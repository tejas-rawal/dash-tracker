import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { type MockInstance, afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { axios, logger } from "../../config";
import app from "../../test/app";
import { BusDataRepository } from "../repositories";

const PREDICTIONS_PREFIX = "/real-time/test-agency/predictions?stop=";

let currentRoutes: unknown[] = [];
let predictionRequests: Record<string, number> = {};

// Serves whatever `currentRoutes` holds and counts prediction calls per stop, so the test can prove a
// stranded stream never reaches DASH again after its stop is dropped.
function startFakeDash(): Promise<http.Server> {
    const server = http.createServer((req, res) => {
        const url = req.url ?? "";
        if (url === "/info/test-agency/routes?verbose=true") {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ data: { routes: currentRoutes } }));
            return;
        }
        if (url.startsWith(PREDICTIONS_PREFIX)) {
            const stopId = url.slice(PREDICTIONS_PREFIX.length);
            predictionRequests[stopId] = (predictionRequests[stopId] ?? 0) + 1;
            res.writeHead(200, { "content-type": "application/json" });
            res.end(
                JSON.stringify({
                    success: true,
                    route: "",
                    data: { agencyKey: "alexandria-dash", predictionsData: [] },
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

function makeDashRoute(id: string, shortName: string, stopIds: string[]) {
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
                stops: stopIds.map((stopId) => ({
                    id: stopId,
                    name: `Stop ${stopId}`,
                    code: "101",
                    lat: "38.8",
                    lon: "-77.1",
                })),
            },
        ],
    };
}

const countOccurrences = (text: string, needle: string): number => text.split(needle).length - 1;

describe("live prediction streams across route/stop reloads against a fake DASH", () => {
    let dashServer: http.Server;
    let appServer: http.Server;
    let appPort: number;
    let originalBaseUrl: string | undefined;
    let infoSpy: MockInstance;
    let warnSpy: MockInstance;
    let errorSpy: MockInstance;

    beforeAll(async () => {
        dashServer = await startFakeDash();
        const { port } = dashServer.address() as AddressInfo;
        originalBaseUrl = axios.defaults.baseURL;
        axios.defaults.baseURL = `http://127.0.0.1:${port}`;
        appServer = app.listen(0);
        appPort = (appServer.address() as AddressInfo).port;
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
        predictionRequests = {};
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("ends a live prediction stream when a reload drops its stop, and the stop then answers 404", async () => {
        const repository = BusDataRepository.getInstance();

        // Step 1: stop-1 is in the loaded dataset.
        // Arrange
        currentRoutes = [makeDashRoute("route-1", "1A", ["stop-1", "stop-2"])];
        await repository.load();
        // Only the 30 s poll is fake; http, AbortSignal.timeout and setTimeout stay real.
        vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });

        // Step 2: a rider opens a stream on stop-1.
        // Act
        let text = "";
        let statusCode: number | undefined;
        let contentType: string | undefined;
        let resolveFirstChunk: () => void = () => {};
        const firstChunk = new Promise<void>((resolve) => {
            resolveFirstChunk = resolve;
        });
        let resolveEnd: () => void = () => {};
        const ended = new Promise<void>((resolve) => {
            resolveEnd = resolve;
        });
        const req = http.get(`http://127.0.0.1:${appPort}/api/v1/predictions/stream?stop=stop-1`, (res) => {
            statusCode = res.statusCode;
            contentType = res.headers["content-type"];
            res.on("data", (chunk: Buffer) => {
                text += chunk.toString();
                resolveFirstChunk();
            });
            res.on("end", () => resolveEnd());
        });
        req.on("error", () => {
            // The server ending the stream is the expected outcome; a socket error here would fail the
            // end-of-stream assertion below instead.
        });
        const endedInTime = Promise.race([
            ended,
            new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error("stream was not ended within 2000 ms")), 2000);
            }),
        ]);
        await firstChunk;

        // Step 3: the stream is open and carries the initial frame from one DASH call.
        // Assert
        expect(statusCode).toBe(200);
        expect(contentType).toMatch(/^text\/event-stream/);
        expect(text).toContain("event: prediction");
        expect(text).toContain("stop-1");
        expect(predictionRequests["stop-1"]).toBe(1);

        // Step 4: a reload drops stop-1, then the next poll tick runs.
        // Arrange
        currentRoutes = [makeDashRoute("route-1", "1A", ["stop-2"])];
        // Act
        const reloadSummary = await repository.load();
        await vi.advanceTimersByTimeAsync(30_000);

        // Step 5: the server ended the stream without another frame or another DASH call.
        // Assert
        expect(reloadSummary).toEqual({ routeCount: 1, stopCount: 1 });
        await expect(endedInTime).resolves.toBeUndefined();
        expect(countOccurrences(text, "event: prediction")).toBe(1);
        expect(predictionRequests["stop-1"]).toBe(1);
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith("Ending 1 prediction stream(s) for stop stop-1: Stop not found: stop-1");
        expect(errorSpy).not.toHaveBeenCalled();

        // Step 6: the reconnect gets the existing 404 contract, and no zombie loop keeps polling.
        // Act
        const reconnect = await request(app).get("/api/v1/predictions/stream?stop=stop-1");
        await vi.advanceTimersByTimeAsync(60_000);
        // Assert
        expect(reconnect.status).toBe(404);
        expect(reconnect.body).toEqual({ error: "Not Found", details: "Stop not found: stop-1" });
        expect(predictionRequests["stop-1"]).toBe(1);
        expect(warnSpy).toHaveBeenCalledTimes(1);

        // Step 7: no log line carries the DASH key.
        // Assert
        const loggedText = JSON.stringify([infoSpy.mock.calls, warnSpy.mock.calls, errorSpy.mock.calls]);
        expect(loggedText).not.toContain("test-api-key");
    });
});
