import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { NotFoundError } from "../errors";
import type { RouteDirectionStops } from "../models";
import { createStopController } from "./StopController";

const makeMockRes = () => {
    const res = {
        json: vi.fn(),
        status: vi.fn(),
    } as unknown as Response;
    (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
    return res;
};

const makeMockReq = (params: Record<string, string> = {}): Request => ({ params }) as unknown as Request;

const makeMockService = () => ({
    getStopsForRoute: vi.fn(),
});

const makeStopsResponse = (): RouteDirectionStops[] => [{ directionId: "d1", title: "Northbound", stops: [] }];

describe("StopController", () => {
    describe("getStopsForRoute", () => {
        it("calls service.getStopsForRoute with req.params.shortName", () => {
            // Arrange
            const mockService = makeMockService();
            mockService.getStopsForRoute.mockReturnValue(makeStopsResponse());
            const { getStopsForRoute } = createStopController(mockService);
            const req = makeMockReq({ shortName: "1A" });
            const res = makeMockRes();

            // Act
            getStopsForRoute(req, res, vi.fn());

            // Assert
            expect(mockService.getStopsForRoute).toHaveBeenCalledWith("1A");
        });

        it("responds with 200 and the service's return value on success", () => {
            // Arrange
            const mockService = makeMockService();
            const payload = makeStopsResponse();
            mockService.getStopsForRoute.mockReturnValue(payload);
            const { getStopsForRoute } = createStopController(mockService);
            const req = makeMockReq({ shortName: "1A" });
            const res = makeMockRes();

            // Act
            getStopsForRoute(req, res, vi.fn());

            // Assert
            expect(res.json).toHaveBeenCalledWith(payload);
        });

        it("does not call res.status on success", () => {
            // Arrange
            const mockService = makeMockService();
            mockService.getStopsForRoute.mockReturnValue(makeStopsResponse());
            const { getStopsForRoute } = createStopController(mockService);
            const req = makeMockReq({ shortName: "1A" });
            const res = makeMockRes();

            // Act
            getStopsForRoute(req, res, vi.fn());

            // Assert
            expect(res.status).not.toHaveBeenCalled();
        });

        it("responds with 404 and a Not Found error body when the service throws NotFoundError", () => {
            // Arrange
            const mockService = makeMockService();
            mockService.getStopsForRoute.mockImplementation(() => {
                throw new NotFoundError("Route not found: UNKNOWN");
            });
            const { getStopsForRoute } = createStopController(mockService);
            const req = makeMockReq({ shortName: "UNKNOWN" });
            const res = makeMockRes();

            // Act
            getStopsForRoute(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({
                error: "Not Found",
                details: "Route not found: UNKNOWN",
            });
        });

        it("responds with 500 and a Request Failed error body when the service throws a generic Error", () => {
            // Arrange
            const mockService = makeMockService();
            mockService.getStopsForRoute.mockImplementation(() => {
                throw new Error("unexpected");
            });
            const { getStopsForRoute } = createStopController(mockService);
            const req = makeMockReq({ shortName: "1A" });
            const res = makeMockRes();

            // Act
            getStopsForRoute(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                error: "Request Failed",
                details: "unexpected",
            });
        });
    });
});
