import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { NotFoundError, UpstreamApiError } from "../errors";
import type { VehiclePositionsResponse } from "../models/Vehicle";
import { createVehicleController } from "./VehicleController";

const makeMockRes = () => {
    const res = {
        json: vi.fn(),
        status: vi.fn(),
    } as unknown as Response;
    (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
    return res;
};

const makeMockReq = (query: Record<string, string> = {}): Request => ({ query }) as unknown as Request;

const makeVehiclePositionsResponse = (): VehiclePositionsResponse => ({
    success: true,
    generatedAt: "2026-01-01T00:00:00.000Z",
    data: {
        agencyKey: "alexandria-dash",
        vehicles: [],
    },
});

const makeMockService = () => ({
    getVehiclePositions: vi.fn(),
});

describe("VehicleController", () => {
    describe("getVehiclePositions", () => {
        it("calls the service with route undefined when no query param is present", async () => {
            // Arrange
            const mockService = makeMockService();
            mockService.getVehiclePositions.mockResolvedValue(makeVehiclePositionsResponse());
            const { getVehiclePositions } = createVehicleController(mockService);
            const req = makeMockReq({});
            const res = makeMockRes();

            // Act
            await getVehiclePositions(req, res, vi.fn());

            // Assert
            expect(mockService.getVehiclePositions).toHaveBeenCalledWith({ route: undefined });
        });

        it("calls the service with the provided route value when present", async () => {
            // Arrange
            const mockService = makeMockService();
            mockService.getVehiclePositions.mockResolvedValue(makeVehiclePositionsResponse());
            const { getVehiclePositions } = createVehicleController(mockService);
            const req = makeMockReq({ route: "1A" });
            const res = makeMockRes();

            // Act
            await getVehiclePositions(req, res, vi.fn());

            // Assert
            expect(mockService.getVehiclePositions).toHaveBeenCalledWith({ route: "1A" });
        });

        it("responds with 200 and the service's response body on success", async () => {
            // Arrange
            const mockService = makeMockService();
            const payload = makeVehiclePositionsResponse();
            mockService.getVehiclePositions.mockResolvedValue(payload);
            const { getVehiclePositions } = createVehicleController(mockService);
            const req = makeMockReq({});
            const res = makeMockRes();

            // Act
            await getVehiclePositions(req, res, vi.fn());

            // Assert
            expect(res.json).toHaveBeenCalledWith(payload);
        });

        it("does not call res.status on success", async () => {
            // Arrange
            const mockService = makeMockService();
            mockService.getVehiclePositions.mockResolvedValue(makeVehiclePositionsResponse());
            const { getVehiclePositions } = createVehicleController(mockService);
            const req = makeMockReq({});
            const res = makeMockRes();

            // Act
            await getVehiclePositions(req, res, vi.fn());

            // Assert
            expect(res.status).not.toHaveBeenCalled();
        });

        it("responds with 502 and a Bad Gateway body when the service throws UpstreamApiError", async () => {
            // Arrange
            const mockService = makeMockService();
            mockService.getVehiclePositions.mockRejectedValue(
                new UpstreamApiError("DASH API returned success: false for vehicle positions"),
            );
            const { getVehiclePositions } = createVehicleController(mockService);
            const req = makeMockReq({});
            const res = makeMockRes();

            // Act
            await getVehiclePositions(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(502);
            expect(res.json).toHaveBeenCalledWith({
                error: "Bad Gateway",
                details: "DASH API returned success: false for vehicle positions",
            });
        });

        it("responds with 404 and a Not Found body when the service throws NotFoundError", async () => {
            // Arrange
            const mockService = makeMockService();
            mockService.getVehiclePositions.mockRejectedValue(new NotFoundError("Route not found: UNKNOWN"));
            const { getVehiclePositions } = createVehicleController(mockService);
            const req = makeMockReq({});
            const res = makeMockRes();

            // Act
            await getVehiclePositions(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({
                error: "Not Found",
                details: "Route not found: UNKNOWN",
            });
        });

        it("responds with 500 and a Request Failed body when the service throws a generic Error", async () => {
            // Arrange
            const mockService = makeMockService();
            mockService.getVehiclePositions.mockRejectedValue(new Error("network error"));
            const { getVehiclePositions } = createVehicleController(mockService);
            const req = makeMockReq({});
            const res = makeMockRes();

            // Act
            await getVehiclePositions(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                error: "Request Failed",
                details: "network error",
            });
        });
    });
});
