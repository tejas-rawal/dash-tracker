import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axios } from "../../config";
import { NotFoundError, UpstreamApiError } from "../errors";
import type { StopPredictionsResponse } from "../models/Prediction";
import type { ServiceAlert } from "../models/ServiceAlert";
import { ServiceAlertRepository } from "../repositories";

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

describe("predictionRoutes wiring", () => {
    it("passes both a BusDataRepository and a FavoritesRecentsRepository instance to createPredictionService", () => {
        // Assert
        expect(vi.mocked(createPredictionService).mock.calls[0]).toHaveLength(2);
    });
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

// Verbatim live alexandria-dash sample (11-CONTEXT.md), including the upstream blockId field.
const makeLiveNearbyPredictionsResponse = () => ({
    success: true,
    route: "/real-time/alexandria-dash/predictions-near-location GET",
    data: {
        agencyKey: "alexandria-dash",
        predictionsData: [
            {
                routeShortName: "30",
                routeName: "30 - DUKE",
                routeId: "30",
                stopId: "548",
                stopName: "King St + N Washington St",
                stopCode: 4000858,
                destinations: [
                    {
                        directionId: "0",
                        headsign: "Van Dorn Street Station",
                        predictions: [
                            {
                                time: 1790192451,
                                sec: 318,
                                min: 5,
                                blockId: "0061",
                                tripId: "405020",
                                vehicleId: "0212",
                            },
                        ],
                    },
                    {
                        directionId: "0",
                        headsign: "West Alexandria Transit Center (SHORT TRIP)",
                        predictions: [
                            {
                                time: 1790192711,
                                sec: 578,
                                min: 9,
                                blockId: "0078",
                                tripId: "1219020",
                                vehicleId: "0227",
                            },
                        ],
                    },
                ],
                distanceToStop: 46.5,
            },
            {
                routeShortName: "31",
                routeName: "31 - KING",
                routeId: "31",
                stopId: "548",
                stopName: "King St + N Washington St",
                stopCode: 4000858,
                destinations: [
                    {
                        directionId: "0",
                        headsign: "NVCC Alexandria",
                        predictions: [
                            {
                                time: 1790192575,
                                sec: 442,
                                min: 7,
                                blockId: "0008",
                                tripId: "488020",
                                vehicleId: "0721",
                            },
                        ],
                    },
                ],
                distanceToStop: 46.5,
            },
            {
                routeShortName: "30",
                routeName: "30 - DUKE",
                routeId: "30",
                stopId: "561",
                stopName: "King St + S Washington St",
                stopCode: 4000871,
                destinations: [
                    {
                        directionId: "1",
                        headsign: "Braddock Road Station",
                        predictions: [
                            {
                                time: 1790192813,
                                sec: 680,
                                min: 11,
                                blockId: "0013",
                                tripId: "1418020",
                                vehicleId: "0708",
                            },
                        ],
                    },
                ],
                distanceToStop: 58,
            },
            {
                routeShortName: "34",
                routeName: "34 - OLD TOWN NORTH",
                routeId: "34",
                stopId: "949",
                stopName: "City Hall / Market Sq",
                stopCode: 4000820,
                destinations: [{ directionId: "0", headsign: "Lee Center", predictions: [] }],
                distanceToStop: 337.7,
            },
        ] as Record<string, unknown>[],
    },
});

const makeActiveStopAlert = (id: string, stopId: string): ServiceAlert => ({
    id,
    headerText: "Stop relocated",
    informedRouteIds: [],
    informedStopIds: [stopId],
    activePeriod: { start: null, end: null },
});

interface NearbyStopBody {
    id: string;
    distance: number;
    routes: { routeShortName: string; destinations: { predictions: Record<string, unknown>[] }[] }[];
    alerts: { id: string }[];
}

describe("GET /api/v1/predictions/nearby", () => {
    const nearbyUrl = "/api/v1/predictions/nearby?lat=38.8048&lng=-77.0469";
    let getSpy: MockInstance;

    beforeEach(() => {
        getSpy = vi.spyOn(axios, "get");
    });

    afterEach(() => {
        getSpy.mockRestore();
        ServiceAlertRepository.getInstance().applyAlerts([]);
    });

    it("returns nearest-first stops with miles distance, routes and alerts from one upstream call", async () => {
        // Arrange
        getSpy.mockResolvedValue({ data: makeLiveNearbyPredictionsResponse() });

        // Act
        const response = await request(app).get(nearbyUrl);

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(new Date(response.body.generatedAt).toISOString()).toBe(response.body.generatedAt);
        expect(response.body.data.agencyKey).toBe("alexandria-dash");
        const stops = response.body.data.stops as NearbyStopBody[];
        expect(stops.map((stop) => stop.id)).toEqual(["548", "561", "949"]);
        expect(stops[0].routes.map((route) => route.routeShortName)).toEqual(["30", "31"]);
        expect(stops[0].distance).toBe(46.5 / 1609.344);
        expect(stops[2].routes[0].destinations[0].predictions).toEqual([]);
        for (const stop of stops) {
            expect(Object.keys(stop).sort()).toEqual(["alerts", "code", "distance", "id", "name", "routes"]);
            expect(stop.alerts).toEqual([]);
            for (const route of stop.routes) {
                for (const destination of route.destinations) {
                    for (const prediction of destination.predictions) {
                        expect(prediction).not.toHaveProperty("blockId");
                    }
                }
            }
        }
        expect(getSpy).toHaveBeenCalledTimes(1);
        const url = getSpy.mock.calls[0][0] as string;
        expect(url).toContain("/real-time/test-agency/predictions-near-location?");
        expect(url).toContain("lat=38.8048");
        expect(url).toContain("lon=-77.0469");
        expect(url).toContain("meters=805");
        expect(url).not.toContain("number=");
        expect(url).not.toContain("lng=");
    });

    it("embeds active alerts from the real ServiceAlertRepository singleton on the matching stop", async () => {
        // Arrange
        ServiceAlertRepository.getInstance().applyAlerts([makeActiveStopAlert("alert-548", "548")]);
        getSpy.mockResolvedValue({ data: makeLiveNearbyPredictionsResponse() });

        // Act
        const response = await request(app).get(nearbyUrl);

        // Assert
        expect(response.status).toBe(200);
        const stops = response.body.data.stops as NearbyStopBody[];
        expect(stops[0].alerts).toHaveLength(1);
        expect(stops[0].alerts[0].id).toBe("alert-548");
        expect(stops[1].alerts).toEqual([]);
        expect(stops[2].alerts).toEqual([]);
    });

    it("responds with 400 without calling upstream when lat is missing", async () => {
        // Arrange & Act
        const response = await request(app).get("/api/v1/predictions/nearby?lng=-77.0469");

        // Assert
        expect(response.status).toBe(400);
        expect(response.body.error).toBe("Bad Request");
        expect(getSpy).not.toHaveBeenCalled();
    });

    it("responds with 502 when upstream returns success: false", async () => {
        // Arrange
        getSpy.mockResolvedValue({ data: { ...makeLiveNearbyPredictionsResponse(), success: false } });

        // Act
        const response = await request(app).get(nearbyUrl);

        // Assert
        expect(response.status).toBe(502);
        expect(response.body.error).toBe("Bad Gateway");
    });
    it("responds with 502 when the upstream request fails at the network level", async () => {
        // Arrange
        getSpy.mockRejectedValue(new Error("connect ECONNREFUSED"));

        // Act
        const response = await request(app).get(nearbyUrl);

        // Assert
        expect(response.status).toBe(502);
        expect(response.body.error).toBe("Bad Gateway");
        expect(response.body.details).toContain("DASH API request failed for nearby predictions");
    });

    it("responds with 502 when the upstream body has no predictionsData array", async () => {
        // Arrange
        getSpy.mockResolvedValue({
            data: { success: true, route: "r", data: { agencyKey: "alexandria-dash" } },
        });

        // Act
        const response = await request(app).get(nearbyUrl);

        // Assert
        expect(response.status).toBe(502);
    });

    it("drops a malformed upstream entry and still returns the valid stops", async () => {
        // Arrange
        const body = makeLiveNearbyPredictionsResponse();
        body.data.predictionsData.push({ ...body.data.predictionsData[2], stopId: "999", distanceToStop: "12" });
        getSpy.mockResolvedValue({ data: body });

        // Act
        const response = await request(app).get(nearbyUrl);

        // Assert
        expect(response.status).toBe(200);
        expect((response.body.data.stops as NearbyStopBody[]).map((stop) => stop.id)).toEqual(["548", "561", "949"]);
    });
});
