import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { type MockInstance, afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { axios, logger } from "../../config";
import app from "../../test/app";
import { BusDataRepository, ServiceAlertRepository } from "../repositories";
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
});
