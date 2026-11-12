import type { Server } from "node:http";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { axios, logger } from "../../config";
import app from "../../test/app";
import { upstreamRateLimiter } from "../middleware/upstreamRateLimit";

// Nothing in this file loads route/stop data, so every response comes from the repository guard, input
// validation, Express itself or cors, and no request reaches DASH. src/test/setup.ts pins CORS_ALLOWED_ORIGINS to
// exactly ALLOWED (Phase 18 D-13), and vitest gives this file its own module graph, so the bucket is its own.

const ALLOWED = "http://localhost:8081";
const DISALLOWED = "http://evil.example";

// A live route that answers 503 before any load: it spends the shared bucket without calling DASH.
const LIVE_PATH = "/api/v1/predictions?stop=stop-1";

type OriginCase = { label: string; origin: string | undefined };

const OTHER_ORIGINS: OriginCase[] = [
    { label: "a disallowed origin", origin: DISALLOWED },
    { label: "no Origin", origin: undefined },
];

// D-14: the plain 200, the 503 with Retry-After: 5 before any load, and the Express 404 nobody wrote a handler for.
const KIND_ROWS: { label: string; path: string; status: number; retryAfter: string | undefined }[] = [
    { label: "200 from /health/live", path: "/api/v1/health/live", status: 200, retryAfter: undefined },
    { label: "503 from /routes/all before any load", path: "/api/v1/routes/all", status: 503, retryAfter: "5" },
    { label: "Express 404", path: "/api/v1/no-such-endpoint", status: 404, retryAfter: undefined },
];

function corsHeaderNames(response: request.Response): string[] {
    return Object.keys(response.headers).filter((name) => name.startsWith("access-control-"));
}

function exposedHeaders(response: request.Response): string[] {
    return String(response.headers["access-control-expose-headers"] ?? "")
        .split(",")
        .map((name) => name.trim());
}

function varyNames(response: request.Response): string[] {
    return String(response.headers.vary ?? "")
        .split(",")
        .map((name) => name.trim().toLowerCase());
}

function remainingOf(response: request.Response): number {
    const match = /r=(\d+);/.exec(String(response.headers.ratelimit));
    return match ? Number(match[1]) : Number.NaN;
}

describe("CORS on responses from createApp()", () => {
    // One server for the whole file, as in rateLimit.test.ts: a bare app would start a throwaway server per
    // request, and a pooled keep-alive socket could then reach a different, earlier server.
    let server: Server;
    // Every response this file receives, so afterEach can check the never-* and never-credentials rules on all of
    // them (edge CORS-02/precision).
    const seen: request.Response[] = [];

    async function send(test: request.Test): Promise<request.Response> {
        const response = await test;
        seen.push(response);
        return response;
    }

    function get(path: string, origin?: string): Promise<request.Response> {
        const pending = request(server).get(path);
        return send(origin === undefined ? pending : pending.set("Origin", origin));
    }

    function options(path: string, origin?: string): request.Test {
        const pending = request(server).options(path);
        return origin === undefined ? pending : pending.set("Origin", origin);
    }

    function expectAllowedCors(response: request.Response): void {
        expect(response.headers["access-control-allow-origin"]).toBe(ALLOWED);
        expect(exposedHeaders(response)).toContain("Retry-After");
        expect(varyNames(response)).toContain("origin");
        expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
    }

    function expectNoCors(response: request.Response): void {
        expect(corsHeaderNames(response)).toEqual([]);
        expect(varyNames(response)).not.toContain("origin");
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
        vi.spyOn(axios, "get").mockRejectedValue(new Error("unexpected DASH call in cors.test.ts"));
        vi.spyOn(logger, "info").mockImplementation(() => logger);
        vi.spyOn(logger, "warn").mockImplementation(() => logger);
        vi.spyOn(logger, "error").mockImplementation(() => logger);
    });

    afterEach(() => {
        for (const response of seen.splice(0)) {
            expect(response.headers["access-control-allow-origin"]).not.toBe("*");
            expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
        }
        expect(axios.get).not.toHaveBeenCalled();
        vi.restoreAllMocks();
    });

    describe("200, 503 and 404 by origin (D-14)", () => {
        it.each(KIND_ROWS.map((row) => [row.label, row] as const))(
            "%s from the allowed origin carries the origin and exposes Retry-After, and is otherwise unchanged",
            async (_label, row) => {
                // Arrange
                const baseline = await get(row.path);

                // Act
                const response = await get(row.path, ALLOWED);

                // Assert
                expect(response.status).toBe(row.status);
                expect(response.headers["retry-after"]).toBe(row.retryAfter);
                expectAllowedCors(response);
                expect(response.text).toBe(baseline.text);
            },
        );

        it.each(
            KIND_ROWS.flatMap((row) =>
                OTHER_ORIGINS.map((originCase) => ({
                    ...row,
                    originLabel: originCase.label,
                    origin: originCase.origin,
                })),
            ),
        )("$label from $originLabel carries no CORS header", async ({ path, status, retryAfter, origin }) => {
            // Act
            const response = await get(path, origin);

            // Assert
            expect(response.status).toBe(status);
            expect(response.headers["retry-after"]).toBe(retryAfter);
            expectNoCors(response);
        });

        it.each(KIND_ROWS.map((row) => [row.label, row] as const))(
            "%s answers a disallowed origin with the same status and body as a request with no Origin",
            async (_label, row) => {
                // Arrange
                const absent = await get(row.path);

                // Act
                const disallowed = await get(row.path, DISALLOWED);

                // Assert
                expect(disallowed.status).toBe(absent.status);
                expect(disallowed.text).toBe(absent.text);
                expect(disallowed.headers["content-type"]).toBe(absent.headers["content-type"]);
            },
        );
    });

    describe("the shared-bucket 429 (D-14, edge CORS-02/boundary)", () => {
        it("the 60th request from the allowed origin passes with CORS, and the 61st is a 429 the browser can read", async () => {
            // Arrange
            const allowed: request.Response[] = [];
            for (let i = 0; i < 60; i++) {
                allowed.push(await get(LIVE_PATH, ALLOWED));
            }

            // Act
            const rejected = await get(LIVE_PATH, ALLOWED);
            const rejectedDisallowed = await get(LIVE_PATH, DISALLOWED);
            const rejectedAbsent = await get(LIVE_PATH);

            // Assert
            const sixtieth = allowed[59];
            expect(sixtieth?.status).not.toBe(429);
            expect(sixtieth?.headers["access-control-allow-origin"]).toBe(ALLOWED);
            expect(remainingOf(sixtieth as request.Response)).toBe(0);
            expect(rejected.status).toBe(429);
            expect(rejected.headers["retry-after"]).toMatch(/^\d+$/);
            expectAllowedCors(rejected);
            expect(exposedHeaders(rejected)).toEqual(expect.arrayContaining(["RateLimit", "RateLimit-Policy"]));
            for (const response of [rejectedDisallowed, rejectedAbsent]) {
                expect(response.status).toBe(429);
                expect(response.headers["retry-after"]).toMatch(/^\d+$/);
                expectNoCors(response);
            }
        });
    });

    describe("preflights (D-13)", () => {
        it("an allowed preflight is answered 204 with X-Device-Id allowed and spends no rate-limit token", async () => {
            // Arrange
            const before = await get(LIVE_PATH, ALLOWED);

            // Act
            const preflight = await send(
                options(LIVE_PATH, ALLOWED)
                    .set("Access-Control-Request-Method", "GET")
                    .set("Access-Control-Request-Headers", "X-Device-Id"),
            );
            const after = await get(LIVE_PATH, ALLOWED);

            // Assert
            expect(remainingOf(before)).toBe(59);
            expect(preflight.status).toBe(204);
            expect(preflight.headers["access-control-allow-origin"]).toBe(ALLOWED);
            expect(preflight.headers["access-control-allow-headers"]).toMatch(/x-device-id/i);
            expect(preflight.headers["access-control-allow-methods"]).toMatch(/\bGET\b/);
            expect(preflight.headers.ratelimit).toBeUndefined();
            // The pair (preflight + GET) lowered the bucket by exactly one (edge CORS-02/adjacency).
            expect(remainingOf(after)).toBe(58);
        });

        it("a disallowed preflight behaves exactly like an OPTIONS with no Origin and spends no token", async () => {
            // Arrange
            const before = await get(LIVE_PATH);

            // Act
            const disallowed = await send(
                options(LIVE_PATH, DISALLOWED)
                    .set("Access-Control-Request-Method", "GET")
                    .set("Access-Control-Request-Headers", "X-Device-Id"),
            );
            const absent = await send(options(LIVE_PATH));
            const after = await get(LIVE_PATH);

            // Assert
            for (const response of [disallowed, absent]) {
                expect(response.status).toBe(200);
                expect(response.text).toBe("GET,HEAD");
                expect(response.headers.allow).toBe("GET,HEAD");
                expect(response.headers.ratelimit).toBeUndefined();
                expectNoCors(response);
            }
            expect(remainingOf(before)).toBe(59);
            expect(remainingOf(after)).toBe(58);
        });

        it("an allowed preflight to /api/v1/favorites is answered 204 before requireDeviceId, which still answers 400 without an Origin", async () => {
            // Arrange
            const path = "/api/v1/favorites";

            // Act
            const preflight = await send(
                options(path, ALLOWED)
                    .set("Access-Control-Request-Method", "POST")
                    .set("Access-Control-Request-Headers", "X-Device-Id, Content-Type"),
            );
            const absent = await send(options(path));

            // Assert
            // CORS runs ahead of every router (edge CORS-02/ordering).
            expect(preflight.status).toBe(204);
            expect(preflight.headers["access-control-allow-origin"]).toBe(ALLOWED);
            expect(preflight.headers["access-control-allow-headers"]).toMatch(/x-device-id/i);
            expect(preflight.headers["access-control-allow-methods"]).toMatch(/\bPOST\b/);
            expect(absent.status).toBe(400);
            expect(absent.body).toEqual({ error: "Bad Request", details: "X-Device-Id header is required" });
            expectNoCors(absent);
        });
    });

    describe("origin precision (edge CORS-02/precision)", () => {
        it("never allows Origin: null", async () => {
            // Arrange
            const absent = await get("/api/v1/health/live");

            // Act
            const response = await get("/api/v1/health/live", "null");
            const preflight = await send(
                options(LIVE_PATH, "null")
                    .set("Access-Control-Request-Method", "GET")
                    .set("Access-Control-Request-Headers", "X-Device-Id"),
            );

            // Assert
            expect(response.status).toBe(absent.status);
            expect(response.text).toBe(absent.text);
            expectNoCors(response);
            expect(preflight.status).toBe(200);
            expectNoCors(preflight);
        });

        it.each([
            ["a trailing slash", `${ALLOWED}/`],
            ["another port", "http://localhost:8082"],
            ["https instead of http", "https://localhost:8081"],
            ["an uppercase host", "http://LOCALHOST:8081"],
        ])("does not allow an origin that differs from the allowlist entry by %s", async (_label, origin) => {
            // Act
            const response = await get("/api/v1/health/live", origin);

            // Assert
            expect(response.status).toBe(200);
            expectNoCors(response);
        });
    });

    describe("concurrency and repeats", () => {
        it("parallel requests from the allowed origin, a disallowed origin and no Origin each get only their own result", async () => {
            // Arrange
            const origins = Array.from({ length: 4 }, () => [ALLOWED, DISALLOWED, undefined]).flat();

            // Act
            const responses = await Promise.all(origins.map((origin) => get("/api/v1/health/live", origin)));

            // Assert
            responses.forEach((response, index) => {
                expect(response.status).toBe(200);
                if (origins[index] === ALLOWED) {
                    expectAllowedCors(response);
                } else {
                    // Interleaved with allowed-origin requests, the others still get no CORS (edge CORS-04/concurrency).
                    expectNoCors(response);
                }
            });
            const bodies = new Set(responses.map((response) => response.text));
            expect(bodies.size).toBe(1);
        });

        it("repeated allowed-origin requests expose the identical header list, with Retry-After exactly once", async () => {
            // Act
            const first = await get("/api/v1/health/live", ALLOWED);
            const second = await get("/api/v1/health/live", ALLOWED);

            // Assert
            expect(first.headers["access-control-expose-headers"]).toBeDefined();
            expect(second.headers["access-control-expose-headers"]).toBe(
                first.headers["access-control-expose-headers"],
            );
            expect(exposedHeaders(first).filter((name) => name === "Retry-After")).toHaveLength(1);
        });
    });
});
