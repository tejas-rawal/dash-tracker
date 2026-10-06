import express from "express";
import request from "supertest";
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../config";
import { createUpstreamRateLimiter } from "./upstreamRateLimit";

const PATH = "/api/v1/predictions/nearby";
const T0 = new Date("2026-10-06T12:00:00.000Z");
const RATE_LIMITED_BODY = {
    error: "Too Many Requests",
    details: "Too many live requests from this client; retry after the Retry-After interval",
};

// A fresh limiter per app keeps every test's bucket its own.
function makeApp(options: { trustProxyHops?: number } = {}): express.Express {
    const app = express();
    if (options.trustProxyHops !== undefined) {
        app.set("trust proxy", options.trustProxyHops);
    }
    app.get(PATH, createUpstreamRateLimiter(), (_req, res) => {
        res.json({ ok: true });
    });
    return app;
}

async function sendSequential(
    app: express.Express,
    count: number,
    url: string = PATH,
    headers: Record<string, string> = {},
): Promise<request.Response[]> {
    const responses: request.Response[] = [];
    for (let i = 0; i < count; i++) {
        responses.push(await request(app).get(url).set(headers));
    }
    return responses;
}

function remainingOf(response: request.Response | undefined): number {
    const match = /r=(\d+);/.exec(String(response?.headers.ratelimit));
    return match ? Number(match[1]) : Number.NaN;
}

describe("createUpstreamRateLimiter", () => {
    let warnSpy: MockInstance;
    let errorSpy: MockInstance;

    function rateLimitWarnings(): unknown[][] {
        return warnSpy.mock.calls.filter(
            ([message]) => typeof message === "string" && message.startsWith("Rate limit exceeded for "),
        );
    }

    beforeEach(() => {
        // Only Date is faked: faking timers would hang supertest's sockets. The store resets a window by
        // comparing Date.now(), so moving the system time is enough to move windows.
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(T0);
        warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);
        errorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("allows the 59th and 60th requests and rejects the 61st and 62nd", async () => {
        // Arrange
        const app = makeApp();

        // Act
        const responses = await sendSequential(app, 62);

        // Assert
        expect(responses[58]?.status).toBe(200);
        expect(remainingOf(responses[58])).toBe(1);
        expect(responses[59]?.status).toBe(200);
        expect(remainingOf(responses[59])).toBe(0);
        expect(responses[60]?.status).toBe(429);
        expect(responses[61]?.status).toBe(429);
    });

    it("window boundary and Retry-After precision", async () => {
        // Arrange
        const app = makeApp();
        await sendSequential(app, 60);

        // Act
        const atStart = await request(app).get(PATH);
        vi.setSystemTime(T0.getTime() + 30_500);
        const midWindow = await request(app).get(PATH);
        vi.setSystemTime(T0.getTime() + 59_999);
        const lastMillisecond = await request(app).get(PATH);
        vi.setSystemTime(T0.getTime() + 60_000);
        const nextWindow = await request(app).get(PATH);

        // Assert
        // Retry-After is the whole-second ceiling of the time left in the window.
        expect(atStart.status).toBe(429);
        expect(atStart.headers["retry-after"]).toBe("60");
        expect(midWindow.status).toBe(429);
        expect(midWindow.headers["retry-after"]).toBe("30");
        expect(lastMillisecond.status).toBe(429);
        expect(lastMillisecond.headers["retry-after"]).toBe("1");
        expect(nextWindow.status).toBe(200);
        expect(remainingOf(nextWindow)).toBe(59);
    });

    it("logs one warn per window and again in the next window", async () => {
        // Arrange
        const app = makeApp();

        // Act
        await sendSequential(app, 62);
        const warningsInFirstWindow = rateLimitWarnings().length;
        vi.setSystemTime(T0.getTime() + 60_000);
        await sendSequential(app, 62);

        // Assert
        expect(warningsInFirstWindow).toBe(1);
        expect(rateLimitWarnings()).toHaveLength(2);
    });

    it("logs the first rejection once without any of the query string", async () => {
        // Arrange
        const app = makeApp();

        // Act
        const responses = await sendSequential(app, 62, `${PATH}?lat=38.8048&lng=-77.0469`);

        // Assert
        expect(responses[60]?.status).toBe(429);
        expect(responses[61]?.status).toBe(429);
        expect(rateLimitWarnings()).toHaveLength(1);
        expect(rateLimitWarnings()[0]?.[0]).toBe(
            "Rate limit exceeded for 127.0.0.1 on /api/v1/predictions/nearby; rejecting until the window resets",
        );
        const logged = JSON.stringify(warnSpy.mock.calls);
        for (const fragment of ["38.8048", "-77.0469", "lat=", "lng=", "?"]) {
            expect(logged).not.toContain(fragment);
        }
    });

    it("keys each client IP separately behind one trusted proxy", async () => {
        // Arrange
        const app = makeApp({ trustProxyHops: 1 });
        await sendSequential(app, 60, PATH, { "X-Forwarded-For": "203.0.113.10" });

        // Act
        const limited = await request(app).get(PATH).set("X-Forwarded-For", "203.0.113.10");
        const other = await request(app).get(PATH).set("X-Forwarded-For", "203.0.113.20");

        // Assert
        expect(limited.status).toBe(429);
        expect(other.status).toBe(200);
        expect(remainingOf(other)).toBe(59);
        expect(rateLimitWarnings()).toHaveLength(1);
        expect(rateLimitWarnings()[0]?.[0]).toBe(
            "Rate limit exceeded for 203.0.113.10 on /api/v1/predictions/nearby; rejecting until the window resets",
        );
    });

    it("counts concurrent requests exactly", async () => {
        // Arrange
        const app = makeApp();

        // Act
        const responses = await Promise.all(Array.from({ length: 70 }, () => request(app).get(PATH)));

        // Assert
        expect(responses.filter((response) => response.status === 200)).toHaveLength(60);
        expect(responses.filter((response) => response.status === 429)).toHaveLength(10);
        expect(rateLimitWarnings()).toHaveLength(1);
    });

    it("counts each request exactly once", async () => {
        // Arrange
        const app = makeApp();

        // Act
        const responses = await sendSequential(app, 5);

        // Assert
        expect(responses.map(remainingOf)).toEqual([59, 58, 57, 56, 55]);
        expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("ERR_ERL_DOUBLE_COUNT");
    });

    it("sends draft-8 headers, no legacy headers, and the error body on rejection", async () => {
        // Arrange
        const app = makeApp();

        // Act
        const responses = await sendSequential(app, 61);

        // Assert
        const first = responses[0];
        expect(first?.headers.ratelimit).toMatch(/^"60-in-1min"; r=59; t=60$/);
        expect(first?.headers["ratelimit-policy"]).toMatch(/^"60-in-1min"; q=60; w=60; pk=:/);
        expect(first?.headers["x-ratelimit-limit"]).toBeUndefined();
        expect(first?.headers["x-ratelimit-remaining"]).toBeUndefined();
        expect(first?.headers["x-ratelimit-reset"]).toBeUndefined();
        const rejected = responses[60];
        expect(rejected?.status).toBe(429);
        expect(rejected?.body).toEqual(RATE_LIMITED_BODY);
        expect(rejected?.headers["content-type"]).toMatch(/application\/json/);
        expect(rejected?.headers["retry-after"]).toBe("60");
        expect(rejected?.headers.ratelimit).toMatch(/r=0;/);
        expect(rejected?.headers["x-ratelimit-remaining"]).toBeUndefined();
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it("routes library validation messages through Winston as one message-only string, once per instance", async () => {
        // Arrange
        // trust proxy stays unset (Express defaults it to false), so an X-Forwarded-For header trips the
        // library's ERR_ERL_UNEXPECTED_X_FORWARDED_FOR validation.
        const app = makeApp();

        // Act
        await request(app).get(PATH).set("X-Forwarded-For", "203.0.113.10");
        await request(app).get(PATH).set("X-Forwarded-For", "203.0.113.10");

        // Assert
        expect(errorSpy).toHaveBeenCalledTimes(1);
        const args = errorSpy.mock.calls[0] ?? [];
        expect(args).toHaveLength(1);
        expect(typeof args[0]).toBe("string");
        expect(String(args[0]).startsWith("express-rate-limit: ")).toBe(true);
        expect(String(args[0])).toContain("ERR_ERL_UNEXPECTED_X_FORWARDED_FOR");
    });

    it("keeps independent buckets for separate instances", async () => {
        // Arrange
        const exhausted = makeApp();
        const fresh = makeApp();
        await sendSequential(exhausted, 60);

        // Act
        const rejected = await request(exhausted).get(PATH);
        const served = await request(fresh).get(PATH);

        // Assert
        expect(rejected.status).toBe(429);
        expect(served.status).toBe(200);
        expect(remainingOf(served)).toBe(59);
    });
});
