import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { type MockInstance, afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { axios, logger } from "../../config";
import app from "../../test/app";
import { BusDataRepository } from "../repositories";

let reply: { status: number; body?: unknown } = { status: 200 };

// Answers the routes call with whatever `reply` currently holds, so one test can walk DASH through
// success, failure, a malformed payload and success again against the real bounded client.
function startFakeDash(): Promise<http.Server> {
    const server = http.createServer((req, res) => {
        if (req.url !== "/info/test-agency/routes?verbose=true") {
            res.writeHead(404);
            res.end();
            return;
        }
        res.writeHead(reply.status, { "content-type": "application/json" });
        res.end(reply.body === undefined ? "" : JSON.stringify(reply.body));
    });
    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => resolve(server));
    });
}

function makeDashRoute(id: string, shortName: string, stopId: string, stopCode = "101") {
    return {
        id,
        shortName,
        longName: `Route ${shortName} Long`,
        name: `Route ${shortName}`,
        type: "3",
        directions: [
            {
                id: `${id}-d1`,
                title: "Northbound",
                headSigns: ["Downtown"],
                stops: [{ id: stopId, name: `Stop ${stopId}`, code: stopCode, lat: "38.8", lon: "-77.1" }],
            },
        ],
    };
}

const routesReply = (routes: ReturnType<typeof makeDashRoute>[]): { status: number; body: unknown } => ({
    status: 200,
    body: { data: { routes } },
});

describe("route/stop data reloads against a fake DASH", () => {
    let server: http.Server;
    let originalBaseUrl: string | undefined;
    let infoSpy: MockInstance;
    let warnSpy: MockInstance;
    let errorSpy: MockInstance;

    beforeAll(async () => {
        server = await startFakeDash();
        const { port } = server.address() as AddressInfo;
        originalBaseUrl = axios.defaults.baseURL;
        axios.defaults.baseURL = `http://127.0.0.1:${port}`;
    });

    afterAll(async () => {
        axios.defaults.baseURL = originalBaseUrl;
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    beforeEach(() => {
        infoSpy = vi.spyOn(logger, "info").mockImplementation(() => logger);
        warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);
        errorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // One sequence, because every route module holds the same singleton that app.ts was built on.
    it("keeps serving the last good routes through failed reloads and records when data last loaded and why the latest attempt failed", async () => {
        const repository = BusDataRepository.getInstance();

        // Step 1: a good load.
        // Arrange
        reply = routesReply([makeDashRoute("route-1", "1A", "stop-1")]);
        // Act
        const firstSummary = await repository.load();
        const firstResponse = await request(app).get("/api/v1/routes/all");
        const firstState = repository.getLoadState();
        // Assert
        expect(firstSummary).toEqual({ routeCount: 1, stopCount: 1 });
        expect(firstResponse.status).toBe(200);
        expect(firstResponse.body.map((route: { shortName: string }) => route.shortName)).toEqual(["1A"]);
        const goodBody = firstResponse.body;
        expect(firstState.lastLoadedAt).toBeInstanceOf(Date);
        expect(firstState.lastFailedAt).toBeUndefined();
        expect(firstState.lastError).toBeUndefined();
        const firstLoadedAt = firstState.lastLoadedAt as Date;

        // Step 2: DASH answers zero routes.
        // Arrange
        reply = routesReply([]);
        // Act
        const emptyLoad = repository.load();
        // Assert
        await expect(emptyLoad).rejects.toThrow("DASH API returned no routes");
        const emptyResponse = await request(app).get("/api/v1/routes/all");
        expect(emptyResponse.status).toBe(200);
        expect(emptyResponse.body).toEqual(goodBody);
        const emptyState = repository.getLoadState();
        expect(emptyState.lastLoadedAt?.getTime()).toBe(firstLoadedAt.getTime());
        expect(emptyState.lastFailedAt).toBeInstanceOf(Date);
        expect(emptyState.lastError).toBe("DASH API returned no routes");

        // Step 3: DASH answers 503.
        // Arrange
        reply = { status: 503 };
        // Act
        const unavailableLoad = repository.load();
        // Assert
        await expect(unavailableLoad).rejects.toThrow("DASH API request failed: Request failed with status code 503");
        const unavailableResponse = await request(app).get("/api/v1/routes/all");
        expect(unavailableResponse.status).toBe(200);
        expect(unavailableResponse.body).toEqual(goodBody);
        const unavailableState = repository.getLoadState();
        expect(unavailableState.lastError).toBe("DASH API request failed: Request failed with status code 503");
        expect(JSON.stringify(unavailableState)).not.toContain("test-api-key");

        // Step 4: DASH sends a stop with a null code and no coordinates at all.
        // Arrange
        reply = {
            status: 200,
            body: {
                data: {
                    routes: [
                        makeDashRoute("route-1", "1A", "stop-1"),
                        {
                            id: "route-3",
                            shortName: "3C",
                            type: "3",
                            directions: [
                                {
                                    id: "route-3-d1",
                                    title: "Northbound",
                                    headSigns: ["Downtown"],
                                    stops: [{ id: "stop-3", name: "Stop stop-3", code: null }],
                                },
                            ],
                        },
                    ],
                },
            },
        };
        // Act
        const malformedLoad = repository.load();
        // Assert
        await expect(malformedLoad).rejects.toThrow("Invalid stop code for stop 'stop-3': 'null'");
        const malformedResponse = await request(app).get("/api/v1/routes/all");
        expect(malformedResponse.status).toBe(200);
        expect(malformedResponse.body).toEqual(goodBody);
        const malformedRouteResponse = await request(app).get("/api/v1/routes/3C");
        expect(malformedRouteResponse.status).toBe(404);
        expect(malformedRouteResponse.body).toEqual({ error: "Not Found", details: "Route not found: 3C" });
        const malformedState = repository.getLoadState();
        expect(malformedState.lastLoadedAt?.getTime()).toBe(firstLoadedAt.getTime());
        expect(malformedState.lastFailedAt).toBeInstanceOf(Date);
        expect(malformedState.lastError).toBe("Invalid stop code for stop 'stop-3': 'null'");
        expect(JSON.stringify(malformedState)).not.toContain("test-api-key");

        // Step 5: DASH recovers with a different route order.
        // Arrange
        reply = routesReply([makeDashRoute("route-2", "2B", "stop-2"), makeDashRoute("route-1", "1A", "stop-1")]);
        // Act
        const recoveredSummary = await repository.load();
        const recoveredResponse = await request(app).get("/api/v1/routes/all");
        const recoveredState = repository.getLoadState();
        // Assert
        expect(recoveredSummary).toEqual({ routeCount: 2, stopCount: 2 });
        expect(recoveredResponse.status).toBe(200);
        expect(recoveredResponse.body.map((route: { shortName: string }) => route.shortName)).toEqual(["2B", "1A"]);
        expect(recoveredState.lastLoadedAt?.getTime()).toBeGreaterThanOrEqual(firstLoadedAt.getTime());
        expect(recoveredState.lastFailedAt).toBeUndefined();
        expect(recoveredState.lastError).toBeUndefined();

        // Step 6: nothing on this path logs; the background loader owns the per-attempt line.
        expect(infoSpy).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
    });
});
