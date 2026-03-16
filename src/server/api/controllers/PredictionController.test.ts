import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { NotFoundError, UpstreamApiError } from "../errors";
import type { StopPredictionsResponse } from "../models/Prediction";

vi.mock("../services/PredictionService", () => ({
    getPredictionsForStop: vi.fn(),
}));

import { getPredictionsForStop } from "../services/PredictionService";
import { getPredictions } from "./PredictionController";

const makeMockRes = () => {
    const res = {
        json: vi.fn(),
        status: vi.fn(),
    } as unknown as Response;
    (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
    return res;
};

const makeMockReq = (query: Record<string, string> = {}): Request => ({ query }) as unknown as Request;

const makeStopPredictionsResponse = (stopId = "stop-1"): StopPredictionsResponse => ({
    success: true,
    data: {
        agencyKey: "alexandria-dash",
        stop: { id: stopId, name: "Main St", code: 101 },
        routes: [],
    },
});

describe("PredictionController", () => {
    describe("getPredictions", () => {
        it("responds with 400 when the stop query parameter is missing", async () => {
            // Arrange
            const req = makeMockReq({});
            const res = makeMockRes();

            // Act
            await getPredictions(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it("responds with a descriptive error body when stop is missing", async () => {
            // Arrange
            const req = makeMockReq({});
            const res = makeMockRes();

            // Act
            await getPredictions(req, res, vi.fn());

            // Assert
            expect(res.json).toHaveBeenCalledWith({
                error: "Bad Request",
                details: "stop parameter is required",
            });
        });

        it("responds with 400 when the number parameter is not a positive integer", async () => {
            // Arrange
            vi.mocked(getPredictionsForStop).mockResolvedValue(makeStopPredictionsResponse());
            const req = makeMockReq({ stop: "stop-1", number: "abc" });
            const res = makeMockRes();

            // Act
            await getPredictions(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it("responds with a descriptive error body when number is not a positive integer", async () => {
            // Arrange
            const req = makeMockReq({ stop: "stop-1", number: "0" });
            const res = makeMockRes();

            // Act
            await getPredictions(req, res, vi.fn());

            // Assert
            expect(res.json).toHaveBeenCalledWith({
                error: "Bad Request",
                details: "number parameter must be a positive integer",
            });
        });

        it("calls the service with the stop id when stop is valid", async () => {
            // Arrange
            vi.mocked(getPredictionsForStop).mockResolvedValue(makeStopPredictionsResponse());
            const req = makeMockReq({ stop: "stop-1" });
            const res = makeMockRes();

            // Act
            await getPredictions(req, res, vi.fn());

            // Assert
            expect(getPredictionsForStop).toHaveBeenCalledWith("stop-1", expect.any(Object));
        });

        it("passes parsed number option to the service", async () => {
            // Arrange
            vi.mocked(getPredictionsForStop).mockResolvedValue(makeStopPredictionsResponse());
            const req = makeMockReq({ stop: "stop-1", number: "5" });
            const res = makeMockRes();

            // Act
            await getPredictions(req, res, vi.fn());

            // Assert
            expect(getPredictionsForStop).toHaveBeenCalledWith("stop-1", { number: 5, route: undefined });
        });

        it("passes route option to the service when provided", async () => {
            // Arrange
            vi.mocked(getPredictionsForStop).mockResolvedValue(makeStopPredictionsResponse());
            const req = makeMockReq({ stop: "stop-1", route: "1A" });
            const res = makeMockRes();

            // Act
            await getPredictions(req, res, vi.fn());

            // Assert
            expect(getPredictionsForStop).toHaveBeenCalledWith("stop-1", { number: undefined, route: "1A" });
        });

        it("responds with 200 and the predictions response body on success", async () => {
            // Arrange
            const payload = makeStopPredictionsResponse("stop-1");
            vi.mocked(getPredictionsForStop).mockResolvedValue(payload);
            const req = makeMockReq({ stop: "stop-1" });
            const res = makeMockRes();

            // Act
            await getPredictions(req, res, vi.fn());

            // Assert
            expect(res.json).toHaveBeenCalledWith(payload);
        });

        it("does not call status when the service succeeds", async () => {
            // Arrange
            vi.mocked(getPredictionsForStop).mockResolvedValue(makeStopPredictionsResponse());
            const req = makeMockReq({ stop: "stop-1" });
            const res = makeMockRes();

            // Act
            await getPredictions(req, res, vi.fn());

            // Assert
            expect(res.status).not.toHaveBeenCalled();
        });

        it("responds with 404 when the service throws a NotFoundError", async () => {
            // Arrange
            vi.mocked(getPredictionsForStop).mockRejectedValue(new NotFoundError("Stop not found: stop-1"));
            const req = makeMockReq({ stop: "stop-1" });
            const res = makeMockRes();

            // Act
            await getPredictions(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(404);
        });

        it("responds with a Not Found error body when the service throws a NotFoundError", async () => {
            // Arrange
            vi.mocked(getPredictionsForStop).mockRejectedValue(new NotFoundError("Stop not found: stop-1"));
            const req = makeMockReq({ stop: "stop-1" });
            const res = makeMockRes();

            // Act
            await getPredictions(req, res, vi.fn());

            // Assert
            expect(res.json).toHaveBeenCalledWith({
                error: "Not Found",
                details: "Stop not found: stop-1",
            });
        });

        it("responds with 500 when the service throws a generic error", async () => {
            // Arrange
            vi.mocked(getPredictionsForStop).mockRejectedValue(new Error("upstream failure"));
            const req = makeMockReq({ stop: "stop-1" });
            const res = makeMockRes();

            // Act
            await getPredictions(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(500);
        });

        it("responds with a Request Failed error body when the service throws a generic error", async () => {
            // Arrange
            vi.mocked(getPredictionsForStop).mockRejectedValue(new Error("upstream failure"));
            const req = makeMockReq({ stop: "stop-1" });
            const res = makeMockRes();

            // Act
            await getPredictions(req, res, vi.fn());

            // Assert
            expect(res.json).toHaveBeenCalledWith({
                error: "Request Failed",
                details: "upstream failure",
            });
        });

        it("responds with 502 when the service throws an UpstreamApiError", async () => {
            // Arrange
            vi.mocked(getPredictionsForStop).mockRejectedValue(
                new UpstreamApiError("DASH API returned success: false for stop stop-1"),
            );
            const req = makeMockReq({ stop: "stop-1" });
            const res = makeMockRes();

            // Act
            await getPredictions(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(502);
        });

        it("responds with a Bad Gateway error body when the service throws an UpstreamApiError", async () => {
            // Arrange
            vi.mocked(getPredictionsForStop).mockRejectedValue(
                new UpstreamApiError("DASH API returned success: false for stop stop-1"),
            );
            const req = makeMockReq({ stop: "stop-1" });
            const res = makeMockRes();

            // Act
            await getPredictions(req, res, vi.fn());

            // Assert
            expect(res.json).toHaveBeenCalledWith({
                error: "Bad Gateway",
                details: "DASH API returned success: false for stop stop-1",
            });
        });

        it("responds with unknown error details when a non-Error is thrown", async () => {
            // Arrange
            vi.mocked(getPredictionsForStop).mockRejectedValue("string error");
            const req = makeMockReq({ stop: "stop-1" });
            const res = makeMockRes();

            // Act
            await getPredictions(req, res, vi.fn());

            // Assert
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ details: "Unknown error" }));
        });
    });
});
