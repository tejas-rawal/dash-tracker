import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { DataNotReadyError } from "../errors";
import { createRecentsController } from "./RecentsController";

const makeMockRes = () => {
    const res = {
        json: vi.fn(),
        set: vi.fn(),
        status: vi.fn(),
    } as unknown as Response;
    (res.set as ReturnType<typeof vi.fn>).mockReturnValue(res);
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

        it("responds with 500 and a generic Request Failed body that does not echo the thrown message", async () => {
            // Arrange
            const mockService = makeMockService();
            mockService.listRecents.mockRejectedValue(new Error("recents listing crashed"));
            const { listRecents } = createRecentsController(mockService as never);
            const req = makeMockReq();
            const res = makeMockRes();

            // Act
            await listRecents(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                error: "Request Failed",
                details: "An unexpected error occurred",
            });
            expect(JSON.stringify(vi.mocked(res.json).mock.calls[0][0])).not.toContain("recents listing crashed");
        });

        it("responds with 503 and Retry-After when route/stop data has not loaded yet", async () => {
            // Arrange
            const mockService = makeMockService();
            mockService.listRecents.mockRejectedValue(new DataNotReadyError("Route and stop data is still loading"));
            const { listRecents } = createRecentsController(mockService as never);
            const req = makeMockReq();
            const res = makeMockRes();

            // Act
            await listRecents(req, res, vi.fn());

            // Assert
            expect(res.set).toHaveBeenCalledWith("Retry-After", "5");
            expect(res.status).toHaveBeenCalledWith(503);
            expect(res.json).toHaveBeenCalledWith({
                error: "Service Unavailable",
                details: "Route and stop data is still loading",
            });
        });
    });
});
