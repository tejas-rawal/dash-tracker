import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { NotFoundError } from "../errors";
import { createFavoritesController } from "./FavoritesController";

const makeMockRes = () => {
    const res = {
        json: vi.fn(),
        status: vi.fn(),
    } as unknown as Response;
    (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
    return res;
};

const makeMockReq = (
    body: Record<string, unknown> = {},
    headers: Record<string, string | string[] | undefined> = { "x-device-id": "device-a" },
): Request => ({ body, headers, params: {} }) as unknown as Request;

const makeMockReqWithParams = (
    params: Record<string, string> = {},
    headers: Record<string, string | string[] | undefined> = { "x-device-id": "device-a" },
): Request => ({ body: {}, headers, params }) as unknown as Request;

const makeMockService = () => ({
    addFavorite: vi.fn(),
    removeFavorite: vi.fn(),
    listFavorites: vi.fn(),
});

describe("FavoritesController", () => {
    describe("favorite", () => {
        it("responds with 400 when entityType is invalid", async () => {
            // Arrange
            const mockService = makeMockService();
            const { favorite } = createFavoritesController(mockService as never);
            const req = makeMockReq({ entityType: "vehicle", entityId: "id-1" });
            const res = makeMockRes();

            // Act
            await favorite(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ error: "Bad Request", details: expect.stringContaining("entityType") }),
            );
            expect(mockService.addFavorite).not.toHaveBeenCalled();
        });

        it("responds with 400 when entityId is missing", async () => {
            // Arrange
            const mockService = makeMockService();
            const { favorite } = createFavoritesController(mockService as never);
            const req = makeMockReq({ entityType: "route" });
            const res = makeMockRes();

            // Act
            await favorite(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: "Bad Request", details: "entityId is required" });
        });

        it("responds with 400 when entityId is an empty string", async () => {
            // Arrange
            const mockService = makeMockService();
            const { favorite } = createFavoritesController(mockService as never);
            const req = makeMockReq({ entityType: "route", entityId: "  " });
            const res = makeMockRes();

            // Act
            await favorite(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it("responds with 404 and Not Found body when the service throws NotFoundError", async () => {
            // Arrange
            const mockService = makeMockService();
            mockService.addFavorite.mockRejectedValue(new NotFoundError("route not found: route-1"));
            const { favorite } = createFavoritesController(mockService as never);
            const req = makeMockReq({ entityType: "route", entityId: "route-1" });
            const res = makeMockRes();

            // Act
            await favorite(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ error: "Not Found", details: "route not found: route-1" });
        });

        it("responds with 200 and success:true when the service resolves", async () => {
            // Arrange
            const mockService = makeMockService();
            mockService.addFavorite.mockResolvedValue(undefined);
            const { favorite } = createFavoritesController(mockService as never);
            const req = makeMockReq({ entityType: "route", entityId: "route-1" });
            const res = makeMockRes();

            // Act
            await favorite(req, res, vi.fn());

            // Assert
            expect(res.json).toHaveBeenCalledWith({ success: true });
            expect(res.status).not.toHaveBeenCalled();
        });

        it("calls service.addFavorite with deviceId read from X-Device-Id header", async () => {
            // Arrange
            const mockService = makeMockService();
            mockService.addFavorite.mockResolvedValue(undefined);
            const { favorite } = createFavoritesController(mockService as never);
            const req = makeMockReq({ entityType: "stop", entityId: "stop-1" }, { "x-device-id": "device-xyz" });
            const res = makeMockRes();

            // Act
            await favorite(req, res, vi.fn());

            // Assert
            expect(mockService.addFavorite).toHaveBeenCalledWith("device-xyz", "stop", "stop-1");
        });

        it("responds with 500 and Request Failed body when the service throws a generic Error", async () => {
            // Arrange
            const mockService = makeMockService();
            mockService.addFavorite.mockRejectedValue(new Error("unexpected"));
            const { favorite } = createFavoritesController(mockService as never);
            const req = makeMockReq({ entityType: "route", entityId: "route-1" });
            const res = makeMockRes();

            // Act
            await favorite(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ error: "Request Failed", details: "unexpected" });
        });
    });

    describe("unfavorite", () => {
        it("responds with 400 when entityType path segment is invalid", async () => {
            // Arrange
            const mockService = makeMockService();
            const { unfavorite } = createFavoritesController(mockService as never);
            const req = makeMockReqWithParams({ entityType: "vehicle", entityId: "id-1" });
            const res = makeMockRes();

            // Act
            await unfavorite(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ error: "Bad Request", details: expect.stringContaining("entityType") }),
            );
            expect(mockService.removeFavorite).not.toHaveBeenCalled();
        });

        it("responds with 200 and success:true for a device that never favorited the entity", async () => {
            // Arrange
            const mockService = makeMockService();
            mockService.removeFavorite.mockResolvedValue(undefined);
            const { unfavorite } = createFavoritesController(mockService as never);
            const req = makeMockReqWithParams({ entityType: "route", entityId: "route-1" });
            const res = makeMockRes();

            // Act
            await unfavorite(req, res, vi.fn());

            // Assert
            expect(res.json).toHaveBeenCalledWith({ success: true });
            expect(res.status).not.toHaveBeenCalled();
        });

        it("responds with 200 and success:true for a device that did favorite the entity", async () => {
            // Arrange
            const mockService = makeMockService();
            mockService.removeFavorite.mockResolvedValue(undefined);
            const { unfavorite } = createFavoritesController(mockService as never);
            const req = makeMockReqWithParams({ entityType: "route", entityId: "route-1" });
            const res = makeMockRes();

            // Act
            await unfavorite(req, res, vi.fn());

            // Assert
            expect(res.json).toHaveBeenCalledWith({ success: true });
        });

        it("calls service.removeFavorite with deviceId, entityType, entityId from params", async () => {
            // Arrange
            const mockService = makeMockService();
            mockService.removeFavorite.mockResolvedValue(undefined);
            const { unfavorite } = createFavoritesController(mockService as never);
            const req = makeMockReqWithParams(
                { entityType: "route", entityId: "route-1" },
                { "x-device-id": "device-xyz" },
            );
            const res = makeMockRes();

            // Act
            await unfavorite(req, res, vi.fn());

            // Assert
            expect(mockService.removeFavorite).toHaveBeenCalledWith("device-xyz", "route", "route-1");
        });

        it("responds with 500 and Request Failed body when the service throws a generic Error", async () => {
            // Arrange
            const mockService = makeMockService();
            mockService.removeFavorite.mockRejectedValue(new Error("unexpected"));
            const { unfavorite } = createFavoritesController(mockService as never);
            const req = makeMockReqWithParams({ entityType: "route", entityId: "route-1" });
            const res = makeMockRes();

            // Act
            await unfavorite(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ error: "Request Failed", details: "unexpected" });
        });
    });

    describe("listFavorites", () => {
        it("responds with 200 and [] when the service resolves an empty array", async () => {
            // Arrange
            const mockService = makeMockService();
            mockService.listFavorites.mockResolvedValue([]);
            const { listFavorites } = createFavoritesController(mockService as never);
            const req = makeMockReq();
            const res = makeMockRes();

            // Act
            await listFavorites(req, res, vi.fn());

            // Assert
            expect(res.json).toHaveBeenCalledWith([]);
            expect(res.status).not.toHaveBeenCalled();
        });

        it("responds with 200 and the service's array verbatim on success", async () => {
            // Arrange
            const mockService = makeMockService();
            const payload = [
                { entityType: "route", favoritedAt: "2026-08-31T10:00:00.000Z", entity: { id: "route-1" } },
            ];
            mockService.listFavorites.mockResolvedValue(payload);
            const { listFavorites } = createFavoritesController(mockService as never);
            const req = makeMockReq();
            const res = makeMockRes();

            // Act
            await listFavorites(req, res, vi.fn());

            // Assert
            expect(res.json).toHaveBeenCalledWith(payload);
        });

        it("calls service.listFavorites with the deviceId read from the X-Device-Id header", async () => {
            // Arrange
            const mockService = makeMockService();
            mockService.listFavorites.mockResolvedValue([]);
            const { listFavorites } = createFavoritesController(mockService as never);
            const req = makeMockReq({}, { "x-device-id": "device-xyz" });
            const res = makeMockRes();

            // Act
            await listFavorites(req, res, vi.fn());

            // Assert
            expect(mockService.listFavorites).toHaveBeenCalledWith("device-xyz");
        });

        it("responds with 500 and Request Failed body when the service throws a generic Error", async () => {
            // Arrange
            const mockService = makeMockService();
            mockService.listFavorites.mockRejectedValue(new Error("unexpected"));
            const { listFavorites } = createFavoritesController(mockService as never);
            const req = makeMockReq();
            const res = makeMockRes();

            // Act
            await listFavorites(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ error: "Request Failed", details: "unexpected" });
        });
    });
});
