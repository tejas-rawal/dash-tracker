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
        // biome-ignore lint/style/useNamingConvention: mirrors the GTFS-RT service-alerts wire format (snake_case)
        active_period: [{ start: 1_700_000_000, end: 1_700_003_600 }],
        // biome-ignore lint/style/useNamingConvention: mirrors the GTFS-RT service-alerts wire format (snake_case)
        informed_entity: [{ route_id: "route-1", stop_id: "stop-1" }],
        cause: "MAINTENANCE",
        effect: "DETOUR",
        // biome-ignore lint/style/useNamingConvention: mirrors the GTFS-RT service-alerts wire format (snake_case)
        header_text: { translation: [{ text: "Detour on Route 1", language: "en" }] },
        // biome-ignore lint/style/useNamingConvention: mirrors the GTFS-RT service-alerts wire format (snake_case)
        description_text: { translation: [{ text: "Bus detoured due to road work", language: "en" }] },
        ...overrides,
    },
});

const makeDashAlertsApiResponse = (entities: DashAlertEntity[] = []): DashAlertsApiResponse => ({ entities });

describe("ServiceAlertService", () => {
    describe("fetchAlerts", () => {
        it("calls the DASH API with a URL containing the gtfs-rt-alerts/v2 path and agency", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue({ data: makeDashAlertsApiResponse([]) });
            const { fetchAlerts } = createServiceAlertService();

            // Act
            await fetchAlerts();

            // Assert
            expect(mockAxiosGet).toHaveBeenCalledWith(
                expect.stringContaining("/real-time/alexandria-dash/gtfs-rt-alerts/v2"),
            );
        });

        it("resolves to an empty array when the response has entities: []", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue({ data: makeDashAlertsApiResponse([]) });
            const { fetchAlerts } = createServiceAlertService();

            // Act
            const result = await fetchAlerts();

            // Assert
            expect(result).toEqual([]);
        });

        it("logs a warning and resolves to an empty array when entities is undefined", async () => {
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
            // biome-ignore lint/style/useNamingConvention: mirrors the GTFS-RT service-alerts wire format (snake_case)
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
            // biome-ignore lint/style/useNamingConvention: mirrors the GTFS-RT service-alerts wire format (snake_case)
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

        it("collapses two active_period entries to {start: earliest start, end: latest end} (D-02)", async () => {
            // Arrange
            const entity = makeDashAlertEntity({
                // biome-ignore lint/style/useNamingConvention: mirrors the GTFS-RT service-alerts wire format (snake_case)
                active_period: [
                    { start: 1_700_010_000, end: 1_700_020_000 },
                    { start: 1_700_000_000, end: 1_700_030_000 },
                ],
            });
            mockAxiosGet.mockResolvedValue({ data: makeDashAlertsApiResponse([entity]) });
            const { fetchAlerts } = createServiceAlertService();

            // Act
            const [alert] = await fetchAlerts();

            // Assert
            expect(alert.activePeriod.start).toBe(new Date(1_700_000_000 * 1000).toISOString());
            expect(alert.activePeriod.end).toBe(new Date(1_700_030_000 * 1000).toISOString());
        });

        it("collapses mixed-boundedness active_period entries to an open-ended window (WR-03)", async () => {
            // Arrange
            const entity = makeDashAlertEntity({
                // biome-ignore lint/style/useNamingConvention: mirrors the GTFS-RT service-alerts wire format (snake_case)
                active_period: [{ start: 1_700_010_000, end: 1_700_020_000 }, { start: 1_700_000_000 }],
            });
            mockAxiosGet.mockResolvedValue({ data: makeDashAlertsApiResponse([entity]) });
            const { fetchAlerts } = createServiceAlertService();

            // Act
            const [alert] = await fetchAlerts();

            // Assert
            expect(alert.activePeriod.start).toBe(new Date(1_700_000_000 * 1000).toISOString());
            expect(alert.activePeriod.end).toBeNull();
        });

        it("returns {start: null, end: null} when active_period is omitted entirely (D-03)", async () => {
            // Arrange
            // biome-ignore lint/style/useNamingConvention: mirrors the GTFS-RT service-alerts wire format (snake_case)
            const entity = makeDashAlertEntity({ active_period: undefined });
            mockAxiosGet.mockResolvedValue({ data: makeDashAlertsApiResponse([entity]) });
            const { fetchAlerts } = createServiceAlertService();

            // Act
            const [alert] = await fetchAlerts();

            // Assert
            expect(alert.activePeriod).toEqual({ start: null, end: null });
        });

        it("rejects with UpstreamApiError when entities is present but not an array", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue({ data: { entities: "bad" } });
            const { fetchAlerts } = createServiceAlertService();

            // Act & Assert
            await expect(fetchAlerts()).rejects.toThrow(UpstreamApiError);
        });

        it("rejects with UpstreamApiError when the response body is null (WR-01)", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue({ data: null });
            const { fetchAlerts } = createServiceAlertService();

            // Act & Assert
            await expect(fetchAlerts()).rejects.toThrow(UpstreamApiError);
        });

        it("parses a JSON-encoded string response body and maps the alert correctly", async () => {
            // Arrange
            const entity = makeDashAlertEntity({}, "alert-1");
            mockAxiosGet.mockResolvedValue({ data: JSON.stringify(makeDashAlertsApiResponse([entity])) });
            const { fetchAlerts } = createServiceAlertService();

            // Act
            const [alert] = await fetchAlerts();

            // Assert
            expect(alert.id).toBe("alert-1");
            expect(alert.informedRouteIds).toEqual(["route-1"]);
            expect(alert.informedStopIds).toEqual(["stop-1"]);
        });

        it("rejects with UpstreamApiError when the response body is a non-object value (WR-01)", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue({ data: "not-an-object" });
            const { fetchAlerts } = createServiceAlertService();

            // Act & Assert
            await expect(fetchAlerts()).rejects.toThrow(UpstreamApiError);
        });

        it("rejects with UpstreamApiError when the response body is an array-rooted value (WR-01)", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue({ data: [] });
            const { fetchAlerts } = createServiceAlertService();

            // Act & Assert
            await expect(fetchAlerts()).rejects.toThrow(UpstreamApiError);
        });

        it("rejects with UpstreamApiError when the response body is a JSON-encoded string that parses to an array-rooted value (WR-01)", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue({ data: "[]" });
            const { fetchAlerts } = createServiceAlertService();

            // Act & Assert
            await expect(fetchAlerts()).rejects.toThrow(UpstreamApiError);
        });

        it("rejects with UpstreamApiError when an entity item is null (WR-02)", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue({ data: { entities: [null] } });
            const { fetchAlerts } = createServiceAlertService();

            // Act & Assert
            await expect(fetchAlerts()).rejects.toThrow(UpstreamApiError);
        });

        it("rejects with UpstreamApiError when an entity item is missing the alert property (WR-02)", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue({ data: { entities: [{ id: "x" }] } });
            const { fetchAlerts } = createServiceAlertService();

            // Act & Assert
            await expect(fetchAlerts()).rejects.toThrow(UpstreamApiError);
        });

        it("rejects with UpstreamApiError when an entity item's alert property is explicitly null (WR-02)", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue({ data: { entities: [{ id: "x", alert: null }] } });
            const { fetchAlerts } = createServiceAlertService();

            // Act & Assert
            await expect(fetchAlerts()).rejects.toThrow(UpstreamApiError);
        });

        it("maps an alert with an empty informed_entity array to empty route/stop id lists without throwing", async () => {
            // Arrange
            // biome-ignore lint/style/useNamingConvention: mirrors the GTFS-RT service-alerts wire format (snake_case)
            const entity = makeDashAlertEntity({ informed_entity: [] });
            mockAxiosGet.mockResolvedValue({ data: makeDashAlertsApiResponse([entity]) });
            const { fetchAlerts } = createServiceAlertService();

            // Act
            const [alert] = await fetchAlerts();

            // Assert
            expect(alert.informedRouteIds).toEqual([]);
            expect(alert.informedStopIds).toEqual([]);
        });

        it("maps an alert with omitted informed_entity to empty route/stop id lists without throwing", async () => {
            // Arrange
            // biome-ignore lint/style/useNamingConvention: mirrors the GTFS-RT service-alerts wire format (snake_case)
            const entity = makeDashAlertEntity({ informed_entity: undefined });
            mockAxiosGet.mockResolvedValue({ data: makeDashAlertsApiResponse([entity]) });
            const { fetchAlerts } = createServiceAlertService();

            // Act
            const [alert] = await fetchAlerts();

            // Assert
            expect(alert.informedRouteIds).toEqual([]);
            expect(alert.informedStopIds).toEqual([]);
        });
    });
});
