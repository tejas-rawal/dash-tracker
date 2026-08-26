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

const makeMockQueryReq = (query: Record<string, string> = {}): Request => ({ query }) as unknown as Request;

const makeMockService = () => ({
    getStopsForRoute: vi.fn(),
    getNearbyStops: vi.fn(),
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

    describe("getNearbyStops", () => {
        it("responds with 400 when lat is missing", () => {
            // Arrange
            const mockService = makeMockService();
            const { getNearbyStops } = createStopController(mockService);
            const req = makeMockQueryReq({ lng: "-77.1" });
            const res = makeMockRes();

            // Act
            getNearbyStops(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                error: "Bad Request",
                details: "lat parameter is required and must be a valid latitude (-90 to 90)",
            });
        });

        it("responds with 400 when lng is missing", () => {
            // Arrange
            const mockService = makeMockService();
            const { getNearbyStops } = createStopController(mockService);
            const req = makeMockQueryReq({ lat: "38.8" });
            const res = makeMockRes();

            // Act
            getNearbyStops(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                error: "Bad Request",
                details: "lng parameter is required and must be a valid longitude (-180 to 180)",
            });
        });

        it("responds with 400 when lat is out of range", () => {
            // Arrange
            const mockService = makeMockService();
            const { getNearbyStops } = createStopController(mockService);
            const req = makeMockQueryReq({ lat: "95", lng: "-77.1" });
            const res = makeMockRes();

            // Act
            getNearbyStops(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ error: "Bad Request", details: expect.stringContaining("lat") }),
            );
        });

        it("responds with 400 when lng is out of range", () => {
            // Arrange
            const mockService = makeMockService();
            const { getNearbyStops } = createStopController(mockService);
            const req = makeMockQueryReq({ lat: "38.8", lng: "-200" });
            const res = makeMockRes();

            // Act
            getNearbyStops(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ error: "Bad Request", details: expect.stringContaining("lng") }),
            );
        });

        it("responds with 400 when lat is non-numeric", () => {
            // Arrange
            const mockService = makeMockService();
            const { getNearbyStops } = createStopController(mockService);
            const req = makeMockQueryReq({ lat: "abc", lng: "-77.1" });
            const res = makeMockRes();

            // Act
            getNearbyStops(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it("responds with 400 when radius is invalid", () => {
            // Arrange
            const mockService = makeMockService();
            const { getNearbyStops } = createStopController(mockService);
            const req = makeMockQueryReq({ lat: "38.8", lng: "-77.1", radius: "abc" });
            const res = makeMockRes();

            // Act
            getNearbyStops(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                error: "Bad Request",
                details: "radius parameter must be a positive number",
            });
        });

        it("responds with 400 when radius is -1", () => {
            // Arrange
            const mockService = makeMockService();
            const { getNearbyStops } = createStopController(mockService);
            const req = makeMockQueryReq({ lat: "38.8", lng: "-77.1", radius: "-1" });
            const res = makeMockRes();

            // Act
            getNearbyStops(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ details: expect.stringContaining("radius") }),
            );
        });

        it("responds with 400 when radius is 0", () => {
            // Arrange
            const mockService = makeMockService();
            const { getNearbyStops } = createStopController(mockService);
            const req = makeMockQueryReq({ lat: "38.8", lng: "-77.1", radius: "0" });
            const res = makeMockRes();

            // Act
            getNearbyStops(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ details: expect.stringContaining("radius") }),
            );
        });

        it("responds with 400 when count is invalid", () => {
            // Arrange
            const mockService = makeMockService();
            const { getNearbyStops } = createStopController(mockService);
            const req = makeMockQueryReq({ lat: "38.8", lng: "-77.1", count: "abc" });
            const res = makeMockRes();

            // Act
            getNearbyStops(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                error: "Bad Request",
                details: "count parameter must be a positive integer",
            });
        });

        it("responds with 400 when count is 0", () => {
            // Arrange
            const mockService = makeMockService();
            const { getNearbyStops } = createStopController(mockService);
            const req = makeMockQueryReq({ lat: "38.8", lng: "-77.1", count: "0" });
            const res = makeMockRes();

            // Act
            getNearbyStops(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ details: expect.stringContaining("count") }),
            );
        });

        it("responds with 400 when count is -5", () => {
            // Arrange
            const mockService = makeMockService();
            const { getNearbyStops } = createStopController(mockService);
            const req = makeMockQueryReq({ lat: "38.8", lng: "-77.1", count: "-5" });
            const res = makeMockRes();

            // Act
            getNearbyStops(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ details: expect.stringContaining("count") }),
            );
        });

        it("responds with 200 and the service result for valid params", () => {
            // Arrange
            const mockService = makeMockService();
            const payload = [{ id: "stop-1", name: "Main St", code: 101, lat: 38.8, lon: -77.1, distance: 0 }];
            mockService.getNearbyStops.mockReturnValue(payload);
            const { getNearbyStops } = createStopController(mockService);
            const req = makeMockQueryReq({ lat: "38.8", lng: "-77.1" });
            const res = makeMockRes();

            // Act
            getNearbyStops(req, res, vi.fn());

            // Assert
            expect(res.json).toHaveBeenCalledWith(payload);
            expect(res.status).not.toHaveBeenCalled();
        });

        it("calls service.getNearbyStops with parsed numeric lat/lng and the radius/count options", () => {
            // Arrange
            const mockService = makeMockService();
            mockService.getNearbyStops.mockReturnValue([]);
            const { getNearbyStops } = createStopController(mockService);
            const req = makeMockQueryReq({ lat: "38.8", lng: "-77.1", radius: "2", count: "5" });
            const res = makeMockRes();

            // Act
            getNearbyStops(req, res, vi.fn());

            // Assert
            expect(mockService.getNearbyStops).toHaveBeenCalledWith(38.8, -77.1, { radius: 2, count: 5 });
        });

        it("passes undefined for radius/count in the options object when they are omitted from the query", () => {
            // Arrange
            const mockService = makeMockService();
            mockService.getNearbyStops.mockReturnValue([]);
            const { getNearbyStops } = createStopController(mockService);
            const req = makeMockQueryReq({ lat: "38.8", lng: "-77.1" });
            const res = makeMockRes();

            // Act
            getNearbyStops(req, res, vi.fn());

            // Assert
            expect(mockService.getNearbyStops).toHaveBeenCalledWith(38.8, -77.1, {
                radius: undefined,
                count: undefined,
            });
        });
    });
});
