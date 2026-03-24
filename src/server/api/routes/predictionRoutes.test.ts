import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { NotFoundError, UpstreamApiError } from "../errors";
import type { StopPredictionsResponse } from "../models/Prediction";

vi.mock("../services/PredictionService", () => ({
    createPredictionService: vi.fn(() => ({
        getPredictionsForStop: vi.fn(),
    })),
}));

import app from "../../test/app";
import { createPredictionService } from "../services/PredictionService";

const getMockService = () => vi.mocked(createPredictionService).mock.results[0]?.value;

const makeStopPredictionsResponse = (stopId = "stop-1"): StopPredictionsResponse => ({
    success: true,
    data: {
        agencyKey: "alexandria-dash",
        stop: { id: stopId, name: "Main St", code: 101 },
        routes: [
            {
                routeId: "route-1",
                routeName: "Route 1A Long",
                routeShortName: "1A",
                stopId,
                stopName: "Main St",
                stopCode: 101,
                destinations: [
                    {
                        directionId: "d1",
                        headsign: "Downtown",
                        predictions: [{ min: 5, sec: 300, time: 1700000300, tripId: "trip-1", vehicleId: "v-1" }],
                    },
                ],
            },
        ],
    },
});

describe("GET /api/v1/predictions", () => {
    it("responds with 400 when stop query parameter is missing", async () => {
        // Arrange & Act
        const response = await request(app).get("/api/v1/predictions");

        // Assert
        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
            error: "Bad Request",
            details: "stop parameter is required",
        });
    });

    it("responds with 400 when number parameter is not a positive integer", async () => {
        // Arrange & Act
        const response = await request(app).get("/api/v1/predictions?stop=stop-1&number=abc");

        // Assert
        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
            error: "Bad Request",
            details: "number parameter must be a positive integer",
        });
    });

    it("responds with 400 when number parameter is zero", async () => {
        // Arrange & Act
        const response = await request(app).get("/api/v1/predictions?stop=stop-1&number=0");

        // Assert
        expect(response.status).toBe(400);
    });

    it("responds with 200 and the predictions payload on success", async () => {
        // Arrange
        const payload = makeStopPredictionsResponse("stop-1");
        getMockService().getPredictionsForStop.mockResolvedValue(payload);

        // Act
        const response = await request(app).get("/api/v1/predictions?stop=stop-1");

        // Assert
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            success: true,
            data: {
                stop: { id: "stop-1", name: "Main St", code: 101 },
            },
        });
    });

    it("passes the stop id to the service", async () => {
        // Arrange
        getMockService().getPredictionsForStop.mockResolvedValue(makeStopPredictionsResponse("stop-42"));

        // Act
        await request(app).get("/api/v1/predictions?stop=stop-42");

        // Assert
        expect(getMockService().getPredictionsForStop).toHaveBeenCalledWith("stop-42", expect.any(Object));
    });

    it("passes the parsed number option to the service", async () => {
        // Arrange
        getMockService().getPredictionsForStop.mockResolvedValue(makeStopPredictionsResponse());

        // Act
        await request(app).get("/api/v1/predictions?stop=stop-1&number=5");

        // Assert
        expect(getMockService().getPredictionsForStop).toHaveBeenCalledWith("stop-1", expect.objectContaining({ number: 5 }));
    });

    it("passes the route option to the service", async () => {
        // Arrange
        getMockService().getPredictionsForStop.mockResolvedValue(makeStopPredictionsResponse());

        // Act
        await request(app).get("/api/v1/predictions?stop=stop-1&route=1A");

        // Assert
        expect(getMockService().getPredictionsForStop).toHaveBeenCalledWith("stop-1", expect.objectContaining({ route: "1A" }));
    });

    it("responds with 404 when the service throws a NotFoundError", async () => {
        // Arrange
        getMockService().getPredictionsForStop.mockRejectedValue(new NotFoundError("Stop not found: stop-1"));

        // Act
        const response = await request(app).get("/api/v1/predictions?stop=stop-1");

        // Assert
        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({
            error: "Not Found",
            details: "Stop not found: stop-1",
        });
    });

    it("responds with 500 when the service throws a generic error", async () => {
        // Arrange
        getMockService().getPredictionsForStop.mockRejectedValue(new Error("upstream failure"));

        // Act
        const response = await request(app).get("/api/v1/predictions?stop=stop-1");

        // Assert
        expect(response.status).toBe(500);
        expect(response.body).toMatchObject({
            error: "Request Failed",
            details: "upstream failure",
        });
    });

    it("responds with 502 when the service throws an UpstreamApiError", async () => {
        // Arrange
        getMockService().getPredictionsForStop.mockRejectedValue(
            new UpstreamApiError("DASH API returned success: false for stop stop-1"),
        );

        // Act
        const response = await request(app).get("/api/v1/predictions?stop=stop-1");

        // Assert
        expect(response.status).toBe(502);
        expect(response.body).toMatchObject({
            error: "Bad Gateway",
            details: "DASH API returned success: false for stop stop-1",
        });
    });

    it("returns route data including destinations and predictions", async () => {
        // Arrange
        getMockService().getPredictionsForStop.mockResolvedValue(makeStopPredictionsResponse());

        // Act
        const response = await request(app).get("/api/v1/predictions?stop=stop-1");

        // Assert
        expect(response.body.data.routes[0]).toMatchObject({
            routeShortName: "1A",
            destinations: [
                {
                    headsign: "Downtown",
                    predictions: [{ min: 5 }],
                },
            ],
        });
    });
});
