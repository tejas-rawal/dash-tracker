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
});
