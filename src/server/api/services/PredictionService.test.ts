import { describe, expect, it, vi } from "vitest";
import { NotFoundError, UpstreamApiError } from "../errors";
import type { DashApiResponse, DashPredictionData } from "../models/Prediction";

vi.mock("../repositories/BusDataRepository", () => {
    const mockInstance = {
        getStopById: vi.fn(),
    };
    return {
        BusDataRepository: {
            getInstance: vi.fn(() => mockInstance),
        },
    };
});

vi.mock("../../config", () => ({
    axios: { get: vi.fn() },
    environment: {
        dashApi: { agency: "alexandria-dash", baseUrl: "https://api.goswift.ly", apiKey: "key" },
        server: { port: 3000 },
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { axios, environment } from "../../config";
import { BusStop } from "../models";
import { BusDataRepository } from "../repositories/BusDataRepository";
import { getPredictionsForStop } from "./PredictionService";

const mockAxiosGet = vi.mocked(axios.get);
const mockRepo = vi.mocked(BusDataRepository.getInstance(), true);

const makeStop = (id = "stop-1") => new BusStop({ id, name: `Stop ${id}`, code: 101, lat: 38.8, lon: -77.1 });

const makeDashPredictionData = (overrides: Partial<DashPredictionData> = {}): DashPredictionData => ({
    routeId: "route-1",
    routeName: "Route 1A Long",
    routeShortName: "1A",
    stopId: "stop-1",
    stopName: "Stop stop-1",
    stopCode: 101,
    destinations: [
        {
            directionId: "d1",
            headsign: "Downtown",
            predictions: [{ min: 5, sec: 300, time: 1700000300, tripId: "trip-1", vehicleId: "v-1" }],
        },
    ],
    ...overrides,
});

const makeDashApiResponse = (predictionsData: DashPredictionData[] = []): DashApiResponse => ({
    success: true,
    route: "/real-time/alexandria-dash/predictions GET",
    data: {
        agencyKey: environment.dashApi.agency,
        predictionsData,
    },
});

describe("PredictionService", () => {
    describe("getPredictionsForStop", () => {
        it("throws NotFoundError when the stop does not exist in the repository", async () => {
            // Arrange
            mockRepo.getStopById.mockReturnValue(undefined);

            // Act & Assert
            await expect(getPredictionsForStop("missing-stop")).rejects.toThrow(NotFoundError);
        });

        it("includes the stop id in the NotFoundError message", async () => {
            // Arrange
            mockRepo.getStopById.mockReturnValue(undefined);

            // Act & Assert
            await expect(getPredictionsForStop("missing-stop")).rejects.toThrow("Stop not found: missing-stop");
        });

        it("calls the DASH API with the correct stop id", async () => {
            // Arrange
            mockRepo.getStopById.mockReturnValue(makeStop("stop-1"));
            mockAxiosGet.mockResolvedValue({ data: makeDashApiResponse([makeDashPredictionData()]) });

            // Act
            await getPredictionsForStop("stop-1");

            // Assert
            expect(mockAxiosGet).toHaveBeenCalledWith(expect.stringContaining("stop=stop-1"));
        });

        it("calls the DASH API with the agency key from environment", async () => {
            // Arrange
            mockRepo.getStopById.mockReturnValue(makeStop("stop-1"));
            mockAxiosGet.mockResolvedValue({ data: makeDashApiResponse([makeDashPredictionData()]) });

            // Act
            await getPredictionsForStop("stop-1");

            // Assert
            expect(mockAxiosGet).toHaveBeenCalledWith(expect.stringContaining("alexandria-dash"));
        });

        it("forwards the optional number parameter to the DASH API", async () => {
            // Arrange
            mockRepo.getStopById.mockReturnValue(makeStop("stop-1"));
            mockAxiosGet.mockResolvedValue({ data: makeDashApiResponse([makeDashPredictionData()]) });

            // Act
            await getPredictionsForStop("stop-1", { number: 5 });

            // Assert
            expect(mockAxiosGet).toHaveBeenCalledWith(expect.stringContaining("number=5"));
        });

        it("forwards the optional route parameter to the DASH API", async () => {
            // Arrange
            mockRepo.getStopById.mockReturnValue(makeStop("stop-1"));
            mockAxiosGet.mockResolvedValue({ data: makeDashApiResponse([makeDashPredictionData()]) });

            // Act
            await getPredictionsForStop("stop-1", { route: "1A" });

            // Assert
            expect(mockAxiosGet).toHaveBeenCalledWith(expect.stringContaining("route=1A"));
        });

        it("omits the number param from the DASH API URL when not provided", async () => {
            // Arrange
            mockRepo.getStopById.mockReturnValue(makeStop("stop-1"));
            mockAxiosGet.mockResolvedValue({ data: makeDashApiResponse([makeDashPredictionData()]) });

            // Act
            await getPredictionsForStop("stop-1");

            // Assert
            expect(mockAxiosGet).toHaveBeenCalledWith(expect.not.stringContaining("number="));
        });

        it("omits the route param from the DASH API URL when not provided", async () => {
            // Arrange
            mockRepo.getStopById.mockReturnValue(makeStop("stop-1"));
            mockAxiosGet.mockResolvedValue({ data: makeDashApiResponse([makeDashPredictionData()]) });

            // Act
            await getPredictionsForStop("stop-1");

            // Assert
            expect(mockAxiosGet).toHaveBeenCalledWith(expect.not.stringContaining("route="));
        });

        it("returns a successful response with stop metadata from the repository", async () => {
            // Arrange
            mockRepo.getStopById.mockReturnValue(makeStop("stop-1"));
            mockAxiosGet.mockResolvedValue({ data: makeDashApiResponse([makeDashPredictionData()]) });

            // Act
            const result = await getPredictionsForStop("stop-1");

            // Assert
            expect(result.success).toBe(true);
            expect(result.data.stop.id).toBe("stop-1");
            expect(result.data.stop.name).toBe("Stop stop-1");
            expect(result.data.stop.code).toBe(101);
        });

        it("returns the agency key from the DASH API response", async () => {
            // Arrange
            mockRepo.getStopById.mockReturnValue(makeStop("stop-1"));
            mockAxiosGet.mockResolvedValue({ data: makeDashApiResponse([makeDashPredictionData()]) });

            // Act
            const result = await getPredictionsForStop("stop-1");

            // Assert
            expect(result.data.agencyKey).toBe("alexandria-dash");
        });

        it("maps DASH predictionsData to RoutePrediction objects in the routes array", async () => {
            // Arrange
            mockRepo.getStopById.mockReturnValue(makeStop("stop-1"));
            const predData = makeDashPredictionData();
            mockAxiosGet.mockResolvedValue({ data: makeDashApiResponse([predData]) });

            // Act
            const result = await getPredictionsForStop("stop-1");

            // Assert
            expect(result.data.routes).toHaveLength(1);
            expect(result.data.routes[0]).toMatchObject({
                routeId: "route-1",
                routeShortName: "1A",
                stopId: "stop-1",
                stopCode: 101,
            });
        });

        it("maps destinations and predictions from DASH API data", async () => {
            // Arrange
            mockRepo.getStopById.mockReturnValue(makeStop("stop-1"));
            mockAxiosGet.mockResolvedValue({ data: makeDashApiResponse([makeDashPredictionData()]) });

            // Act
            const result = await getPredictionsForStop("stop-1");
            const [route] = result.data.routes;

            // Assert
            expect(route.destinations).toHaveLength(1);
            expect(route.destinations[0].headsign).toBe("Downtown");
            expect(route.destinations[0].predictions[0].min).toBe(5);
        });

        it("returns an empty routes array when DASH API returns no predictions", async () => {
            // Arrange
            mockRepo.getStopById.mockReturnValue(makeStop("stop-1"));
            mockAxiosGet.mockResolvedValue({ data: makeDashApiResponse([]) });

            // Act
            const result = await getPredictionsForStop("stop-1");

            // Assert
            expect(result.data.routes).toEqual([]);
        });

        it("throws when the DASH API call rejects", async () => {
            // Arrange
            mockRepo.getStopById.mockReturnValue(makeStop("stop-1"));
            mockAxiosGet.mockRejectedValue(new Error("network error"));

            // Act & Assert
            await expect(getPredictionsForStop("stop-1")).rejects.toThrow("network error");
        });

        it("throws an UpstreamApiError when the DASH API returns success: false", async () => {
            // Arrange
            mockRepo.getStopById.mockReturnValue(makeStop("stop-1"));
            const failResponse: DashApiResponse = {
                ...makeDashApiResponse(),
                success: false,
            };
            mockAxiosGet.mockResolvedValue({ data: failResponse });

            // Act & Assert
            await expect(getPredictionsForStop("stop-1")).rejects.toThrow(UpstreamApiError);
        });

        it("includes the stop id in the UpstreamApiError message when DASH API returns success: false", async () => {
            // Arrange
            mockRepo.getStopById.mockReturnValue(makeStop("stop-1"));
            const failResponse: DashApiResponse = {
                ...makeDashApiResponse(),
                success: false,
            };
            mockAxiosGet.mockResolvedValue({ data: failResponse });

            // Act & Assert
            await expect(getPredictionsForStop("stop-1")).rejects.toThrow("stop-1");
        });
    });
});
