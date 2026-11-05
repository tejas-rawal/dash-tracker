import type { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from "../../config";
import { NotFoundError, UpstreamApiError } from "../errors";
import type { StopPredictionsResponse } from "../models/Prediction";
import type { PredictionService } from "../services/PredictionService";
import { type StreamSubscriber, createPredictionStreamService } from "../services/PredictionStreamService";
import { createPredictionStreamController } from "./PredictionStreamController";

const makeMockRes = () => {
    const res = {
        writeHead: vi.fn(),
        write: vi.fn(),
        status: vi.fn(),
        json: vi.fn(),
        end: vi.fn(),
        on: vi.fn(),
    } as unknown as Response;
    (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
    return res;
};

// Fires every listener the controller registered for the given event on the mock response.
const emitResponseEvent = (res: Response, event: "close" | "error", ...args: unknown[]): void => {
    const calls = (res.on as ReturnType<typeof vi.fn>).mock.calls as [string, (...args: unknown[]) => void][];
    for (const [registeredEvent, listener] of calls) {
        if (registeredEvent === event) {
            listener(...args);
        }
    }
};

const emitResponseError = (res: Response, error: Error): void => emitResponseEvent(res, "error", error);

const emitResponseClose = (res: Response): void => emitResponseEvent(res, "close");

const makeMockReq = (query: Record<string, string> = {}) => ({ query }) as unknown as Request;

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
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("getPredictionsStream", () => {
        it("responds with 400 when the stop query parameter is missing and never calls subscribe", async () => {
            // Arrange
            const mockStreamService = makeMockStreamService();
            const { getPredictionsStream } = createPredictionStreamController(mockStreamService);
            const req = makeMockReq({});
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
            const req = makeMockReq({ stop: "stop-1" });
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

        it("invokes unsubscribe and ends the response when the connection closes", async () => {
            // Arrange
            const mockStreamService = makeMockStreamService();
            const unsubscribe = vi.fn();
            mockStreamService.subscribe.mockResolvedValue({
                initialPayload: makeStopPredictionsResponse("stop-1"),
                unsubscribe,
            });
            const { getPredictionsStream } = createPredictionStreamController(mockStreamService);
            const req = makeMockReq({ stop: "stop-1" });
            const res = makeMockRes();
            await getPredictionsStream(req, res, vi.fn());

            // Act
            emitResponseClose(res);

            // Assert
            expect(unsubscribe).toHaveBeenCalledTimes(1);
            expect(res.end).toHaveBeenCalledTimes(1);
        });

        it("invokes unsubscribe without writing headers when the client disconnects while subscribe is still pending", async () => {
            // Arrange
            const mockStreamService = makeMockStreamService();
            const unsubscribe = vi.fn();
            let resolveSubscribe: (value: {
                initialPayload: StopPredictionsResponse;
                unsubscribe: () => void;
            }) => void = () => {};
            mockStreamService.subscribe.mockImplementation(
                () =>
                    new Promise((resolve) => {
                        resolveSubscribe = resolve;
                    }),
            );
            const { getPredictionsStream } = createPredictionStreamController(mockStreamService);
            const req = makeMockReq({ stop: "stop-1" });
            const res = makeMockRes();

            // Act: start the handler (subscribe pending), disconnect, then let subscribe resolve
            const handlerPromise = getPredictionsStream(req, res, vi.fn());
            emitResponseClose(res);
            resolveSubscribe({ initialPayload: makeStopPredictionsResponse("stop-1"), unsubscribe });
            await handlerPromise;

            // Assert
            expect(unsubscribe).toHaveBeenCalledTimes(1);
            expect(res.writeHead).not.toHaveBeenCalled();
            expect(res.write).not.toHaveBeenCalled();
        });

        it("responds with 404 and never writes SSE headers when subscribe rejects with NotFoundError", async () => {
            // Arrange
            const mockStreamService = makeMockStreamService();
            mockStreamService.subscribe.mockRejectedValue(new NotFoundError("Stop not found: missing-stop"));
            const { getPredictionsStream } = createPredictionStreamController(mockStreamService);
            const req = makeMockReq({ stop: "missing-stop" });
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
            const req = makeMockReq({ stop: "stop-1" });
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

        it("writes no error response when subscribe rejects after the client has already disconnected", async () => {
            // Arrange
            const mockStreamService = makeMockStreamService();
            let rejectSubscribe: (reason: unknown) => void = () => {};
            mockStreamService.subscribe.mockImplementation(
                () =>
                    new Promise((_resolve, reject) => {
                        rejectSubscribe = reject;
                    }),
            );
            const { getPredictionsStream } = createPredictionStreamController(mockStreamService);
            const req = makeMockReq({ stop: "stop-1" });
            const res = makeMockRes();

            // Act: start the handler (subscribe pending), disconnect, then let subscribe reject
            const handlerPromise = getPredictionsStream(req, res, vi.fn());
            emitResponseClose(res);
            rejectSubscribe(new UpstreamApiError("DASH API returned success: false"));
            await handlerPromise;

            // Assert
            expect(res.status).not.toHaveBeenCalled();
            expect(res.json).not.toHaveBeenCalled();
            expect(res.writeHead).not.toHaveBeenCalled();
        });

        it("logs a warning and runs the disconnect cleanup once when the SSE response errors", async () => {
            // Arrange
            const mockStreamService = makeMockStreamService();
            const unsubscribe = vi.fn();
            mockStreamService.subscribe.mockResolvedValue({
                initialPayload: makeStopPredictionsResponse("stop-1"),
                unsubscribe,
            });
            const { getPredictionsStream } = createPredictionStreamController(mockStreamService);
            const req = makeMockReq({ stop: "stop-1" });
            const res = makeMockRes();
            await getPredictionsStream(req, res, vi.fn());

            // Act
            emitResponseError(res, new Error("write EPIPE"));

            // Assert
            expect(unsubscribe).toHaveBeenCalledTimes(1);
            expect(res.end).toHaveBeenCalledTimes(1);
            expect(logger.warn).toHaveBeenCalledTimes(1);
            expect(logger.warn).toHaveBeenCalledWith("SSE response error for stop stop-1: write EPIPE");
            expect(logger.error).not.toHaveBeenCalled();
        });

        it("runs the cleanup once when the response errors and then closes", async () => {
            // Arrange
            const mockStreamService = makeMockStreamService();
            const unsubscribe = vi.fn();
            mockStreamService.subscribe.mockResolvedValue({
                initialPayload: makeStopPredictionsResponse("stop-1"),
                unsubscribe,
            });
            const { getPredictionsStream } = createPredictionStreamController(mockStreamService);
            const req = makeMockReq({ stop: "stop-1" });
            const res = makeMockRes();
            await getPredictionsStream(req, res, vi.fn());

            // Act
            emitResponseError(res, new Error("write EPIPE"));
            emitResponseClose(res);

            // Assert
            expect(unsubscribe).toHaveBeenCalledTimes(1);
            expect(res.end).toHaveBeenCalledTimes(1);
            expect(logger.warn).toHaveBeenCalledTimes(1);
        });

        it("runs the cleanup once when the response closes and then errors", async () => {
            // Arrange
            const mockStreamService = makeMockStreamService();
            const unsubscribe = vi.fn();
            mockStreamService.subscribe.mockResolvedValue({
                initialPayload: makeStopPredictionsResponse("stop-1"),
                unsubscribe,
            });
            const { getPredictionsStream } = createPredictionStreamController(mockStreamService);
            const req = makeMockReq({ stop: "stop-1" });
            const res = makeMockRes();
            await getPredictionsStream(req, res, vi.fn());

            // Act
            emitResponseClose(res);
            emitResponseError(res, new Error("write EPIPE"));

            // Assert
            expect(unsubscribe).toHaveBeenCalledTimes(1);
            expect(res.end).toHaveBeenCalledTimes(1);
            expect(logger.warn).toHaveBeenCalledTimes(1);
            expect(logger.warn).toHaveBeenCalledWith("SSE response error for stop stop-1: write EPIPE");
        });

        it("unsubscribes without writing headers when the response errors while subscribe is still pending", async () => {
            // Arrange
            const mockStreamService = makeMockStreamService();
            const unsubscribe = vi.fn();
            let resolveSubscribe: (value: {
                initialPayload: StopPredictionsResponse;
                unsubscribe: () => void;
            }) => void = () => {};
            mockStreamService.subscribe.mockImplementation(
                () =>
                    new Promise((resolve) => {
                        resolveSubscribe = resolve;
                    }),
            );
            const { getPredictionsStream } = createPredictionStreamController(mockStreamService);
            const req = makeMockReq({ stop: "stop-1" });
            const res = makeMockRes();

            // Act: start the handler (subscribe pending), error the response, then let subscribe resolve
            const handlerPromise = getPredictionsStream(req, res, vi.fn());
            emitResponseError(res, new Error("read ECONNRESET"));
            resolveSubscribe({ initialPayload: makeStopPredictionsResponse("stop-1"), unsubscribe });
            await handlerPromise;

            // Assert
            expect(unsubscribe).toHaveBeenCalledTimes(1);
            expect(res.writeHead).not.toHaveBeenCalled();
            expect(res.write).not.toHaveBeenCalled();
            expect(logger.warn).toHaveBeenCalledTimes(1);
            expect(logger.warn).toHaveBeenCalledWith("SSE response error for stop stop-1: read ECONNRESET");
        });

        it("subscribes with a subscriber object carrying onUpdate and onEnd", async () => {
            // Arrange
            const mockStreamService = makeMockStreamService();
            mockStreamService.subscribe.mockResolvedValue({
                initialPayload: makeStopPredictionsResponse("stop-1"),
                unsubscribe: vi.fn(),
            });
            const { getPredictionsStream } = createPredictionStreamController(mockStreamService);
            const req = makeMockReq({ stop: "stop-1" });
            const res = makeMockRes();

            // Act
            await getPredictionsStream(req, res, vi.fn());

            // Assert
            expect(mockStreamService.subscribe).toHaveBeenCalledWith("stop-1", {
                onUpdate: expect.any(Function),
                onEnd: expect.any(Function),
            });
        });

        it("ends the response once through the cleanup path when the service ends the stream, even if the connection then closes", async () => {
            // Arrange
            const mockStreamService = makeMockStreamService();
            const unsubscribe = vi.fn();
            mockStreamService.subscribe.mockResolvedValue({
                initialPayload: makeStopPredictionsResponse("stop-1"),
                unsubscribe,
            });
            const { getPredictionsStream } = createPredictionStreamController(mockStreamService);
            const req = makeMockReq({ stop: "stop-1" });
            const res = makeMockRes();
            await getPredictionsStream(req, res, vi.fn());
            const subscriber = mockStreamService.subscribe.mock.calls[0][1] as StreamSubscriber;

            // Act
            subscriber.onEnd();

            // Assert
            expect(res.end).toHaveBeenCalledTimes(1);
            expect(unsubscribe).toHaveBeenCalledTimes(1);

            // Act: the socket then closes
            emitResponseClose(res);

            // Assert: nothing runs twice
            expect(res.end).toHaveBeenCalledTimes(1);
            expect(unsubscribe).toHaveBeenCalledTimes(1);
        });

        it("writes one more prediction frame when the service delivers an update", async () => {
            // Arrange
            const mockStreamService = makeMockStreamService();
            mockStreamService.subscribe.mockResolvedValue({
                initialPayload: makeStopPredictionsResponse("stop-1"),
                unsubscribe: vi.fn(),
            });
            const { getPredictionsStream } = createPredictionStreamController(mockStreamService);
            const req = makeMockReq({ stop: "stop-1" });
            const res = makeMockRes();
            await getPredictionsStream(req, res, vi.fn());
            const subscriber = mockStreamService.subscribe.mock.calls[0][1] as StreamSubscriber;
            const update = makeStopPredictionsResponse("stop-1");

            // Act
            subscriber.onUpdate(update);

            // Assert
            const writes = (res.write as ReturnType<typeof vi.fn>).mock.calls;
            expect(writes).toHaveLength(2);
            expect(writes[1]?.[0] as string).toMatch(/^event: prediction\ndata:/);
            expect(writes[1]?.[0] as string).toContain(JSON.stringify(update));
        });

        describe("with the real PredictionStreamService", () => {
            beforeEach(() => {
                vi.useFakeTimers();
            });

            afterEach(() => {
                vi.useRealTimers();
            });

            it("keeps streaming to other subscribers on the stop after one subscriber's response errors, and stops polling when the last leaves", async () => {
                // Arrange
                const mockPredictionService = {
                    getPredictionsForStop: vi.fn().mockResolvedValue(makeStopPredictionsResponse("stop-1")),
                };
                const { getPredictionsStream } = createPredictionStreamController(
                    createPredictionStreamService(mockPredictionService as unknown as PredictionService),
                );
                const reqA = makeMockReq({ stop: "stop-1" });
                const resA = makeMockRes();
                const reqB = makeMockReq({ stop: "stop-1" });
                const resB = makeMockRes();
                await getPredictionsStream(reqA, resA, vi.fn());
                await getPredictionsStream(reqB, resB, vi.fn());

                // Act 1: subscriber A's socket breaks, then one poll tick elapses
                emitResponseError(resA, new Error("write EPIPE"));
                await vi.advanceTimersByTimeAsync(30_000);

                // Assert 1: B still receives the tick, A received only its initial frame
                expect(mockPredictionService.getPredictionsForStop).toHaveBeenCalledTimes(2);
                expect(resB.write).toHaveBeenCalledTimes(2);
                expect(resA.write).toHaveBeenCalledTimes(1);
                expect(resA.end).toHaveBeenCalledTimes(1);

                // Act 2: the last subscriber leaves, then another poll tick elapses
                emitResponseClose(resB);
                await vi.advanceTimersByTimeAsync(30_000);

                // Assert 2: the per-stop poll has stopped
                expect(mockPredictionService.getPredictionsForStop).toHaveBeenCalledTimes(2);
                expect(resB.end).toHaveBeenCalledTimes(1);
            });

            it("ends every response on the stop once when a reload removes it, and stops polling", async () => {
                // Arrange
                const mockPredictionService = {
                    getPredictionsForStop: vi
                        .fn()
                        .mockResolvedValueOnce(makeStopPredictionsResponse("stop-1"))
                        .mockRejectedValue(new NotFoundError("Stop not found: stop-1")),
                };
                const { getPredictionsStream } = createPredictionStreamController(
                    createPredictionStreamService(mockPredictionService as unknown as PredictionService),
                );
                const resA = makeMockRes();
                const resB = makeMockRes();
                await getPredictionsStream(makeMockReq({ stop: "stop-1" }), resA, vi.fn());
                await getPredictionsStream(makeMockReq({ stop: "stop-1" }), resB, vi.fn());

                // Act: the next tick finds the stop gone
                await vi.advanceTimersByTimeAsync(30_000);

                // Assert: both responses ended after only their initial frame
                expect(resA.end).toHaveBeenCalledTimes(1);
                expect(resB.end).toHaveBeenCalledTimes(1);
                expect(resA.write).toHaveBeenCalledTimes(1);
                expect(resB.write).toHaveBeenCalledTimes(1);

                // Act: more time passes
                await vi.advanceTimersByTimeAsync(60_000);

                // Assert: the loop is gone
                expect(mockPredictionService.getPredictionsForStop).toHaveBeenCalledTimes(2);

                // Act: the socket close that follows the server ending the response
                emitResponseClose(resA);

                // Assert: the response is not ended twice
                expect(resA.end).toHaveBeenCalledTimes(1);
            });
        });
    });
});
