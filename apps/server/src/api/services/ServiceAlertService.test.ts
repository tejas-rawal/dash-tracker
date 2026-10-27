import { beforeEach, describe, expect, it, vi } from "vitest";
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
const mockLoggerWarn = vi.mocked(logger.warn);

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
    beforeEach(() => {
        vi.clearAllMocks();
    });

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

        describe("soft-deleted alerts (ALRT-12)", () => {
            it.each([
                { label: "a past timestamp", deletedAt: "2023-11-14T21:00:00.000Z" },
                { label: "a future timestamp", deletedAt: "2099-01-01T00:00:00.000Z" },
                { label: "a garbled string", deletedAt: "not-a-timestamp" },
                { label: "an empty string", deletedAt: "" },
                { label: "the number 0", deletedAt: 0 },
                { label: "an empty object", deletedAt: {} },
                { label: "true", deletedAt: true },
            ])(
                "drops an alert whose deletedAt is $label and keeps the others without logging",
                async ({ deletedAt }) => {
                    // Arrange
                    mockAxiosGet.mockResolvedValue({
                        data: makeDashAlertsApiResponse([
                            makeDashAlertEntity({ deletedAt }, "alert-1"),
                            makeDashAlertEntity({}, "alert-2"),
                        ]),
                    });
                    const { fetchAlerts } = createServiceAlertService();

                    // Act
                    const result = await fetchAlerts();

                    // Assert
                    expect(result.map((alert) => alert.id)).toEqual(["alert-2"]);
                    expect(mockLoggerWarn).not.toHaveBeenCalled();
                },
            );

            it.each([
                { label: "null", overrides: { deletedAt: null } },
                { label: "omitted", overrides: {} },
            ])("keeps an alert whose deletedAt is $label", async ({ overrides }) => {
                // Arrange
                mockAxiosGet.mockResolvedValue({
                    data: makeDashAlertsApiResponse([makeDashAlertEntity(overrides, "alert-1")]),
                });
                const { fetchAlerts } = createServiceAlertService();

                // Act
                const result = await fetchAlerts();

                // Assert
                expect(result).toEqual([
                    {
                        id: "alert-1",
                        cause: "MAINTENANCE",
                        effect: "DETOUR",
                        headerText: "Detour on Route 1",
                        descriptionText: "Bus detoured due to road work",
                        url: undefined,
                        informedRouteIds: ["route-1"],
                        informedStopIds: ["stop-1"],
                        activePeriod: { start: "2023-11-14T22:13:20.000Z", end: "2023-11-14T23:13:20.000Z" },
                    },
                ]);
                expect(result[0]).not.toHaveProperty("deletedAt");
                expect(mockLoggerWarn).not.toHaveBeenCalled();
            });

            it("drops a deleted alert with a malformed date without warning (D-10)", async () => {
                // Arrange
                mockAxiosGet.mockResolvedValue({
                    data: makeDashAlertsApiResponse([
                        makeDashAlertEntity(
                            {
                                deletedAt: "2020-06-01T00:00:00.000Z",
                                activePeriods: [{ start: "not-a-date", end: null }],
                            },
                            "alert-1",
                        ),
                        makeDashAlertEntity({}, "alert-2"),
                    ]),
                });
                const { fetchAlerts } = createServiceAlertService();

                // Act
                const result = await fetchAlerts();

                // Assert
                expect(result.map((alert) => alert.id)).toEqual(["alert-2"]);
                expect(mockLoggerWarn).not.toHaveBeenCalled();
            });
        });

        describe("malformed activePeriods dates (ALRT-13)", () => {
            const goodPeriod = { start: "2023-11-14T22:13:20.000Z", end: "2023-11-15T01:13:20.000Z" };

            it.each([
                { label: "an unparseable start", activePeriods: [{ start: "not-a-date", end: null }], bound: "start" },
                { label: "an unparseable end", activePeriods: [{ start: null, end: "garbage" }], bound: "end" },
                { label: "an empty-string start", activePeriods: [{ start: "", end: null }], bound: "start" },
                { label: "a numeric start", activePeriods: [{ start: 1700000000000, end: null }], bound: "start" },
                {
                    label: "an object end",
                    activePeriods: [{ start: "2023-11-14T22:13:20.000Z", end: {} }],
                    bound: "end",
                },
                {
                    label: "one bad start among good periods",
                    activePeriods: [goodPeriod, { start: "garbage", end: "2023-11-15T01:13:20.000Z" }],
                    bound: "start",
                },
                {
                    label: "one bad end among good periods",
                    activePeriods: [goodPeriod, { start: "2023-11-14T19:13:20.000Z", end: "nope" }],
                    bound: "end",
                },
            ])(
                "drops only the alert with $label, keeps the others, and warns once naming the alert id and bound",
                async ({ activePeriods, bound }) => {
                    // Arrange
                    mockAxiosGet.mockResolvedValue({
                        data: makeDashAlertsApiResponse([
                            makeDashAlertEntity({ activePeriods }, "alert-1"),
                            makeDashAlertEntity({}, "alert-2"),
                        ]),
                    });
                    const { fetchAlerts } = createServiceAlertService();

                    // Act
                    const result = await fetchAlerts();

                    // Assert
                    expect(result.map((alert) => alert.id)).toEqual(["alert-2"]);
                    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
                    expect(mockLoggerWarn).toHaveBeenCalledWith(
                        `Dropping service alert alert-1 with a malformed activePeriods ${bound} date`,
                    );
                },
            );

            it("keeps an alert whose dates are parseable but not ISO-8601 and normalizes them to ISO", async () => {
                // Arrange
                const entity = makeDashAlertEntity({
                    activePeriods: [{ start: "Sun, 09 Mar 2025 13:00:00 GMT", end: "2025-03-10T13:00:00Z" }],
                });
                mockAxiosGet.mockResolvedValue({ data: makeDashAlertsApiResponse([entity]) });
                const { fetchAlerts } = createServiceAlertService();

                // Act
                const result = await fetchAlerts();

                // Assert
                expect(result).toHaveLength(1);
                expect(result[0].activePeriod).toEqual({
                    start: "2025-03-09T13:00:00.000Z",
                    end: "2025-03-10T13:00:00.000Z",
                });
                expect(mockLoggerWarn).not.toHaveBeenCalled();
            });

            it("treats null and omitted bounds as unbounded, not malformed", async () => {
                // Arrange
                const entity = makeDashAlertEntity({
                    activePeriods: [{ start: null, end: "2023-11-14T23:13:20.000Z" }, {}],
                });
                mockAxiosGet.mockResolvedValue({ data: makeDashAlertsApiResponse([entity]) });
                const { fetchAlerts } = createServiceAlertService();

                // Act
                const result = await fetchAlerts();

                // Assert
                expect(result).toHaveLength(1);
                expect(result[0].activePeriod).toEqual({ start: null, end: null });
                expect(mockLoggerWarn).not.toHaveBeenCalled();
            });

            it("warns again on every fetch while the same malformed alert stays in the feed", async () => {
                // Arrange
                const entity = makeDashAlertEntity({ activePeriods: [{ start: "not-a-date", end: null }] });
                mockAxiosGet.mockResolvedValue({ data: makeDashAlertsApiResponse([entity]) });
                const { fetchAlerts } = createServiceAlertService();

                // Act
                await fetchAlerts();
                await fetchAlerts();

                // Assert
                expect(mockLoggerWarn).toHaveBeenCalledTimes(2);
            });

            it("never puts the raw date value or other alert fields in the warn line", async () => {
                // Arrange
                const entity = makeDashAlertEntity({
                    headerText: "Header text marker",
                    activePeriods: [{ start: "RAW-VALUE-2025-99-99", end: null }],
                });
                mockAxiosGet.mockResolvedValue({ data: makeDashAlertsApiResponse([entity]) });
                const { fetchAlerts } = createServiceAlertService();

                // Act
                await fetchAlerts();

                // Assert
                expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
                const line = String(mockLoggerWarn.mock.calls[0][0]);
                expect(line).toContain("alert-1");
                expect(line).not.toContain("RAW-VALUE");
                expect(line).not.toContain("Header text marker");
            });

            it("never returns an activePeriod bound that is not null or a round-trippable ISO string (D-06)", async () => {
                // Arrange
                mockAxiosGet.mockResolvedValue({
                    data: makeDashAlertsApiResponse([
                        makeDashAlertEntity({}, "alert-iso"),
                        makeDashAlertEntity({ activePeriods: [{ start: null, end: null }] }, "alert-null-bounds"),
                        makeDashAlertEntity({ activePeriods: undefined }, "alert-no-periods"),
                        makeDashAlertEntity(
                            {
                                activePeriods: [
                                    { start: "Sun, 09 Mar 2025 13:00:00 GMT", end: "Mon, 10 Mar 2025 13:00:00 GMT" },
                                ],
                            },
                            "alert-rfc2822",
                        ),
                        makeDashAlertEntity(
                            { activePeriods: [{ start: "2025-03-09T13:00:00Z", end: "2025-03-10T13:00:00Z" }] },
                            "alert-no-millis",
                        ),
                        makeDashAlertEntity({ activePeriods: [{ start: "not-a-date", end: null }] }, "alert-malformed"),
                        makeDashAlertEntity({ deletedAt: "2020-06-01T00:00:00.000Z" }, "alert-deleted"),
                    ]),
                });
                const { fetchAlerts } = createServiceAlertService();

                // Act
                const result = await fetchAlerts();

                // Assert
                expect(result.map((alert) => alert.id)).toEqual([
                    "alert-iso",
                    "alert-null-bounds",
                    "alert-no-periods",
                    "alert-rfc2822",
                    "alert-no-millis",
                ]);
                for (const alert of result) {
                    for (const bound of [alert.activePeriod.start, alert.activePeriod.end]) {
                        if (bound !== null) {
                            expect(new Date(bound).toISOString()).toBe(bound);
                        }
                    }
                }
            });
        });

        describe("structurally malformed alerts (D-16)", () => {
            const goodPeriod = { start: "2023-11-14T22:13:20.000Z", end: "2023-11-15T01:13:20.000Z" };

            it.each([
                { label: "activePeriods [null]", overrides: { activePeriods: [null] }, list: "activePeriods" },
                {
                    label: "one null period among good periods",
                    overrides: { activePeriods: [goodPeriod, null] },
                    list: "activePeriods",
                },
                { label: "activePeriods {}", overrides: { activePeriods: {} }, list: "activePeriods" },
                {
                    label: "a lone unwrapped period object",
                    overrides: { activePeriods: { start: "2023-11-14T22:13:20.000Z", end: null } },
                    list: "activePeriods",
                },
                { label: "activePeriods 5", overrides: { activePeriods: 5 }, list: "activePeriods" },
                { label: "activePeriods 'abc'", overrides: { activePeriods: "abc" }, list: "activePeriods" },
                {
                    label: "a nested-array period",
                    overrides: { activePeriods: [["2023-11-14T22:13:20.000Z", null]] },
                    list: "activePeriods",
                },
                {
                    label: "a string period",
                    overrides: { activePeriods: ["2023-11-14T22:13:20.000Z"] },
                    list: "activePeriods",
                },
                { label: "informedEntities [null]", overrides: { informedEntities: [null] }, list: "informedEntities" },
                {
                    label: "a number among good informed entities",
                    overrides: { informedEntities: [{ routeId: "route-1" }, 7] },
                    list: "informedEntities",
                },
                { label: "informedEntities {}", overrides: { informedEntities: {} }, list: "informedEntities" },
                {
                    label: "informedEntities 'route-1'",
                    overrides: { informedEntities: "route-1" },
                    list: "informedEntities",
                },
                {
                    label: "a malformed activePeriods list and a malformed informedEntities list",
                    overrides: { activePeriods: [null], informedEntities: {} },
                    list: "activePeriods",
                },
                {
                    label: "a malformed informedEntities list and a malformed start date",
                    overrides: { informedEntities: {}, activePeriods: [{ start: "not-a-date", end: null }] },
                    list: "informedEntities",
                },
            ])(
                "drops only the alert with $label, keeps the others, and warns once naming the alert id and malformed list",
                async ({ overrides, list }) => {
                    // Arrange
                    mockAxiosGet.mockResolvedValue({
                        data: makeDashAlertsApiResponse([
                            makeDashAlertEntity(overrides, "alert-1"),
                            makeDashAlertEntity({}, "alert-2"),
                        ]),
                    });
                    const { fetchAlerts } = createServiceAlertService();

                    // Act
                    const result = await fetchAlerts();

                    // Assert
                    expect(result.map((alert) => alert.id)).toEqual(["alert-2"]);
                    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
                    expect(mockLoggerWarn).toHaveBeenCalledWith(
                        `Dropping service alert alert-1 with a malformed ${list} list`,
                    );
                },
            );

            it("keeps an alert whose activePeriods and informedEntities are null, as always active with no targets", async () => {
                // Arrange
                mockAxiosGet.mockResolvedValue({
                    data: makeDashAlertsApiResponse([
                        makeDashAlertEntity({ activePeriods: null, informedEntities: null }),
                    ]),
                });
                const { fetchAlerts } = createServiceAlertService();

                // Act
                const result = await fetchAlerts();

                // Assert
                expect(result).toHaveLength(1);
                expect(result[0].activePeriod).toEqual({ start: null, end: null });
                expect(result[0].informedRouteIds).toEqual([]);
                expect(result[0].informedStopIds).toEqual([]);
                expect(mockLoggerWarn).not.toHaveBeenCalled();
            });

            it("skips informed route and stop ids that are not strings and keeps the alert for its other targets", async () => {
                // Arrange
                mockAxiosGet.mockResolvedValue({
                    data: makeDashAlertsApiResponse([
                        makeDashAlertEntity({
                            informedEntities: [
                                { routeId: null, stopId: "stop-1" },
                                { routeId: "route-1", stopId: 42 },
                                { routeId: {}, stopId: null },
                                {},
                            ],
                        }),
                    ]),
                });
                const { fetchAlerts } = createServiceAlertService();

                // Act
                const result = await fetchAlerts();

                // Assert
                expect(result).toHaveLength(1);
                expect(result[0].informedRouteIds).toEqual(["route-1"]);
                expect(result[0].informedStopIds).toEqual(["stop-1"]);
                expect(mockLoggerWarn).not.toHaveBeenCalled();
            });

            it("drops a deleted alert with a malformed list without warning (D-10)", async () => {
                // Arrange
                mockAxiosGet.mockResolvedValue({
                    data: makeDashAlertsApiResponse([
                        makeDashAlertEntity(
                            {
                                deletedAt: "2020-06-01T00:00:00.000Z",
                                activePeriods: [null],
                                informedEntities: {},
                            },
                            "alert-1",
                        ),
                        makeDashAlertEntity({}, "alert-2"),
                    ]),
                });
                const { fetchAlerts } = createServiceAlertService();

                // Act
                const result = await fetchAlerts();

                // Assert
                expect(result.map((alert) => alert.id)).toEqual(["alert-2"]);
                expect(mockLoggerWarn).not.toHaveBeenCalled();
            });

            it("never puts the raw list value or other alert fields in the warn line", async () => {
                // Arrange
                const entity = makeDashAlertEntity({
                    headerText: "Header text marker",
                    activePeriods: "RAW-LIST-MARKER",
                });
                mockAxiosGet.mockResolvedValue({ data: makeDashAlertsApiResponse([entity]) });
                const { fetchAlerts } = createServiceAlertService();

                // Act
                await fetchAlerts();

                // Assert
                expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
                const line = String(mockLoggerWarn.mock.calls[0][0]);
                expect(line).toContain("alert-1");
                expect(line).not.toContain("RAW-LIST-MARKER");
                expect(line).not.toContain("Header text marker");
            });
        });
    });
});
