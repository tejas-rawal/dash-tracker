import { describe, expect, it, vi } from "vitest";
import { NotFoundError, UpstreamApiError } from "../errors";
import type { DashVehicle, DashVehiclesApiResponse } from "../models/Vehicle";

vi.mock("../../config", () => ({
    axios: { get: vi.fn() },
    environment: {
        dashApi: { agency: "alexandria-dash", baseUrl: "https://api.goswift.ly", apiKey: "key" },
        server: { port: 3000 },
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { axios, environment } from "../../config";
import { createVehicleService } from "./VehicleService";

const mockAxiosGet = vi.mocked(axios.get);

const makeMockRepo = () => ({
    getRouteByShortName: vi.fn(),
});

const makeDashVehicle = (overrides: Partial<DashVehicle> = {}): DashVehicle => ({
    id: "1550",
    routeId: "13223",
    routeShortName: "KJ",
    directionId: "0",
    headsign: "West Portal Ave/Sloat/Portola",
    loc: { heading: 113.8, lat: 37.72179, lon: -122.44705, speed: 0, time: 1534287835 },
    vehicleType: "0",
    ...overrides,
});

const makeDashVehiclesApiResponse = (vehicles: DashVehicle[] = []): DashVehiclesApiResponse => ({
    success: true,
    route: "/real-time/alexandria-dash/vehicles GET",
    data: {
        agencyKey: environment.dashApi.agency,
        vehicles,
    },
});

describe("VehicleService", () => {
    describe("getVehiclePositions", () => {
        it("calls the DASH API with the agency key in the URL", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue({ data: makeDashVehiclesApiResponse() });
            const mockRepo = makeMockRepo();
            const { getVehiclePositions } = createVehicleService(mockRepo as never);

            // Act
            await getVehiclePositions();

            // Assert
            expect(mockAxiosGet).toHaveBeenCalledWith(expect.stringContaining("alexandria-dash"));
        });

        it("omits the route param from the URL when not provided", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue({ data: makeDashVehiclesApiResponse() });
            const mockRepo = makeMockRepo();
            const { getVehiclePositions } = createVehicleService(mockRepo as never);

            // Act
            await getVehiclePositions();

            // Assert
            expect(mockAxiosGet).toHaveBeenCalledWith(expect.not.stringContaining("route="));
        });

        it("forwards the route param when provided", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue({ data: makeDashVehiclesApiResponse() });
            const mockRepo = makeMockRepo();
            mockRepo.getRouteByShortName.mockReturnValue({ id: "13223", shortName: "KJ" } as never);
            const { getVehiclePositions } = createVehicleService(mockRepo as never);

            // Act
            await getVehiclePositions({ route: "1A" });

            // Assert
            expect(mockAxiosGet).toHaveBeenCalledWith(expect.stringContaining("route=1A"));
            expect(mockRepo.getRouteByShortName).toHaveBeenCalledWith("1A");
        });

        it("maps DashVehicle[] to VehiclePosition[]", async () => {
            // Arrange
            const dashVehicle = makeDashVehicle({
                id: "vehicle-7",
                loc: { heading: 180, lat: 38.9, lon: -122.44705, speed: 0, time: 1534287835 },
            });
            mockAxiosGet.mockResolvedValue({ data: makeDashVehiclesApiResponse([dashVehicle]) });
            const mockRepo = makeMockRepo();
            const { getVehiclePositions } = createVehicleService(mockRepo as never);

            // Act
            const result = await getVehiclePositions();

            // Assert
            expect(result.data.vehicles).toHaveLength(1);
            expect(result.data.vehicles[0]).toMatchObject({
                id: "vehicle-7",
                lat: 38.9,
                lon: -122.44705,
                heading: 180,
                speed: 0,
                vehicleType: "0",
                lastUpdated: new Date(1534287835 * 1000).toISOString(),
            });
            expect(result.data.vehicles[0]).not.toHaveProperty("tripId");
        });

        it("returns an empty vehicles array when the DASH API returns none", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue({ data: makeDashVehiclesApiResponse([]) });
            const mockRepo = makeMockRepo();
            const { getVehiclePositions } = createVehicleService(mockRepo as never);

            // Act
            const result = await getVehiclePositions();

            // Assert
            expect(result.data.vehicles).toEqual([]);
        });

        it("includes a generatedAt ISO 8601 timestamp in the response", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue({ data: makeDashVehiclesApiResponse() });
            const mockRepo = makeMockRepo();
            const { getVehiclePositions } = createVehicleService(mockRepo as never);

            // Act
            const result = await getVehiclePositions();

            // Assert
            expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        });

        it("throws an UpstreamApiError when the DASH API returns success: false", async () => {
            // Arrange
            const failResponse: DashVehiclesApiResponse = { ...makeDashVehiclesApiResponse(), success: false };
            mockAxiosGet.mockResolvedValue({ data: failResponse });
            const mockRepo = makeMockRepo();
            const { getVehiclePositions } = createVehicleService(mockRepo as never);

            // Act & Assert
            await expect(getVehiclePositions()).rejects.toThrow(UpstreamApiError);
        });

        it("propagates a thrown error when the axios call rejects", async () => {
            // Arrange
            mockAxiosGet.mockRejectedValue(new Error("network error"));
            const mockRepo = makeMockRepo();
            const { getVehiclePositions } = createVehicleService(mockRepo as never);

            // Act & Assert
            await expect(getVehiclePositions()).rejects.toThrow("network error");
        });
    });

    describe("route validation", () => {
        it("rejects with NotFoundError when the route short name is unknown", async () => {
            // Arrange
            const mockRepo = makeMockRepo();
            mockRepo.getRouteByShortName.mockReturnValue(undefined);
            const { getVehiclePositions } = createVehicleService(mockRepo as never);

            // Act & Assert
            await expect(getVehiclePositions({ route: "UNKNOWN" })).rejects.toThrow(NotFoundError);
            expect(mockAxiosGet).not.toHaveBeenCalled();
        });

        it("rejects with the exact 'Route not found' message for the unknown route", async () => {
            // Arrange
            const mockRepo = makeMockRepo();
            mockRepo.getRouteByShortName.mockReturnValue(undefined);
            const { getVehiclePositions } = createVehicleService(mockRepo as never);

            // Act & Assert
            await expect(getVehiclePositions({ route: "UNKNOWN" })).rejects.toThrow("Route not found: UNKNOWN");
        });

        it("does not call repository.getRouteByShortName when no route filter is provided", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue({ data: makeDashVehiclesApiResponse() });
            const mockRepo = makeMockRepo();
            const { getVehiclePositions } = createVehicleService(mockRepo as never);

            // Act
            await getVehiclePositions();

            // Assert
            expect(mockRepo.getRouteByShortName).not.toHaveBeenCalled();
        });
    });
});
