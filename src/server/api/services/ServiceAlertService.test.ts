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

// Confirmed live shape (G-05-5): a flat, custom Swiftly/Alexandria alerts format — no
// nested `alert` object, and headerText/descriptionText/url are plain strings.
const makeDashAlertEntity = (overrides: Partial<DashAlertEntity> = {}, id = "alert-1"): DashAlertEntity => ({
    id,
    activePeriods: [{ start: "2023-11-14T22:13:20.000Z", end: "2023-11-14T23:13:20.000Z" }],
    informedEntities: [{ routeId: "route-1", stopId: "stop-1" }],
    cause: "MAINTENANCE",
    effect: "DETOUR",
    headerText: "Detour on Route 1",
    descriptionText: "Bus detoured due to road work",
    ...overrides,
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

        it("calls the DASH API with a URL containing format=json", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue({ data: makeDashAlertsApiResponse([]) });
            const { fetchAlerts } = createServiceAlertService();

            // Act
            await fetchAlerts();

            // Assert
            expect(mockAxiosGet).toHaveBeenCalledWith(expect.stringContaining("format=json"));
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

        it("maps a Dash alert entity with one active period, one informed entity, cause/effect, and header/description text", async () => {
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

        it("maps headerText, descriptionText, and url all together from a fully-populated, realistic alert payload matching the confirmed live shape", async () => {
            // Arrange — mirrors an entity from the confirmed live diagnostic capture (G-05-5)
            const entity = makeDashAlertEntity({
                id: "e7b56888-5441-414a-a0d6-dd40f9f7c0e6",
                cause: "CONSTRUCTION",
                effect: "NO_SERVICE",
                url: "https://goswift.ly/alerts/alert-1",
                headerText: "Temporary Stop Closure on Lines 30 & 31",
                descriptionText: "The bus stop located at Montgomery St + N Pitt St (ID# 4000850) will be closed.",
                activePeriods: [{ start: "2025-03-09T13:00:00.000Z", end: null }],
                informedEntities: [
                    { routeId: "30", stopId: "540" },
                    { routeId: "31", stopId: "540" },
                ],
            });
            mockAxiosGet.mockResolvedValue({ data: makeDashAlertsApiResponse([entity]) });
            const { fetchAlerts } = createServiceAlertService();

            // Act
            const [alert] = await fetchAlerts();

            // Assert
            expect(alert.id).toBe("e7b56888-5441-414a-a0d6-dd40f9f7c0e6");
            expect(alert.cause).toBe("CONSTRUCTION");
            expect(alert.effect).toBe("NO_SERVICE");
            expect(alert.headerText).toBe("Temporary Stop Closure on Lines 30 & 31");
            expect(alert.descriptionText).toBe(
                "The bus stop located at Montgomery St + N Pitt St (ID# 4000850) will be closed.",
            );
            expect(alert.url).toBe("https://goswift.ly/alerts/alert-1");
            expect(alert.informedRouteIds).toEqual(["30", "31"]);
            expect(alert.informedStopIds).toEqual(["540", "540"]);
            expect(alert.activePeriod).toEqual({ start: "2025-03-09T13:00:00.000Z", end: null });
        });

        it("passes through an already-ISO-8601 active period start/end unchanged", async () => {
            // Arrange
            const entity = makeDashAlertEntity({
                activePeriods: [{ start: "2023-11-14T22:13:20.000Z", end: "2023-11-14T23:13:20.000Z" }],
            });
            mockAxiosGet.mockResolvedValue({ data: makeDashAlertsApiResponse([entity]) });
            const { fetchAlerts } = createServiceAlertService();

            // Act
            const [alert] = await fetchAlerts();

            // Assert
            expect(alert.activePeriod.start).toBe("2023-11-14T22:13:20.000Z");
            expect(alert.activePeriod.end).toBe("2023-11-14T23:13:20.000Z");
        });

        it("returns activePeriod {start: null, end: null} for an alert with zero active period entries", async () => {
            // Arrange
            const entity = makeDashAlertEntity({ activePeriods: [] });
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

        it("collapses two active period entries to {start: earliest start, end: latest end} (D-02)", async () => {
            // Arrange
            const entity = makeDashAlertEntity({
                activePeriods: [
                    { start: "2023-11-14T22:13:20.000Z", end: "2023-11-15T01:13:20.000Z" },
                    { start: "2023-11-14T19:13:20.000Z", end: "2023-11-15T04:13:20.000Z" },
                ],
            });
            mockAxiosGet.mockResolvedValue({ data: makeDashAlertsApiResponse([entity]) });
            const { fetchAlerts } = createServiceAlertService();

            // Act
            const [alert] = await fetchAlerts();

            // Assert
            expect(alert.activePeriod.start).toBe("2023-11-14T19:13:20.000Z");
            expect(alert.activePeriod.end).toBe("2023-11-15T04:13:20.000Z");
        });

        it("collapses mixed-boundedness active period entries to an open-ended window (WR-03)", async () => {
            // Arrange
            const entity = makeDashAlertEntity({
                activePeriods: [
                    { start: "2023-11-14T22:13:20.000Z", end: "2023-11-15T01:13:20.000Z" },
                    { start: "2023-11-14T19:13:20.000Z", end: null },
                ],
            });
            mockAxiosGet.mockResolvedValue({ data: makeDashAlertsApiResponse([entity]) });
            const { fetchAlerts } = createServiceAlertService();

            // Act
            const [alert] = await fetchAlerts();

            // Assert
            expect(alert.activePeriod.start).toBe("2023-11-14T19:13:20.000Z");
            expect(alert.activePeriod.end).toBeNull();
        });

        it("returns {start: null, end: null} when activePeriods is omitted entirely (D-03)", async () => {
            // Arrange
            const entity = makeDashAlertEntity({ activePeriods: undefined });
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

        it("resolves to an empty array when the response body is a bare, empty array-rooted value (G-05-5)", async () => {
            // Arrange — the guard now accepts array-rooted bodies instead of rejecting them
            mockAxiosGet.mockResolvedValue({ data: [] });
            const { fetchAlerts } = createServiceAlertService();

            // Act
            const result = await fetchAlerts();

            // Assert
            expect(result).toEqual([]);
        });

        it("resolves to an empty array when the response body is a JSON-encoded string that parses to an empty array (G-05-5)", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue({ data: "[]" });
            const { fetchAlerts } = createServiceAlertService();

            // Act
            const result = await fetchAlerts();

            // Assert
            expect(result).toEqual([]);
        });

        it("maps a non-empty bare array-rooted body (no envelope) end-to-end (G-05-5)", async () => {
            // Arrange
            const entity = makeDashAlertEntity({}, "alert-1");
            mockAxiosGet.mockResolvedValue({ data: [entity] });
            const { fetchAlerts } = createServiceAlertService();

            // Act
            const [alert] = await fetchAlerts();

            // Assert
            expect(alert.id).toBe("alert-1");
            expect(alert.informedRouteIds).toEqual(["route-1"]);
            expect(alert.informedStopIds).toEqual(["stop-1"]);
        });

        it("rejects with UpstreamApiError when an entity item is null (WR-02)", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue({ data: { entities: [null] } });
            const { fetchAlerts } = createServiceAlertService();

            // Act & Assert
            await expect(fetchAlerts()).rejects.toThrow(UpstreamApiError);
        });

        it("rejects with UpstreamApiError when an entity item is missing the id property (WR-02)", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue({ data: { entities: [{ cause: "MAINTENANCE" }] } });
            const { fetchAlerts } = createServiceAlertService();

            // Act & Assert
            await expect(fetchAlerts()).rejects.toThrow(UpstreamApiError);
        });

        it("maps an alert with an empty informedEntities array to empty route/stop id lists without throwing", async () => {
            // Arrange
            const entity = makeDashAlertEntity({ informedEntities: [] });
            mockAxiosGet.mockResolvedValue({ data: makeDashAlertsApiResponse([entity]) });
            const { fetchAlerts } = createServiceAlertService();

            // Act
            const [alert] = await fetchAlerts();

            // Assert
            expect(alert.informedRouteIds).toEqual([]);
            expect(alert.informedStopIds).toEqual([]);
        });

        it("maps an alert with omitted informedEntities to empty route/stop id lists without throwing", async () => {
            // Arrange
            const entity = makeDashAlertEntity({ informedEntities: undefined });
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
