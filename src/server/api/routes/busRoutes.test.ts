import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { NotFoundError } from "../errors";
import { BusRoute, BusStop, RouteType } from "../models";
import { RouteDirection } from "../models/RouteDirection";

vi.mock("../services/BusRouteService", () => ({
    createBusRouteService: vi.fn(() => ({
        getAgencyRoutes: vi.fn(),
        getAgencyRoute: vi.fn(),
        getAgencyStop: vi.fn(),
        getAgencyStops: vi.fn(),
        getRoutesForStop: vi.fn(),
    })),
}));

vi.mock("../services/StopService", () => ({
    createStopService: vi.fn(() => ({
        getStopsForRoute: vi.fn(),
    })),
}));

import app from "../../test/app";
import { createBusRouteService } from "../services/BusRouteService";
import { createStopService } from "../services/StopService";

const getMockService = () => vi.mocked(createBusRouteService).mock.results[0]?.value;
const getMockStopService = () => vi.mocked(createStopService).mock.results[0]?.value;

const makeStop = () => new BusStop({ id: "stop-1", name: "Main St", code: 101, lat: 38.8, lon: -77.1 });

const makeRoute = (shortName = "1A") =>
    new BusRoute({
        id: "route-1",
        longName: "Route 1A Long",
        shortName,
        name: "Route 1A",
        type: RouteType.Bus,
        directions: [new RouteDirection({ id: "d1", title: "Northbound", stops: [makeStop()], headSigns: [] })],
    });

describe("GET /api/v1/routes/all", () => {
    it("responds with 200 and an array of route objects", async () => {
        // Arrange
        const routes = [makeRoute("1A"), makeRoute("2B")];
        getMockService().getAgencyRoutes.mockReturnValue(routes);

        // Act
        const response = await request(app).get("/api/v1/routes/all");

        // Assert
        expect(response.status).toBe(200);
        expect(response.body).toBeInstanceOf(Array);
        expect(response.body).toHaveLength(2);
    });

    it("responds with route objects that contain the expected properties", async () => {
        // Arrange
        getMockService().getAgencyRoutes.mockReturnValue([makeRoute("1A")]);

        // Act
        const response = await request(app).get("/api/v1/routes/all");

        // Assert
        expect(response.body[0]).toMatchObject({
            id: "route-1",
            shortName: "1A",
            longName: "Route 1A Long",
            name: "Route 1A",
            type: RouteType.Bus,
        });
    });

    it("responds with 200 and an empty array when there are no routes", async () => {
        // Arrange
        getMockService().getAgencyRoutes.mockReturnValue([]);

        // Act
        const response = await request(app).get("/api/v1/routes/all");

        // Assert
        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
    });

    it("responds with 500 and an error body when the service throws", async () => {
        // Arrange
        getMockService().getAgencyRoutes.mockImplementation(() => {
            throw new Error("service error");
        });

        // Act
        const response = await request(app).get("/api/v1/routes/all");

        // Assert
        expect(response.status).toBe(500);
        expect(response.body).toMatchObject({
            error: "Request Failed",
            details: "service error",
        });
    });
});

describe("GET /api/v1/routes/:shortName", () => {
    it("responds with 200 and the matching route object", async () => {
        // Arrange
        const route = makeRoute("1A");
        getMockService().getAgencyRoute.mockReturnValue(route);

        // Act
        const response = await request(app).get("/api/v1/routes/1A");

        // Assert
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            id: "route-1",
            shortName: "1A",
        });
    });

    it("responds with 404 and a Not Found error body when the route does not exist", async () => {
        // Arrange
        getMockService().getAgencyRoute.mockImplementation(() => {
            throw new NotFoundError("Route not found: UNKNOWN");
        });

        // Act
        const response = await request(app).get("/api/v1/routes/UNKNOWN");

        // Assert
        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({
            error: "Not Found",
            details: "Route not found: UNKNOWN",
        });
    });

    it("responds with 500 and a Request Failed error body when the service throws a generic error", async () => {
        // Arrange
        getMockService().getAgencyRoute.mockImplementation(() => {
            throw new Error("unexpected");
        });

        // Act
        const response = await request(app).get("/api/v1/routes/1A");

        // Assert
        expect(response.status).toBe(500);
        expect(response.body).toMatchObject({
            error: "Request Failed",
            details: "unexpected",
        });
    });

    it("passes the shortName path parameter to the service", async () => {
        // Arrange
        const route = makeRoute("3C");
        getMockService().getAgencyRoute.mockReturnValue(route);

        // Act
        await request(app).get("/api/v1/routes/3C");

        // Assert
        expect(getMockService().getAgencyRoute).toHaveBeenCalledWith("3C");
    });
});

describe("GET /api/v1/routes/:shortName/stops", () => {
    it("responds with 200 and the grouped-by-direction body for a known route", async () => {
        // Arrange
        const body = [{ directionId: "d1", title: "Northbound", stops: [makeStop()] }];
        getMockStopService().getStopsForRoute.mockReturnValue(body);

        // Act
        const response = await request(app).get("/api/v1/routes/1A/stops");

        // Assert
        expect(response.status).toBe(200);
        expect(response.body).toEqual(body);
    });

    it("responds with 404 and a Not Found error body when the service throws NotFoundError", async () => {
        // Arrange
        getMockStopService().getStopsForRoute.mockImplementation(() => {
            throw new NotFoundError("Route not found: UNKNOWN");
        });

        // Act
        const response = await request(app).get("/api/v1/routes/UNKNOWN/stops");

        // Assert
        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({
            error: "Not Found",
            details: "Route not found: UNKNOWN",
        });
    });

    it("passes the shortName path parameter to the service", async () => {
        // Arrange
        getMockStopService().getStopsForRoute.mockReturnValue([]);

        // Act
        await request(app).get("/api/v1/routes/3C/stops");

        // Assert
        expect(getMockStopService().getStopsForRoute).toHaveBeenCalledWith("3C");
    });

    it("returns a direction with an empty stops array as { directionId, title, stops: [] }, not omitted", async () => {
        // Arrange
        const body = [
            { directionId: "d1", title: "Northbound", stops: [makeStop()] },
            { directionId: "d2", title: "Southbound", stops: [] },
        ];
        getMockStopService().getStopsForRoute.mockReturnValue(body);

        // Act
        const response = await request(app).get("/api/v1/routes/1A/stops");

        // Assert
        expect(response.body).toHaveLength(2);
        expect(response.body[1]).toEqual({ directionId: "d2", title: "Southbound", stops: [] });
    });

    it("returns both direction entries with a shared stop present in each", async () => {
        // Arrange
        const sharedStop = { id: "shared-1", name: "Main St", code: 101, lat: 38.8, lon: -77.1 };
        const body = [
            { directionId: "d1", title: "Inbound", stops: [sharedStop] },
            { directionId: "d2", title: "Outbound", stops: [sharedStop] },
        ];
        getMockStopService().getStopsForRoute.mockReturnValue(body);

        // Act
        const response = await request(app).get("/api/v1/routes/1A/stops");

        // Assert
        expect(response.body[0].stops).toContainEqual(sharedStop);
        expect(response.body[1].stops).toContainEqual(sharedStop);
    });
});
