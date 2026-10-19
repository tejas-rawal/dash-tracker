import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { type MockInstance, afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { axios, logger } from "../../config";
import app from "../../test/app";
import { BusDataRepository } from "../repositories";
import { type BusDataRefreshService, createBusDataRefreshService } from "../services/BusDataRefreshService";

let routesRequestCount = 0;

// Fails the first routes call with a 503, then serves one route, so the loader's retry is what turns
// the app from 503 to 200.
function startFakeDash(): Promise<http.Server> {
    const server = http.createServer((req, res) => {
        if (req.url !== "/info/test-agency/routes?verbose=true") {
            res.writeHead(404);
            res.end();
            return;
        }
        routesRequestCount += 1;
        if (routesRequestCount === 1) {
            res.writeHead(503);
            res.end();
            return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
            JSON.stringify({
                data: {
                    routes: [
                        {
                            id: "route-1",
                            shortName: "1A",
                            type: "3",
                            directions: [
                                {
                                    id: "route-1-d1",
                                    title: "Northbound",
                                    headSigns: ["Downtown"],
                                    stops: [{ id: "stop-1", name: "Main St", code: "101", lat: "38.8", lon: "-77.1" }],
                                },
                            ],
                        },
                    ],
                },
            }),
        );
    });
    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => resolve(server));
    });
}

describe("background route/stop data load at boot", () => {
    let dashServer: http.Server;
    // One server for the file, as in rateLimit.test.ts: a per-request server plus Node 20's keep-alive agent can
    // land a request on an earlier, closed server.
    let appServer: http.Server;
    let originalBaseUrl: string | undefined;
    let infoSpy: MockInstance;
    let warnSpy: MockInstance;
    let errorSpy: MockInstance;
    let service: BusDataRefreshService | undefined;

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
        infoSpy = vi.spyOn(logger, "info").mockImplementation(() => logger);
        warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);
        errorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
        // Pins the first backoff delay to its 500 ms floor.
        vi.spyOn(Math, "random").mockReturnValue(0);
    });

    afterEach(() => {
        service?.stop();
        vi.restoreAllMocks();
    });

    it("answers 503 until the background loader's first successful load, then 200 without a restart", async () => {
        // Arrange
        const repository = BusDataRepository.getInstance();
        service = createBusDataRefreshService(repository);

        // Act
        service.start();
        const loadingResponse = await request(appServer).get("/api/v1/routes/all");

        // Assert
        expect(loadingResponse.status).toBe(503);
        expect(loadingResponse.headers["retry-after"]).toBe("5");

        // Act
        await vi.waitFor(() => expect(repository.getLoadState().lastLoadedAt).toBeInstanceOf(Date), {
            timeout: 3000,
        });
        const routesResponse = await request(appServer).get("/api/v1/routes/all");
        const stopsResponse = await request(appServer).get("/api/v1/routes/1A/stops");

        // Assert
        expect(routesResponse.status).toBe(200);
        expect(routesResponse.body.map((route: { shortName: string }) => route.shortName)).toEqual(["1A"]);
        expect(stopsResponse.status).toBe(200);
        expect(routesRequestCount).toBe(2);
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(
            "Route/stop data load attempt 1 failed: DASH API request failed: Request failed with status code 503; next attempt in 500ms",
        );
        expect(infoSpy).toHaveBeenCalledWith("Route/stop data loaded on attempt 2: 1 routes, 1 stops");
        expect(errorSpy).not.toHaveBeenCalled();
        const logged = JSON.stringify([infoSpy.mock.calls, warnSpy.mock.calls, errorSpy.mock.calls]);
        expect(logged).not.toContain("test-api-key");
    });
});
