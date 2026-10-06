import request from "supertest";
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axios, logger } from "../../config";
import app from "../../test/app";
import { upstreamRateLimiter } from "../middleware/upstreamRateLimit";

// Nothing in this file loads route/stop data, so the live routes answer 503/400 from the repository guard or
// input validation without calling DASH. The limiter counts every response status, so those answers still
// spend the bucket. vitest isolates modules per test file, so this file's shared bucket is its own.

const RATE_LIMITED_BODY = {
    error: "Too Many Requests",
    details: "Too many live requests from this client; retry after the Retry-After interval",
};

// The four D-11 routes. None of these paths reaches DASH before the first route/stop load.
const LIMITED_ROWS: { label: string; path: string }[] = [
    { label: "GET /api/v1/predictions", path: "/api/v1/predictions?stop=stop-1" },
    // No coordinates: the controller answers 400 before any DASH call.
    { label: "GET /api/v1/predictions/nearby", path: "/api/v1/predictions/nearby" },
    // 503 from the repository guard before any SSE header is written.
    { label: "GET /api/v1/predictions/stream", path: "/api/v1/predictions/stream?stop=stop-1" },
    // 503 from the route lookup.
    { label: "GET /api/v1/vehicles", path: "/api/v1/vehicles?route=1A" },
];

function remainingOf(response: request.Response): number {
    const match = /r=(\d+);/.exec(String(response.headers.ratelimit));
    return match ? Number(match[1]) : Number.NaN;
}

describe("upstream rate limit on the live DASH routes", () => {
    let getSpy: MockInstance;
    let warnSpy: MockInstance;
    let errorSpy: MockInstance;

    function rateLimitWarnings(): unknown[][] {
        return warnSpy.mock.calls.filter(
            ([message]) => typeof message === "string" && message.startsWith("Rate limit exceeded for "),
        );
    }

    beforeEach(() => {
        // supertest connects from ::ffff:127.0.0.1, which the default key generator normalizes to 127.0.0.1.
        upstreamRateLimiter.resetKey("127.0.0.1");
        getSpy = vi.spyOn(axios, "get").mockRejectedValue(new Error("unexpected DASH call in rateLimit.test.ts"));
        warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);
        errorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("GET /api/v1/predictions answers 429 with Retry-After and the error body on the 61st request in a minute", async () => {
        // Arrange
        const client = request(app);
        const path = "/api/v1/predictions?stop=stop-1";

        // Act
        const allowed: request.Response[] = [];
        for (let i = 0; i < 60; i++) {
            allowed.push(await client.get(path));
        }
        const rejected = await client.get(path);

        // Assert
        expect(allowed[0]?.headers.ratelimit).toMatch(/^"60-in-1min"; r=59; t=\d+$/);
        for (const response of allowed) {
            expect(response.status).not.toBe(429);
            expect(response.headers.ratelimit).toMatch(/^"60-in-1min"; r=\d+; t=\d+$/);
            expect(response.headers["ratelimit-policy"]).toMatch(/^"60-in-1min"; q=60; w=60; pk=:/);
            expect(response.headers["x-ratelimit-limit"]).toBeUndefined();
            expect(response.headers["x-ratelimit-remaining"]).toBeUndefined();
            expect(response.headers["x-ratelimit-reset"]).toBeUndefined();
        }
        expect(rejected.status).toBe(429);
        expect(rejected.body).toEqual(RATE_LIMITED_BODY);
        expect(rejected.headers["retry-after"]).toMatch(/^\d+$/);
        const retryAfter = Number(rejected.headers["retry-after"]);
        expect(retryAfter).toBeGreaterThanOrEqual(1);
        expect(retryAfter).toBeLessThanOrEqual(60);
        expect(rejected.headers["content-type"]).toMatch(/application\/json/);
        expect(rejected.headers.ratelimit).toMatch(/r=0;/);
        expect(rateLimitWarnings()).toHaveLength(1);
        expect(rateLimitWarnings()[0]?.[0]).toBe(
            "Rate limit exceeded for 127.0.0.1 on /api/v1/predictions/; rejecting until the window resets",
        );
        expect(getSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
    });

    // Rows go in as [label, path] tuples so the "%s" title prints the label unquoted.
    it.each(LIMITED_ROWS.map(({ label, path }) => [label, path]))(
        "%s carries the shared draft-8 RateLimit headers",
        async (_label, path) => {
            // Arrange
            const client = request(app);

            // Act
            const response = await client.get(path);

            // Assert
            expect(response.status).not.toBe(429);
            expect(response.headers.ratelimit).toMatch(/^"60-in-1min"; r=59; t=\d+$/);
            expect(response.headers["ratelimit-policy"]).toBeDefined();
            expect(response.headers["x-ratelimit-remaining"]).toBeUndefined();
        },
    );

    it("the four live routes draw from one bucket: 15 requests to each leave the next request on any of them at 429", async () => {
        // Arrange
        const client = request(app);

        // Act
        const remaining: number[] = [];
        for (let i = 0; i < 60; i++) {
            const row = LIMITED_ROWS[i % LIMITED_ROWS.length];
            remaining.push(remainingOf(await client.get(row?.path ?? "")));
        }
        const rejected: request.Response[] = [];
        for (const { path } of LIMITED_ROWS) {
            rejected.push(await client.get(path));
        }

        // Assert
        // Each request is counted exactly once, whichever route it hits.
        expect(remaining).toEqual(Array.from({ length: 60 }, (_, i) => 59 - i));
        for (const response of rejected) {
            expect(response.status).toBe(429);
            expect(response.headers["retry-after"]).toMatch(/^\d+$/);
            expect(response.body).toEqual(RATE_LIMITED_BODY);
        }
        expect(rateLimitWarnings()).toHaveLength(1);
        expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("ERR_ERL_");
        expect(getSpy).not.toHaveBeenCalled();
    });

    it("the first rejected /predictions/nearby request logs one warn with the path and none of the query string", async () => {
        // Arrange
        const client = request(app);
        for (let i = 0; i < 60; i++) {
            await client.get("/api/v1/predictions?stop=stop-1");
        }

        // Act
        // The limiter answers before the controller, so even valid coordinates reach no DASH call.
        const first = await client.get("/api/v1/predictions/nearby?lat=38.8048&lng=-77.0469");
        const second = await client.get("/api/v1/predictions/nearby?lat=38.8048&lng=-77.0469");

        // Assert
        expect(first.status).toBe(429);
        expect(second.status).toBe(429);
        expect(rateLimitWarnings()).toHaveLength(1);
        expect(rateLimitWarnings()[0]?.[0]).toBe(
            "Rate limit exceeded for 127.0.0.1 on /api/v1/predictions/nearby; rejecting until the window resets",
        );
        const logged = JSON.stringify(warnSpy.mock.calls);
        for (const fragment of ["38.8048", "-77.0469", "lat=", "lng=", "?"]) {
            expect(logged).not.toContain(fragment);
        }
        expect(getSpy).not.toHaveBeenCalled();
    });
});
