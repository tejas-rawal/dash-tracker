import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BusRoute, BusStop, RouteType } from "../models";
import { RouteDirection } from "../models/RouteDirection";

vi.mock("../../config", () => ({
    axios: { get: vi.fn() },
    environment: {
        dashApi: { agency: "test-agency", baseUrl: "https://api.test.example.com", apiKey: "key" },
        server: { port: 3000 },
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { axios, logger } from "../../config";
import { DataNotReadyError } from "../errors";
import { BusDataRepository } from "./BusDataRepository";

const mockAxiosGet = vi.mocked(axios.get);

const makeApiStop = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    name: `Stop ${id}`,
    code: "101",
    lat: "38.8",
    lon: "-77.1",
    ...overrides,
});

const makeApiDirection = (id: string, stops: ReturnType<typeof makeApiStop>[] = []) => ({
    id,
    title: `Direction ${id}`,
    stops,
    headSigns: ["Downtown"],
});

const makeApiRoute = (id: string, shortName: string, directions: ReturnType<typeof makeApiDirection>[] = []) => ({
    id,
    shortName,
    longName: `Route ${shortName} Long`,
    name: `Route ${shortName}`,
    type: RouteType.Bus,
    directions,
});

const makeApiResponse = (routes: ReturnType<typeof makeApiRoute>[]) => ({
    data: { data: { routes } },
});

const makeApiRouteWithStop = (id: string, shortName: string, stop: ReturnType<typeof makeApiStop>) =>
    makeApiRoute(id, shortName, [makeApiDirection(`${id}-d1`, [stop])]);

const T1 = new Date("2026-09-30T12:00:00.000Z");
const T2 = new Date("2026-09-30T13:00:00.000Z");
const T3 = new Date("2026-09-30T14:00:00.000Z");

describe("BusDataRepository", () => {
    let repo: BusDataRepository;

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset the singleton so each test gets a fresh instance
        // @ts-expect-error accessing private static for test isolation
        BusDataRepository.instance = undefined;
        repo = BusDataRepository.getInstance();
    });

    afterEach(() => {
        // @ts-expect-error accessing private static for test isolation
        BusDataRepository.instance = undefined;
    });

    describe("getInstance", () => {
        it("always returns the same singleton instance", () => {
            // Arrange & Act
            const instance1 = BusDataRepository.getInstance();
            const instance2 = BusDataRepository.getInstance();

            // Assert
            expect(instance1).toBe(instance2);
        });
    });

    describe("load", () => {
        it("fetches data from the correct API path on first call", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute("r1", "1A")]));

            // Act
            await repo.load();

            // Assert
            expect(mockAxiosGet).toHaveBeenCalledWith("/info/test-agency/routes?verbose=true");
        });

        it("populates routes after a successful load", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute("r1", "1A")]));

            // Act
            await repo.load();
            const routes = repo.getAllRoutes();

            // Assert
            expect(routes).toHaveLength(1);
            expect(routes[0]).toBeInstanceOf(BusRoute);
            expect(routes[0].shortName).toBe("1A");
        });

        it("populates stops after a successful load", async () => {
            // Arrange
            const stop = makeApiStop("s1");
            const direction = makeApiDirection("d1", [stop]);
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute("r1", "1A", [direction])]));

            // Act
            await repo.load();
            const stops = repo.getAllStops();

            // Assert
            expect(stops).toHaveLength(1);
            expect(stops[0]).toBeInstanceOf(BusStop);
            expect(stops[0].id).toBe("s1");
        });

        it("rejects with the upstream message when the API call rejects", async () => {
            // Arrange
            mockAxiosGet.mockRejectedValue(new Error("network error"));

            // Act & Assert
            await expect(repo.load()).rejects.toThrow("network error");
        });

        it("calls the API again on the next load after a failure", async () => {
            // Arrange
            mockAxiosGet.mockRejectedValueOnce(new Error("network error"));
            mockAxiosGet.mockResolvedValueOnce(makeApiResponse([makeApiRoute("r1", "1A")]));

            // Act
            await repo.load().catch(() => undefined);
            await repo.load();

            // Assert
            expect(mockAxiosGet).toHaveBeenCalledTimes(2);
        });

        it("rejects an API response with no routes and applies nothing", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue(makeApiResponse([]));

            // Act
            const result = repo.load();

            // Assert
            await expect(result).rejects.toThrow("DASH API returned no routes");
            expect(() => repo.getAllRoutes()).toThrow(DataNotReadyError);
        });

        it("rejects an API response where routes is null and applies nothing", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue({ data: { data: { routes: null } } });

            // Act
            const result = repo.load();

            // Assert
            await expect(result).rejects.toThrow("DASH API returned no routes");
            expect(() => repo.getAllRoutes()).toThrow(DataNotReadyError);
        });

        it("handles a route without shortName without adding it to the shortName map", async () => {
            // Arrange
            const routeWithoutShortName = { ...makeApiRoute("r1", ""), shortName: undefined } as unknown as ReturnType<
                typeof makeApiRoute
            >;
            mockAxiosGet.mockResolvedValue(makeApiResponse([routeWithoutShortName]));

            // Act
            await repo.load();

            // Assert
            expect(repo.getRouteByShortName("")).toBeUndefined();
        });

        it("deduplicates stops that appear in multiple directions of a route", async () => {
            // Arrange
            const sharedStop = makeApiStop("shared-stop");
            const dir1 = makeApiDirection("d1", [sharedStop]);
            const dir2 = makeApiDirection("d2", [sharedStop]);
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute("r1", "1A", [dir1, dir2])]));

            // Act
            await repo.load();
            const stops = repo.getAllStops();

            // Assert
            expect(stops).toHaveLength(1);
        });

        it("rejects when a stop has an invalid numeric code", async () => {
            // Arrange
            const badStop = makeApiStop("s1", { code: "not-a-number" });
            const direction = makeApiDirection("d1", [badStop]);
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute("r1", "1A", [direction])]));

            // Act & Assert
            await expect(repo.load()).rejects.toThrow();
        });

        it("rejects when a stop has an invalid latitude", async () => {
            // Arrange
            const badStop = makeApiStop("s1", { lat: "not-a-number" });
            const direction = makeApiDirection("d1", [badStop]);
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute("r1", "1A", [direction])]));

            // Act & Assert
            await expect(repo.load()).rejects.toThrow();
        });

        it("rejects when a stop has an invalid longitude", async () => {
            // Arrange
            const badStop = makeApiStop("s1", { lon: "not-a-number" });
            const direction = makeApiDirection("d1", [badStop]);
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute("r1", "1A", [direction])]));

            // Act & Assert
            await expect(repo.load()).rejects.toThrow();
        });

        it("accepts numeric code, lat and lon values without conversion errors", async () => {
            // Arrange
            const numericStop = makeApiStop("s1", { code: 101, lat: 38.8, lon: -77.1 });
            const direction = makeApiDirection("d1", [numericStop]);
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute("r1", "1A", [direction])]));

            // Act
            await repo.load();
            const stops = repo.getAllStops();

            // Assert
            expect(stops[0].code).toBe(101);
            expect(stops[0].lat).toBe(38.8);
        });

        it("processes a direction with no stops property without throwing", async () => {
            // Arrange
            const directionWithoutStops = { id: "d1", title: "NB", headSigns: [] } as unknown as ReturnType<
                typeof makeApiDirection
            >;
            mockAxiosGet.mockResolvedValue(
                makeApiResponse([{ ...makeApiRoute("r1", "1A"), directions: [directionWithoutStops] }]),
            );

            // Act
            await repo.load();
            const routes = repo.getAllRoutes();

            // Assert
            expect(routes[0].directions[0].stops).toEqual([]);
        });

        it("processes a route with no directions property without throwing", async () => {
            // Arrange
            const routeWithoutDirs = { ...makeApiRoute("r1", "1A"), directions: undefined } as unknown as ReturnType<
                typeof makeApiRoute
            >;
            mockAxiosGet.mockResolvedValue(makeApiResponse([routeWithoutDirs]));

            // Act
            await repo.load();
            const routes = repo.getAllRoutes();

            // Assert
            expect(routes[0].directions).toEqual([]);
        });

        it("replaces the data on a later successful load", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValueOnce(makeApiResponse([makeApiRoute("r1", "1A")]));
            await repo.load();
            mockAxiosGet.mockResolvedValueOnce(makeApiResponse([makeApiRoute("r1", "1A"), makeApiRoute("r2", "2B")]));

            // Act
            await repo.load();
            const routes = repo.getAllRoutes();

            // Assert
            expect(routes).toHaveLength(2);
        });

        it("rejects a later failed load with the upstream message and keeps the previous data", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValueOnce(makeApiResponse([makeApiRoute("r1", "1A")]));
            await repo.load();
            mockAxiosGet.mockRejectedValueOnce(new Error("refresh failed"));

            // Act
            const result = repo.load();

            // Assert
            await expect(result).rejects.toThrow("refresh failed");
            expect(repo.getAllRoutes().map((route) => route.id)).toEqual(["r1"]);
        });
    });

    describe("getAllRoutes", () => {
        it("throws DataNotReadyError before the first successful load", () => {
            // Arrange & Act & Assert
            expect(() => repo.getAllRoutes()).toThrow(DataNotReadyError);
        });
    });

    describe("getRouteById", () => {
        it("returns the route matching the given id", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute("r1", "1A")]));
            await repo.load();

            // Act
            const route = repo.getRouteById("r1");

            // Assert
            expect(route).toBeInstanceOf(BusRoute);
            expect(route?.id).toBe("r1");
        });

        it("returns undefined when no route matches the given id", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute("r1", "1A")]));
            await repo.load();

            // Act
            const route = repo.getRouteById("nonexistent");

            // Assert
            expect(route).toBeUndefined();
        });

        it("throws DataNotReadyError before the first successful load", () => {
            // Arrange & Act & Assert
            expect(() => repo.getRouteById("r1")).toThrow(DataNotReadyError);
        });
    });

    describe("getRouteByShortName", () => {
        it("returns the route matching the given short name", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute("r1", "1A")]));
            await repo.load();

            // Act
            const route = repo.getRouteByShortName("1A");

            // Assert
            expect(route?.shortName).toBe("1A");
        });

        it("returns undefined when no route matches the given short name", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute("r1", "1A")]));
            await repo.load();

            // Act
            const route = repo.getRouteByShortName("UNKNOWN");

            // Assert
            expect(route).toBeUndefined();
        });

        it("throws DataNotReadyError before the first successful load", () => {
            // Arrange & Act & Assert
            expect(() => repo.getRouteByShortName("1A")).toThrow(DataNotReadyError);
        });
    });

    describe("getAllStops", () => {
        it("returns all stops after a load", async () => {
            // Arrange
            const stop = makeApiStop("s1");
            const direction = makeApiDirection("d1", [stop]);
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute("r1", "1A", [direction])]));
            await repo.load();

            // Act
            const stops = repo.getAllStops();

            // Assert
            expect(stops).toHaveLength(1);
            expect(stops[0]).toBeInstanceOf(BusStop);
        });

        it("throws DataNotReadyError before the first successful load", () => {
            // Arrange & Act & Assert
            expect(() => repo.getAllStops()).toThrow(DataNotReadyError);
        });
    });

    describe("getStopById", () => {
        it("returns the stop matching the given id", async () => {
            // Arrange
            const stop = makeApiStop("s1");
            const direction = makeApiDirection("d1", [stop]);
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute("r1", "1A", [direction])]));
            await repo.load();

            // Act
            const found = repo.getStopById("s1");

            // Assert
            expect(found).toBeInstanceOf(BusStop);
            expect(found?.id).toBe("s1");
        });

        it("returns undefined when no stop matches the given id", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute("r1", "1A")]));
            await repo.load();

            // Act
            const found = repo.getStopById("unknown-stop");

            // Assert
            expect(found).toBeUndefined();
        });

        it("throws DataNotReadyError before the first successful load", () => {
            // Arrange & Act & Assert
            expect(() => repo.getStopById("s1")).toThrow(DataNotReadyError);
        });
    });

    describe("getRoutesForStop", () => {
        it("returns routes that contain the given stop", async () => {
            // Arrange
            const stop = makeApiStop("s1");
            const direction = makeApiDirection("d1", [stop]);
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute("r1", "1A", [direction])]));
            await repo.load();

            // Act
            const routes = repo.getRoutesForStop("s1");

            // Assert
            expect(routes).toHaveLength(1);
            expect(routes[0]).toBeInstanceOf(BusRoute);
        });

        it("returns an empty array when no routes contain the given stop", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute("r1", "1A")]));
            await repo.load();

            // Act
            const routes = repo.getRoutesForStop("nonexistent-stop");

            // Assert
            expect(routes).toEqual([]);
        });

        it("throws DataNotReadyError before the first successful load", () => {
            // Arrange & Act & Assert
            expect(() => repo.getRoutesForStop("s1")).toThrow(DataNotReadyError);
        });

        it("returns routes from multiple routes that share the given stop", async () => {
            // Arrange
            const sharedStop = makeApiStop("shared");
            const dir1 = makeApiDirection("d1", [sharedStop]);
            const dir2 = makeApiDirection("d2", [sharedStop]);
            mockAxiosGet.mockResolvedValue(
                makeApiResponse([makeApiRoute("r1", "1A", [dir1]), makeApiRoute("r2", "2B", [dir2])]),
            );
            await repo.load();

            // Act
            const routes = repo.getRoutesForStop("shared");

            // Assert
            expect(routes).toHaveLength(2);
        });
    });

    describe("getLoadState", () => {
        beforeEach(() => {
            // Only Date is faked, so promise resolution and timer behaviour are untouched.
            vi.useFakeTimers({ toFake: ["Date"] });
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it("reports nothing before any load attempt", () => {
            // Arrange & Act
            const state = repo.getLoadState();

            // Assert
            expect(state).toEqual({ lastLoadedAt: undefined, lastFailedAt: undefined, lastError: undefined });
        });

        it("records lastLoadedAt at the swap time and no failure after a successful load", async () => {
            // Arrange
            vi.setSystemTime(T1);
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute("r1", "1A")]));

            // Act
            await repo.load();
            const state = repo.getLoadState();

            // Assert
            expect(state).toEqual({ lastLoadedAt: T1, lastFailedAt: undefined, lastError: undefined });
        });

        it("records the failure time and message, and stays not ready, when the first load fails", async () => {
            // Arrange
            vi.setSystemTime(T1);
            mockAxiosGet.mockRejectedValue(new Error("network error"));

            // Act
            await expect(repo.load()).rejects.toThrow("network error");
            const state = repo.getLoadState();

            // Assert
            expect(state).toEqual({ lastLoadedAt: undefined, lastFailedAt: T1, lastError: "network error" });
            expect(() => repo.getAllRoutes()).toThrow(DataNotReadyError);
        });

        it("keeps lastLoadedAt and the data through a failure, then a later success clears the failure", async () => {
            // Arrange
            const stop = makeApiStop("s1");
            vi.setSystemTime(T1);
            mockAxiosGet.mockResolvedValueOnce(makeApiResponse([makeApiRouteWithStop("r1", "1A", stop)]));
            await repo.load();

            // Act: a failure at T2
            vi.setSystemTime(T2);
            mockAxiosGet.mockRejectedValueOnce(new Error("refresh failed"));
            await expect(repo.load()).rejects.toThrow("refresh failed");
            const failedState = repo.getLoadState();

            // Assert: T1 data and lastLoadedAt survive
            expect(failedState).toEqual({ lastLoadedAt: T1, lastFailedAt: T2, lastError: "refresh failed" });
            expect(repo.getAllRoutes().map((route) => route.id)).toEqual(["r1"]);
            expect(repo.getRouteById("r1")?.shortName).toBe("1A");
            expect(repo.getRouteByShortName("1A")?.id).toBe("r1");
            expect(repo.getAllStops().map((s) => s.id)).toEqual(["s1"]);
            expect(repo.getStopById("s1")?.id).toBe("s1");
            expect(repo.getRoutesForStop("s1").map((route) => route.id)).toEqual(["r1"]);

            // Act: a success at T3
            vi.setSystemTime(T3);
            mockAxiosGet.mockResolvedValueOnce(makeApiResponse([makeApiRoute("r2", "2B")]));
            await repo.load();

            // Assert
            expect(repo.getLoadState()).toEqual({ lastLoadedAt: T3, lastFailedAt: undefined, lastError: undefined });
        });

        it("records only the message of an upstream error that carries the API key", async () => {
            // Arrange
            const upstreamError = Object.assign(new Error("Request failed with status code 500"), {
                // biome-ignore lint/style/useNamingConvention: mirrors the real axios header that carries DASH_API_KEY
                config: { headers: { Authorization: "secret-api-key-123" } },
            });
            mockAxiosGet.mockRejectedValue(upstreamError);

            // Act
            const rejection = await repo.load().catch((error: unknown) => error);
            const state = repo.getLoadState();

            // Assert
            expect(rejection).toBeInstanceOf(Error);
            expect((rejection as Error).message).toBe("Request failed with status code 500");
            expect(rejection).not.toBe(upstreamError);
            expect(rejection).not.toHaveProperty("config");
            expect(state.lastError).toBe("Request failed with status code 500");
            expect(JSON.stringify(state)).not.toContain("secret-api-key-123");
        });

        it("returns a copy, so mutating a returned Date does not change the next snapshot", async () => {
            // Arrange
            vi.setSystemTime(T1);
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute("r1", "1A")]));
            await repo.load();

            // Act
            repo.getLoadState().lastLoadedAt?.setTime(0);
            const next = repo.getLoadState();

            // Assert
            expect(next.lastLoadedAt).toEqual(T1);
        });
    });

    describe("load: failure keeps the last good data", () => {
        it("makes no log call on a successful or a failed load", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValueOnce(makeApiResponse([makeApiRoute("r1", "1A")]));
            mockAxiosGet.mockResolvedValueOnce(makeApiResponse([]));
            mockAxiosGet.mockRejectedValueOnce(new Error("network error"));

            // Act
            await repo.load();
            await repo.load().catch(() => undefined);
            await repo.load().catch(() => undefined);

            // Assert
            expect(logger.info).not.toHaveBeenCalled();
            expect(logger.warn).not.toHaveBeenCalled();
            expect(logger.error).not.toHaveBeenCalled();
        });
    });

    describe("load: empty and malformed responses", () => {
        const emptyResponses: [string, unknown][] = [
            ["an empty routes array", { data: { data: { routes: [] } } }],
            ["routes: null", { data: { data: { routes: null } } }],
            ["no routes field", { data: { data: {} } }],
            ["no data object", { data: {} }],
        ];

        it.each(emptyResponses)("rejects %s before any success and stays not ready", async (_label, response) => {
            // Arrange
            mockAxiosGet.mockResolvedValue(response as never);

            // Act
            const result = repo.load();

            // Assert
            await expect(result).rejects.toThrow("DASH API returned no routes");
            expect(() => repo.getAllRoutes()).toThrow(DataNotReadyError);
        });

        it.each(emptyResponses)("rejects %s after a success and keeps the old routes", async (_label, response) => {
            // Arrange
            mockAxiosGet.mockResolvedValueOnce(makeApiResponse([makeApiRoute("r1", "1A")]));
            await repo.load();
            mockAxiosGet.mockResolvedValueOnce(response as never);

            // Act
            const result = repo.load();

            // Assert
            await expect(result).rejects.toThrow("DASH API returned no routes");
            expect(repo.getAllRoutes().map((route) => route.id)).toEqual(["r1"]);
        });

        it("loads a single route with a single stop", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRouteWithStop("r1", "1A", makeApiStop("s1"))]));

            // Act
            const summary = await repo.load();

            // Assert
            expect(summary).toEqual({ routeCount: 1, stopCount: 1 });
        });

        it("fails the whole load on one malformed stop and keeps the previous data", async () => {
            // Arrange
            const goodRoute = makeApiRouteWithStop("r1", "1A", makeApiStop("s1"));
            mockAxiosGet.mockResolvedValueOnce(makeApiResponse([goodRoute]));
            await repo.load();
            const badRoute = makeApiRouteWithStop("r2", "2B", makeApiStop("s2", { code: "not-a-number" }));
            mockAxiosGet.mockResolvedValueOnce(makeApiResponse([goodRoute, badRoute]));

            // Act
            const result = repo.load();

            // Assert
            await expect(result).rejects.toThrow("Invalid stop code for stop 's2': 'not-a-number'");
            expect(repo.getRouteByShortName("2B")).toBeUndefined();
            expect(repo.getStopById("s2")).toBeUndefined();
            expect(repo.getAllRoutes().map((route) => route.id)).toEqual(["r1"]);
        });
    });

    describe("load: ordering and in-flight reads", () => {
        it("lists routes in DASH order and replaces that order wholesale on the next load", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValueOnce(makeApiResponse([makeApiRoute("r2", "2B"), makeApiRoute("r1", "1A")]));
            mockAxiosGet.mockResolvedValueOnce(makeApiResponse([makeApiRoute("r1", "1A"), makeApiRoute("r2", "2B")]));

            // Act
            await repo.load();
            const firstOrder = repo.getAllRoutes().map((route) => route.id);
            await repo.load();
            const secondOrder = repo.getAllRoutes().map((route) => route.id);

            // Assert
            expect(firstOrder).toEqual(["r2", "r1"]);
            expect(secondOrder).toEqual(["r1", "r2"]);
        });

        it("lists a stop shared by two routes once", async () => {
            // Arrange
            const shared = makeApiStop("shared");
            mockAxiosGet.mockResolvedValue(
                makeApiResponse([makeApiRouteWithStop("r1", "1A", shared), makeApiRouteWithStop("r2", "2B", shared)]),
            );

            // Act
            await repo.load();

            // Assert
            expect(repo.getAllStops().map((stop) => stop.id)).toEqual(["shared"]);
        });

        it("throws DataNotReadyError while the first load is in flight, then serves the new data", async () => {
            // Arrange
            let resolveGet: (value: unknown) => void = () => undefined;
            const pending = new Promise((resolve) => {
                resolveGet = resolve;
            });
            mockAxiosGet.mockReturnValueOnce(pending as never);

            // Act
            const loading = repo.load();

            // Assert: reads never wait on the load
            expect(() => repo.getAllRoutes()).toThrow(DataNotReadyError);
            resolveGet(makeApiResponse([makeApiRoute("r1", "1A")]));
            await loading;
            expect(repo.getAllRoutes().map((route) => route.id)).toEqual(["r1"]);
        });

        it("serves the previous complete dataset while a reload is in flight, then switches all maps together", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValueOnce(makeApiResponse([makeApiRouteWithStop("r1", "1A", makeApiStop("s1"))]));
            await repo.load();
            let resolveGet: (value: unknown) => void = () => undefined;
            const pending = new Promise((resolve) => {
                resolveGet = resolve;
            });
            mockAxiosGet.mockReturnValueOnce(pending as never);

            // Act
            const reloading = repo.load();

            // Assert: the old dataset is served while the reload is pending
            expect(repo.getAllRoutes().map((route) => route.id)).toEqual(["r1"]);
            expect(repo.getStopById("s1")?.id).toBe("s1");
            expect(repo.getRouteByShortName("1A")?.id).toBe("r1");

            resolveGet(makeApiResponse([makeApiRouteWithStop("r2", "2B", makeApiStop("s2"))]));
            await reloading;

            // Assert: routes, short names and stops switched together
            expect(repo.getRouteByShortName("1A")).toBeUndefined();
            expect(repo.getStopById("s1")).toBeUndefined();
            expect(repo.getRouteByShortName("2B")?.id).toBe("r2");
            expect(repo.getStopById("s2")?.id).toBe("s2");
            expect(repo.getAllRoutes().map((route) => route.id)).toEqual(["r2"]);
        });
    });
});
