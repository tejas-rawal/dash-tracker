import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("../services/RecentsService", () => ({
    createRecentsService: vi.fn(() => ({
        listRecents: vi.fn(),
    })),
}));

import app from "../../test/app";
import { createRecentsService } from "../services/RecentsService";

const getMockService = () => vi.mocked(createRecentsService).mock.results[0]?.value;

describe("GET /api/v1/recents", () => {
    it("responds with 400 when X-Device-Id header is missing", async () => {
        // Act
        const response = await request(app).get("/api/v1/recents");

        // Assert
        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
            error: "Bad Request",
            details: "X-Device-Id header is required",
        });
    });

    it("responds with 200 and [] for a mocked empty listRecents result", async () => {
        // Arrange
        getMockService().listRecents.mockResolvedValue([]);

        // Act
        const response = await request(app).get("/api/v1/recents").set("X-Device-Id", "device-a");

        // Assert
        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
    });

    it("responds with 200 and the service's array body for a mixed route+stop result", async () => {
        // Arrange
        const payload = [
            { entityType: "route", viewedAt: "2026-08-31T10:00:00.000Z", entity: { id: "route-1" } },
            { entityType: "stop", viewedAt: "2026-08-31T09:00:00.000Z", entity: { id: "stop-1" } },
        ];
        getMockService().listRecents.mockResolvedValue(payload);

        // Act
        const response = await request(app).get("/api/v1/recents").set("X-Device-Id", "device-a");

        // Assert
        expect(response.status).toBe(200);
        expect(response.body).toEqual(payload);
    });
});
