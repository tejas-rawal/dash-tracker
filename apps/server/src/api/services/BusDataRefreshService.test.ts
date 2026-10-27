import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from "../../config";
import { computeRetryDelayMs, createBusDataRefreshService } from "./BusDataRefreshService";

const HOUR_MS = 3_600_000;

const makeMockRepository = () => ({
    load: vi.fn(),
});

const makeSummary = (routeCount = 3, stopCount = 7) => ({ routeCount, stopCount });

function warnMessages(): string[] {
    return vi.mocked(logger.warn).mock.calls.map((call) => String(call[0]));
}

function loggedDelays(): number[] {
    return warnMessages().map((message) => Number(/next attempt in (\d+)ms$/.exec(message)?.[1]));
}

// D-08: every settled attempt leaves exactly one info or warn line, and nothing is logged at error level.
function expectOneLinePerSettledAttempt(settledAttempts: number): void {
    expect(vi.mocked(logger.info).mock.calls.length + vi.mocked(logger.warn).mock.calls.length).toBe(settledAttempts);
    expect(logger.error).not.toHaveBeenCalled();
}

describe("computeRetryDelayMs", () => {
    it.each([
        { attempt: 1, random: 0, expected: 500 },
        { attempt: 1, random: 1, expected: 1000 },
        { attempt: 2, random: 0.5, expected: 1500 },
        { attempt: 7, random: 0, expected: 30000 },
        { attempt: 7, random: 1, expected: 60000 },
        { attempt: 10000, random: 1, expected: 60000 },
    ])("returns $expected ms for attempt $attempt with random() = $random", ({ attempt, random, expected }) => {
        // Arrange
        const randomSource = () => random;

        // Act
        const delay = computeRetryDelayMs(attempt, randomSource);

        // Assert
        expect(delay).toBe(expected);
        expect(Number.isFinite(delay)).toBe(true);
    });

    // Below the cap each range is [c/2, c] with the next ceiling doubling, so the ranges touch. Attempt 6's
    // ceiling (32000) is not yet capped while attempt 7's floor is half the 60000 cap (30000), so the
    // ranges overlap from there on; that boundary is pinned separately below.
    it.each([1, 2, 3, 4, 5])(
        "lets attempt %i's longest delay touch the next attempt's shortest, so delays never shrink",
        (attempt) => {
            // Arrange
            const lowest = () => 0;
            const highest = () => 1;

            // Act
            const nextFloor = computeRetryDelayMs(attempt + 1, lowest);
            const currentCeiling = computeRetryDelayMs(attempt, highest);

            // Assert
            expect(nextFloor).toBe(currentCeiling);
        },
    );

    it("keeps capped attempts between half the cap and the cap, starting at attempt 7", () => {
        // Arrange
        const lowest = () => 0;
        const highest = () => 1;

        // Act
        const lastUncappedCeiling = computeRetryDelayMs(6, highest);
        const cappedFloor = computeRetryDelayMs(7, lowest);
        const cappedCeiling = computeRetryDelayMs(7, highest);

        // Assert
        expect(lastUncappedCeiling).toBe(32000);
        expect(cappedFloor).toBe(30000);
        expect(cappedCeiling).toBe(60000);
    });

    it("uses Math.random when no random source is given", () => {
        // Arrange
        vi.spyOn(Math, "random").mockReturnValue(1);

        // Act
        const delay = computeRetryDelayMs(1);

        // Assert
        expect(delay).toBe(1000);
    });
});

describe("createBusDataRefreshService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.spyOn(Math, "random").mockReturnValue(0);
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("loads immediately on start() and logs one info line on the first success", async () => {
        // Arrange
        const repository = makeMockRepository();
        repository.load.mockResolvedValue(makeSummary(3, 7));
        const service = createBusDataRefreshService(repository as never);

        // Act
        service.start();
        await vi.advanceTimersByTimeAsync(0);

        // Assert
        expect(repository.load).toHaveBeenCalledTimes(1);
        expect(logger.info).toHaveBeenCalledTimes(1);
        expect(logger.info).toHaveBeenCalledWith("Route/stop data loaded on attempt 1: 3 routes, 7 stops");
        expectOneLinePerSettledAttempt(1);
    });

    it("backs off 500, 1000, 2000, 4000, 8000, 16000, 30000 and 30000 ms with random() = 0, starting each attempt exactly when its delay elapses", async () => {
        // Arrange
        const repository = makeMockRepository();
        repository.load.mockRejectedValue(new Error("DASH down"));
        const service = createBusDataRefreshService(repository as never);
        const expectedDelays = [500, 1000, 2000, 4000, 8000, 16000, 30000, 30000];

        // Act
        service.start();
        await vi.advanceTimersByTimeAsync(0);

        // Assert
        for (const [index, delay] of expectedDelays.entries()) {
            const attempt = index + 1;
            expect(logger.warn).toHaveBeenNthCalledWith(
                attempt,
                `Route/stop data load attempt ${attempt} failed: DASH down; next attempt in ${delay}ms`,
            );
            await vi.advanceTimersByTimeAsync(delay - 1);
            expect(repository.load).toHaveBeenCalledTimes(attempt);
            await vi.advanceTimersByTimeAsync(1);
            expect(repository.load).toHaveBeenCalledTimes(attempt + 1);
        }
        expectOneLinePerSettledAttempt(expectedDelays.length + 1);
    });

    it("never logs a delay above 60000 ms or shorter than the one before it, over 20 failed attempts with random() near 1", async () => {
        // Arrange
        vi.spyOn(Math, "random").mockReturnValue(0.999999);
        const repository = makeMockRepository();
        repository.load.mockRejectedValue(new Error("DASH down"));
        const service = createBusDataRefreshService(repository as never);

        // Act
        service.start();
        await vi.advanceTimersByTimeAsync(0);
        while (repository.load.mock.calls.length < 20) {
            await vi.advanceTimersByTimeAsync(60_000);
        }

        // Assert
        const delays = loggedDelays();
        expect(delays.length).toBeGreaterThanOrEqual(20);
        for (const [index, delay] of delays.entries()) {
            expect(delay).toBeLessThanOrEqual(60_000);
            if (index > 0) {
                expect(delay).toBeGreaterThanOrEqual(delays[index - 1]);
            }
        }
        expect(logger.error).not.toHaveBeenCalled();
    });

    it("starts no refresh 3_599_999 ms after a success and exactly one at 3_600_000 ms", async () => {
        // Arrange
        const repository = makeMockRepository();
        repository.load.mockRejectedValueOnce(new Error("DASH down")).mockResolvedValue(makeSummary(3, 7));
        const service = createBusDataRefreshService(repository as never);
        service.start();
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(500);
        expect(logger.info).toHaveBeenCalledWith("Route/stop data loaded on attempt 2: 3 routes, 7 stops");

        // Act
        await vi.advanceTimersByTimeAsync(3_599_999);
        const loadsJustBefore = repository.load.mock.calls.length;
        await vi.advanceTimersByTimeAsync(1);

        // Assert
        expect(loadsJustBefore).toBe(2);
        expect(repository.load).toHaveBeenCalledTimes(3);
        expect(logger.info).toHaveBeenLastCalledWith("Route/stop data refreshed: 3 routes, 7 stops");
        expectOneLinePerSettledAttempt(3);
    });

    it("keeps the hourly cadence after a failed refresh instead of switching back to backoff", async () => {
        // Arrange
        const repository = makeMockRepository();
        repository.load
            .mockResolvedValueOnce(makeSummary())
            .mockRejectedValueOnce(new Error("boom"))
            .mockResolvedValue(makeSummary());
        const service = createBusDataRefreshService(repository as never);
        service.start();
        await vi.advanceTimersByTimeAsync(0);

        // Act
        await vi.advanceTimersByTimeAsync(HOUR_MS);

        // Assert
        expect(repository.load).toHaveBeenCalledTimes(2);
        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(logger.warn).toHaveBeenCalledWith(
            "Route/stop data refresh attempt 1 failed: boom; next attempt in 3600000ms",
        );
        await vi.advanceTimersByTimeAsync(HOUR_MS - 1);
        expect(repository.load).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1);
        expect(repository.load).toHaveBeenCalledTimes(3);
        expect(logger.info).toHaveBeenLastCalledWith("Route/stop data refreshed: 3 routes, 7 stops");
        expectOneLinePerSettledAttempt(3);
    });

    it("never overlaps attempts while a load is still pending", async () => {
        // Arrange
        let resolveLoad: (summary: ReturnType<typeof makeSummary>) => void = () => {};
        const repository = makeMockRepository();
        repository.load
            .mockReturnValueOnce(
                new Promise((resolve) => {
                    resolveLoad = resolve;
                }),
            )
            .mockResolvedValue(makeSummary());
        const service = createBusDataRefreshService(repository as never);
        service.start();
        await vi.advanceTimersByTimeAsync(0);

        // Act
        await vi.advanceTimersByTimeAsync(24 * HOUR_MS);

        // Assert
        expect(repository.load).toHaveBeenCalledTimes(1);
        expectOneLinePerSettledAttempt(0);

        // Act
        resolveLoad(makeSummary());
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(HOUR_MS);

        // Assert
        expect(logger.info).toHaveBeenNthCalledWith(1, "Route/stop data loaded on attempt 1: 3 routes, 7 stops");
        expect(repository.load).toHaveBeenCalledTimes(2);
        expectOneLinePerSettledAttempt(2);
    });

    it("stop() cancels a pending backoff retry", async () => {
        // Arrange
        const repository = makeMockRepository();
        repository.load.mockRejectedValue(new Error("DASH down"));
        const service = createBusDataRefreshService(repository as never);
        service.start();
        await vi.advanceTimersByTimeAsync(0);

        // Act
        service.stop();
        await vi.advanceTimersByTimeAsync(120_000);

        // Assert
        expect(repository.load).toHaveBeenCalledTimes(1);
        expectOneLinePerSettledAttempt(1);
    });

    it("stop() cancels a pending hourly refresh", async () => {
        // Arrange
        const repository = makeMockRepository();
        repository.load.mockResolvedValue(makeSummary());
        const service = createBusDataRefreshService(repository as never);
        service.start();
        await vi.advanceTimersByTimeAsync(0);

        // Act
        service.stop();
        await vi.advanceTimersByTimeAsync(2 * HOUR_MS);

        // Assert
        expect(repository.load).toHaveBeenCalledTimes(1);
        expectOneLinePerSettledAttempt(1);
    });

    it("stop() during an in-flight attempt lets it settle and log once, but schedules nothing after it", async () => {
        // Arrange
        let resolveLoad: (summary: ReturnType<typeof makeSummary>) => void = () => {};
        const repository = makeMockRepository();
        repository.load.mockReturnValueOnce(
            new Promise((resolve) => {
                resolveLoad = resolve;
            }),
        );
        const service = createBusDataRefreshService(repository as never);
        service.start();
        await vi.advanceTimersByTimeAsync(0);

        // Act
        service.stop();
        resolveLoad(makeSummary());
        await vi.advanceTimersByTimeAsync(2 * HOUR_MS);

        // Assert
        expect(repository.load).toHaveBeenCalledTimes(1);
        expect(logger.info).toHaveBeenCalledWith("Route/stop data loaded on attempt 1: 3 routes, 7 stops");
        expectOneLinePerSettledAttempt(1);
    });

    it("start() twice runs a single immediate load", async () => {
        // Arrange
        const repository = makeMockRepository();
        repository.load.mockResolvedValue(makeSummary());
        const service = createBusDataRefreshService(repository as never);

        // Act
        service.start();
        service.start();
        await vi.advanceTimersByTimeAsync(0);

        // Assert
        expect(repository.load).toHaveBeenCalledTimes(1);
        expectOneLinePerSettledAttempt(1);
    });

    it("start() after stop() loads nothing", async () => {
        // Arrange
        const repository = makeMockRepository();
        repository.load.mockResolvedValue(makeSummary());
        const service = createBusDataRefreshService(repository as never);

        // Act
        service.stop();
        service.start();
        await vi.advanceTimersByTimeAsync(2 * HOUR_MS);

        // Assert
        expect(repository.load).not.toHaveBeenCalled();
        expectOneLinePerSettledAttempt(0);
    });

    it("logs 'Unknown error' for a non-Error rejection", async () => {
        // Arrange
        const repository = makeMockRepository();
        repository.load.mockRejectedValue("nope");
        const service = createBusDataRefreshService(repository as never);

        // Act
        service.start();
        await vi.advanceTimersByTimeAsync(0);

        // Assert
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("failed: Unknown error;"));
        expect(warnMessages()[0]).not.toContain("nope");
        expectOneLinePerSettledAttempt(1);
    });
});
