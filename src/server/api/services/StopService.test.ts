import { describe, expect, it, vi } from "vitest";
import { NotFoundError } from "../errors";
import { BusRoute, BusStop, RouteType } from "../models";
import { RouteDirection } from "../models/RouteDirection";
import { createStopService } from "./StopService";

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
});

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
});
