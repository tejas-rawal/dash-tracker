import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("../services/FavoritesService", () => ({
    createFavoritesService: vi.fn(() => ({
        addFavorite: vi.fn(),
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
