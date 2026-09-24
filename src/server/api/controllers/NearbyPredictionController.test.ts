import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { UpstreamApiError } from "../errors";
import type { NearbyPredictionsResponse } from "../models/Prediction";
import { createNearbyPredictionController } from "./NearbyPredictionController";

const LAT_DETAILS = "lat parameter is required and must be a valid latitude (-90 to 90)";
const LNG_DETAILS = "lng parameter is required and must be a valid longitude (-180 to 180)";
const RADIUS_DETAILS = "radius parameter must be a positive number no greater than 1 (miles)";
const NUMBER_DETAILS = "number parameter must be an integer from 1 to 10";

const VALID_QUERY = { lat: "38.8048", lng: "-77.0469" };

const makeMockRes = () => {
    const res = {
        json: vi.fn(),
        status: vi.fn(),
    } as unknown as Response;
    (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
    return res;
};

// Query values are unknown so tests can inject the arrays and objects Express's qs parser produces.
const makeMockReq = (query: Record<string, unknown> = {}): Request => ({ query, headers: {} }) as unknown as Request;

const makeMockService = () => ({
    getNearbyPredictions: vi.fn(),
});

const makeNearbyPredictionsResponse = (): NearbyPredictionsResponse => ({
    success: true,
    generatedAt: "2026-01-01T00:00:00.000Z",
    data: {
        agencyKey: "alexandria-dash",
        stops: [
            {
                id: "548",
                name: "King St + N Washington St",
                code: 4000858,
                distance: 46.5 / 1609.344,
                routes: [],
                alerts: [],
            },
        ],
    },
});

const runHandler = async (query: Record<string, unknown>) => {
    const mockService = makeMockService();
    mockService.getNearbyPredictions.mockResolvedValue(makeNearbyPredictionsResponse());
    const { getNearbyPredictions } = createNearbyPredictionController(mockService);
    const req = makeMockReq(query);
    const res = makeMockRes();
    await getNearbyPredictions(req, res, vi.fn());
    return { mockService, res };
};

describe("NearbyPredictionController", () => {
    describe("getNearbyPredictions", () => {
        describe("valid requests", () => {
            it("calls the service with parsed lat/lng and undefined radius/number, then responds with its result", async () => {
                // Arrange
                const mockService = makeMockService();
                const result = makeNearbyPredictionsResponse();
                mockService.getNearbyPredictions.mockResolvedValue(result);
                const { getNearbyPredictions } = createNearbyPredictionController(mockService);
                const req = makeMockReq(VALID_QUERY);
                const res = makeMockRes();

                // Act
                await getNearbyPredictions(req, res, vi.fn());

                // Assert
                expect(mockService.getNearbyPredictions).toHaveBeenCalledTimes(1);
                expect(mockService.getNearbyPredictions).toHaveBeenCalledWith(38.8048, -77.0469, {
                    radius: undefined,
                    number: undefined,
                });
                expect(res.status).not.toHaveBeenCalled();
                expect(res.json).toHaveBeenCalledWith(result);
            });

            it("passes radius and number through as numbers", async () => {
                // Arrange & Act
                const { mockService } = await runHandler({ ...VALID_QUERY, radius: "0.25", number: "3" });

                // Assert
                expect(mockService.getNearbyPredictions).toHaveBeenCalledWith(38.8048, -77.0469, {
                    radius: 0.25,
                    number: 3,
                });
            });

            it("passes number 5.0 as the integer 5", async () => {
                // Arrange & Act
                const { mockService } = await runHandler({ ...VALID_QUERY, number: "5.0" });

                // Assert
                expect(mockService.getNearbyPredictions).toHaveBeenCalledWith(38.8048, -77.0469, {
                    radius: undefined,
                    number: 5,
                });
            });
        });

        describe("accepted boundaries", () => {
            it.each([
                [
                    "lat",
                    "-90",
                    { lat: "-90", lng: "-77.0469" },
                    [-90, -77.0469, { radius: undefined, number: undefined }],
                ],
                ["lat", "90", { lat: "90", lng: "-77.0469" }, [90, -77.0469, { radius: undefined, number: undefined }]],
                [
                    "lng",
                    "-180",
                    { lat: "38.8048", lng: "-180" },
                    [38.8048, -180, { radius: undefined, number: undefined }],
                ],
                [
                    "lng",
                    "180",
                    { lat: "38.8048", lng: "180" },
                    [38.8048, 180, { radius: undefined, number: undefined }],
                ],
                ["radius", "1", { ...VALID_QUERY, radius: "1" }, [38.8048, -77.0469, { radius: 1, number: undefined }]],
                ["number", "1", { ...VALID_QUERY, number: "1" }, [38.8048, -77.0469, { radius: undefined, number: 1 }]],
                [
                    "number",
                    "10",
                    { ...VALID_QUERY, number: "10" },
                    [38.8048, -77.0469, { radius: undefined, number: 10 }],
                ],
            ])("accepts %s=%s", async (_param, _value, query, expectedArgs) => {
                // Arrange & Act
                const { mockService, res } = await runHandler(query);

                // Assert
                expect(res.status).not.toHaveBeenCalled();
                expect(mockService.getNearbyPredictions).toHaveBeenCalledWith(...expectedArgs);
            });
        });

        describe("lat validation", () => {
            it.each([
                ["missing", undefined],
                ["empty", ""],
                ["whitespace", "   "],
                ["non-numeric", "abc"],
                ["NaN", "NaN"],
                ["Infinity", "Infinity"],
                ["overflowing", "1e999"],
                ["below -90", "-90.0001"],
                ["above 90", "90.0001"],
                ["repeated", ["1", "2"]],
                ["nested", { x: "1" }],
            ])("responds with 400 when lat is %s", async (_label, lat) => {
                // Arrange & Act
                const { mockService, res } = await runHandler({ lat, lng: "-77.0469" });

                // Assert
                expect(res.status).toHaveBeenCalledWith(400);
                expect(res.json).toHaveBeenCalledWith({ error: "Bad Request", details: LAT_DETAILS });
                expect(mockService.getNearbyPredictions).not.toHaveBeenCalled();
            });
        });

        describe("lng validation", () => {
            it.each([
                ["missing", undefined],
                ["empty", ""],
                ["whitespace", "   "],
                ["non-numeric", "abc"],
                ["below -180", "-180.0001"],
                ["above 180", "180.0001"],
                ["repeated", ["1", "2"]],
            ])("responds with 400 when lng is %s", async (_label, lng) => {
                // Arrange & Act
                const { mockService, res } = await runHandler({ lat: "38.8048", lng });

                // Assert
                expect(res.status).toHaveBeenCalledWith(400);
                expect(res.json).toHaveBeenCalledWith({ error: "Bad Request", details: LNG_DETAILS });
                expect(mockService.getNearbyPredictions).not.toHaveBeenCalled();
            });
        });

        describe("radius validation", () => {
            it.each([
                ["empty", ""],
                ["zero", "0"],
                ["negative", "-0.5"],
                ["non-numeric", "abc"],
                ["Infinity", "Infinity"],
                ["just above 1", "1.0001"],
                ["above 1", "1.5"],
                ["repeated", ["0.5", "0.5"]],
            ])("responds with 400 when radius is %s", async (_label, radius) => {
                // Arrange & Act
                const { mockService, res } = await runHandler({ ...VALID_QUERY, radius });

                // Assert
                expect(res.status).toHaveBeenCalledWith(400);
                expect(res.json).toHaveBeenCalledWith({ error: "Bad Request", details: RADIUS_DETAILS });
                expect(mockService.getNearbyPredictions).not.toHaveBeenCalled();
            });
        });

        describe("number validation", () => {
            it.each([
                ["empty", ""],
                ["zero", "0"],
                ["above 10", "11"],
                ["fractional", "5.5"],
                ["negative", "-1"],
                ["non-numeric", "abc"],
                ["repeated", ["3", "3"]],
            ])("responds with 400 when number is %s", async (_label, number) => {
                // Arrange & Act
                const { mockService, res } = await runHandler({ ...VALID_QUERY, number });

                // Assert
                expect(res.status).toHaveBeenCalledWith(400);
                expect(res.json).toHaveBeenCalledWith({ error: "Bad Request", details: NUMBER_DETAILS });
                expect(mockService.getNearbyPredictions).not.toHaveBeenCalled();
            });
        });

        describe("validation order", () => {
            it.each([
                ["lat before radius", { lat: "abc", lng: "-77.0469", radius: "5" }, LAT_DETAILS],
                ["lng before number", { lat: "38.8048", lng: "abc", number: "11" }, LNG_DETAILS],
                ["radius before number", { ...VALID_QUERY, radius: "5", number: "11" }, RADIUS_DETAILS],
            ])("reports %s when both are invalid", async (_label, query, details) => {
                // Arrange & Act
                const { mockService, res } = await runHandler(query);

                // Assert
                expect(res.status).toHaveBeenCalledWith(400);
                expect(res.json).toHaveBeenCalledWith({ error: "Bad Request", details });
                expect(mockService.getNearbyPredictions).not.toHaveBeenCalled();
            });
        });

        describe("error mapping", () => {
            it("responds with 502 Bad Gateway when the service throws UpstreamApiError", async () => {
                // Arrange
                const mockService = makeMockService();
                mockService.getNearbyPredictions.mockRejectedValue(new UpstreamApiError("boom"));
                const { getNearbyPredictions } = createNearbyPredictionController(mockService);
                const res = makeMockRes();

                // Act
                await getNearbyPredictions(makeMockReq(VALID_QUERY), res, vi.fn());

                // Assert
                expect(res.status).toHaveBeenCalledWith(502);
                expect(res.json).toHaveBeenCalledWith({ error: "Bad Gateway", details: "boom" });
            });

            it("responds with 500 Request Failed when the service throws a generic Error", async () => {
                // Arrange
                const mockService = makeMockService();
                mockService.getNearbyPredictions.mockRejectedValue(new Error("x"));
                const { getNearbyPredictions } = createNearbyPredictionController(mockService);
                const res = makeMockRes();

                // Act
                await getNearbyPredictions(makeMockReq(VALID_QUERY), res, vi.fn());

                // Assert
                expect(res.status).toHaveBeenCalledWith(500);
                expect(res.json).toHaveBeenCalledWith({ error: "Request Failed", details: "x" });
            });

            it("responds with 500 and 'Unknown error' when the service throws a non-Error value", async () => {
                // Arrange
                const mockService = makeMockService();
                mockService.getNearbyPredictions.mockRejectedValue("x");
                const { getNearbyPredictions } = createNearbyPredictionController(mockService);
                const res = makeMockRes();

                // Act
                await getNearbyPredictions(makeMockReq(VALID_QUERY), res, vi.fn());

                // Assert
                expect(res.status).toHaveBeenCalledWith(500);
                expect(res.json).toHaveBeenCalledWith({ error: "Request Failed", details: "Unknown error" });
            });
        });
    });
});
