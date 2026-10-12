import type { IncomingHttpHeaders, Server } from "node:http";
import type { AddressInfo } from "node:net";
import { type MockInstance, afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../config";
import { type OpenedStream, openStream, trackOpenResponses } from "../../test/streamClient";
import type { StopPredictionsResponse } from "../models/Prediction";

// environment.ts reads TRUST_PROXY_HOPS once at import. vi.hoisted runs before this file's imports, and vitest
// gives each test file its own module graph, so this file's app trusts one proxy hop and X-Forwarded-For picks
// the client IP.
vi.hoisted(() => {
    vi.stubEnv("TRUST_PROXY_HOPS", "1");
});

// Streams open without route data or DASH: the mocked service answers every stop lookup.
vi.mock("../services/PredictionService", () => ({
    createPredictionService: vi.fn(() => ({
        getPredictionsForStop: vi.fn(),
    })),
}));

import app from "../../test/app";
import { createPredictionService } from "../services/PredictionService";

const getMockService = () => vi.mocked(createPredictionService).mock.results[0]?.value;

// vitest gives each test file its own module graph, so this file's shared cap and bucket are its own. Every test
// uses its own client IPs, so neither the cap nor the bucket carries counts between tests.

const STREAM_PATH = "/api/v1/predictions/stream";
const CAP_BODY = {
    error: "Too Many Requests",
    details: "Too many open prediction streams from this client; close one before opening another",
};

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

function remainingOf(headers: IncomingHttpHeaders): number {
    const match = /r=(\d+);/.exec(String(headers.ratelimit));
    return Number(match?.[1]);
}

describe("concurrent stream cap on GET /api/v1/predictions/stream", () => {
    let server: Server;
    let port: number;
    let openResponses: () => number;
    const streams: OpenedStream[] = [];
    let warnSpy: MockInstance;
    let errorSpy: MockInstance;

    function capWarnings(): unknown[][] {
        return warnSpy.mock.calls.filter(
            ([message]) => typeof message === "string" && message.startsWith("Concurrent stream cap reached for "),
        );
    }

    async function open(clientIp: string, query = "?stop=stop-1"): Promise<OpenedStream> {
        const stream = await openStream({ port, path: STREAM_PATH + query, clientIp });
        streams.push(stream);
        return stream;
    }

    async function openWithFrame(clientIp: string, query = "?stop=stop-1"): Promise<OpenedStream> {
        const stream = await open(clientIp, query);
        await vi.waitFor(() => expect(stream.frameCount()).toBeGreaterThanOrEqual(1));
        return stream;
    }

    beforeAll(async () => {
        server = app.listen(0);
        await new Promise<void>((resolve) => server.once("listening", () => resolve()));
        port = (server.address() as AddressInfo).port;
        openResponses = trackOpenResponses(server);
    });

    afterAll(async () => {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        vi.unstubAllEnvs();
    });

    beforeEach(() => {
        getMockService().getPredictionsForStop.mockResolvedValue(makeStopPredictionsResponse("stop-1"));
        warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);
        errorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
    });

    afterEach(async () => {
        for (const stream of streams.splice(0)) {
            stream.request.destroy();
        }
        await vi.waitFor(() => expect(openResponses()).toBe(0));
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("rejects a client IP's 6th open stream with 429 while another IP still streams, and frees the slot when one closes", async () => {
        // Arrange
        const ipA = "203.0.113.10";
        const ipB = "203.0.113.20";

        // Act: 5 streams on the same stop, so duplicates each take a slot (D-02).
        const held: OpenedStream[] = [];
        for (let index = 0; index < 5; index += 1) {
            held.push(await openWithFrame(ipA));
        }
        const sixth = await open(ipA);

        // Assert
        for (const stream of held) {
            expect(stream.status).toBe(200);
            expect(stream.headers["content-type"]).toMatch(/^text\/event-stream/);
        }
        expect(sixth.status).toBe(429);
        await sixth.ended;
        expect(JSON.parse(sixth.text())).toEqual(CAP_BODY);
        expect(sixth.headers["retry-after"]).toBe("5");
        expect(sixth.headers["content-type"]).toMatch(/application\/json/);
        // The bucket ran first and counted all 6 connects (SC3, D-07).
        expect(remainingOf(sixth.headers)).toBe(54);
        expect(capWarnings()).toEqual([
            ["Concurrent stream cap reached for 203.0.113.10 on /api/v1/predictions/stream; rejecting the new stream"],
        ]);
        expect(JSON.stringify(warnSpy.mock.calls)).not.toContain("stop=");
        expect(openResponses()).toBe(5);
        for (const stream of held) {
            expect(stream.frameCount()).toBeGreaterThanOrEqual(1);
        }

        // Act: another IP still streams (SC1).
        const other = await openWithFrame(ipB);

        // Assert
        expect(other.status).toBe(200);

        // Act: one of IP A's streams closes, and IP A opens again at once (SC2).
        held[0]?.request.destroy();
        await vi.waitFor(() => expect(openResponses()).toBe(5));
        const reopened = await openWithFrame(ipA);

        // Assert
        expect(reopened.status).toBe(200);
        expect(errorSpy).not.toHaveBeenCalled();
    });
});
