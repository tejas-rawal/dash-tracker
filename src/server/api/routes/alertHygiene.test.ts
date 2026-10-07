import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { type MockInstance, afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { axios, logger } from "../../config";
import app from "../../test/app";
import { BusDataRepository, ServiceAlertRepository } from "../repositories";
import { createServiceAlertPollService } from "../services/ServiceAlertPollService";
import { createServiceAlertService } from "../services/ServiceAlertService";

// Its own file because every route module shares the singletons test/app.ts was built on
// (dataReload.test.ts precedent). Route data is loaded once from a fake DASH, and alerts travel
// through the real ServiceAlertService into the real ServiceAlertRepository and out of the real
// endpoints, so the ingestion filter is proven where riders actually see alerts.

let alertsReply: unknown[] = [];

function startFakeDash(): Promise<http.Server> {
    const server = http.createServer((req, res) => {
        const { pathname } = new URL(req.url ?? "/", "http://fake-dash");
        if (pathname === "/info/test-agency/routes") {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ data: { routes: [makeDashRoute()] } }));
            return;
        }
        if (pathname === "/real-time/test-agency/gtfs-rt-alerts/v2") {
            // A bare top-level array is the confirmed live shape (G-05-5).
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify(alertsReply));
            return;
        }
        if (pathname === "/real-time/test-agency/predictions-near-location") {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(
                JSON.stringify({
                    success: true,
                    route: "/real-time/test-agency/predictions-near-location GET",
                    data: { agencyKey: "test-agency", predictionsData: [makeDashNearbyEntry()] },
                }),
            );
            return;
        }
        res.writeHead(404);
        res.end();
    });
    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => resolve(server));
    });
}

function makeDashRoute(): Record<string, unknown> {
    return {
        id: "route-1",
        shortName: "1A",
        longName: "Route 1A Long",
        name: "Route 1A",
        type: "3",
        directions: [
            {
                id: "route-1-d1",
                title: "Northbound",
                headSigns: ["Downtown"],
                stops: [{ id: "stop-1", name: "Stop stop-1", code: "101", lat: "38.8", lon: "-77.1" }],
            },
        ],
    };
}

// The live alexandria-dash nearby shape, with every display field present and non-empty so it
// passes both the current entry guard and the tightened NEAR-12 guard (15-02).
function makeDashNearbyEntry(): Record<string, unknown> {
    return {
        routeShortName: "1A",
        routeName: "1A - Main",
        routeId: "route-1",
        stopId: "stop-1",
        stopName: "Stop stop-1",
        stopCode: 101,
        destinations: [
            {
                directionId: "0",
                headsign: "Downtown",
                predictions: [{ time: 1790192451, sec: 318, min: 5, tripId: "trip-1", vehicleId: "vehicle-1" }],
            },
        ],
        distanceToStop: 10,
    };
}

// The confirmed live flat shape; live alerts carry deletedAt and deletedBy as null.
function makeDashAlert(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id,
        cause: "CONSTRUCTION",
        effect: "DETOUR",
        headerText: `Header ${id}`,
        descriptionText: `Description ${id}`,
        activePeriods: [{ start: "2020-01-01T00:00:00.000Z", end: null }],
        informedEntities: [{ routeId: "route-1", stopId: "stop-1" }],
        deletedAt: null,
        deletedBy: null,
        ...overrides,
    };
}

// The same two calls ServiceAlertPollService.pollAlerts makes.
async function applyAlertsFromDash(): Promise<void> {
    ServiceAlertRepository.getInstance().applyAlerts(await createServiceAlertService().fetchAlerts());
}

describe("service alert hygiene from DASH to rider responses", () => {
    let server: http.Server;
    let originalBaseUrl: string | undefined;
    let warnSpy: MockInstance;
    let errorSpy: MockInstance;

    beforeAll(async () => {
        server = await startFakeDash();
        const { port } = server.address() as AddressInfo;
        originalBaseUrl = axios.defaults.baseURL;
        axios.defaults.baseURL = `http://127.0.0.1:${port}`;
        await BusDataRepository.getInstance().load();
    });

    afterAll(async () => {
        axios.defaults.baseURL = originalBaseUrl;
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    beforeEach(() => {
        vi.spyOn(logger, "info").mockImplementation(() => logger);
        warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);
        errorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
    });

    afterEach(() => {
        ServiceAlertRepository.getInstance().applyAlerts([]);
        vi.restoreAllMocks();
    });

    it("never shows a soft-deleted alert on the route response, even while its active window covers now", async () => {
        // Arrange
        alertsReply = [
            makeDashAlert("alert-live"),
            makeDashAlert("alert-deleted", { deletedAt: "2020-06-01T00:00:00.000Z", deletedBy: "dash-admin" }),
        ];

        // Act
        await applyAlertsFromDash();
        const response = await request(app).get("/api/v1/routes/1A");

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.alerts.map((alert: { id: string }) => alert.id)).toEqual(["alert-live"]);
        const body = JSON.stringify(response.body);
        expect(body).not.toContain("alert-deleted");
        expect(body).not.toContain("dash-admin");
        expect(warnSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it("shows only the well-formed, undeleted alert on route, route-list, route-stop, nearby-stop and nearby-prediction responses", async () => {
        // Arrange
        alertsReply = [
            makeDashAlert("alert-live"),
            makeDashAlert("alert-deleted-past", { deletedAt: "2020-06-01T00:00:00.000Z", deletedBy: "dash-admin" }),
            makeDashAlert("alert-deleted-future", { deletedAt: "2099-01-01T00:00:00.000Z" }),
            makeDashAlert("alert-deleted-garbled", { deletedAt: "not-a-timestamp" }),
            makeDashAlert("alert-bad-start", { activePeriods: [{ start: "not-a-date", end: null }] }),
            makeDashAlert("alert-deleted-bad-date", {
                deletedAt: "2020-06-01T00:00:00.000Z",
                activePeriods: [{ start: "not-a-date", end: null }],
            }),
        ];

        // Act
        await applyAlertsFromDash();
        const warnLines = warnSpy.mock.calls.map((call) => call[0]);
        const route = await request(app).get("/api/v1/routes/1A");
        const routeList = await request(app).get("/api/v1/routes/all");
        const routeStops = await request(app).get("/api/v1/routes/1A/stops");
        const nearbyStops = await request(app).get("/api/v1/stops/nearby?lat=38.8&lng=-77.1");
        const nearbyPredictions = await request(app).get("/api/v1/predictions/nearby?lat=38.8&lng=-77.1");

        // Assert
        const ids = (alerts: { id: string }[]): string[] => alerts.map((alert) => alert.id);
        for (const response of [route, routeList, routeStops, nearbyStops, nearbyPredictions]) {
            expect(response.status).toBe(200);
            const body = JSON.stringify(response.body);
            expect(body).not.toContain("deletedAt");
            expect(body).not.toContain("deletedBy");
            expect(body).not.toContain("dash-admin");
        }
        expect(ids(route.body.alerts)).toEqual(["alert-live"]);
        expect(ids(routeList.body.find((item: { shortName: string }) => item.shortName === "1A").alerts)).toEqual([
            "alert-live",
        ]);
        expect(ids(routeStops.body[0].stops[0].alerts)).toEqual(["alert-live"]);
        expect(ids(nearbyStops.body.find((stop: { id: string }) => stop.id === "stop-1").alerts)).toEqual([
            "alert-live",
        ]);
        expect(nearbyPredictions.body.data.stops[0].id).toBe("stop-1");
        expect(ids(nearbyPredictions.body.data.stops[0].alerts)).toEqual(["alert-live"]);
        expect(route.body.alerts[0]).toEqual({
            id: "alert-live",
            cause: "CONSTRUCTION",
            effect: "DETOUR",
            headerText: "Header alert-live",
            descriptionText: "Description alert-live",
            activePeriod: { start: "2020-01-01T00:00:00.000Z", end: null },
        });
        expect(warnLines).toEqual(["Dropping service alert alert-bad-start with a malformed activePeriods start date"]);
    });

    it("keeps applying alert updates through the real poll when one alert has a malformed date (D-01)", async () => {
        // Arrange
        alertsReply = [makeDashAlert("alert-old")];
        const repository = ServiceAlertRepository.getInstance();
        const poller = createServiceAlertPollService(createServiceAlertService(), ServiceAlertRepository.getInstance());
        const activeIds = (): string[] => repository.getActiveAlerts().map((alert) => alert.id);

        try {
            // Step 1: a clean poll.
            // Act
            poller.start();
            // Assert
            await vi.waitFor(() => expect(activeIds()).toEqual(["alert-old"]));
            poller.stop();

            // Step 2: the next poll carries a malformed-date alert next to a good one.
            // Arrange
            alertsReply = [
                makeDashAlert("alert-new"),
                makeDashAlert("alert-bad-end", {
                    activePeriods: [{ start: "2020-01-01T00:00:00.000Z", end: "garbage" }],
                }),
            ];
            // Act
            poller.start();
            await vi.waitFor(() => expect(activeIds()).toEqual(["alert-new"]));
            const response = await request(app).get("/api/v1/routes/1A");
            // Assert
            expect(response.status).toBe(200);
            expect(response.body.alerts.map((alert: { id: string }) => alert.id)).toEqual(["alert-new"]);
            expect(errorSpy).not.toHaveBeenCalled();
            expect(warnSpy).toHaveBeenCalledWith(
                "Dropping service alert alert-bad-end with a malformed activePeriods end date",
            );
        } finally {
            poller.stop();
        }
    });
});
