import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServiceAlert } from "../models/ServiceAlert";

vi.mock("../../config", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from "../../config";
import { createServiceAlertPollService } from "./ServiceAlertPollService";

const makeMockService = () => ({
    fetchAlerts: vi.fn(),
});

const makeMockRepository = () => ({
    applyAlerts: vi.fn(),
});

const makeAlert = (id = "alert-1"): ServiceAlert => ({
    id,
    informedRouteIds: [],
    informedStopIds: [],
    activePeriod: { start: null, end: null },
});

describe("ServiceAlertPollService", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("triggers an immediate fetch + apply on start() without waiting for the first interval tick", async () => {
        // Arrange
        const mockService = makeMockService();
        const mockRepository = makeMockRepository();
        const alerts = [makeAlert()];
        mockService.fetchAlerts.mockResolvedValue(alerts);
        const { start } = createServiceAlertPollService(mockService as never, mockRepository as never);

        // Act
        start();
        await vi.advanceTimersByTimeAsync(0);

        // Assert
        expect(mockService.fetchAlerts).toHaveBeenCalledTimes(1);
        expect(mockRepository.applyAlerts).toHaveBeenCalledWith(alerts);
    });

    it("triggers exactly one additional poll cycle after advancing 5 minutes", async () => {
        // Arrange
        const mockService = makeMockService();
        const mockRepository = makeMockRepository();
        mockService.fetchAlerts.mockResolvedValue([makeAlert()]);
        const { start } = createServiceAlertPollService(mockService as never, mockRepository as never);
        start();
        await vi.advanceTimersByTimeAsync(0);

        // Act
        await vi.advanceTimersByTimeAsync(300_000);

        // Assert
        expect(mockService.fetchAlerts).toHaveBeenCalledTimes(2);
    });

    it("logs via logger.error and does not call repository.applyAlerts() when fetchAlerts() rejects", async () => {
        // Arrange
        const mockService = makeMockService();
        const mockRepository = makeMockRepository();
        mockService.fetchAlerts.mockRejectedValue(new Error("upstream down"));
        const { start } = createServiceAlertPollService(mockService as never, mockRepository as never);

        // Act
        start();
        await vi.advanceTimersByTimeAsync(0);

        // Assert
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("upstream down"));
        expect(mockRepository.applyAlerts).not.toHaveBeenCalled();
    });

    it("calls repository.applyAlerts(result) with the resolved array when fetchAlerts() resolves", async () => {
        // Arrange
        const mockService = makeMockService();
        const mockRepository = makeMockRepository();
        const alerts = [makeAlert("alert-1"), makeAlert("alert-2")];
        mockService.fetchAlerts.mockResolvedValue(alerts);
        const { start } = createServiceAlertPollService(mockService as never, mockRepository as never);

        // Act
        start();
        await vi.advanceTimersByTimeAsync(0);

        // Assert
        expect(mockRepository.applyAlerts).toHaveBeenCalledWith(alerts);
    });
});
