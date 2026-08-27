import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("../services/StopService", () => ({
    createStopService: vi.fn(() => ({
        getStopsForRoute: vi.fn(),
        getNearbyStops: vi.fn(),
    })),
}));

import app from "../../test/app";
import { createStopService } from "../services/StopService";

// busRoutes.ts also instantiates a StopService (for GET /routes/:shortName/stops), so when
// app.ts wires the full router this mock factory is invoked twice — busRoutes.ts first,
// then stopRoutes.ts. Grab the second instance, the one wired to this router.
const getMockService = () => vi.mocked(createStopService).mock.results[1]?.value;

describe("GET /api/v1/stops/nearby", () => {
    it("responds with 200 and an array body on success", async () => {
        // Arrange
        const payload = [{ id: "stop-1", name: "Main St", code: 101, lat: 38.8, lon: -77.1, distance: 0 }];
        getMockService().getNearbyStops.mockReturnValue(payload);

        // Act
        const response = await request(app).get("/api/v1/stops/nearby?lat=38.8&lng=-77.1");

        // Assert
        expect(response.status).toBe(200);
        expect(response.body).toEqual(payload);
    });

    it("responds with 400 when lat is omitted", async () => {
        // Arrange & Act
        const response = await request(app).get("/api/v1/stops/nearby?lng=-77.1");

        // Assert
        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
            error: "Bad Request",
            details: "lat parameter is required and must be a valid latitude (-90 to 90)",
        });
    });

    it("responds with 400 when lat is out of range", async () => {
        // Arrange & Act
        const response = await request(app).get("/api/v1/stops/nearby?lat=95&lng=-77.1");

        // Assert
        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({ error: "Bad Request" });
    });

    it("responds with 400 when lng is out of range", async () => {
        // Arrange & Act
        const response = await request(app).get("/api/v1/stops/nearby?lat=38.8&lng=-200");

        // Assert
        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({ error: "Bad Request" });
    });

    it("passes query params through to service.getNearbyStops", async () => {
        // Arrange
        getMockService().getNearbyStops.mockReturnValue([]);

        // Act
        await request(app).get("/api/v1/stops/nearby?lat=38.8&lng=-77.1&radius=2&count=5");

        // Assert
        expect(getMockService().getNearbyStops).toHaveBeenCalledWith(38.8, -77.1, { radius: 2, count: 5 });
    });

    it("responds with 200 when count exceeds the hard cap of 50 (capped, not rejected)", async () => {
        // Arrange
        getMockService().getNearbyStops.mockReturnValue([]);

        // Act
        const response = await request(app).get("/api/v1/stops/nearby?lat=38.8&lng=-77.1&count=51");

        // Assert
        expect(response.status).toBe(200);
    });
});
