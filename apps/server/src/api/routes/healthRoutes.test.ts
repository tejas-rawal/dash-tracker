import type { Server } from "node:http";
import request from "supertest";
import { type MockInstance, afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { axios } from "../../config";
import app from "../../test/app";
import { BusDataRepository } from "../repositories";

// vitest isolates modules per test file, and a successful load cannot be undone on the BusDataRepository
// singleton every route module captured. So the "before the first successful route/stop load" describe must
// stay first in this file, and only later describes may load data.

const makeRoutesPayload = () => ({
    data: {
        data: {
            routes: [
                {
                    id: "route-1",
                    shortName: "1A",
                    type: "3",
                    directions: [
                        {
                            id: "route-1-d1",
                            title: "Northbound",
                            headSigns: ["Downtown"],
                            stops: [{ id: "stop-1", name: "Main St", code: "101", lat: "38.8", lon: "-77.1" }],
                        },
                    ],
                },
            ],
        },
    },
});

let getSpy: MockInstance;

beforeEach(() => {
    getSpy = vi.spyOn(axios, "get");
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

// One server for the file, as in rateLimit.test.ts: a per-request server plus Node 20's keep-alive agent can
// land a request on an earlier, closed server.
let server: Server;

beforeAll(async () => {
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
});

afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("health probes before the first successful route/stop load", () => {
    it("GET /api/v1/health/ready answers 503 never_loaded with null age and timestamps before any load attempt", async () => {
        // Arrange
        const client = request(server);

        // Act
        const response = await client.get("/api/v1/health/ready");

        // Assert
        expect(response.status).toBe(503);
        expect(response.body).toEqual({
            status: "not_ready",
            reason: "never_loaded",
            dataAgeSeconds: null,
            lastLoadedAt: null,
            lastFailedAt: null,
        });
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(response.headers["retry-after"]).toBeUndefined();
        expect(response.headers["content-type"]).toMatch(/application\/json/);
        expect(getSpy).not.toHaveBeenCalled();
    });

    it("GET /api/v1/health/live answers 200 ok before any route/stop load and makes no DASH call", async () => {
        // Arrange
        const client = request(server);

        // Act
        const response = await client.get("/api/v1/health/live");

        // Assert
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ status: "ok" });
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(getSpy).not.toHaveBeenCalled();
    });

    it("HEAD /api/v1/health/live answers 200", async () => {
        // Arrange
        const client = request(server);

        // Act
        const response = await client.head("/api/v1/health/live");

        // Assert
        expect(response.status).toBe(200);
        expect(response.headers["cache-control"]).toBe("no-store");
    });

    it("GET /api/v1/health/ready stays never_loaded and reports lastFailedAt after a failed first load", async () => {
        // Arrange
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2026-10-06T12:00:00.000Z"));
        getSpy.mockRejectedValueOnce(new Error("DASH API request failed: connect ECONNREFUSED"));

        // Act
        await expect(BusDataRepository.getInstance().load()).rejects.toThrow();
        const response = await request(server).get("/api/v1/health/ready");

        // Assert
        expect(response.status).toBe(503);
        expect(response.body).toEqual({
            status: "not_ready",
            reason: "never_loaded",
            dataAgeSeconds: null,
            lastLoadedAt: null,
            lastFailedAt: "2026-10-06T12:00:00.000Z",
        });
        expect(JSON.stringify(response.body)).not.toContain("ECONNREFUSED");
        expect(response.body).not.toHaveProperty("lastError");
    });

    it("GET /api/v1/health/live still answers 200 ok after a failed first load while DASH is down", async () => {
        // Arrange
        getSpy.mockRejectedValueOnce(new Error("DASH API request failed: connect ECONNREFUSED"));
        await expect(BusDataRepository.getInstance().load()).rejects.toThrow();
        const callsAfterFailure = getSpy.mock.calls.length;

        // Act
        const response = await request(server).get("/api/v1/health/live");

        // Assert
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ status: "ok" });
        expect(getSpy.mock.calls.length).toBe(callsAfterFailure);
    });
});

describe("health probes after a successful route/stop load", () => {
    const T0 = new Date("2026-10-06T12:00:00.000Z");

    beforeEach(async () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(T0);
        getSpy.mockResolvedValue(makeRoutesPayload());
        await BusDataRepository.getInstance().load();
    });

    it("GET /api/v1/health/ready answers 200 ready with the data age and never calls DASH", async () => {
        // Arrange
        const callsAfterLoad = getSpy.mock.calls.length;
        vi.setSystemTime(T0.getTime() + 90_500);

        // Act
        const response = await request(server).get("/api/v1/health/ready");

        // Assert
        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            status: "ready",
            dataAgeSeconds: 90,
            lastLoadedAt: "2026-10-06T12:00:00.000Z",
            lastFailedAt: null,
        });
        expect(response.body).not.toHaveProperty("reason");
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(getSpy.mock.calls.length).toBe(callsAfterLoad);
    });

    it("GET /api/v1/health/ready stays 200 at exactly the staleness threshold and turns 503 stale one millisecond later", async () => {
        // Arrange
        const callsAfterLoad = getSpy.mock.calls.length;

        // Act
        vi.setSystemTime(T0.getTime() + 11_100_000);
        const atThreshold = await request(server).get("/api/v1/health/ready");
        vi.setSystemTime(T0.getTime() + 11_100_001);
        const pastThreshold = await request(server).get("/api/v1/health/ready");

        // Assert
        expect(atThreshold.status).toBe(200);
        expect(atThreshold.body).toEqual({
            status: "ready",
            dataAgeSeconds: 11100,
            lastLoadedAt: T0.toISOString(),
            lastFailedAt: null,
        });
        expect(pastThreshold.status).toBe(503);
        expect(pastThreshold.body).toEqual({
            status: "not_ready",
            reason: "stale",
            dataAgeSeconds: 11100,
            lastLoadedAt: T0.toISOString(),
            lastFailedAt: null,
        });
        expect(pastThreshold.headers["retry-after"]).toBeUndefined();
        expect(pastThreshold.headers["cache-control"]).toBe("no-store");
        expect(getSpy.mock.calls.length).toBe(callsAfterLoad);
    });

    it("GET /api/v1/health/ready stays 200 ready with the original lastLoadedAt after a failed refresh", async () => {
        // Arrange
        vi.setSystemTime(T0.getTime() + 3_600_000);
        getSpy.mockRejectedValueOnce(new Error("DASH API request timed out after 200ms"));
        await expect(BusDataRepository.getInstance().load()).rejects.toThrow();

        // Act
        const response = await request(server).get("/api/v1/health/ready");

        // Assert
        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            status: "ready",
            dataAgeSeconds: 3600,
            lastLoadedAt: T0.toISOString(),
            lastFailedAt: new Date(T0.getTime() + 3_600_000).toISOString(),
        });
        expect(JSON.stringify(response.body)).not.toContain("timed out");
    });

    it("20 concurrent GET /api/v1/health/live requests all answer 200 ok without calling DASH", async () => {
        // Arrange
        const callsAfterLoad = getSpy.mock.calls.length;

        // Act
        const responses = await Promise.all(
            Array.from({ length: 20 }, () => request(server).get("/api/v1/health/live")),
        );

        // Assert
        for (const response of responses) {
            expect(response.status).toBe(200);
            expect(response.body).toEqual({ status: "ok" });
        }
        expect(getSpy.mock.calls.length).toBe(callsAfterLoad);
    });
});
