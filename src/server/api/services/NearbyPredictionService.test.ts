import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpstreamApiError } from "../errors";
import type { DashNearbyPredictionData } from "../models/Prediction";
import type { ServiceAlert } from "../models/ServiceAlert";

vi.mock("../../config", () => ({
    axios: { get: vi.fn() },
    environment: {
        dashApi: { agency: "alexandria-dash", baseUrl: "https://api.goswift.ly", apiKey: "key" },
        server: { port: 3000 },
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { axios, logger } from "../../config";
import { createNearbyPredictionService } from "./NearbyPredictionService";

const mockAxiosGet = vi.mocked(axios.get);
const mockLoggerInfo = vi.mocked(logger.info);
const mockLoggerWarn = vi.mocked(logger.warn);
const mockLoggerError = vi.mocked(logger.error);

const LAT = 38.8048;
const LNG = -77.0469;
const METERS_PER_MILE = 1609.344;

// Defaults to the first entry of the live alexandria-dash sample (11-CONTEXT.md), blockId included.
const makeDashNearbyPredictionData = (overrides: Record<string, unknown> = {}): DashNearbyPredictionData =>
    ({
        routeShortName: "30",
        routeName: "30 - DUKE",
        routeId: "30",
        stopId: "548",
        stopName: "King St + N Washington St",
        stopCode: 4000858,
        destinations: [
            {
                directionId: "0",
                headsign: "Van Dorn Street Station",
                predictions: [
                    { time: 1790192451, sec: 318, min: 5, blockId: "0061", tripId: "405020", vehicleId: "0212" },
                ],
            },
            {
                directionId: "0",
                headsign: "West Alexandria Transit Center (SHORT TRIP)",
                predictions: [
                    { time: 1790192711, sec: 578, min: 9, blockId: "0078", tripId: "1219020", vehicleId: "0227" },
                ],
            },
        ],
        distanceToStop: 46.5,
        ...overrides,
    }) as DashNearbyPredictionData;

const makeDashNearbyApiResponse = (entries: unknown[]) => ({
    success: true,
    route: "/real-time/alexandria-dash/predictions-near-location GET",
    data: {
        agencyKey: "alexandria-dash",
        predictionsData: entries,
    },
});

const makeLiveSampleEntries = (): DashNearbyPredictionData[] => [
    makeDashNearbyPredictionData(),
    makeDashNearbyPredictionData({
        routeShortName: "31",
        routeName: "31 - KING",
        routeId: "31",
        destinations: [
            {
                directionId: "0",
                headsign: "NVCC Alexandria",
                predictions: [
                    { time: 1790192575, sec: 442, min: 7, blockId: "0008", tripId: "488020", vehicleId: "0721" },
                ],
            },
        ],
    }),
    makeDashNearbyPredictionData({
        stopId: "561",
        stopName: "King St + S Washington St",
        stopCode: 4000871,
        destinations: [
            {
                directionId: "1",
                headsign: "Braddock Road Station",
                predictions: [
                    { time: 1790192813, sec: 680, min: 11, blockId: "0013", tripId: "1418020", vehicleId: "0708" },
                ],
            },
        ],
        distanceToStop: 58,
    }),
    makeDashNearbyPredictionData({
        routeShortName: "34",
        routeName: "34 - OLD TOWN NORTH",
        routeId: "34",
        stopId: "949",
        stopName: "City Hall / Market Sq",
        stopCode: 4000820,
        destinations: [{ directionId: "0", headsign: "Lee Center", predictions: [] }],
        distanceToStop: 337.7,
    }),
];

// The first live prediction (11-CONTEXT.md D-01), blockId included (D-05).
const makeDashPrediction = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    time: 1790192451,
    sec: 318,
    min: 5,
    blockId: "0061",
    tripId: "405020",
    vehicleId: "0212",
    ...overrides,
});

const makeEntryWithPredictions = (predictions: unknown[]): DashNearbyPredictionData =>
    makeDashNearbyPredictionData({
        destinations: [{ directionId: "0", headsign: "Van Dorn Street Station", predictions }],
    });

const makeMockAlertRepo = () => ({
    getActiveAlertsForStop: vi.fn().mockReturnValue([]),
});

const makeAlert = (id: string, stopId: string): ServiceAlert => ({
    id,
    headerText: `Header ${id}`,
    informedRouteIds: [],
    informedStopIds: [stopId],
    activePeriod: { start: null, end: null },
});

const resolveUpstream = (body: unknown): void => {
    mockAxiosGet.mockResolvedValue({ data: body });
};

const lastRequestedUrl = (): string => mockAxiosGet.mock.calls[mockAxiosGet.mock.calls.length - 1][0] as string;

describe("NearbyPredictionService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("grouping and ordering", () => {
        it("groups the live sample into stops 548, 561, 949 with routes 30 then 31 at 548", async () => {
            // Arrange
            resolveUpstream(makeDashNearbyApiResponse(makeLiveSampleEntries()));
            const { getNearbyPredictions } = createNearbyPredictionService(makeMockAlertRepo() as never);

            // Act
            const result = await getNearbyPredictions(LAT, LNG);

            // Assert
            const { stops } = result.data;
            expect(stops.map((stop) => stop.id)).toEqual(["548", "561", "949"]);
            expect(stops[0].routes.map((route) => route.routeShortName)).toEqual(["30", "31"]);
            expect(stops.flatMap((stop) => stop.routes)).toHaveLength(4);
        });

        it("sorts stops by distance regardless of upstream order and keeps first-seen route order", async () => {
            // Arrange
            resolveUpstream(makeDashNearbyApiResponse(makeLiveSampleEntries().reverse()));
            const { getNearbyPredictions } = createNearbyPredictionService(makeMockAlertRepo() as never);

            // Act
            const result = await getNearbyPredictions(LAT, LNG);

            // Assert
            const { stops } = result.data;
            expect(stops.map((stop) => stop.id)).toEqual(["548", "561", "949"]);
            expect(stops[0].routes.map((route) => route.routeShortName)).toEqual(["31", "30"]);
        });

        it("keeps first-seen upstream order for stops with equal distance (stable sort)", async () => {
            // Arrange
            const a = makeDashNearbyPredictionData({ stopId: "A", distanceToStop: 100 });
            const b = makeDashNearbyPredictionData({ stopId: "B", distanceToStop: 100 });
            const { getNearbyPredictions } = createNearbyPredictionService(makeMockAlertRepo() as never);

            // Act
            resolveUpstream(makeDashNearbyApiResponse([a, b]));
            const forward = await getNearbyPredictions(LAT, LNG);
            resolveUpstream(makeDashNearbyApiResponse([b, a]));
            const reversed = await getNearbyPredictions(LAT, LNG);

            // Assert
            expect(forward.data.stops.map((stop) => stop.id)).toEqual(["A", "B"]);
            expect(reversed.data.stops.map((stop) => stop.id)).toEqual(["B", "A"]);
        });

        it("converts distanceToStop meters to unrounded miles", async () => {
            // Arrange
            resolveUpstream(makeDashNearbyApiResponse([makeDashNearbyPredictionData({ distanceToStop: 46.5 })]));
            const { getNearbyPredictions } = createNearbyPredictionService(makeMockAlertRepo() as never);

            // Act
            const result = await getNearbyPredictions(LAT, LNG);

            // Assert
            expect(result.data.stops[0].distance).toBe(46.5 / METERS_PER_MILE);
        });

        it("takes id, name, code and distance from the first entry seen for a stopId", async () => {
            // Arrange
            const first = makeDashNearbyPredictionData();
            const later = makeDashNearbyPredictionData({
                routeShortName: "31",
                stopName: "Renamed Stop",
                stopCode: 999,
                distanceToStop: 500,
            });
            resolveUpstream(makeDashNearbyApiResponse([first, later]));
            const { getNearbyPredictions } = createNearbyPredictionService(makeMockAlertRepo() as never);

            // Act
            const result = await getNearbyPredictions(LAT, LNG);

            // Assert
            expect(result.data.stops).toHaveLength(1);
            expect(result.data.stops[0]).toMatchObject({
                id: "548",
                name: "King St + N Washington St",
                code: 4000858,
                distance: 46.5 / METERS_PER_MILE,
            });
            expect(result.data.stops[0].routes).toHaveLength(2);
        });

        it("groups by the raw stopId string without trimming", async () => {
            // Arrange
            resolveUpstream(
                makeDashNearbyApiResponse([
                    makeDashNearbyPredictionData({ stopId: "548" }),
                    makeDashNearbyPredictionData({ stopId: " 548" }),
                ]),
            );
            const { getNearbyPredictions } = createNearbyPredictionService(makeMockAlertRepo() as never);

            // Act
            const result = await getNearbyPredictions(LAT, LNG);

            // Assert
            expect(result.data.stops.map((stop) => stop.id)).toEqual(["548", " 548"]);
        });

        it("keeps destinations with no predictions and entries with no destinations as-is", async () => {
            // Arrange
            resolveUpstream(
                makeDashNearbyApiResponse([
                    makeDashNearbyPredictionData({
                        destinations: [{ directionId: "0", headsign: "Lee Center", predictions: [] }],
                    }),
                    makeDashNearbyPredictionData({ stopId: "561", destinations: [] }),
                ]),
            );
            const { getNearbyPredictions } = createNearbyPredictionService(makeMockAlertRepo() as never);

            // Act
            const result = await getNearbyPredictions(LAT, LNG);

            // Assert
            expect(result.data.stops[0].routes[0].destinations).toEqual([
                { directionId: "0", headsign: "Lee Center", predictions: [] },
            ]);
            expect(result.data.stops[1].routes[0].destinations).toEqual([]);
        });

        it("returns no stops when upstream predictionsData is empty", async () => {
            // Arrange
            resolveUpstream(makeDashNearbyApiResponse([]));
            const { getNearbyPredictions } = createNearbyPredictionService(makeMockAlertRepo() as never);

            // Act
            const result = await getNearbyPredictions(LAT, LNG);

            // Assert
            expect(result.data.stops).toEqual([]);
        });

        it("returns exactly one stop for a single valid entry", async () => {
            // Arrange
            resolveUpstream(makeDashNearbyApiResponse([makeDashNearbyPredictionData()]));
            const { getNearbyPredictions } = createNearbyPredictionService(makeMockAlertRepo() as never);

            // Act
            const result = await getNearbyPredictions(LAT, LNG);

            // Assert
            expect(result.data.stops).toHaveLength(1);
            expect(result.data.stops[0].routes).toHaveLength(1);
        });
    });

    describe("alerts", () => {
        it("looks up alerts once per distinct stop with the upstream stopId", async () => {
            // Arrange
            resolveUpstream(makeDashNearbyApiResponse(makeLiveSampleEntries()));
            const alertRepo = makeMockAlertRepo();
            const { getNearbyPredictions } = createNearbyPredictionService(alertRepo as never);

            // Act
            await getNearbyPredictions(LAT, LNG);

            // Assert
            expect(alertRepo.getActiveAlertsForStop).toHaveBeenCalledTimes(3);
            expect(alertRepo.getActiveAlertsForStop.mock.calls.map((call) => call[0])).toEqual(["548", "561", "949"]);
        });

        it("preserves repository alert order and gives stops without alerts an empty array", async () => {
            // Arrange
            resolveUpstream(makeDashNearbyApiResponse(makeLiveSampleEntries()));
            const alertRepo = makeMockAlertRepo();
            alertRepo.getActiveAlertsForStop.mockImplementation((stopId: string) =>
                stopId === "548" ? [makeAlert("alert-2", "548"), makeAlert("alert-1", "548")] : [],
            );
            const { getNearbyPredictions } = createNearbyPredictionService(alertRepo as never);

            // Act
            const result = await getNearbyPredictions(LAT, LNG);

            // Assert
            const { stops } = result.data;
            expect(stops[0].alerts.map((alert) => alert.id)).toEqual(["alert-2", "alert-1"]);
            expect(stops[1].alerts).toEqual([]);
            expect(stops[2].alerts).toEqual([]);
        });
    });

    describe("upstream request", () => {
        it("requests meters=805 and omits number by default", async () => {
            // Arrange
            resolveUpstream(makeDashNearbyApiResponse([]));
            const { getNearbyPredictions } = createNearbyPredictionService(makeMockAlertRepo() as never);

            // Act
            await getNearbyPredictions(LAT, LNG);

            // Assert
            const url = lastRequestedUrl();
            expect(url).toContain("/real-time/alexandria-dash/predictions-near-location?");
            expect(url).toContain("meters=805");
            expect(url).not.toContain("number=");
        });

        it.each([
            { radius: 0.25, meters: "meters=403" },
            { radius: 1, meters: "meters=1610" },
            { radius: 0.0001, meters: "meters=1" },
        ])("converts radius $radius miles to $meters", async ({ radius, meters }) => {
            // Arrange
            resolveUpstream(makeDashNearbyApiResponse([]));
            const { getNearbyPredictions } = createNearbyPredictionService(makeMockAlertRepo() as never);

            // Act
            await getNearbyPredictions(LAT, LNG, { radius });

            // Assert
            expect(lastRequestedUrl()).toContain(meters);
        });

        it("forwards number when provided", async () => {
            // Arrange
            resolveUpstream(makeDashNearbyApiResponse([]));
            const { getNearbyPredictions } = createNearbyPredictionService(makeMockAlertRepo() as never);

            // Act
            await getNearbyPredictions(LAT, LNG, { radius: 0.25, number: 3 });

            // Assert
            expect(lastRequestedUrl()).toContain("meters=403");
            expect(lastRequestedUrl()).toContain("number=3");
        });

        it("sends the coordinates as lat and lon, never lng", async () => {
            // Arrange
            resolveUpstream(makeDashNearbyApiResponse([]));
            const { getNearbyPredictions } = createNearbyPredictionService(makeMockAlertRepo() as never);

            // Act
            await getNearbyPredictions(LAT, LNG);

            // Assert
            const url = lastRequestedUrl();
            expect(url).toContain("lat=38.8048");
            expect(url).toContain("lon=-77.0469");
            expect(url).not.toContain("lng=");
        });

        it("makes a fresh upstream call on every request (no caching)", async () => {
            // Arrange
            resolveUpstream(makeDashNearbyApiResponse(makeLiveSampleEntries()));
            const { getNearbyPredictions } = createNearbyPredictionService(makeMockAlertRepo() as never);

            // Act
            await getNearbyPredictions(LAT, LNG);
            await getNearbyPredictions(LAT, LNG);

            // Assert
            expect(mockAxiosGet).toHaveBeenCalledTimes(2);
        });

        it("never logs the rider's coordinates", async () => {
            // Arrange
            resolveUpstream(makeDashNearbyApiResponse(makeLiveSampleEntries()));
            const { getNearbyPredictions } = createNearbyPredictionService(makeMockAlertRepo() as never);

            // Act
            await getNearbyPredictions(LAT, LNG);

            // Assert
            expect(mockLoggerInfo).toHaveBeenCalled();
            const logged = JSON.stringify(mockLoggerInfo.mock.calls);
            expect(logged).not.toContain("38.8048");
            expect(logged).not.toContain("-77.0469");
        });
    });

    describe("response envelope", () => {
        it("stamps an ISO generatedAt and copies agencyKey from upstream", async () => {
            // Arrange
            resolveUpstream({
                ...makeDashNearbyApiResponse([]),
                data: { agencyKey: "other-agency", predictionsData: [] },
            });
            const { getNearbyPredictions } = createNearbyPredictionService(makeMockAlertRepo() as never);

            // Act
            const result = await getNearbyPredictions(LAT, LNG);

            // Assert
            expect(result.success).toBe(true);
            expect(new Date(result.generatedAt).toISOString()).toBe(result.generatedAt);
            expect(result.data.agencyKey).toBe("other-agency");
        });
    });

    describe("upstream failures", () => {
        it("rejects with UpstreamApiError when upstream returns success: false", async () => {
            // Arrange
            resolveUpstream({ ...makeDashNearbyApiResponse([]), success: false });
            const { getNearbyPredictions } = createNearbyPredictionService(makeMockAlertRepo() as never);

            // Act & Assert
            await expect(getNearbyPredictions(LAT, LNG)).rejects.toBeInstanceOf(UpstreamApiError);
        });

        it("wraps a network error as UpstreamApiError once, without leaking the API key", async () => {
            // Arrange
            const networkError = Object.assign(new Error("connect ECONNREFUSED"), {
                // biome-ignore lint/style/useNamingConvention: mirrors the real axios header that carries DASH_API_KEY
                config: { headers: { Authorization: "super-secret-key" } },
            });
            mockAxiosGet.mockRejectedValue(networkError);
            const { getNearbyPredictions } = createNearbyPredictionService(makeMockAlertRepo() as never);

            // Act
            const error = await getNearbyPredictions(LAT, LNG).catch((caught: unknown) => caught);

            // Assert
            expect(error).toBeInstanceOf(UpstreamApiError);
            expect((error as Error).message).toContain("connect ECONNREFUSED");
            expect((error as Error).message).not.toContain("super-secret-key");
            const logged = JSON.stringify([
                mockLoggerInfo.mock.calls,
                mockLoggerWarn.mock.calls,
                mockLoggerError.mock.calls,
            ]);
            expect(logged).not.toContain("super-secret-key");
            expect(mockAxiosGet).toHaveBeenCalledTimes(1);
        });

        it.each([
            { label: "a null body", body: null },
            { label: "an HTML string body", body: "<html><body>Bad Gateway</body></html>" },
            {
                label: "a body without data.predictionsData",
                body: { success: true, route: "r", data: { agencyKey: "alexandria-dash" } },
            },
            {
                label: "a non-array predictionsData",
                body: { success: true, route: "r", data: { agencyKey: "alexandria-dash", predictionsData: {} } },
            },
        ])("rejects with UpstreamApiError for $label", async ({ body }) => {
            // Arrange
            resolveUpstream(body);
            const { getNearbyPredictions } = createNearbyPredictionService(makeMockAlertRepo() as never);

            // Act & Assert
            await expect(getNearbyPredictions(LAT, LNG)).rejects.toBeInstanceOf(UpstreamApiError);
        });
    });

    describe("malformed entries", () => {
        const validEntry = () => makeDashNearbyPredictionData({ stopId: "561", distanceToStop: 58 });

        it.each([
            { label: "a numeric stopId", entry: makeDashNearbyPredictionData({ stopId: 548 }) },
            { label: "an empty stopId", entry: makeDashNearbyPredictionData({ stopId: "" }) },
            { label: "a missing stopId", entry: makeDashNearbyPredictionData({ stopId: undefined }) },
            { label: "a string distanceToStop", entry: makeDashNearbyPredictionData({ distanceToStop: "46.5" }) },
            { label: "a null distanceToStop", entry: makeDashNearbyPredictionData({ distanceToStop: null }) },
            { label: "a NaN distanceToStop", entry: makeDashNearbyPredictionData({ distanceToStop: Number.NaN }) },
            {
                label: "an Infinity distanceToStop",
                entry: makeDashNearbyPredictionData({ distanceToStop: Number.POSITIVE_INFINITY }),
            },
            { label: "a negative distanceToStop", entry: makeDashNearbyPredictionData({ distanceToStop: -1 }) },
            { label: "null destinations", entry: makeDashNearbyPredictionData({ destinations: null }) },
            {
                label: "a destination with null predictions",
                entry: makeDashNearbyPredictionData({
                    destinations: [{ directionId: "0", headsign: "Lee Center", predictions: null }],
                }),
            },
            { label: "a null entry", entry: null },
            { label: "a null prediction element", entry: makeEntryWithPredictions([null]) },
            { label: "a string prediction element", entry: makeEntryWithPredictions(["x"]) },
            { label: "an empty-object prediction element", entry: makeEntryWithPredictions([{}]) },
            {
                label: "a prediction with a string min",
                entry: makeEntryWithPredictions([makeDashPrediction({ min: "5" })]),
            },
            {
                label: "a prediction without sec",
                entry: makeEntryWithPredictions([makeDashPrediction({ sec: undefined })]),
            },
            {
                label: "a prediction with a NaN time",
                entry: makeEntryWithPredictions([makeDashPrediction({ time: Number.NaN })]),
            },
            {
                label: "a prediction with a numeric tripId",
                entry: makeEntryWithPredictions([makeDashPrediction({ tripId: 405020 })]),
            },
            {
                label: "a prediction without vehicleId",
                entry: makeEntryWithPredictions([makeDashPrediction({ vehicleId: undefined })]),
            },
            {
                label: "a valid prediction followed by a null element",
                entry: makeEntryWithPredictions([makeDashPrediction(), null]),
            },
            {
                label: "an empty-object element in a second destination",
                entry: makeDashNearbyPredictionData({
                    destinations: [
                        { directionId: "0", headsign: "Van Dorn Street Station", predictions: [makeDashPrediction()] },
                        {
                            directionId: "0",
                            headsign: "West Alexandria Transit Center (SHORT TRIP)",
                            predictions: [{}],
                        },
                    ],
                }),
            },
        ])("drops an entry with $label, warns once, and keeps valid entries", async ({ entry }) => {
            // Arrange
            resolveUpstream(makeDashNearbyApiResponse([entry, validEntry()]));
            const { getNearbyPredictions } = createNearbyPredictionService(makeMockAlertRepo() as never);

            // Act
            const result = await getNearbyPredictions(LAT, LNG);

            // Assert
            expect(result.data.stops.map((stop) => stop.id)).toEqual(["561"]);
            expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
        });

        it("resolves with no stops when every entry is malformed", async () => {
            // Arrange
            resolveUpstream(
                makeDashNearbyApiResponse([
                    null,
                    makeDashNearbyPredictionData({ stopId: "" }),
                    makeDashNearbyPredictionData({ distanceToStop: Number.NaN }),
                ]),
            );
            const { getNearbyPredictions } = createNearbyPredictionService(makeMockAlertRepo() as never);

            // Act
            const result = await getNearbyPredictions(LAT, LNG);

            // Assert
            expect(result.data.stops).toEqual([]);
            expect(mockLoggerWarn).toHaveBeenCalledTimes(3);
        });

        it("never serves a prediction missing min, sec, time, tripId or vehicleId when prediction elements are malformed", async () => {
            // Arrange
            const makeStop561Entry = (routeShortName: string, predictions: unknown[]): DashNearbyPredictionData =>
                makeDashNearbyPredictionData({
                    routeShortName,
                    stopId: "561",
                    stopName: "King St + S Washington St",
                    stopCode: 4000871,
                    distanceToStop: 58,
                    destinations: [{ directionId: "1", headsign: "Braddock Road Station", predictions }],
                });
            resolveUpstream(
                makeDashNearbyApiResponse([
                    ...makeLiveSampleEntries(),
                    makeStop561Entry("31", [{}]),
                    makeStop561Entry("35", ["x"]),
                    makeStop561Entry("36", [makeDashPrediction({ vehicleId: undefined })]),
                ]),
            );
            const { getNearbyPredictions } = createNearbyPredictionService(makeMockAlertRepo() as never);

            // Act
            const result = await getNearbyPredictions(LAT, LNG);

            // Assert
            const { stops } = result.data;
            expect(stops.map((stop) => stop.id)).toEqual(["548", "561", "949"]);
            expect(stops.find((stop) => stop.id === "561")?.routes.map((route) => route.routeShortName)).toEqual([
                "30",
            ]);
            for (const stop of stops) {
                for (const route of stop.routes) {
                    for (const destination of route.destinations) {
                        for (const prediction of destination.predictions) {
                            expect(typeof prediction.min).toBe("number");
                            expect(typeof prediction.sec).toBe("number");
                            expect(typeof prediction.time).toBe("number");
                            expect(typeof prediction.tripId).toBe("string");
                            expect(typeof prediction.vehicleId).toBe("string");
                            expect(Object.keys(prediction).sort()).toEqual([
                                "min",
                                "sec",
                                "time",
                                "tripId",
                                "vehicleId",
                            ]);
                        }
                    }
                }
            }
            expect(mockLoggerWarn).toHaveBeenCalledTimes(3);
        });
    });
});
