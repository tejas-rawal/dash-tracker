import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "../errors";
import type { StopPredictionsResponse } from "../models/Prediction";

vi.mock("../../config", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from "../../config";
import { createPredictionStreamService } from "./PredictionStreamService";

const makeMockPredictionService = () => ({
    getPredictionsForStop: vi.fn(),
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
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("subscribing to a new stop returns the first fetch's resolved value and fetches exactly once", async () => {
        // Arrange
        const mockPredictionService = makeMockPredictionService();
        const payload = makeResponse();
        mockPredictionService.getPredictionsForStop.mockResolvedValue(payload);
        const { subscribe } = createPredictionStreamService(mockPredictionService as never);

        // Act
        const { initialPayload } = await subscribe("stop-1", vi.fn());

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
        const first = await subscribe("stop-1", vi.fn());
        const second = await subscribe("stop-1", vi.fn());

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
        const onUpdateA = vi.fn();
        const onUpdateB = vi.fn();

        // Act
        await subscribe("stop-1", onUpdateA);
        await subscribe("stop-1", onUpdateB);
        await vi.advanceTimersByTimeAsync(30_000);

        // Assert
        expect(mockPredictionService.getPredictionsForStop).toHaveBeenCalledTimes(2);
        expect(onUpdateA).toHaveBeenCalledWith(secondPayload);
        expect(onUpdateB).toHaveBeenCalledWith(secondPayload);
    });

    it("stops polling once the sole subscriber unsubscribes", async () => {
        // Arrange
        const mockPredictionService = makeMockPredictionService();
        mockPredictionService.getPredictionsForStop.mockResolvedValue(makeResponse());
        const { subscribe } = createPredictionStreamService(mockPredictionService as never);
        const { unsubscribe } = await subscribe("stop-1", vi.fn());

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
        const { unsubscribe } = await subscribe("stop-1", vi.fn());
        unsubscribe();

        // Act
        await subscribe("stop-1", vi.fn());

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
        const onUpdate = vi.fn();
        await subscribe("stop-1", onUpdate);

        // Act: first tick fails
        await vi.advanceTimersByTimeAsync(30_000);

        // Assert: failure logged, subscriber not called with failed-tick data, interval still alive
        expect(onUpdate).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("stop-1"));

        // Act: second tick succeeds
        await vi.advanceTimersByTimeAsync(30_000);

        // Assert: recovery fans out fresh data
        expect(onUpdate).toHaveBeenCalledWith(recoveredPayload);
        expect(mockPredictionService.getPredictionsForStop).toHaveBeenCalledTimes(3);
    });

    it("propagates the error when the very first subscribe fetch rejects, without creating a zombie loop", async () => {
        // Arrange
        const mockPredictionService = makeMockPredictionService();
        mockPredictionService.getPredictionsForStop
            .mockRejectedValueOnce(new NotFoundError("Stop not found: stop-1"))
            .mockResolvedValueOnce(makeResponse());
        const { subscribe } = createPredictionStreamService(mockPredictionService as never);

        // Act & Assert: first attempt rejects
        await expect(subscribe("stop-1", vi.fn())).rejects.toThrow(NotFoundError);

        // Act: a following subscribe triggers a brand-new fetch (no zombie loop entry survived)
        await subscribe("stop-1", vi.fn());

        // Assert
        expect(mockPredictionService.getPredictionsForStop).toHaveBeenCalledTimes(2);
    });
});
