import { describe, expect, it, vi } from "vitest";
import { UpstreamApiError } from "../errors";
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

const makeDashVehicle = (overrides: Partial<DashVehicle> = {}): DashVehicle => ({
    id: "vehicle-1",
    routeId: "route-1",
    routeShortName: "1A",
    tripId: "trip-1",
    directionId: "d1",
    headsign: "Downtown",
    lat: 38.8,
    lon: -77.1,
    heading: 90,
    speed: 12.5,
    lastUpdated: 1700000300,
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
            const { getVehiclePositions } = createVehicleService();

            // Act
            await getVehiclePositions();

            // Assert
            expect(mockAxiosGet).toHaveBeenCalledWith(expect.stringContaining("alexandria-dash"));
        });

        it("omits the route param from the URL when not provided", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue({ data: makeDashVehiclesApiResponse() });
            const { getVehiclePositions } = createVehicleService();

            // Act
            await getVehiclePositions();

            // Assert
            expect(mockAxiosGet).toHaveBeenCalledWith(expect.not.stringContaining("route="));
        });

        it("forwards the route param when provided", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue({ data: makeDashVehiclesApiResponse() });
            const { getVehiclePositions } = createVehicleService();

            // Act
            await getVehiclePositions({ route: "1A" });

            // Assert
            expect(mockAxiosGet).toHaveBeenCalledWith(expect.stringContaining("route=1A"));
        });

        it("maps DashVehicle[] to VehiclePosition[]", async () => {
            // Arrange
            const dashVehicle = makeDashVehicle({ id: "vehicle-7", lat: 38.9, heading: 180 });
            mockAxiosGet.mockResolvedValue({ data: makeDashVehiclesApiResponse([dashVehicle]) });
            const { getVehiclePositions } = createVehicleService();

            // Act
            const result = await getVehiclePositions();

            // Assert
            expect(result.data.vehicles).toHaveLength(1);
            expect(result.data.vehicles[0]).toMatchObject({
                id: "vehicle-7",
                lat: 38.9,
                heading: 180,
            });
        });

        it("returns an empty vehicles array when the DASH API returns none", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue({ data: makeDashVehiclesApiResponse([]) });
            const { getVehiclePositions } = createVehicleService();

            // Act
            const result = await getVehiclePositions();

            // Assert
            expect(result.data.vehicles).toEqual([]);
        });

        it("includes a generatedAt ISO 8601 timestamp in the response", async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue({ data: makeDashVehiclesApiResponse() });
            const { getVehiclePositions } = createVehicleService();

            // Act
            const result = await getVehiclePositions();

            // Assert
            expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        });

        it("throws an UpstreamApiError when the DASH API returns success: false", async () => {
            // Arrange
            const failResponse: DashVehiclesApiResponse = { ...makeDashVehiclesApiResponse(), success: false };
            mockAxiosGet.mockResolvedValue({ data: failResponse });
            const { getVehiclePositions } = createVehicleService();

            // Act & Assert
            await expect(getVehiclePositions()).rejects.toThrow(UpstreamApiError);
        });

        it("propagates a thrown error when the axios call rejects", async () => {
            // Arrange
            mockAxiosGet.mockRejectedValue(new Error("network error"));
            const { getVehiclePositions } = createVehicleService();

            // Act & Assert
            await expect(getVehiclePositions()).rejects.toThrow("network error");
        });
    });
});
