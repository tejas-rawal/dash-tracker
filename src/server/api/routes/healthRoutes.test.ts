import request from "supertest";
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

describe("health probes before the first successful route/stop load", () => {
    it("GET /api/v1/health/ready answers 503 never_loaded with null age and timestamps before any load attempt", async () => {
        // Arrange
        const client = request(app);

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

    it("GET /api/v1/health/ready stays never_loaded and reports lastFailedAt after a failed first load", async () => {
        // Arrange
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2026-10-06T12:00:00.000Z"));
        getSpy.mockRejectedValueOnce(new Error("DASH API request failed: connect ECONNREFUSED"));

        // Act
        await expect(BusDataRepository.getInstance().load()).rejects.toThrow();
        const response = await request(app).get("/api/v1/health/ready");

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
        const response = await request(app).get("/api/v1/health/ready");

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
});
