import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DashAlertEntity, DashAlertsApiResponse, ServiceAlert } from "../models/ServiceAlert";

vi.mock("../../config", () => ({
    axios: { get: vi.fn() },
    environment: {
        dashApi: { agency: "alexandria-dash", baseUrl: "https://api.goswift.ly", apiKey: "key" },
        server: { port: 3000 },
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { axios } from "../../config";
import { createServiceAlertService } from "../services/ServiceAlertService";
import { ServiceAlertRepository } from "./ServiceAlertRepository";

const mockAxiosGet = vi.mocked(axios.get);

const makeAlert = (overrides: Partial<ServiceAlert> = {}): ServiceAlert => ({
    id: "alert-1",
    informedRouteIds: [],
    informedStopIds: [],
    activePeriod: { start: null, end: null },
    ...overrides,
});

describe("ServiceAlertRepository", () => {
    let repo: ServiceAlertRepository;

    beforeEach(() => {
        vi.clearAllMocks();
        // @ts-expect-error accessing private static for test isolation
        ServiceAlertRepository.instance = undefined;
        repo = ServiceAlertRepository.getInstance();
    });

    afterEach(() => {
        // @ts-expect-error accessing private static for test isolation
        ServiceAlertRepository.instance = undefined;
    });

    describe("getInstance", () => {
        it("always returns the same singleton instance", () => {
            // Arrange & Act
            const instance1 = ServiceAlertRepository.getInstance();
            const instance2 = ServiceAlertRepository.getInstance();

            // Assert
            expect(instance1).toBe(instance2);
        });
    });

    describe("getActiveAlerts", () => {
        it("returns an empty array before any applyAlerts() call", () => {
            // Arrange & Act
            const alerts = repo.getActiveAlerts();

            // Assert
            expect(alerts).toEqual([]);
        });

        it("does not throw when called before any applyAlerts() call", () => {
            // Act & Assert
            expect(() => repo.getActiveAlerts()).not.toThrow();
        });

        it("includes an alert whose window contains referenceTime", () => {
            // Arrange
            const referenceTime = new Date("2026-01-01T12:00:00.000Z");
            const active = makeAlert({
                id: "active-alert",
                activePeriod: { start: "2026-01-01T11:00:00.000Z", end: "2026-01-01T13:00:00.000Z" },
            });
            repo.applyAlerts([active]);

            // Act
            const alerts = repo.getActiveAlerts(referenceTime);

            // Assert
            expect(alerts.map((a) => a.id)).toEqual(["active-alert"]);
        });

        it("excludes an alert whose end is before referenceTime", () => {
            // Arrange
            const referenceTime = new Date("2026-01-01T12:00:00.000Z");
            const expired = makeAlert({
                id: "expired-alert",
                activePeriod: { start: "2026-01-01T09:00:00.000Z", end: "2026-01-01T10:00:00.000Z" },
            });
            repo.applyAlerts([expired]);

            // Act
            const alerts = repo.getActiveAlerts(referenceTime);

            // Assert
            expect(alerts).toEqual([]);
        });

        it("excludes an alert whose start is after referenceTime", () => {
            // Arrange
            const referenceTime = new Date("2026-01-01T12:00:00.000Z");
            const future = makeAlert({
                id: "future-alert",
                activePeriod: { start: "2026-01-01T14:00:00.000Z", end: "2026-01-01T15:00:00.000Z" },
            });
            repo.applyAlerts([future]);

            // Act
            const alerts = repo.getActiveAlerts(referenceTime);

            // Assert
            expect(alerts).toEqual([]);
        });
    });

    describe("applyAlerts", () => {
        it("fully replaces the store on each call (no accumulation across calls)", () => {
            // Arrange
            const referenceTime = new Date("2026-01-01T12:00:00.000Z");
            const alwaysActive = { start: null, end: null } as const;
            repo.applyAlerts([makeAlert({ id: "alert-1", activePeriod: alwaysActive })]);
            repo.applyAlerts([makeAlert({ id: "alert-2", activePeriod: alwaysActive })]);

            // Act
            const alerts = repo.getActiveAlerts(referenceTime);

            // Assert
            expect(alerts.map((a) => a.id)).toEqual(["alert-2"]);
        });
    });

    describe("end-to-end: fetch -> normalize -> filter-active -> query", () => {
        it("surfaces exactly the alerts active at fixedNow and nothing else", async () => {
            // Arrange
            const fixedNow = new Date("2026-01-01T12:00:00.000Z");
            const activeEntity: DashAlertEntity = {
                id: "active-alert",
                alert: {
                    active_period: [{ start: 1_767_265_200, end: 1_767_272_400 }], // 2026-01-01T11:00-13:00Z
                    informed_entity: [{ route_id: "route-1" }],
                    cause: "MAINTENANCE",
                    effect: "DETOUR",
                },
            };
            const expiredEntity: DashAlertEntity = {
                id: "expired-alert",
                alert: {
                    active_period: [{ start: 1_767_250_800, end: 1_767_254_400 }], // 2026-01-01T07:00-08:00Z
                    informed_entity: [{ route_id: "route-2" }],
                    cause: "MAINTENANCE",
                    effect: "DETOUR",
                },
            };
            const response: DashAlertsApiResponse = { entity: [activeEntity, expiredEntity] };
            mockAxiosGet.mockResolvedValue({ data: response });

            const service = createServiceAlertService();

            // Act
            const fetchedAlerts = await service.fetchAlerts();
            repo.applyAlerts(fetchedAlerts);
            const activeAlerts = repo.getActiveAlerts(fixedNow);

            // Assert
            expect(activeAlerts).toHaveLength(1);
            expect(activeAlerts[0].id).toBe("active-alert");
        });
    });
});
