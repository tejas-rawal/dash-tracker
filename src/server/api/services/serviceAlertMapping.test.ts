import { describe, expect, it } from "vitest";
import type { ServiceAlert } from "../models/ServiceAlert";
import { mapToServiceAlertSummaries, mapToServiceAlertSummary } from "./serviceAlertMapping";

const makeAlert = (overrides: Partial<ServiceAlert> = {}): ServiceAlert => ({
    id: "alert-1",
    cause: "MAINTENANCE",
    effect: "DETOUR",
    headerText: "Header",
    descriptionText: "Description",
    url: "https://example.com/alert-1",
    informedRouteIds: ["route-1"],
    informedStopIds: ["stop-1"],
    activePeriod: { start: null, end: null },
    ...overrides,
});

describe("mapToServiceAlertSummary", () => {
    it("returns exactly id, cause, effect, headerText, descriptionText, activePeriod", () => {
        // Arrange
        const alert = makeAlert();

        // Act
        const summary = mapToServiceAlertSummary(alert);

        // Assert
        expect(summary).toEqual({
            id: "alert-1",
            cause: "MAINTENANCE",
            effect: "DETOUR",
            headerText: "Header",
            descriptionText: "Description",
            activePeriod: { start: null, end: null },
        });
    });

    it("never includes url, informedRouteIds, or informedStopIds even when populated on the input", () => {
        // Arrange
        const alert = makeAlert({
            url: "https://example.com/alert-1",
            informedRouteIds: ["route-1", "route-2"],
            informedStopIds: ["stop-1", "stop-2"],
        });

        // Act
        const summary = mapToServiceAlertSummary(alert);

        // Assert
        expect(summary).not.toHaveProperty("url");
        expect(summary).not.toHaveProperty("informedRouteIds");
        expect(summary).not.toHaveProperty("informedStopIds");
    });
});

describe("mapToServiceAlertSummaries", () => {
    it("maps an array via mapToServiceAlertSummary, preserving input order", () => {
        // Arrange
        const alerts = [makeAlert({ id: "first" }), makeAlert({ id: "second" })];

        // Act
        const summaries = mapToServiceAlertSummaries(alerts);

        // Assert
        expect(summaries.map((s) => s.id)).toEqual(["first", "second"]);
    });

    it("returns [] for an empty input array", () => {
        // Arrange & Act
        const summaries = mapToServiceAlertSummaries([]);

        // Assert
        expect(summaries).toEqual([]);
    });
});
