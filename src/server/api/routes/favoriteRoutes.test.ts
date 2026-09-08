import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("../services/FavoritesService", () => ({
    createFavoritesService: vi.fn(() => ({
        addFavorite: vi.fn(),
        removeFavorite: vi.fn(),
        listFavorites: vi.fn(),
    })),
}));

import app from "../../test/app";
import { createFavoritesService } from "../services/FavoritesService";

const getMockService = () => vi.mocked(createFavoritesService).mock.results[0]?.value;

describe("POST /api/v1/favorites", () => {
    it("responds with 400 when X-Device-Id header is missing", async () => {
        // Act
        const response = await request(app).post("/api/v1/favorites").send({ entityType: "route", entityId: "r-1" });

        // Assert
        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
            error: "Bad Request",
            details: "X-Device-Id header is required",
        });
    });

    it("responds with 200 and success:true with a valid header and body", async () => {
        // Arrange
        getMockService().addFavorite.mockResolvedValue(undefined);

        // Act
        const response = await request(app)
            .post("/api/v1/favorites")
            .set("X-Device-Id", "device-a")
            .send({ entityType: "route", entityId: "route-1" });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true });
    });

    it("calls the mocked service's addFavorite with the exact deviceId/entityType/entityId args", async () => {
        // Arrange
        getMockService().addFavorite.mockResolvedValue(undefined);

        // Act
        await request(app)
            .post("/api/v1/favorites")
            .set("X-Device-Id", "device-xyz")
            .send({ entityType: "stop", entityId: "stop-9" });

        // Assert
        expect(getMockService().addFavorite).toHaveBeenCalledWith("device-xyz", "stop", "stop-9");
    });
});

describe("DELETE /api/v1/favorites/:entityType/:entityId", () => {
    it("responds with 400 when X-Device-Id header is missing", async () => {
        // Act
        const response = await request(app).delete("/api/v1/favorites/route/route-1");

        // Assert
        expect(response.status).toBe(400);
    });

    it("responds with 200 and success:true for a device that never favorited route-1", async () => {
        // Arrange
        getMockService().removeFavorite.mockResolvedValue(undefined);

        // Act
        const response = await request(app).delete("/api/v1/favorites/route/route-1").set("X-Device-Id", "device-a");

        // Assert
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true });
    });

    it("responds with 200 and success:true for a device that did favorite route-1, calling deleteFavorite with (deviceId, 'route', 'route-1')", async () => {
        // Arrange
        getMockService().removeFavorite.mockResolvedValue(undefined);

        // Act
        const response = await request(app).delete("/api/v1/favorites/route/route-1").set("X-Device-Id", "device-a");

        // Assert
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true });
        expect(getMockService().removeFavorite).toHaveBeenCalledWith("device-a", "route", "route-1");
    });

    it("responds with 400 for an invalid entityType path segment", async () => {
        // Act
        const response = await request(app).delete("/api/v1/favorites/vehicle/x").set("X-Device-Id", "device-a");

        // Assert
        expect(response.status).toBe(400);
    });
});

describe("GET /api/v1/favorites", () => {
    it("responds with 400 when X-Device-Id header is missing", async () => {
        // Act
        const response = await request(app).get("/api/v1/favorites");

        // Assert
        expect(response.status).toBe(400);
    });

    it("responds with 200 and [] for a mocked empty listFavorites result", async () => {
        // Arrange
        getMockService().listFavorites.mockResolvedValue([]);

        // Act
        const response = await request(app).get("/api/v1/favorites").set("X-Device-Id", "device-a");

        // Assert
        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
    });

    it("responds with 200 and the service's array body for a mixed route+stop result", async () => {
        // Arrange
        const payload = [
            { entityType: "route", favoritedAt: "2026-08-31T10:00:00.000Z", entity: { id: "route-1" } },
            { entityType: "stop", favoritedAt: "2026-08-31T09:00:00.000Z", entity: { id: "stop-1" } },
        ];
        getMockService().listFavorites.mockResolvedValue(payload);

        // Act
        const response = await request(app).get("/api/v1/favorites").set("X-Device-Id", "device-a");

        // Assert
        expect(response.status).toBe(200);
        expect(response.body).toEqual(payload);
    });
});
