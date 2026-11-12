import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { axios, logger } from "../../config";
import app from "../../test/app";
import { BusDataRepository } from "../repositories";

let routesBody: unknown = { data: { routes: [] } };

// Answers the routes call with `routesBody`, so the test drives the real repository load from a
// DASH-shaped payload instead of a mocked axios.
function startFakeDash(): Promise<http.Server> {
    const server = http.createServer((req, res) => {
        if (req.url !== "/info/test-agency/routes?verbose=true") {
            res.writeHead(404);
            res.end();
            return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(routesBody));
    });
    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => resolve(server));
    });
}

// The base route carries live route 30's colors, as captured in 18-dash-routes-payload.txt.
function makeDashRoute(id: string, shortName: string, overrides: Record<string, unknown> = {}) {
    return {
        id,
        shortName,
        longName: `Route ${shortName} Long`,
        name: `Route ${shortName}`,
        type: "3",
        color: "006899",
        textColor: "ffffff",
        directions: [
            {
                id: `${id}-d1`,
                title: "Northbound",
                headSigns: ["Downtown"],
                stops: [{ id: `${id}-stop`, name: `Stop ${id}`, code: "101", lat: "38.8", lon: "-77.1" }],
            },
        ],
        ...overrides,
    };
}

describe("route colors from DASH reach the route responses", () => {
    let dashServer: http.Server;
    // One server for the file, as in dataReload.test.ts: a per-request server plus the keep-alive agent can
    // land a request on an earlier, closed server.
    let appServer: http.Server;
    let originalBaseUrl: string | undefined;

    beforeAll(async () => {
        dashServer = await startFakeDash();
        const { port } = dashServer.address() as AddressInfo;
        originalBaseUrl = axios.defaults.baseURL;
        axios.defaults.baseURL = `http://127.0.0.1:${port}`;
        appServer = app.listen(0);
        await new Promise<void>((resolve) => appServer.once("listening", () => resolve()));
    });

    afterAll(async () => {
        axios.defaults.baseURL = originalBaseUrl;
        appServer.closeAllConnections();
        dashServer.closeAllConnections();
        await Promise.all([
            new Promise<void>((resolve) => appServer.close(() => resolve())),
            new Promise<void>((resolve) => dashServer.close(() => resolve())),
        ]);
    });

    beforeEach(() => {
        vi.spyOn(logger, "info").mockImplementation(() => logger);
        vi.spyOn(logger, "warn").mockImplementation(() => logger);
        vi.spyOn(logger, "error").mockImplementation(() => logger);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("serves each route's color and textColor exactly as DASH sent them on /routes/all and /routes/:shortName", async () => {
        // Arrange
        routesBody = {
            data: {
                routes: [
                    makeDashRoute("30", "30"),
                    makeDashRoute("36B", "36B", { color: "eda0d3", textColor: "ffffff" }),
                ],
            },
        };
        await BusDataRepository.getInstance().load();

        // Act
        const allResponse = await request(appServer).get("/api/v1/routes/all");
        const routeResponse = await request(appServer).get("/api/v1/routes/36B");

        // Assert
        expect(allResponse.status).toBe(200);
        expect(
            allResponse.body.map((route: { shortName: string; color?: string; textColor?: string }) => ({
                shortName: route.shortName,
                color: route.color,
                textColor: route.textColor,
            })),
        ).toEqual([
            { shortName: "30", color: "006899", textColor: "ffffff" },
            { shortName: "36B", color: "eda0d3", textColor: "ffffff" },
        ]);
        expect(routeResponse.status).toBe(200);
        expect(routeResponse.body.color).toBe("eda0d3");
        expect(routeResponse.body.textColor).toBe("ffffff");
    });
});
