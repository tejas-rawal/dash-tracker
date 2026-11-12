import type { IncomingHttpHeaders, Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../config";
import { type OpenedStream, openStream, trackOpenResponses } from "../../test/streamClient";
import type { StopPredictionsResponse } from "../models/Prediction";

// Streams open without route data or DASH: the mocked service answers every stop lookup.
vi.mock("../services/PredictionService", () => ({
    createPredictionService: vi.fn(() => ({
        getPredictionsForStop: vi.fn(),
    })),
}));

import app from "../../test/app";
import { upstreamRateLimiter } from "../middleware/upstreamRateLimit";
import { createPredictionService } from "../services/PredictionService";

// Captured once at import: afterEach's vi.restoreAllMocks() (for the logger spies) also clears the factory mock's
// results, so reading results[0] in a later test would find nothing.
const mockService = vi.mocked(createPredictionService).mock.results[0]?.value;

// src/test/setup.ts pins CORS_ALLOWED_ORIGINS to exactly this origin (Phase 18 D-13).
const ALLOWED = "http://localhost:8081";
const DISALLOWED = "http://evil.example";

const STREAM_PATH = "/api/v1/predictions/stream?stop=stop-1";
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

function corsHeaderNames(headers: IncomingHttpHeaders): string[] {
    return Object.keys(headers).filter((name) => name.startsWith("access-control-"));
}

function exposedHeaders(headers: IncomingHttpHeaders): string[] {
    return String(headers["access-control-expose-headers"] ?? "")
        .split(",")
        .map((name) => name.trim());
}

// D-14: the SSE writeHead and the stream-cap 429 are written outside the normal response flow, so they need their
// own proof that the CORS headers reach them. No TRUST_PROXY_HOPS stub: every stream comes from 127.0.0.1, which
// is one client IP for the cap.
describe("CORS on GET /api/v1/predictions/stream", () => {
    let server: Server;
    let port: number;
    let openResponses: () => number;
    const streams: OpenedStream[] = [];

    async function open(origin?: string): Promise<OpenedStream> {
        const stream = await openStream({ port, path: STREAM_PATH, origin });
        streams.push(stream);
        return stream;
    }

    async function openWithFrame(origin?: string): Promise<OpenedStream> {
        const stream = await open(origin);
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
    });

    beforeEach(() => {
        // The stream client connects over IPv4, so the bucket key is 127.0.0.1.
        upstreamRateLimiter.resetKey("127.0.0.1");
        mockService.getPredictionsForStop.mockResolvedValue(makeStopPredictionsResponse("stop-1"));
        vi.spyOn(logger, "info").mockImplementation(() => logger);
        vi.spyOn(logger, "warn").mockImplementation(() => logger);
        vi.spyOn(logger, "error").mockImplementation(() => logger);
    });

    afterEach(async () => {
        for (const stream of streams.splice(0)) {
            stream.request.destroy();
        }
        await vi.waitFor(() => expect(openResponses()).toBe(0));
        vi.restoreAllMocks();
    });

    it("streams prediction frames to every client, with CORS headers only for the allowed origin", async () => {
        // Arrange
        const origins = [ALLOWED, DISALLOWED, undefined];

        // Act
        const [allowed, disallowed, absent] = await Promise.all(origins.map((origin) => openWithFrame(origin)));

        // Assert
        for (const stream of [allowed, disallowed, absent]) {
            expect(stream?.status).toBe(200);
            expect(stream?.headers["content-type"]).toMatch(/^text\/event-stream/);
            expect(stream?.frameCount()).toBeGreaterThanOrEqual(1);
        }
        // writeHead merges the headers cors set earlier with setHeader, so they reach the SSE response.
        expect(allowed?.headers["access-control-allow-origin"]).toBe(ALLOWED);
        expect(exposedHeaders(allowed?.headers ?? {})).toContain("Retry-After");
        expect(allowed?.headers.vary).toMatch(/\bOrigin\b/);
        expect(allowed?.headers["access-control-allow-credentials"]).toBeUndefined();
        expect(corsHeaderNames(disallowed?.headers ?? {})).toEqual([]);
        expect(corsHeaderNames(absent?.headers ?? {})).toEqual([]);
    });

    it("answers the stream-cap 429 with readable CORS headers for the allowed origin and none for the others", async () => {
        // Arrange: 5 held streams from the allowed origin fill this client IP's cap.
        const held: OpenedStream[] = [];
        for (let index = 0; index < 5; index += 1) {
            held.push(await openWithFrame(ALLOWED));
        }

        // Act
        const sixth = await open(ALLOWED);
        const seventh = await open(DISALLOWED);
        const eighth = await open();
        await Promise.all([sixth.ended, seventh.ended, eighth.ended]);

        // Assert
        for (const stream of held) {
            expect(stream.status).toBe(200);
        }
        for (const rejected of [sixth, seventh, eighth]) {
            expect(rejected.status).toBe(429);
            expect(rejected.headers["retry-after"]).toBe("5");
            expect(JSON.parse(rejected.text())).toEqual(CAP_BODY);
        }
        expect(sixth.headers["access-control-allow-origin"]).toBe(ALLOWED);
        expect(exposedHeaders(sixth.headers)).toContain("Retry-After");
        expect(sixth.headers.vary).toMatch(/\bOrigin\b/);
        expect(corsHeaderNames(seventh.headers)).toEqual([]);
        expect(corsHeaderNames(eighth.headers)).toEqual([]);
        // The cap never touched the held streams.
        expect(openResponses()).toBe(5);
    });
});
