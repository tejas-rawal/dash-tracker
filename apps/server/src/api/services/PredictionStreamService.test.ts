import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, UpstreamApiError } from "../errors";
import type { StopPredictionsResponse } from "../models/Prediction";

vi.mock("../../config", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from "../../config";
import { createPredictionStreamService } from "./PredictionStreamService";

const makeMockPredictionService = () => ({
    getPredictionsForStop: vi.fn(),
});

const makeSubscriber = () => ({
    onUpdate: vi.fn(),
    onEnd: vi.fn(),
});

const makeResponse = (stopId = "stop-1", suffix = "a"): StopPredictionsResponse => ({
    success: true,
    generatedAt: `2026-01-01T00:00:00.00${suffix}Z`,
    data: {
        agencyKey: "alexandria-dash",
        stop: { id: stopId, name: "Main St", code: 101 },
        routes: [],
    },
});

describe("PredictionStreamService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("never supplies a second argument to getPredictionsForStop on the initial subscribe fetch or a subsequent poll tick", async () => {
        // Arrange
        const mockPredictionService = makeMockPredictionService();
        mockPredictionService.getPredictionsForStop.mockResolvedValue(makeResponse());
        const { subscribe } = createPredictionStreamService(mockPredictionService as never);

        // Act
        await subscribe("stop-1", makeSubscriber());
        expect(mockPredictionService.getPredictionsForStop).toHaveBeenCalledWith("stop-1");

        await vi.advanceTimersByTimeAsync(30_000);

        // Assert
        expect(mockPredictionService.getPredictionsForStop).toHaveBeenCalledWith("stop-1");
        for (const call of mockPredictionService.getPredictionsForStop.mock.calls) {
            expect(call).toHaveLength(1);
        }
    });

    it("subscribing to a new stop returns the first fetch's resolved value and fetches exactly once", async () => {
        // Arrange
        const mockPredictionService = makeMockPredictionService();
        const payload = makeResponse();
        mockPredictionService.getPredictionsForStop.mockResolvedValue(payload);
        const { subscribe } = createPredictionStreamService(mockPredictionService as never);

        // Act
        const { initialPayload } = await subscribe("stop-1", makeSubscriber());

        // Assert
        expect(initialPayload).toBe(payload);
        expect(mockPredictionService.getPredictionsForStop).toHaveBeenCalledTimes(1);
    });

    it("a second subscribe for the same stop before any tick does not trigger a second fetch", async () => {
        // Arrange
        const mockPredictionService = makeMockPredictionService();
        const payload = makeResponse();
        mockPredictionService.getPredictionsForStop.mockResolvedValue(payload);
        const { subscribe } = createPredictionStreamService(mockPredictionService as never);

        // Act
        const first = await subscribe("stop-1", makeSubscriber());
        const second = await subscribe("stop-1", makeSubscriber());

        // Assert
        expect(mockPredictionService.getPredictionsForStop).toHaveBeenCalledTimes(1);
        expect(first.initialPayload).toBe(payload);
        expect(second.initialPayload).toBe(payload);
    });

    it("fans out one additional fetch per tick to every subscriber of the same stop", async () => {
        // Arrange
        const mockPredictionService = makeMockPredictionService();
        const firstPayload = makeResponse("stop-1", "a");
        const secondPayload = makeResponse("stop-1", "b");
        mockPredictionService.getPredictionsForStop
            .mockResolvedValueOnce(firstPayload)
            .mockResolvedValue(secondPayload);
        const { subscribe } = createPredictionStreamService(mockPredictionService as never);
        const subscriberA = makeSubscriber();
        const subscriberB = makeSubscriber();

        // Act
        await subscribe("stop-1", subscriberA);
        await subscribe("stop-1", subscriberB);
        await vi.advanceTimersByTimeAsync(30_000);

        // Assert
        expect(mockPredictionService.getPredictionsForStop).toHaveBeenCalledTimes(2);
        expect(subscriberA.onUpdate).toHaveBeenCalledWith(secondPayload);
        expect(subscriberB.onUpdate).toHaveBeenCalledWith(secondPayload);
    });

    it("stops polling once the sole subscriber unsubscribes", async () => {
        // Arrange
        const mockPredictionService = makeMockPredictionService();
        mockPredictionService.getPredictionsForStop.mockResolvedValue(makeResponse());
        const { subscribe } = createPredictionStreamService(mockPredictionService as never);
        const { unsubscribe } = await subscribe("stop-1", makeSubscriber());

        // Act
        unsubscribe();
        await vi.advanceTimersByTimeAsync(30_000);

        // Assert
        expect(mockPredictionService.getPredictionsForStop).toHaveBeenCalledTimes(1);
    });

    it("subscribing again after a full unsubscribe triggers a fresh fetch", async () => {
        // Arrange
        const mockPredictionService = makeMockPredictionService();
        mockPredictionService.getPredictionsForStop.mockResolvedValue(makeResponse());
        const { subscribe } = createPredictionStreamService(mockPredictionService as never);
        const { unsubscribe } = await subscribe("stop-1", makeSubscriber());
        unsubscribe();

        // Act
        await subscribe("stop-1", makeSubscriber());

        // Assert
        expect(mockPredictionService.getPredictionsForStop).toHaveBeenCalledTimes(2);
    });

    it("logs and keeps the interval running when a poll tick's fetch rejects, then recovers next tick", async () => {
        // Arrange
        const mockPredictionService = makeMockPredictionService();
        const initialPayload = makeResponse("stop-1", "a");
        const recoveredPayload = makeResponse("stop-1", "c");
        mockPredictionService.getPredictionsForStop
            .mockResolvedValueOnce(initialPayload)
            .mockRejectedValueOnce(new Error("upstream down"))
            .mockResolvedValueOnce(recoveredPayload);
        const { subscribe } = createPredictionStreamService(mockPredictionService as never);
        const subscriber = makeSubscriber();
        await subscribe("stop-1", subscriber);

        // Act: first tick fails
        await vi.advanceTimersByTimeAsync(30_000);

        // Assert: failure logged, subscriber not called with failed-tick data, interval still alive
        expect(subscriber.onUpdate).not.toHaveBeenCalled();
        expect(subscriber.onEnd).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("stop-1"));

        // Act: second tick succeeds
        await vi.advanceTimersByTimeAsync(30_000);

        // Assert: recovery fans out fresh data
        expect(subscriber.onUpdate).toHaveBeenCalledWith(recoveredPayload);
        expect(mockPredictionService.getPredictionsForStop).toHaveBeenCalledTimes(3);
    });

    it("keeps the stream open when a poll tick times out upstream, then fans out the next good tick", async () => {
        // Arrange
        const mockPredictionService = makeMockPredictionService();
        const recoveredPayload = makeResponse("stop-1", "c");
        mockPredictionService.getPredictionsForStop
            .mockResolvedValueOnce(makeResponse("stop-1", "a"))
            .mockRejectedValueOnce(new UpstreamApiError("DASH API request timed out after 200ms"))
            .mockResolvedValueOnce(recoveredPayload);
        const { subscribe } = createPredictionStreamService(mockPredictionService as never);
        const subscriber = makeSubscriber();
        await subscribe("stop-1", subscriber);

        // Act: the tick times out upstream
        await vi.advanceTimersByTimeAsync(30_000);

        // Assert: logged as a transient failure, the stream is not ended
        expect(subscriber.onEnd).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("stop-1"));
        expect(logger.warn).not.toHaveBeenCalled();

        // Act: the next tick succeeds
        await vi.advanceTimersByTimeAsync(30_000);

        // Assert
        expect(subscriber.onUpdate).toHaveBeenCalledWith(recoveredPayload);
        expect(subscriber.onEnd).not.toHaveBeenCalled();
    });

    it("two subscribes for the same brand-new stop issued without awaiting the first share one fetch and one loop", async () => {
        // Arrange
        const mockPredictionService = makeMockPredictionService();
        const payload = makeResponse();
        let resolveFetch: (value: StopPredictionsResponse) => void = () => {};
        mockPredictionService.getPredictionsForStop.mockImplementationOnce(
            () =>
                new Promise<StopPredictionsResponse>((resolve) => {
                    resolveFetch = resolve;
                }),
        );
        const { subscribe } = createPredictionStreamService(mockPredictionService as never);
        const subscriberA = makeSubscriber();
        const subscriberB = makeSubscriber();

        // Act: fire both subscribes without awaiting the first before starting the second
        const firstPromise = subscribe("stop-1", subscriberA);
        const secondPromise = subscribe("stop-1", subscriberB);
        resolveFetch(payload);
        const [first, second] = await Promise.all([firstPromise, secondPromise]);

        // Assert: the shared in-flight fetch was only issued once
        expect(mockPredictionService.getPredictionsForStop).toHaveBeenCalledTimes(1);
        expect(first.initialPayload).toBe(payload);
        expect(second.initialPayload).toBe(payload);

        // Assert: only one loop/interval was created — a tick fetches once, not twice
        mockPredictionService.getPredictionsForStop.mockResolvedValue(makeResponse("stop-1", "b"));
        await vi.advanceTimersByTimeAsync(30_000);
        expect(mockPredictionService.getPredictionsForStop).toHaveBeenCalledTimes(2);
    });

    it("isolates a throwing subscriber during poll() fan-out so other subscribers still receive the update", async () => {
        // Arrange
        const mockPredictionService = makeMockPredictionService();
        const firstPayload = makeResponse("stop-1", "a");
        const secondPayload = makeResponse("stop-1", "b");
        mockPredictionService.getPredictionsForStop
            .mockResolvedValueOnce(firstPayload)
            .mockResolvedValue(secondPayload);
        const { subscribe } = createPredictionStreamService(mockPredictionService as never);
        const subscriberA = {
            onUpdate: vi.fn(() => {
                throw new Error("subscriber A exploded");
            }),
            onEnd: vi.fn(),
        };
        const subscriberB = makeSubscriber();

        // Act
        await subscribe("stop-1", subscriberA);
        await subscribe("stop-1", subscriberB);
        await vi.advanceTimersByTimeAsync(30_000);

        // Assert: the failing subscriber's error is caught and logged...
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("Failed to deliver prediction update"));
        // ...but the other subscriber in the same tick still receives the update.
        expect(subscriberB.onUpdate).toHaveBeenCalledWith(secondPayload);
    });

    it("propagates the error when the very first subscribe fetch rejects, without creating a zombie loop", async () => {
        // Arrange
        const mockPredictionService = makeMockPredictionService();
        mockPredictionService.getPredictionsForStop
            .mockRejectedValueOnce(new NotFoundError("Stop not found: stop-1"))
            .mockResolvedValueOnce(makeResponse());
        const { subscribe } = createPredictionStreamService(mockPredictionService as never);

        // Act & Assert: first attempt rejects
        await expect(subscribe("stop-1", makeSubscriber())).rejects.toThrow(NotFoundError);

        // Act: a following subscribe triggers a brand-new fetch (no zombie loop entry survived)
        await subscribe("stop-1", makeSubscriber());

        // Assert
        expect(mockPredictionService.getPredictionsForStop).toHaveBeenCalledTimes(2);
    });

    describe("when a reload removes the stop", () => {
        it("ends every subscriber of the stop once with one warn and no error, and stops polling", async () => {
            // Arrange
            const mockPredictionService = makeMockPredictionService();
            mockPredictionService.getPredictionsForStop
                .mockResolvedValueOnce(makeResponse())
                .mockRejectedValue(new NotFoundError("Stop not found: stop-1"));
            const { subscribe } = createPredictionStreamService(mockPredictionService as never);
            const subscriberA = makeSubscriber();
            const subscriberB = makeSubscriber();
            await subscribe("stop-1", subscriberA);
            await subscribe("stop-1", subscriberB);

            // Act
            await vi.advanceTimersByTimeAsync(30_000);

            // Assert
            expect(subscriberA.onEnd).toHaveBeenCalledTimes(1);
            expect(subscriberB.onEnd).toHaveBeenCalledTimes(1);
            expect(subscriberA.onUpdate).not.toHaveBeenCalled();
            expect(subscriberB.onUpdate).not.toHaveBeenCalled();
            expect(logger.warn).toHaveBeenCalledTimes(1);
            expect(logger.warn).toHaveBeenCalledWith(
                "Ending 2 prediction stream(s) for stop stop-1: Stop not found: stop-1",
            );
            expect(logger.error).not.toHaveBeenCalled();

            // Act: further ticks would have fired here
            await vi.advanceTimersByTimeAsync(90_000);

            // Assert: the loop is gone, so nothing polls again
            expect(mockPredictionService.getPredictionsForStop).toHaveBeenCalledTimes(2);
        });

        it("ends only the removed stop's streams while a stop still in the dataset keeps streaming", async () => {
            // Arrange
            const mockPredictionService = makeMockPredictionService();
            const stopTwoPayload = makeResponse("stop-2", "b");
            let stopOneFetches = 0;
            mockPredictionService.getPredictionsForStop.mockImplementation(async (stopId: string) => {
                if (stopId === "stop-2") {
                    return stopTwoPayload;
                }
                stopOneFetches += 1;
                if (stopOneFetches > 1) {
                    throw new NotFoundError("Stop not found: stop-1");
                }
                return makeResponse("stop-1");
            });
            const { subscribe } = createPredictionStreamService(mockPredictionService as never);
            const subscriberA = makeSubscriber();
            const subscriberC = makeSubscriber();
            await subscribe("stop-1", subscriberA);
            await subscribe("stop-2", subscriberC);
            const fetchesFor = (stopId: string): number =>
                mockPredictionService.getPredictionsForStop.mock.calls.filter(([id]) => id === stopId).length;

            // Act: one tick removes stop-1 and refreshes stop-2
            await vi.advanceTimersByTimeAsync(30_000);

            // Assert
            expect(subscriberA.onEnd).toHaveBeenCalledTimes(1);
            expect(subscriberC.onUpdate).toHaveBeenCalledWith(stopTwoPayload);
            expect(subscriberC.onEnd).not.toHaveBeenCalled();
            expect(fetchesFor("stop-1")).toBe(2);
            expect(fetchesFor("stop-2")).toBe(2);

            // Act: the next tick
            await vi.advanceTimersByTimeAsync(30_000);

            // Assert: stop-2 is polled again, stop-1 is not
            expect(fetchesFor("stop-2")).toBe(3);
            expect(fetchesFor("stop-1")).toBe(2);
            expect(subscriberC.onUpdate).toHaveBeenCalledTimes(2);
        });

        it("isolates a throwing onEnd so every other subscriber of the stop is still ended", async () => {
            // Arrange
            const mockPredictionService = makeMockPredictionService();
            mockPredictionService.getPredictionsForStop
                .mockResolvedValueOnce(makeResponse())
                .mockRejectedValue(new NotFoundError("Stop not found: stop-1"));
            const { subscribe } = createPredictionStreamService(mockPredictionService as never);
            const subscriberA = {
                onUpdate: vi.fn(),
                onEnd: vi.fn(() => {
                    throw new Error("socket gone");
                }),
            };
            const subscriberB = makeSubscriber();
            await subscribe("stop-1", subscriberA);
            await subscribe("stop-1", subscriberB);

            // Act
            await vi.advanceTimersByTimeAsync(30_000);

            // Assert
            expect(subscriberA.onEnd).toHaveBeenCalledTimes(1);
            expect(subscriberB.onEnd).toHaveBeenCalledTimes(1);
            expect(logger.error).toHaveBeenCalledTimes(1);
            expect(logger.error).toHaveBeenCalledWith("Failed to end prediction stream for stop stop-1: socket gone");
            expect(logger.warn).toHaveBeenCalledTimes(1);
            expect(logger.warn).toHaveBeenCalledWith(
                "Ending 2 prediction stream(s) for stop stop-1: Stop not found: stop-1",
            );
        });

        it("treats an unsubscribe after teardown as a harmless no-op", async () => {
            // Arrange
            const mockPredictionService = makeMockPredictionService();
            mockPredictionService.getPredictionsForStop
                .mockResolvedValueOnce(makeResponse())
                .mockRejectedValue(new NotFoundError("Stop not found: stop-1"));
            const { subscribe } = createPredictionStreamService(mockPredictionService as never);
            const subscriberA = makeSubscriber();
            const { unsubscribe } = await subscribe("stop-1", subscriberA);
            await vi.advanceTimersByTimeAsync(30_000);

            // Act
            const act = () => unsubscribe();

            // Assert
            expect(act).not.toThrow();
            expect(subscriberA.onUpdate).not.toHaveBeenCalled();
            expect(subscriberA.onEnd).toHaveBeenCalledTimes(1);
        });

        it("rejects a re-subscribe to the removed stop with NotFoundError and leaves no zombie loop", async () => {
            // Arrange
            const mockPredictionService = makeMockPredictionService();
            mockPredictionService.getPredictionsForStop
                .mockResolvedValueOnce(makeResponse())
                .mockRejectedValue(new NotFoundError("Stop not found: stop-1"));
            const { subscribe } = createPredictionStreamService(mockPredictionService as never);
            await subscribe("stop-1", makeSubscriber());
            await vi.advanceTimersByTimeAsync(30_000);

            // Act
            const resubscribe = subscribe("stop-1", makeSubscriber());

            // Assert
            await expect(resubscribe).rejects.toThrow(NotFoundError);
            await vi.advanceTimersByTimeAsync(30_000);
            expect(mockPredictionService.getPredictionsForStop).toHaveBeenCalledTimes(3);
        });

        it("ends nothing and logs nothing when every subscriber left while the failing tick was in flight", async () => {
            // Arrange
            const mockPredictionService = makeMockPredictionService();
            let rejectTick: (reason: unknown) => void = () => {};
            mockPredictionService.getPredictionsForStop.mockResolvedValueOnce(makeResponse()).mockReturnValueOnce(
                new Promise((_, reject) => {
                    rejectTick = reject;
                }),
            );
            const { subscribe } = createPredictionStreamService(mockPredictionService as never);
            const subscriberA = makeSubscriber();
            const { unsubscribe } = await subscribe("stop-1", subscriberA);
            await vi.advanceTimersByTimeAsync(30_000);

            // Act: the last subscriber leaves, then the in-flight tick fails
            unsubscribe();
            rejectTick(new NotFoundError("Stop not found: stop-1"));
            await vi.advanceTimersByTimeAsync(0);

            // Assert
            expect(subscriberA.onEnd).not.toHaveBeenCalled();
            expect(logger.warn).not.toHaveBeenCalled();
            expect(logger.error).not.toHaveBeenCalled();
        });

        it("never lets a stale tick from a replaced loop tear down the newer loop for the same stop", async () => {
            // Arrange
            const mockPredictionService = makeMockPredictionService();
            const freshPayload = makeResponse("stop-1", "d");
            let rejectTick: (reason: unknown) => void = () => {};
            mockPredictionService.getPredictionsForStop
                .mockResolvedValueOnce(makeResponse("stop-1", "a"))
                .mockReturnValueOnce(
                    new Promise((_, reject) => {
                        rejectTick = reject;
                    }),
                )
                .mockResolvedValue(freshPayload);
            const { subscribe } = createPredictionStreamService(mockPredictionService as never);
            const subscriberA = makeSubscriber();
            const subscriberD = makeSubscriber();
            const { unsubscribe } = await subscribe("stop-1", subscriberA);
            // The first tick's fetch is now pending.
            await vi.advanceTimersByTimeAsync(30_000);
            // A leaves, which removes the loop, and D starts a new loop with a fresh first fetch.
            unsubscribe();
            await subscribe("stop-1", subscriberD);

            // Act: the stale tick from the removed loop fails
            rejectTick(new NotFoundError("Stop not found: stop-1"));
            await vi.advanceTimersByTimeAsync(0);

            // Assert: the newer loop is untouched
            expect(subscriberD.onEnd).not.toHaveBeenCalled();
            expect(logger.warn).not.toHaveBeenCalled();

            // Act: the newer loop's own tick
            await vi.advanceTimersByTimeAsync(30_000);

            // Assert: D's loop polled once more and delivered
            expect(mockPredictionService.getPredictionsForStop).toHaveBeenCalledTimes(4);
            expect(subscriberD.onUpdate).toHaveBeenCalledWith(freshPayload);
            expect(subscriberD.onEnd).not.toHaveBeenCalled();
        });
    });
});
