import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { NotFoundError, UpstreamApiError } from "../errors";
import type { StopPredictionsResponse } from "../models/Prediction";

vi.mock("../services/PredictionService", () => ({
    createPredictionService: vi.fn(() => ({
        getPredictionsForStop: vi.fn(),
    })),
}));

import app from "../../test/app";
import { createPredictionService } from "../services/PredictionService";

const getMockService = () => vi.mocked(createPredictionService).mock.results[0]?.value;

const makeStopPredictionsResponse = (stopId = "stop-1"): StopPredictionsResponse => ({
    success: true,
    generatedAt: "2026-01-01T00:00:00.000Z",
    data: {
        agencyKey: "alexandria-dash",
        stop: { id: stopId, name: "Main St", code: 101 },
        routes: [
            {
                routeId: "route-1",
                routeName: "Route 1A Long",
                routeShortName: "1A",
                stopId,
                stopName: "Main St",
                stopCode: 101,
                destinations: [
                    {
                        directionId: "d1",
                        headsign: "Downtown",
                        predictions: [{ min: 5, sec: 300, time: 1700000300, tripId: "trip-1", vehicleId: "v-1" }],
                    },
                ],
            },
        ],
    },
});

describe("GET /api/v1/predictions", () => {
    it("responds with 400 when stop query parameter is missing", async () => {
        // Arrange & Act
        const response = await request(app).get("/api/v1/predictions");

        // Assert
        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
            error: "Bad Request",
            details: "stop parameter is required",
        });
    });

    it("responds with 400 when number parameter is not a positive integer", async () => {
        // Arrange & Act
        const response = await request(app).get("/api/v1/predictions?stop=stop-1&number=abc");

        // Assert
        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
            error: "Bad Request",
            details: "number parameter must be a positive integer",
        });
    });

    it("responds with 400 when number parameter is zero", async () => {
        // Arrange & Act
        const response = await request(app).get("/api/v1/predictions?stop=stop-1&number=0");

        // Assert
        expect(response.status).toBe(400);
    });

    it("responds with 200 and the predictions payload on success", async () => {
        // Arrange
        const payload = makeStopPredictionsResponse("stop-1");
        getMockService().getPredictionsForStop.mockResolvedValue(payload);

        // Act
        const response = await request(app).get("/api/v1/predictions?stop=stop-1");

        // Assert
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            success: true,
            data: {
                stop: { id: "stop-1", name: "Main St", code: 101 },
            },
        });
    });

    it("passes the stop id to the service", async () => {
        // Arrange
        getMockService().getPredictionsForStop.mockResolvedValue(makeStopPredictionsResponse("stop-42"));

        // Act
        await request(app).get("/api/v1/predictions?stop=stop-42");

        // Assert
        expect(getMockService().getPredictionsForStop).toHaveBeenCalledWith("stop-42", expect.any(Object));
    });

    it("passes the parsed number option to the service", async () => {
        // Arrange
        getMockService().getPredictionsForStop.mockResolvedValue(makeStopPredictionsResponse());

        // Act
        await request(app).get("/api/v1/predictions?stop=stop-1&number=5");

        // Assert
        expect(getMockService().getPredictionsForStop).toHaveBeenCalledWith(
            "stop-1",
            expect.objectContaining({ number: 5 }),
        );
    });

    it("passes the route option to the service", async () => {
        // Arrange
        getMockService().getPredictionsForStop.mockResolvedValue(makeStopPredictionsResponse());

        // Act
        await request(app).get("/api/v1/predictions?stop=stop-1&route=1A");

        // Assert
        expect(getMockService().getPredictionsForStop).toHaveBeenCalledWith(
            "stop-1",
            expect.objectContaining({ route: "1A" }),
        );
    });

    it("responds with 404 when the service throws a NotFoundError", async () => {
        // Arrange
        getMockService().getPredictionsForStop.mockRejectedValue(new NotFoundError("Stop not found: stop-1"));

        // Act
        const response = await request(app).get("/api/v1/predictions?stop=stop-1");

        // Assert
        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({
            error: "Not Found",
            details: "Stop not found: stop-1",
        });
    });

    it("responds with 500 when the service throws a generic error", async () => {
        // Arrange
        getMockService().getPredictionsForStop.mockRejectedValue(new Error("upstream failure"));

        // Act
        const response = await request(app).get("/api/v1/predictions?stop=stop-1");

        // Assert
        expect(response.status).toBe(500);
        expect(response.body).toMatchObject({
            error: "Request Failed",
            details: "upstream failure",
        });
    });

    it("responds with 502 when the service throws an UpstreamApiError", async () => {
        // Arrange
        getMockService().getPredictionsForStop.mockRejectedValue(
            new UpstreamApiError("DASH API returned success: false for stop stop-1"),
        );

        // Act
        const response = await request(app).get("/api/v1/predictions?stop=stop-1");

        // Assert
        expect(response.status).toBe(502);
        expect(response.body).toMatchObject({
            error: "Bad Gateway",
            details: "DASH API returned success: false for stop stop-1",
        });
    });

    it("returns route data including destinations and predictions", async () => {
        // Arrange
        getMockService().getPredictionsForStop.mockResolvedValue(makeStopPredictionsResponse());

        // Act
        const response = await request(app).get("/api/v1/predictions?stop=stop-1");

        // Assert
        expect(response.body.data.routes[0]).toMatchObject({
            routeShortName: "1A",
            destinations: [
                {
                    headsign: "Downtown",
                    predictions: [{ min: 5 }],
                },
            ],
        });
    });
});

describe("GET /api/v1/predictions/stream", () => {
    it("streams an immediate event: prediction frame carrying the mocked payload", async () => {
        // Arrange
        getMockService().getPredictionsForStop.mockResolvedValue(makeStopPredictionsResponse("stop-1"));
        const server = app.listen(0);
        const port = (server.address() as AddressInfo).port;

        // Act & Assert
        await new Promise<void>((resolve, reject) => {
            const req = http.get(`http://localhost:${port}/api/v1/predictions/stream?stop=stop-1`, (res) => {
                try {
                    expect(res.headers["content-type"]).toMatch(/^text\/event-stream/);
                } catch (assertionError) {
                    server.close();
                    reject(assertionError as Error);
                    return;
                }

                res.on("data", (chunk: Buffer) => {
                    req.destroy();
                    // let the server-side "close" event fire and tear down the poll loop/interval
                    // before closing the server, to avoid leaking a 30s timer into later tests
                    setTimeout(() => {
                        server.close();
                        try {
                            const text = chunk.toString();
                            expect(text).toContain("event: prediction");
                            expect(text).toContain("stop-1");
                            resolve();
                        } catch (assertionError) {
                            reject(assertionError as Error);
                        }
                    }, 20);
                });
            });
            req.on("error", () => {
                // req.destroy() above triggers a socket-hangup error event; ignore it here
                // since the assertions and resolve/reject already happened in the data handler.
            });
        });
    });

    it("responds with 400 when the stop query parameter is missing", async () => {
        // Arrange & Act
        const response = await request(app).get("/api/v1/predictions/stream");

        // Assert
        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
            error: "Bad Request",
            details: "stop parameter is required",
        });
    });

    it("responds with 404 when the stop does not exist, without ever opening a stream", async () => {
        // Arrange
        getMockService().getPredictionsForStop.mockRejectedValue(new NotFoundError("Stop not found: missing-stop"));

        // Act
        const response = await request(app).get("/api/v1/predictions/stream?stop=missing-stop");

        // Assert
        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({
            error: "Not Found",
            details: "Stop not found: missing-stop",
        });
    });

    it("performs its own independent fetch for REST even while a stream loop is active for the same stop", async () => {
        // Arrange
        getMockService().getPredictionsForStop.mockResolvedValue(makeStopPredictionsResponse("stop-shared"));
        const server = app.listen(0);
        const port = (server.address() as AddressInfo).port;

        // Act: open a stream connection first (populates the loop/cache for this stop)
        const streamReq = await new Promise<import("node:http").ClientRequest>((resolve, reject) => {
            const req = http.get(`http://localhost:${port}/api/v1/predictions/stream?stop=stop-shared`, (res) => {
                res.on("data", () => resolve(req));
            });
            req.on("error", () => {
                // ignore socket-hangup once we destroy it below
            });
            setTimeout(() => reject(new Error("timed out waiting for stream data")), 2000);
        });
        const callsAfterStreamOpen = getMockService().getPredictionsForStop.mock.calls.length;

        const restResponse = await request(app).get("/api/v1/predictions?stop=stop-shared");

        // Assert: REST performed its own additional fetch, not served from the stream's cache
        expect(restResponse.status).toBe(200);
        expect(getMockService().getPredictionsForStop.mock.calls.length).toBe(callsAfterStreamOpen + 1);

        streamReq.destroy();
        await new Promise((resolve) => setTimeout(resolve, 20));
        server.close();
    });

    it("tears down the poll loop on client disconnect, triggering a fresh fetch on reconnect", async () => {
        // Arrange
        getMockService().getPredictionsForStop.mockResolvedValue(makeStopPredictionsResponse("stop-reconnect"));
        const server = app.listen(0);
        const port = (server.address() as AddressInfo).port;

        // Act: open, read first frame, then disconnect
        const callsAfterFirstConnect = await new Promise<number>((resolve, reject) => {
            const req = http.get(`http://localhost:${port}/api/v1/predictions/stream?stop=stop-reconnect`, (res) => {
                res.on("data", () => {
                    req.destroy();
                    setTimeout(() => resolve(getMockService().getPredictionsForStop.mock.calls.length), 20);
                });
            });
            req.on("error", () => {
                // ignore socket-hangup from req.destroy()
            });
            setTimeout(() => reject(new Error("timed out waiting for stream data")), 2000);
        });

        // Act: reconnect for the same stop
        await new Promise<void>((resolve, reject) => {
            const req = http.get(`http://localhost:${port}/api/v1/predictions/stream?stop=stop-reconnect`, (res) => {
                res.on("data", () => {
                    req.destroy();
                    setTimeout(() => {
                        server.close();
                        resolve();
                    }, 20);
                });
            });
            req.on("error", () => {
                // ignore socket-hangup from req.destroy()
            });
            setTimeout(() => reject(new Error("timed out waiting for stream data")), 2000);
        });

        // Assert: reconnect triggered a brand-new fetch (loop was torn down, not reused stale)
        expect(getMockService().getPredictionsForStop.mock.calls.length).toBe(callsAfterFirstConnect + 1);
    });
});
