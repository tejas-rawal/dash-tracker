import type { Server } from "node:http";
import request from "supertest";
import { type MockInstance, afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

// A live route that answers 503 before any load: it spends the shared bucket without calling DASH.
const LIVE_PATH = "/api/v1/predictions?stop=stop-1";

type UnlimitedRow = { label: string; method: "get" | "post" | "delete"; path: string; deviceId: boolean };

// D-16 / RATE-02: every endpoint that never calls DASH. Before any route/stop load (and with SQLite never opened in
// route tests) they answer 503, 500 or 200 depending on the row; only the absence of 429 and quota headers matters.
const UNLIMITED_ROWS: UnlimitedRow[] = [
    { label: "GET /api/v1/routes/all", method: "get", path: "/api/v1/routes/all", deviceId: false },
    { label: "GET /api/v1/routes/1A", method: "get", path: "/api/v1/routes/1A", deviceId: false },
    { label: "GET /api/v1/routes/1A/stops", method: "get", path: "/api/v1/routes/1A/stops", deviceId: false },
    {
        label: "GET /api/v1/stops/nearby",
        method: "get",
        path: "/api/v1/stops/nearby?lat=38.8&lng=-77.1",
        deviceId: false,
    },
    { label: "GET /api/v1/favorites", method: "get", path: "/api/v1/favorites", deviceId: true },
    { label: "POST /api/v1/favorites", method: "post", path: "/api/v1/favorites", deviceId: true },
    {
        label: "DELETE /api/v1/favorites/route/route-1",
        method: "delete",
        path: "/api/v1/favorites/route/route-1",
        deviceId: true,
    },
    { label: "GET /api/v1/recents", method: "get", path: "/api/v1/recents", deviceId: true },
    { label: "GET /api/v1/health/live", method: "get", path: "/api/v1/health/live", deviceId: false },
    { label: "GET /api/v1/health/ready", method: "get", path: "/api/v1/health/ready", deviceId: false },
];

function remainingOf(response: request.Response): number {
    const match = /r=(\d+);/.exec(String(response.headers.ratelimit));
    return match ? Number(match[1]) : Number.NaN;
}

describe("upstream rate limit on the live DASH routes", () => {
    // One server for the whole file. Handing supertest the bare app would start a throwaway server per request,
    // and Node 20's keep-alive agent can then reuse a pooled socket to an earlier, closed server that the OS gave
    // the same port, so a request could be answered by a server this test never meant to hit.
    let server: Server;
    let getSpy: MockInstance;
    let warnSpy: MockInstance;
    let errorSpy: MockInstance;

    function rateLimitWarnings(): unknown[][] {
        return warnSpy.mock.calls.filter(
            ([message]) => typeof message === "string" && message.startsWith("Rate limit exceeded for "),
        );
    }

    beforeAll(async () => {
        server = app.listen(0);
        await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    });

    afterAll(async () => {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

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
        const client = request(server);
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
            const client = request(server);

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
        const client = request(server);

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
        const client = request(server);
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

    // Nested so it shares the file's one server, spies and per-test bucket reset.
    describe("endpoints that never touch DASH are never rate limited", () => {
        async function sendUnlimited(row: UnlimitedRow): Promise<request.Response> {
            let pending = request(server)[row.method](row.path);
            if (row.deviceId) {
                pending = pending.set("X-Device-Id", "device-a");
            }
            if (row.method === "post") {
                pending = pending.send({ entityType: "route", entityId: "route-1" });
            }
            return await pending;
        }

        async function exhaustLiveBucket(): Promise<request.Response> {
            const client = request(server);
            let last = await client.get(LIVE_PATH);
            for (let i = 1; i < 61; i++) {
                last = await client.get(LIVE_PATH);
            }
            return last;
        }

        it.each(UNLIMITED_ROWS.map((row) => [row.label, row] as const))(
            "%s never answers 429 or advertises a quota, even while the same IP is limited on the live routes",
            async (_label, row) => {
                // Arrange
                const limited = await exhaustLiveBucket();
                expect(limited.status).toBe(429);

                // Act
                const responses: request.Response[] = [];
                for (let i = 0; i < 61; i++) {
                    responses.push(await sendUnlimited(row));
                }
                const liveAfter = await request(server).get(LIVE_PATH);

                // Assert
                for (const response of responses) {
                    expect(response.status).not.toBe(429);
                    expect(response.headers.ratelimit).toBeUndefined();
                    expect(response.headers["ratelimit-policy"]).toBeUndefined();
                }
                // The unlimited traffic neither refilled nor touched the live bucket.
                expect(liveAfter.status).toBe(429);
                expect(getSpy).not.toHaveBeenCalled();
            },
        );

        it("concurrent bursts to unlimited endpoints never consume the shared live-route bucket", async () => {
            // Arrange
            const rows = Array.from({ length: 61 }, (_, i) => UNLIMITED_ROWS[i % UNLIMITED_ROWS.length]);

            // Act
            const responses = await Promise.all(rows.map((row) => sendUnlimited(row)));
            const live = await request(server).get(LIVE_PATH);

            // Assert
            for (const response of responses) {
                expect(response.status).not.toBe(429);
                expect(response.headers.ratelimit).toBeUndefined();
            }
            expect(live.headers.ratelimit).toMatch(/r=59;/);
        });

        it("with the default TRUST_PROXY_HOPS=0 a forged X-Forwarded-For does not escape the limit", async () => {
            // Arrange
            const client = request(server);
            for (let i = 0; i < 60; i++) {
                await client.get(LIVE_PATH);
            }

            // Act
            const forged = await client.get(LIVE_PATH).set("X-Forwarded-For", "203.0.113.99");
            const forgedChain = await client.get(LIVE_PATH).set("X-Forwarded-For", "203.0.113.99, 198.51.100.1");

            // Assert
            expect(app.get("trust proxy")).toBe(0);
            expect(forged.status).toBe(429);
            expect(forgedChain.status).toBe(429);
            // A numeric 0 is neither Express's default false nor the permissive true, so the library raises no
            // trust-proxy validation error.
            expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("ERR_ERL_");
        });
    });
});
