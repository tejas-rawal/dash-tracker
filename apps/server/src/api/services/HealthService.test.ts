import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BusDataLoadState } from "../repositories";
import { REFRESH_INTERVAL_MS } from "./BusDataRefreshService";
import { STALE_AFTER_MS, createHealthService } from "./HealthService";

const NOW = new Date("2026-10-06T12:00:00.000Z");

// No load method: any readiness path that tried to fetch would throw.
const makeMockRepo = (state: BusDataLoadState = {}) => ({
    getLoadState: vi.fn().mockReturnValue(state),
});

const msAgo = (ms: number): Date => new Date(NOW.getTime() - ms);

describe("HealthService", () => {
    beforeEach(() => {
        // Only Date is faked, so promise resolution and timer behaviour are untouched.
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(NOW);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("STALE_AFTER_MS is three refresh intervals plus a five-minute grace", () => {
        // Arrange & Act & Assert
        expect(REFRESH_INTERVAL_MS).toBe(3_600_000);
        expect(STALE_AFTER_MS).toBe(3 * REFRESH_INTERVAL_MS + 300_000);
        expect(STALE_AFTER_MS).toBe(11_100_000);
    });

    describe("getReadiness", () => {
        it("reports never_loaded with null age and timestamps before any load attempt", () => {
            // Arrange
            const { getReadiness } = createHealthService(makeMockRepo() as never);

            // Act
            const report = getReadiness();

            // Assert
            expect(report).toEqual({
                status: "not_ready",
                reason: "never_loaded",
                dataAgeSeconds: null,
                lastLoadedAt: null,
                lastFailedAt: null,
            });
        });

        it("reports never_loaded with the failure time and no error text after a failed first load", () => {
            // Arrange
            const failedAt = msAgo(2_000);
            const mockRepo = makeMockRepo({ lastFailedAt: failedAt, lastError: "DASH API request failed: boom" });
            const { getReadiness } = createHealthService(mockRepo as never);

            // Act
            const report = getReadiness();

            // Assert
            expect(report).toEqual({
                status: "not_ready",
                reason: "never_loaded",
                dataAgeSeconds: null,
                lastLoadedAt: null,
                lastFailedAt: failedAt.toISOString(),
            });
            expect(report).not.toHaveProperty("lastError");
            expect(JSON.stringify(report)).not.toContain("boom");
        });

        it.each([
            { ageMs: 0, seconds: 0 },
            { ageMs: 999, seconds: 0 },
            { ageMs: 1_000, seconds: 1 },
            { ageMs: 1_999, seconds: 1 },
            { ageMs: 11_099_999, seconds: 11_099 },
            { ageMs: 11_100_000, seconds: 11_100 },
        ])("reports ready with dataAgeSeconds $seconds for data aged $ageMs ms", ({ ageMs, seconds }) => {
            // Arrange
            const loadedAt = msAgo(ageMs);
            const { getReadiness } = createHealthService(makeMockRepo({ lastLoadedAt: loadedAt }) as never);

            // Act
            const report = getReadiness();

            // Assert
            expect(report).toEqual({
                status: "ready",
                dataAgeSeconds: seconds,
                lastLoadedAt: loadedAt.toISOString(),
                lastFailedAt: null,
            });
            expect(report).not.toHaveProperty("reason");
        });

        it.each([
            { ageMs: 11_100_001, seconds: 11_100 },
            { ageMs: 86_400_000, seconds: 86_400 },
        ])("reports stale with dataAgeSeconds $seconds for data aged $ageMs ms", ({ ageMs, seconds }) => {
            // Arrange
            const loadedAt = msAgo(ageMs);
            const { getReadiness } = createHealthService(makeMockRepo({ lastLoadedAt: loadedAt }) as never);

            // Act
            const report = getReadiness();

            // Assert
            expect(report).toEqual({
                status: "not_ready",
                reason: "stale",
                dataAgeSeconds: seconds,
                lastLoadedAt: loadedAt.toISOString(),
                lastFailedAt: null,
            });
        });

        it("reports ready with age 0 when lastLoadedAt is ahead of the clock", () => {
            // Arrange
            const loadedAt = new Date(NOW.getTime() + 5_000);
            const { getReadiness } = createHealthService(makeMockRepo({ lastLoadedAt: loadedAt }) as never);

            // Act
            const report = getReadiness();

            // Assert
            expect(report).toEqual({
                status: "ready",
                dataAgeSeconds: 0,
                lastLoadedAt: loadedAt.toISOString(),
                lastFailedAt: null,
            });
        });

        it("stays ready with both timestamps and no error text after a failed refresh within the threshold", () => {
            // Arrange
            const loadedAt = msAgo(60_000);
            const failedAt = msAgo(1_000);
            const mockRepo = makeMockRepo({
                lastLoadedAt: loadedAt,
                lastFailedAt: failedAt,
                lastError: "DASH API request failed: boom",
            });
            const { getReadiness } = createHealthService(mockRepo as never);

            // Act
            const report = getReadiness();

            // Assert
            expect(report).toEqual({
                status: "ready",
                dataAgeSeconds: 60,
                lastLoadedAt: loadedAt.toISOString(),
                lastFailedAt: failedAt.toISOString(),
            });
            expect(report).not.toHaveProperty("lastError");
        });

        it("reports stale with both timestamps when old data is followed by a recent failure", () => {
            // Arrange
            const loadedAt = msAgo(11_100_001);
            const failedAt = msAgo(5_000);
            const mockRepo = makeMockRepo({ lastLoadedAt: loadedAt, lastFailedAt: failedAt });
            const { getReadiness } = createHealthService(mockRepo as never);

            // Act
            const report = getReadiness();

            // Assert
            expect(report).toEqual({
                status: "not_ready",
                reason: "stale",
                dataAgeSeconds: 11_100,
                lastLoadedAt: loadedAt.toISOString(),
                lastFailedAt: failedAt.toISOString(),
            });
        });

        it("reads exactly one load-state snapshot per call", () => {
            // Arrange
            const mockRepo = makeMockRepo({ lastLoadedAt: msAgo(1_000) });
            const { getReadiness } = createHealthService(mockRepo as never);

            // Act
            getReadiness();
            getReadiness();

            // Assert
            expect(mockRepo.getLoadState).toHaveBeenCalledTimes(2);
        });
    });
});
