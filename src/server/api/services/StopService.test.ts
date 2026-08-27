import { describe, expect, it, vi } from "vitest";
import { NotFoundError } from "../errors";
import { BusRoute, BusStop, RouteType } from "../models";
import { RouteDirection } from "../models/RouteDirection";
import { createStopService } from "./StopService";
import { haversineDistanceMiles } from "./distance";

const makeStop = (id = "stop-1") => new BusStop({ id, name: `Stop ${id}`, code: 101, lat: 38.8, lon: -77.1 });

const makeRoute = (shortName = "1A", directions: RouteDirection[] = []) =>
    new BusRoute({
        id: "route-1",
        longName: "Route 1A Long",
        shortName,
        name: "Route 1A",
        type: RouteType.Bus,
        directions,
    });

const makeMockRepo = () => ({
    getRouteByShortName: vi.fn(),
    getAllStops: vi.fn(),
});

// DC (~38.9), origin, for nearby-search fixtures.
const ORIGIN = { lat: 38.9, lng: -77.0 };

const makeStopAt = (id: string, lat: number, lon: number) =>
    new BusStop({ id, name: `Stop ${id}`, code: 101, lat, lon });

describe("StopService", () => {
    describe("getStopsForRoute", () => {
        it("returns the grouped array with correct directionId/title/stops per direction", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            const northStop = makeStop("stop-n1");
            const southStop = makeStop("stop-s1");
            const route = makeRoute("1A", [
                new RouteDirection({ id: "d1", title: "Northbound", stops: [northStop], headSigns: [] }),
                new RouteDirection({ id: "d2", title: "Southbound", stops: [southStop], headSigns: [] }),
            ]);
            mockRepo.getRouteByShortName.mockReturnValue(route);
            const { getStopsForRoute } = createStopService(mockRepo as never);

            // Act
            const result = getStopsForRoute("1A");

            // Assert
            expect(result).toEqual([
                { directionId: "d1", title: "Northbound", stops: [northStop] },
                { directionId: "d2", title: "Southbound", stops: [southStop] },
            ]);
            expect(mockRepo.getRouteByShortName).toHaveBeenCalledWith("1A");
        });

        it("throws a NotFoundError when no route matches the short name", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            mockRepo.getRouteByShortName.mockReturnValue(undefined);
            const { getStopsForRoute } = createStopService(mockRepo as never);

            // Act & Assert
            expect(() => getStopsForRoute("UNKNOWN")).toThrowError(NotFoundError);
        });

        it("includes the short name in the NotFoundError message", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            mockRepo.getRouteByShortName.mockReturnValue(undefined);
            const { getStopsForRoute } = createStopService(mockRepo as never);

            // Act & Assert
            expect(() => getStopsForRoute("UNKNOWN")).toThrowError("Route not found: UNKNOWN");
        });

        it("includes a direction with an empty stops array rather than omitting it", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            const route = makeRoute("1A", [
                new RouteDirection({ id: "d1", title: "Northbound", stops: [], headSigns: [] }),
            ]);
            mockRepo.getRouteByShortName.mockReturnValue(route);
            const { getStopsForRoute } = createStopService(mockRepo as never);

            // Act
            const result = getStopsForRoute("1A");

            // Assert
            expect(result).toEqual([{ directionId: "d1", title: "Northbound", stops: [] }]);
        });

        it("does not dedupe a stop shared by two directions — each direction keeps its own copy", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            const sharedStop = makeStop("shared-1");
            const route = makeRoute("1A", [
                new RouteDirection({ id: "d1", title: "Inbound", stops: [sharedStop], headSigns: [] }),
                new RouteDirection({ id: "d2", title: "Outbound", stops: [sharedStop], headSigns: [] }),
            ]);
            mockRepo.getRouteByShortName.mockReturnValue(route);
            const { getStopsForRoute } = createStopService(mockRepo as never);

            // Act
            const result = getStopsForRoute("1A");

            // Assert
            expect(result[0]?.stops).toContainEqual(sharedStop);
            expect(result[1]?.stops).toContainEqual(sharedStop);
        });

        it("preserves the direction's real stop sequence order, not re-sorted", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            const stopC = makeStop("c");
            const stopA = makeStop("a");
            const stopB = makeStop("b");
            const route = makeRoute("1A", [
                new RouteDirection({ id: "d1", title: "Northbound", stops: [stopC, stopA, stopB], headSigns: [] }),
            ]);
            mockRepo.getRouteByShortName.mockReturnValue(route);
            const { getStopsForRoute } = createStopService(mockRepo as never);

            // Act
            const result = getStopsForRoute("1A");

            // Assert
            expect(result[0]?.stops).toEqual([stopC, stopA, stopB]);
        });

        it("returns an empty array when the route has zero directions", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            const route = makeRoute("1A", []);
            mockRepo.getRouteByShortName.mockReturnValue(route);
            const { getStopsForRoute } = createStopService(mockRepo as never);

            // Act
            const result = getStopsForRoute("1A");

            // Assert
            expect(result).toEqual([]);
        });
    });

    describe("getNearbyStops", () => {
        it("defaults to radius 0.5 miles and count 10 when options are omitted", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            const nearStop = makeStopAt("near", ORIGIN.lat, ORIGIN.lng);
            mockRepo.getAllStops.mockReturnValue([nearStop]);
            const { getNearbyStops } = createStopService(mockRepo as never);

            // Act
            const result = getNearbyStops(ORIGIN.lat, ORIGIN.lng);

            // Assert
            expect(result).toEqual([
                { id: "near", name: "Stop near", code: 101, lat: ORIGIN.lat, lon: ORIGIN.lng, distance: 0 },
            ]);
        });

        it("returns results sorted ascending by distance", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            const far = makeStopAt("far", ORIGIN.lat + 0.02, ORIGIN.lng);
            const near = makeStopAt("near", ORIGIN.lat, ORIGIN.lng);
            const mid = makeStopAt("mid", ORIGIN.lat + 0.01, ORIGIN.lng);
            mockRepo.getAllStops.mockReturnValue([far, near, mid]);
            const { getNearbyStops } = createStopService(mockRepo as never);

            // Act
            const result = getNearbyStops(ORIGIN.lat, ORIGIN.lng, { radius: 5 });

            // Assert
            expect(result.map((stop) => stop.id)).toEqual(["near", "mid", "far"]);
        });

        it("excludes a stop farther than the given radius", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            const near = makeStopAt("near", ORIGIN.lat, ORIGIN.lng);
            const far = makeStopAt("far", ORIGIN.lat + 0.5, ORIGIN.lng);
            mockRepo.getAllStops.mockReturnValue([near, far]);
            const { getNearbyStops } = createStopService(mockRepo as never);

            // Act
            const result = getNearbyStops(ORIGIN.lat, ORIGIN.lng, { radius: 2 });

            // Assert
            expect(result.map((stop) => stop.id)).toEqual(["near"]);
        });

        it("caps results at 50 even when count: 100 is requested (D-07 hard cap)", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            const stops = Array.from({ length: 60 }, (_, i) => makeStopAt(`stop-${i}`, ORIGIN.lat, ORIGIN.lng));
            mockRepo.getAllStops.mockReturnValue(stops);
            const { getNearbyStops } = createStopService(mockRepo as never);

            // Act
            const result = getNearbyStops(ORIGIN.lat, ORIGIN.lng, { count: 100 });

            // Assert
            expect(result).toHaveLength(50);
        });

        it("respects a requested count within the allowed range", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            const stops = Array.from({ length: 20 }, (_, i) => makeStopAt(`stop-${i}`, ORIGIN.lat, ORIGIN.lng));
            mockRepo.getAllStops.mockReturnValue(stops);
            const { getNearbyStops } = createStopService(mockRepo as never);

            // Act
            const result = getNearbyStops(ORIGIN.lat, ORIGIN.lng, { count: 5 });

            // Assert
            expect(result).toHaveLength(5);
        });

        it("returns an empty array when no stops are within the effective radius", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            const far = makeStopAt("far", ORIGIN.lat + 10, ORIGIN.lng);
            mockRepo.getAllStops.mockReturnValue([far]);
            const { getNearbyStops } = createStopService(mockRepo as never);

            // Act
            const result = getNearbyStops(ORIGIN.lat, ORIGIN.lng);

            // Assert
            expect(result).toEqual([]);
        });

        it("returns an empty array when the repository has zero stops", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            mockRepo.getAllStops.mockReturnValue([]);
            const { getNearbyStops } = createStopService(mockRepo as never);

            // Act
            const result = getNearbyStops(ORIGIN.lat, ORIGIN.lng);

            // Assert
            expect(result).toEqual([]);
        });

        it("computes distance via haversineDistanceMiles rounded to 2 decimal places", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            const stop = makeStopAt("stop-1", ORIGIN.lat + 0.01, ORIGIN.lng + 0.01);
            mockRepo.getAllStops.mockReturnValue([stop]);
            const { getNearbyStops } = createStopService(mockRepo as never);
            const expectedDistance = haversineDistanceMiles(
                { lat: ORIGIN.lat, lon: ORIGIN.lng },
                { lat: ORIGIN.lat + 0.01, lon: ORIGIN.lng + 0.01 },
            );

            // Act
            const result = getNearbyStops(ORIGIN.lat, ORIGIN.lng, { radius: 5 });

            // Assert
            expect(result[0]?.distance).toBe(expectedDistance);
        });

        it("at-cap boundary: requested count: 50 against 60 in-radius stops returns exactly 50 entries", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            const stops = Array.from({ length: 60 }, (_, i) => makeStopAt(`stop-${i}`, ORIGIN.lat, ORIGIN.lng));
            mockRepo.getAllStops.mockReturnValue(stops);
            const { getNearbyStops } = createStopService(mockRepo as never);

            // Act
            const result = getNearbyStops(ORIGIN.lat, ORIGIN.lng, { count: 50 });

            // Assert
            expect(result).toHaveLength(50);
        });

        it("over-cap boundary: requested count: 1000 against 60 in-radius stops still returns exactly 50 entries", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            const stops = Array.from({ length: 60 }, (_, i) => makeStopAt(`stop-${i}`, ORIGIN.lat, ORIGIN.lng));
            mockRepo.getAllStops.mockReturnValue(stops);
            const { getNearbyStops } = createStopService(mockRepo as never);

            // Act
            const result = getNearbyStops(ORIGIN.lat, ORIGIN.lng, { count: 1000 });

            // Assert
            expect(result).toHaveLength(50);
        });

        it("default count: with no count option and 15 in-radius stops, returns exactly 10 entries", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            const stops = Array.from({ length: 15 }, (_, i) => makeStopAt(`stop-${i}`, ORIGIN.lat, ORIGIN.lng));
            mockRepo.getAllStops.mockReturnValue(stops);
            const { getNearbyStops } = createStopService(mockRepo as never);

            // Act
            const result = getNearbyStops(ORIGIN.lat, ORIGIN.lng);

            // Assert
            expect(result).toHaveLength(10);
        });

        it("default radius: a stop just inside 0.5 miles is included and a stop just outside is excluded", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            // ~0.005 deg lat offset ≈ 0.35mi (well inside 0.5mi); ~0.01 deg ≈ 0.69mi (well outside 0.5mi).
            const inside = makeStopAt("inside", ORIGIN.lat + 0.005, ORIGIN.lng);
            const outside = makeStopAt("outside", ORIGIN.lat + 0.01, ORIGIN.lng);
            mockRepo.getAllStops.mockReturnValue([inside, outside]);
            const { getNearbyStops } = createStopService(mockRepo as never);

            // Act
            const result = getNearbyStops(ORIGIN.lat, ORIGIN.lng);

            // Assert
            expect(result.map((stop) => stop.id)).toEqual(["inside"]);
        });

        it("rounding contract: every returned distance has at most 2 decimal places", () => {
            // Arrange
            const mockRepo = makeMockRepo();
            const stops = [
                makeStopAt("a", ORIGIN.lat + 0.001, ORIGIN.lng + 0.002),
                makeStopAt("b", ORIGIN.lat + 0.003, ORIGIN.lng + 0.001),
                makeStopAt("c", ORIGIN.lat, ORIGIN.lng),
            ];
            mockRepo.getAllStops.mockReturnValue(stops);
            const { getNearbyStops } = createStopService(mockRepo as never);

            // Act
            const result = getNearbyStops(ORIGIN.lat, ORIGIN.lng, { radius: 5 });

            // Assert
            expect(result.length).toBeGreaterThan(0);
            for (const stop of result) {
                expect(Number(stop.distance.toFixed(2))).toBe(stop.distance);
            }
        });
    });
});
