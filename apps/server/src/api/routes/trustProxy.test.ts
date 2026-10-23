import type { Server } from "node:http";
import request from "supertest";
import { type MockInstance, afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { axios, environment, logger } from "../../config";
import app from "../../test/app";
import { upstreamRateLimiter } from "../middleware/upstreamRateLimit";

// environment.ts reads TRUST_PROXY_HOPS once at import. vi.hoisted runs before this file's imports, and vitest
// gives each test file its own module graph, so this file's app trusts one proxy hop and its limiter bucket is
// its own.
vi.hoisted(() => {
    vi.stubEnv("TRUST_PROXY_HOPS", "1");
});

const T0 = new Date("2026-10-06T12:00:00.000Z");
// 503 before any route/stop load, so no request reaches DASH; the limiter still counts each one.
const PREDICTIONS = "/api/v1/predictions?stop=stop-1";

const RATE_LIMITED_BODY = {
    error: "Too Many Requests",
    details: "Too many live requests from this client; retry after the Retry-After interval",
};

describe("rate limit keyed on the forwarded client IP with TRUST_PROXY_HOPS=1", () => {
    // One long-lived server for the file, as in rateLimit.test.ts: supertest's per-request servers plus Node 20's
    // keep-alive agent can route a request to an earlier, closed server that the OS gave the same port.
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
        vi.unstubAllEnvs();
    });

    beforeEach(() => {
        // Only Date is faked: supertest needs real socket and HTTP timers, and the MemoryStore expires a window by
        // comparing Date.now().
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(T0);
        upstreamRateLimiter.resetKey("203.0.113.10");
        upstreamRateLimiter.resetKey("203.0.113.20");
        getSpy = vi.spyOn(axios, "get").mockRejectedValue(new Error("unexpected DASH call in trustProxy.test.ts"));
        warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);
        errorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("reads TRUST_PROXY_HOPS=1 into the app's trust proxy setting", () => {
        // Arrange
        // TRUST_PROXY_HOPS=1 is stubbed before import (vi.hoisted above).

        // Act
        const setting = app.get("trust proxy");

        // Assert
        expect(environment.server.trustProxyHops).toBe(1);
        expect(setting).toBe(1);
    });

    it("limits each forwarded client IP separately and serves it again once the window resets", async () => {
        // Arrange
        const client = request(server);
        const allowed: request.Response[] = [];
        for (let i = 0; i < 60; i++) {
            allowed.push(await client.get(PREDICTIONS).set("X-Forwarded-For", "203.0.113.10"));
        }

        // Act
        const rejected = await client.get(PREDICTIONS).set("X-Forwarded-For", "203.0.113.10");
        const otherClient = await client.get(PREDICTIONS).set("X-Forwarded-For", "203.0.113.20");
        vi.setSystemTime(T0.getTime() + 60_000);
        const afterWindow = await client.get(PREDICTIONS).set("X-Forwarded-For", "203.0.113.10");

        // Assert
        for (const response of allowed) {
            expect(response.status).not.toBe(429);
        }
        expect(rejected.status).toBe(429);
        expect(rejected.headers["retry-after"]).toBe("60");
        expect(rejected.body).toEqual(RATE_LIMITED_BODY);
        expect(otherClient.status).toBe(503);
        expect(otherClient.headers.ratelimit).toMatch(/r=59;/);
        expect(afterWindow.status).toBe(503);
        expect(afterWindow.headers.ratelimit).toMatch(/r=59;/);
        expect(rateLimitWarnings()).toHaveLength(1);
        expect(rateLimitWarnings()[0]?.[0]).toBe(
            "Rate limit exceeded for 203.0.113.10 on /api/v1/predictions/; rejecting until the window resets",
        );
        expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("ERR_ERL_");
        expect(getSpy).not.toHaveBeenCalled();
    });

    it("keys on the address the trusted proxy appended, so forged leading X-Forwarded-For entries cannot dodge the limit", async () => {
        // Arrange
        const client = request(server);

        // Act
        // Each request forges a different leading entry; the one trusted proxy appended 203.0.113.10 every time.
        const responses: request.Response[] = [];
        for (let i = 1; i <= 61; i++) {
            responses.push(await client.get(PREDICTIONS).set("X-Forwarded-For", `198.51.100.${i}, 203.0.113.10`));
        }

        // Assert
        for (const response of responses.slice(0, 60)) {
            expect(response.status).not.toBe(429);
        }
        expect(responses[60]?.status).toBe(429);
        expect(getSpy).not.toHaveBeenCalled();
    });
});
