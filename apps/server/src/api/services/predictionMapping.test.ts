import { describe, expect, it } from "vitest";
import type { DashPredictionData } from "../models/Prediction";
import { mapToRoutePrediction, mapToRoutePredictions } from "./predictionMapping";

const makeDashPredictionData = (overrides: Partial<DashPredictionData> = {}): DashPredictionData => ({
    routeId: "30",
    routeName: "30 - DUKE",
    routeShortName: "30",
    stopId: "548",
    stopName: "King St + N Washington St",
    stopCode: 4000858,
    destinations: [
        {
            directionId: "0",
            headsign: "Van Dorn Street Station",
            predictions: [{ min: 5, sec: 318, time: 1790192451, tripId: "405020", vehicleId: "0212" }],
        },
    ],
    ...overrides,
});

describe("mapToRoutePrediction", () => {
    it("copies the route and stop fields and maps destinations", () => {
        // Arrange
        const item = makeDashPredictionData();

        // Act
        const result = mapToRoutePrediction(item);

        // Assert
        expect(result).toEqual({
            routeId: "30",
            routeName: "30 - DUKE",
            routeShortName: "30",
            stopId: "548",
            stopName: "King St + N Washington St",
            stopCode: 4000858,
            destinations: [
                {
                    directionId: "0",
                    headsign: "Van Dorn Street Station",
                    predictions: [{ min: 5, sec: 318, time: 1790192451, tripId: "405020", vehicleId: "0212" }],
                },
            ],
        });
    });

    it("drops the upstream block identifier from predictions", () => {
        // Arrange
        const prediction = { min: 5, sec: 318, time: 1790192451, blockId: "0061", tripId: "405020", vehicleId: "0212" };
        const item = makeDashPredictionData({
            destinations: [{ directionId: "0", headsign: "Van Dorn Street Station", predictions: [prediction] }],
        });

        // Act
        const result = mapToRoutePrediction(item);

        // Assert
        expect(result.destinations[0].predictions[0]).not.toHaveProperty("blockId");
        expect(Object.keys(result.destinations[0].predictions[0]).sort()).toEqual([
            "min",
            "sec",
            "time",
            "tripId",
            "vehicleId",
        ]);
    });

    it("keeps a destination whose predictions are empty", () => {
        // Arrange
        const item = makeDashPredictionData({
            destinations: [{ directionId: "0", headsign: "Lee Center", predictions: [] }],
        });

        // Act
        const result = mapToRoutePrediction(item);

        // Assert
        expect(result.destinations).toEqual([{ directionId: "0", headsign: "Lee Center", predictions: [] }]);
    });
});

describe("mapToRoutePredictions", () => {
    it("preserves input order", () => {
        // Arrange
        const items = [
            makeDashPredictionData({ routeShortName: "31" }),
            makeDashPredictionData({ routeShortName: "30" }),
            makeDashPredictionData({ routeShortName: "34" }),
        ];

        // Act
        const result = mapToRoutePredictions(items);

        // Assert
        expect(result.map((route) => route.routeShortName)).toEqual(["31", "30", "34"]);
    });

    it("maps an empty array to an empty array", () => {
        // Arrange & Act
        const result = mapToRoutePredictions([]);

        // Assert
        expect(result).toEqual([]);
    });
});
