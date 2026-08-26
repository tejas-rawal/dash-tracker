import { describe, expect, it } from "vitest";
import { haversineDistanceMiles } from "./distance";

describe("haversineDistanceMiles", () => {
    it("returns 0 for identical points", () => {
        // Arrange
        const point = { lat: 38.8, lon: -77.1 };

        // Act
        const result = haversineDistanceMiles(point, point);

        // Assert
        expect(result).toBe(0);
    });

    it("returns a positive number rounded to at most 2 decimal places for two known coordinate pairs roughly 1 mile apart", () => {
        // Arrange
        // ~0.0145 degrees latitude ≈ 1 mile at this latitude.
        const a = { lat: 38.8, lon: -77.1 };
        const b = { lat: 38.8145, lon: -77.1 };

        // Act
        const result = haversineDistanceMiles(a, b);

        // Assert
        expect(result).toBeGreaterThan(0);
        expect(result).toBeCloseTo(1, 0);
    });

    it("has at most 2 decimal places", () => {
        // Arrange
        const a = { lat: 38.8, lon: -77.1 };
        const b = { lat: 38.812345, lon: -77.098765 };

        // Act
        const result = haversineDistanceMiles(a, b);

        // Assert
        expect(Number(result.toFixed(2))).toBe(result);
    });

    it("is symmetric — distance(a, b) === distance(b, a)", () => {
        // Arrange
        const a = { lat: 38.8, lon: -77.1 };
        const b = { lat: 38.9, lon: -77.2 };

        // Act
        const forward = haversineDistanceMiles(a, b);
        const backward = haversineDistanceMiles(b, a);

        // Assert
        expect(forward).toBe(backward);
    });
});
