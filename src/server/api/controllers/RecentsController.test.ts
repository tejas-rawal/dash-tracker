import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { createRecentsController } from "./RecentsController";

const makeMockRes = () => {
    const res = {
        json: vi.fn(),
        status: vi.fn(),
    } as unknown as Response;
    (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
    return res;
};

const makeMockReq = (headers: Record<string, string | string[] | undefined> = { "x-device-id": "device-a" }): Request =>
    ({ headers }) as unknown as Request;

const makeMockService = () => ({
    listRecents: vi.fn(),
});

describe("RecentsController", () => {
    describe("listRecents", () => {
        it("responds with 200 and [] when the service resolves an empty array", async () => {
            // Arrange
            const mockService = makeMockService();
            mockService.listRecents.mockResolvedValue([]);
            const { listRecents } = createRecentsController(mockService as never);
            const req = makeMockReq();
            const res = makeMockRes();

            // Act
            await listRecents(req, res, vi.fn());

            // Assert
            expect(res.json).toHaveBeenCalledWith([]);
            expect(res.status).not.toHaveBeenCalled();
        });

        it("responds with 200 and the service's array verbatim on success", async () => {
            // Arrange
            const mockService = makeMockService();
            const payload = [{ entityType: "route", viewedAt: "2026-08-31T10:00:00.000Z", entity: { id: "route-1" } }];
            mockService.listRecents.mockResolvedValue(payload);
            const { listRecents } = createRecentsController(mockService as never);
            const req = makeMockReq();
            const res = makeMockRes();

            // Act
            await listRecents(req, res, vi.fn());

            // Assert
            expect(res.json).toHaveBeenCalledWith(payload);
        });

        it("calls service.listRecents with the deviceId read from the X-Device-Id header", async () => {
            // Arrange
            const mockService = makeMockService();
            mockService.listRecents.mockResolvedValue([]);
            const { listRecents } = createRecentsController(mockService as never);
            const req = makeMockReq({ "x-device-id": "device-xyz" });
            const res = makeMockRes();

            // Act
            await listRecents(req, res, vi.fn());

            // Assert
            expect(mockService.listRecents).toHaveBeenCalledWith("device-xyz");
        });

        it("responds with 500 and Request Failed body when the service throws a generic Error", async () => {
            // Arrange
            const mockService = makeMockService();
            mockService.listRecents.mockRejectedValue(new Error("unexpected"));
            const { listRecents } = createRecentsController(mockService as never);
            const req = makeMockReq();
            const res = makeMockRes();

            // Act
            await listRecents(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ error: "Request Failed", details: "unexpected" });
        });
    });
});
