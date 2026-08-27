import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { NotFoundError, UpstreamApiError } from "../errors";
import type { StopPredictionsResponse } from "../models/Prediction";
import { createPredictionStreamController } from "./PredictionStreamController";

const makeMockRes = () => {
    const res = {
        writeHead: vi.fn(),
        write: vi.fn(),
        status: vi.fn(),
        json: vi.fn(),
        end: vi.fn(),
    } as unknown as Response;
    (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
    return res;
};

const makeMockReq = (query: Record<string, string> = {}) => {
    let closeCallback: (() => void) | undefined;
    const req = {
        query,
        on: vi.fn((event: string, callback: () => void) => {
            if (event === "close") {
                closeCallback = callback;
            }
        }),
    } as unknown as Request;
    return { req, triggerClose: () => closeCallback?.() };
};

const makeStopPredictionsResponse = (stopId = "stop-1"): StopPredictionsResponse => ({
    success: true,
    generatedAt: "2026-01-01T00:00:00.000Z",
    data: {
        agencyKey: "alexandria-dash",
        stop: { id: stopId, name: "Main St", code: 101 },
        routes: [],
    },
});

const makeMockStreamService = () => ({
    subscribe: vi.fn(),
});

describe("PredictionStreamController", () => {
    describe("getPredictionsStream", () => {
        it("responds with 400 when the stop query parameter is missing and never calls subscribe", async () => {
            // Arrange
            const mockStreamService = makeMockStreamService();
            const { getPredictionsStream } = createPredictionStreamController(mockStreamService);
            const { req } = makeMockReq({});
            const res = makeMockRes();

            // Act
            await getPredictionsStream(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: "Bad Request", details: "stop parameter is required" });
            expect(mockStreamService.subscribe).not.toHaveBeenCalled();
        });

        it("writes SSE headers and the initial event on a successful subscribe", async () => {
            // Arrange
            const mockStreamService = makeMockStreamService();
            const initialPayload = makeStopPredictionsResponse("stop-1");
            mockStreamService.subscribe.mockResolvedValue({ initialPayload, unsubscribe: vi.fn() });
            const { getPredictionsStream } = createPredictionStreamController(mockStreamService);
            const { req } = makeMockReq({ stop: "stop-1" });
            const res = makeMockRes();

            // Act
            await getPredictionsStream(req, res, vi.fn());

            // Assert
            expect(res.writeHead).toHaveBeenCalledWith(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                // biome-ignore lint/style/useNamingConvention: HTTP header name, casing is fixed by the spec
                Connection: "keep-alive",
            });
            const writtenFrame = (res.write as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
            expect(writtenFrame).toMatch(/^event: prediction\ndata:/);
            expect(writtenFrame).toContain(JSON.stringify(initialPayload));
        });

        it("invokes unsubscribe and ends the response when the request closes", async () => {
            // Arrange
            const mockStreamService = makeMockStreamService();
            const unsubscribe = vi.fn();
            mockStreamService.subscribe.mockResolvedValue({
                initialPayload: makeStopPredictionsResponse("stop-1"),
                unsubscribe,
            });
            const { getPredictionsStream } = createPredictionStreamController(mockStreamService);
            const { req, triggerClose } = makeMockReq({ stop: "stop-1" });
            const res = makeMockRes();
            await getPredictionsStream(req, res, vi.fn());

            // Act
            triggerClose();

            // Assert
            expect(unsubscribe).toHaveBeenCalledTimes(1);
            expect(res.end).toHaveBeenCalledTimes(1);
        });

        it("responds with 404 and never writes SSE headers when subscribe rejects with NotFoundError", async () => {
            // Arrange
            const mockStreamService = makeMockStreamService();
            mockStreamService.subscribe.mockRejectedValue(new NotFoundError("Stop not found: missing-stop"));
            const { getPredictionsStream } = createPredictionStreamController(mockStreamService);
            const { req } = makeMockReq({ stop: "missing-stop" });
            const res = makeMockRes();

            // Act
            await getPredictionsStream(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ error: "Not Found", details: "Stop not found: missing-stop" });
            expect(res.writeHead).not.toHaveBeenCalled();
        });

        it("responds with 502 and never writes SSE headers when subscribe rejects with UpstreamApiError", async () => {
            // Arrange
            const mockStreamService = makeMockStreamService();
            mockStreamService.subscribe.mockRejectedValue(new UpstreamApiError("DASH API returned success: false"));
            const { getPredictionsStream } = createPredictionStreamController(mockStreamService);
            const { req } = makeMockReq({ stop: "stop-1" });
            const res = makeMockRes();

            // Act
            await getPredictionsStream(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(502);
            expect(res.json).toHaveBeenCalledWith({
                error: "Bad Gateway",
                details: "DASH API returned success: false",
            });
            expect(res.writeHead).not.toHaveBeenCalled();
        });
    });
});
