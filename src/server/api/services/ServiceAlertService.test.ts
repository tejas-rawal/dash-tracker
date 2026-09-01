import { describe, expect, it, vi } from "vitest";
import { UpstreamApiError } from "../errors";
import type { DashAlertEntity, DashAlertsApiResponse } from "../models/ServiceAlert";

vi.mock("../../config", () => ({
    axios: { get: vi.fn() },
    environment: {
        dashApi: { agency: "alexandria-dash", baseUrl: "https://api.goswift.ly", apiKey: "key" },
        server: { port: 3000 },
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { axios, logger } from "../../config";
import { createServiceAlertService } from "./ServiceAlertService";

const mockAxiosGet = vi.mocked(axios.get);

const makeDashAlertEntity = (overrides: Partial<DashAlertEntity["alert"]> = {}, id = "alert-1"): DashAlertEntity => ({
    id,
    alert: {
        active_period: [{ start: 1_700_000_000, end: 1_700_003_600 }],
        informed_entity: [{ route_id: "route-1", stop_id: "stop-1" }],
        cause: "MAINTENANCE",
        effect: "DETOUR",
        header_text: { translation: [{ text: "Detour on Route 1", language: "en" }] },
        description_text: { translation: [{ text: "Bus detoured due to road work", language: "en" }] },
        ...overrides,
    },
});

const makeDashAlertsApiResponse = (entity: DashAlertEntity[] = []): DashAlertsApiResponse => ({ entity });

describe("ServiceAlertService", () => {
    describe("fetchAlerts", () => {
        it("calls the DASH API with a URL containing the service-alerts path and agency", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue({ data: makeDashAlertsApiResponse([]) });
            const { fetchAlerts } = createServiceAlertService();

            // Act
            await fetchAlerts();

            // Assert
            expect(mockAxiosGet).toHaveBeenCalledWith(
                expect.stringContaining("/real-time/alexandria-dash/service-alerts"),
            );
        });

        it("resolves to an empty array when the response has entity: []", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue({ data: makeDashAlertsApiResponse([]) });
            const { fetchAlerts } = createServiceAlertService();

            // Act
            const result = await fetchAlerts();

            // Assert
            expect(result).toEqual([]);
        });

        it("logs a warning and resolves to an empty array when entity is undefined", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue({ data: {} });
            const { fetchAlerts } = createServiceAlertService();

            // Act
            const result = await fetchAlerts();

            // Assert
            expect(result).toEqual([]);
            expect(logger.warn).toHaveBeenCalledWith("No service alerts found in API response");
        });

        it("maps a Dash alert entity with one active_period, one informed_entity, cause/effect, and translations", async () => {
            // Arrange
            const entity = makeDashAlertEntity({}, "alert-1");
            mockAxiosGet.mockResolvedValue({ data: makeDashAlertsApiResponse([entity]) });
            const { fetchAlerts } = createServiceAlertService();

            // Act
            const [alert] = await fetchAlerts();

            // Assert
            expect(alert.id).toBe("alert-1");
            expect(alert.informedRouteIds).toEqual(["route-1"]);
            expect(alert.informedStopIds).toEqual(["stop-1"]);
            expect(alert.cause).toBe("MAINTENANCE");
            expect(alert.effect).toBe("DETOUR");
            expect(alert.headerText).toBe("Detour on Route 1");
            expect(alert.descriptionText).toBe("Bus detoured due to road work");
        });

        it("converts unix-seconds active_period start/end to ISO 8601 strings", async () => {
            // Arrange
            const entity = makeDashAlertEntity({ active_period: [{ start: 1_700_000_000, end: 1_700_003_600 }] });
            mockAxiosGet.mockResolvedValue({ data: makeDashAlertsApiResponse([entity]) });
            const { fetchAlerts } = createServiceAlertService();

            // Act
            const [alert] = await fetchAlerts();

            // Assert
            expect(alert.activePeriod.start).toBe(new Date(1_700_000_000 * 1000).toISOString());
            expect(alert.activePeriod.end).toBe(new Date(1_700_003_600 * 1000).toISOString());
        });

        it("returns activePeriod {start: null, end: null} for an alert with zero active_period entries", async () => {
            // Arrange
            const entity = makeDashAlertEntity({ active_period: [] });
            mockAxiosGet.mockResolvedValue({ data: makeDashAlertsApiResponse([entity]) });
            const { fetchAlerts } = createServiceAlertService();

            // Act
            const [alert] = await fetchAlerts();

            // Assert
            expect(alert.activePeriod).toEqual({ start: null, end: null });
        });

        it("throws when the DASH API call rejects", async () => {
            // Arrange
            mockAxiosGet.mockRejectedValue(new Error("network error"));
            const { fetchAlerts } = createServiceAlertService();

            // Act & Assert
            await expect(fetchAlerts()).rejects.toThrow("network error");
        });
    });
});
