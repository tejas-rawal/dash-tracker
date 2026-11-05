import { describe, expect, it, vi } from "vitest";
import { NotFoundError } from "../errors";
import { BusRoute, BusStop, RouteType } from "../models";
import { RouteDirection } from "../models/RouteDirection";
import { createBusRouteService } from "./BusRouteService";

const makeStop = (id = "stop-1") => new BusStop({ id, name: `Stop ${id}`, code: 101, lat: 38.8, lon: -77.1 });

const makeRoute = (shortName = "1A") =>
    new BusRoute({
        id: "route-1",
        longName: "Route 1A Long",
        shortName,
        name: "Route 1A",
        type: RouteType.Bus,
        directions: [new RouteDirection({ id: "d1", title: "Northbound", stops: [makeStop()], headSigns: [] })],
    });

const makeMockRepo = () => ({
    getAllRoutes: vi.fn(),
    getRouteByShortName: vi.fn(),
    getStopById: vi.fn(),
    getAllStops: vi.fn(),
    getRoutesForStop: vi.fn(),
});

const makeMockAlertRepo = () => ({
    getActiveAlertsForRoute: vi.fn().mockReturnValue([]),
    getActiveAlertsForStop: vi.fn().mockReturnValue([]),
});

describe("BusRouteService", () => {
    describe("getAgencyRoutes", () => {
        it("returns all routes from the repository", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            const routes = [makeRoute("1A"), makeRoute("2B")];
            mockRepo.getAllRoutes.mockReturnValue(routes);
            const { getAgencyRoutes } = createBusRouteService(mockRepo as never, makeMockAlertRepo() as never);

            // Act
            const result = getAgencyRoutes();

            // Assert
            expect(result).toEqual(routes.map((route) => ({ ...route, alerts: [] })));
            expect(mockRepo.getAllRoutes).toHaveBeenCalledOnce();
        });

        it("returns an empty array when the repository has no routes", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            mockRepo.getAllRoutes.mockReturnValue([]);
            const { getAgencyRoutes } = createBusRouteService(mockRepo as never, makeMockAlertRepo() as never);

            // Act
            const result = getAgencyRoutes();

            // Assert
            expect(result).toEqual([]);
        });

        it("calls serviceAlertRepository.getActiveAlertsForRoute with each route's id", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            const mockAlertRepo = makeMockAlertRepo();
            const routes = [makeRoute("1A"), makeRoute("2B")];
            mockRepo.getAllRoutes.mockReturnValue(routes);
            const { getAgencyRoutes } = createBusRouteService(mockRepo as never, mockAlertRepo as never);

            // Act
            getAgencyRoutes();

            // Assert
            expect(mockAlertRepo.getActiveAlertsForRoute).toHaveBeenCalledWith("route-1");
            expect(mockAlertRepo.getActiveAlertsForRoute).toHaveBeenCalledTimes(2);
        });

        it("includes the mapped alert summaries verbatim as the alerts field", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            const mockAlertRepo = makeMockAlertRepo();
            const route = makeRoute("1A");
            const alert = {
                id: "alert-1",
                cause: "MAINTENANCE",
                effect: "DETOUR",
                headerText: "Header",
                descriptionText: "Description",
                informedRouteIds: ["route-1"],
                informedStopIds: [],
                activePeriod: { start: null, end: null },
            };
            mockRepo.getAllRoutes.mockReturnValue([route]);
            mockAlertRepo.getActiveAlertsForRoute.mockReturnValue([alert]);
            const { getAgencyRoutes } = createBusRouteService(mockRepo as never, mockAlertRepo as never);

            // Act
            const result = getAgencyRoutes();

            // Assert
            expect(result[0].alerts).toEqual([
                {
                    id: "alert-1",
                    cause: "MAINTENANCE",
                    effect: "DETOUR",
                    headerText: "Header",
                    descriptionText: "Description",
                    activePeriod: { start: null, end: null },
                },
            ]);
        });

        it("preserves order and includes each of 2+ matching alerts as a separate entry (no merging)", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            const mockAlertRepo = makeMockAlertRepo();
            const route = makeRoute("1A");
            const alerts = [
                {
                    id: "first-alert",
                    informedRouteIds: ["route-1"],
                    informedStopIds: [],
                    activePeriod: { start: null, end: null },
                },
                {
                    id: "second-alert",
                    informedRouteIds: ["route-1"],
                    informedStopIds: [],
                    activePeriod: { start: null, end: null },
                },
            ];
            mockRepo.getAllRoutes.mockReturnValue([route]);
            mockAlertRepo.getActiveAlertsForRoute.mockReturnValue(alerts);
            const { getAgencyRoutes } = createBusRouteService(mockRepo as never, mockAlertRepo as never);

            // Act
            const result = getAgencyRoutes();

            // Assert
            expect(result[0].alerts).toHaveLength(2);
            expect(result[0].alerts.map((a) => a.id)).toEqual(["first-alert", "second-alert"]);
        });
    });

    describe("getAgencyRoute", () => {
        it("returns the route matching the given short name", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            const route = makeRoute("1A");
            mockRepo.getRouteByShortName.mockReturnValue(route);
            const { getAgencyRoute } = createBusRouteService(mockRepo as never, makeMockAlertRepo() as never);

            // Act
            const result = getAgencyRoute("1A");

            // Assert
            expect(result).toEqual({ ...route, alerts: [] });
            expect(mockRepo.getRouteByShortName).toHaveBeenCalledWith("1A");
        });

        it("calls serviceAlertRepository.getActiveAlertsForRoute with the matched route's id", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            const mockAlertRepo = makeMockAlertRepo();
            const route = makeRoute("1A");
            mockRepo.getRouteByShortName.mockReturnValue(route);
            const { getAgencyRoute } = createBusRouteService(mockRepo as never, mockAlertRepo as never);

            // Act
            getAgencyRoute("1A");

            // Assert
            expect(mockAlertRepo.getActiveAlertsForRoute).toHaveBeenCalledWith("route-1");
        });

        it("throws a NotFoundError when no route matches the short name", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            mockRepo.getRouteByShortName.mockReturnValue(undefined);
            const { getAgencyRoute } = createBusRouteService(mockRepo as never, makeMockAlertRepo() as never);

            // Act & Assert
            expect(() => getAgencyRoute("UNKNOWN")).toThrowError(NotFoundError);
        });

        it("includes the short name in the NotFoundError message", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            mockRepo.getRouteByShortName.mockReturnValue(undefined);
            const { getAgencyRoute } = createBusRouteService(mockRepo as never, makeMockAlertRepo() as never);

            // Act & Assert
            expect(() => getAgencyRoute("UNKNOWN")).toThrowError("Route not found: UNKNOWN");
        });
    });

    describe("getAgencyStop", () => {
        it("returns the stop matching the given stop id", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            const stop = makeStop("stop-42");
            mockRepo.getStopById.mockReturnValue(stop);
            const { getAgencyStop } = createBusRouteService(mockRepo as never, makeMockAlertRepo() as never);

            // Act
            const result = getAgencyStop("stop-42");

            // Assert
            expect(result).toEqual(stop);
            expect(mockRepo.getStopById).toHaveBeenCalledWith("stop-42");
        });

        it("throws a NotFoundError when no stop matches the given id", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            mockRepo.getStopById.mockReturnValue(undefined);
            const { getAgencyStop } = createBusRouteService(mockRepo as never, makeMockAlertRepo() as never);

            // Act & Assert
            expect(() => getAgencyStop("missing-stop")).toThrowError(NotFoundError);
        });

        it("includes the stop id in the NotFoundError message", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            mockRepo.getStopById.mockReturnValue(undefined);
            const { getAgencyStop } = createBusRouteService(mockRepo as never, makeMockAlertRepo() as never);

            // Act & Assert
            expect(() => getAgencyStop("missing-stop")).toThrowError("Stop not found: missing-stop");
        });
    });

    describe("getAgencyStops", () => {
        it("returns all stops from the repository", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            const stops = [makeStop("s1"), makeStop("s2")];
            mockRepo.getAllStops.mockReturnValue(stops);
            const { getAgencyStops } = createBusRouteService(mockRepo as never, makeMockAlertRepo() as never);

            // Act
            const result = getAgencyStops();

            // Assert
            expect(result).toEqual(stops);
            expect(mockRepo.getAllStops).toHaveBeenCalledOnce();
        });

        it("returns an empty array when the repository has no stops", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            mockRepo.getAllStops.mockReturnValue([]);
            const { getAgencyStops } = createBusRouteService(mockRepo as never, makeMockAlertRepo() as never);

            // Act
            const result = getAgencyStops();

            // Assert
            expect(result).toEqual([]);
        });
    });

    describe("getRoutesForStop", () => {
        it("returns all routes containing the given stop id", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            const routes = [makeRoute("1A"), makeRoute("2B")];
            mockRepo.getRoutesForStop.mockReturnValue(routes);
            const { getRoutesForStop } = createBusRouteService(mockRepo as never, makeMockAlertRepo() as never);

            // Act
            const result = getRoutesForStop("stop-1");

            // Assert
            expect(result).toEqual(routes);
            expect(mockRepo.getRoutesForStop).toHaveBeenCalledWith("stop-1");
        });

        it("returns an empty array when no routes contain the given stop", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            mockRepo.getRoutesForStop.mockReturnValue([]);
            const { getRoutesForStop } = createBusRouteService(mockRepo as never, makeMockAlertRepo() as never);

            // Act
            const result = getRoutesForStop("orphan-stop");

            // Assert
            expect(result).toEqual([]);
        });
    });
});
