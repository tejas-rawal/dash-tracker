import type { ClientRequest, IncomingHttpHeaders, Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import type { Request, RequestHandler, Response } from "express";
import { ipKeyGenerator } from "express-rate-limit";
import request from "supertest";
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../config";
import { type OpenedStream, connectStream } from "../../test/streamClient";
import { createStreamConcurrencyCap } from "./streamConcurrencyCap";
import { createUpstreamRateLimiter } from "./upstreamRateLimit";

// Mounting the cap at the full stream path makes its warn read exactly like the real route's.
const STREAM_PATH = "/api/v1/predictions/stream";
const CAP_BODY = {
    error: "Too Many Requests",
    details: "Too many open prediction streams from this client; close one before opening another",
};
const RATE_LIMITED_BODY = {
    error: "Too Many Requests",
    details: "Too many live requests from this client; retry after the Retry-After interval",
};
const CAP_WARNING_PREFIX = "Concurrent stream cap reached for ";

const servers: Server[] = [];
// Server-side responses of held streams, in arrival order.
const heldResponses: Response[] = [];
// Every client socket a test opened, so afterEach can destroy it.
const clientRequests: ClientRequest[] = [];

let warnSpy: MockInstance;
let errorSpy: MockInstance;

// Stands in for the stream controller: answers with ?status=, never answers with ?mode=pending, and otherwise
// opens an event stream with one frame and holds it.
const fakeStreamHandler: RequestHandler = (req: Request, res: Response): void => {
    // The real controller always listens for 'error', and so does this stand-in.
    res.on("error", () => {});
    const { status, mode } = req.query as Record<string, string | undefined>;
    if (status !== undefined) {
        res.status(Number(status)).json({ error: "Fake Error", details: "fake failure" });
        return;
    }
    if (mode === "pending") {
        return;
    }
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write('event: prediction\ndata: {"frame":1}\n\n');
    heldResponses.push(res);
};

// A fresh cap (and limiter) per app keeps every test's counts its own. The app is served from one server that
// stays up until afterEach. Handing supertest the bare app would start a throwaway server per request, and Node
// 20's keep-alive agent can then reuse a pooled socket to an earlier, closed server that the OS gave the same
// port, so the request lands on a different app.
async function makeApp(
    options: { openStreams?: Map<string, number>; withLimiter?: boolean } = {},
): Promise<{ server: Server; port: number }> {
    const app = express();
    app.set("trust proxy", 1);
    const handlers: RequestHandler[] = [];
    if (options.withLimiter === true) {
        handlers.push(createUpstreamRateLimiter());
    }
    handlers.push(createStreamConcurrencyCap(options.openStreams ?? new Map()), fakeStreamHandler);
    app.get(STREAM_PATH, ...handlers);
    const server = app.listen(0);
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    return { server, port: (server.address() as AddressInfo).port };
}

async function hold(port: number, clientIp: string, query = ""): Promise<OpenedStream> {
    const connection = connectStream({ port, path: STREAM_PATH + query, clientIp });
    clientRequests.push(connection.request);
    const stream = await connection.opened;
    if (stream.status === 200) {
        await vi.waitFor(() => expect(stream.frameCount()).toBeGreaterThanOrEqual(1));
    }
    return stream;
}

async function holdMany(port: number, clientIp: string, count: number, query = ""): Promise<OpenedStream[]> {
    const streams: OpenedStream[] = [];
    for (let index = 0; index < count; index += 1) {
        streams.push(await hold(port, clientIp, query));
    }
    return streams;
}

function connectPending(port: number, clientIp: string): ReturnType<typeof connectStream> {
    const connection = connectStream({ port, path: `${STREAM_PATH}?mode=pending`, clientIp });
    clientRequests.push(connection.request);
    return connection;
}

function capWarnings(): unknown[][] {
    return warnSpy.mock.calls.filter(
        ([message]) => typeof message === "string" && message.startsWith(CAP_WARNING_PREFIX),
    );
}

function remainingOf(headers: IncomingHttpHeaders): number {
    const match = /r=(\d+);/.exec(String(headers.ratelimit));
    return match ? Number(match[1]) : Number.NaN;
}

beforeEach(() => {
    warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);
    errorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
});

afterEach(async () => {
    for (const clientRequest of clientRequests.splice(0)) {
        clientRequest.destroy();
    }
    heldResponses.splice(0);
    vi.restoreAllMocks();
    for (const server of servers.splice(0)) {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
});

describe("createStreamConcurrencyCap over real connections", () => {
    const ipA = "203.0.113.10";
    const ipB = "203.0.113.20";
    const ipC = "203.0.113.30";

    it("rejects the 6th open stream from one IP with 429 while another IP still connects", async () => {
        // Arrange
        const { server, port } = await makeApp();
        await holdMany(port, ipA, 5);

        // Act
        const rejected = await request(server).get(STREAM_PATH).set("X-Forwarded-For", ipA);
        const other = await hold(port, ipB);

        // Assert
        expect(rejected.status).toBe(429);
        expect(rejected.body).toEqual(CAP_BODY);
        expect(rejected.headers["retry-after"]).toBe("5");
        expect(rejected.headers["content-type"]).toMatch(/application\/json/);
        // This app has no limiter, so the cap adds no rate headers of its own.
        expect(rejected.headers.ratelimit).toBeUndefined();
        expect(other.status).toBe(200);
        expect(other.frameCount()).toBeGreaterThanOrEqual(1);
    });

    it.each([
        {
            label: "the client disconnects",
            close: (stream: OpenedStream | undefined): void => {
                stream?.request.destroy();
            },
        },
        {
            label: "the server ends the stream",
            close: (): void => {
                heldResponses[0]?.end();
            },
        },
        {
            label: "the response's socket errors",
            close: (): void => {
                heldResponses[0]?.destroy(new Error("simulated socket error"));
            },
        },
    ])("frees the slot when $label", async ({ close }) => {
        // Arrange
        const openStreams = new Map<string, number>();
        const { port } = await makeApp({ openStreams });
        const held = await holdMany(port, ipA, 5);

        // Act
        close(held[0]);
        await vi.waitFor(() => expect(openStreams.get(ipA)).toBe(4));
        const reopened = await hold(port, ipA);

        // Assert
        expect(reopened.status).toBe(200);
        expect(openStreams.get(ipA)).toBe(5);
    });

    it("frees every slot when shutdown force-closes all connections", async () => {
        // Arrange
        const openStreams = new Map<string, number>();
        const { server, port } = await makeApp({ openStreams });
        await holdMany(port, ipA, 5);

        // Act
        server.closeAllConnections();
        await vi.waitFor(() => expect(openStreams.size).toBe(0));
        const reopened = await holdMany(port, ipA, 5);

        // Assert
        expect(reopened.map((stream) => stream.status)).toEqual([200, 200, 200, 200, 200]);
    });

    it.each([{ status: 400 }, { status: 404 }, { status: 502 }, { status: 503 }])(
        "frees the slot of a connect answered $status",
        async ({ status }) => {
            // Arrange
            const openStreams = new Map<string, number>();
            const { server, port } = await makeApp({ openStreams });

            // Act
            const statuses: number[] = [];
            for (let index = 0; index < 6; index += 1) {
                const response = await request(server)
                    .get(`${STREAM_PATH}?status=${status}`)
                    .set("X-Forwarded-For", ipA);
                statuses.push(response.status);
            }
            await vi.waitFor(() => expect(openStreams.size).toBe(0));
            const held = await holdMany(port, ipA, 5);

            // Assert
            expect(statuses).toEqual([status, status, status, status, status, status]);
            expect(held.map((stream) => stream.status)).toEqual([200, 200, 200, 200, 200]);
        },
    );

    it("frees slots claimed by connects still pending when the client disconnects", async () => {
        // Arrange
        const openStreams = new Map<string, number>();
        const { server, port } = await makeApp({ openStreams });
        const pending = Array.from({ length: 5 }, () => connectPending(port, ipA));
        await vi.waitFor(() => expect(openStreams.get(ipA)).toBe(5));
        const rejected = await request(server).get(STREAM_PATH).set("X-Forwarded-For", ipA);

        // Act
        for (const connection of pending) {
            connection.request.destroy();
        }
        await vi.waitFor(() => expect(openStreams.size).toBe(0));
        const held = await hold(port, ipA);

        // Assert
        expect(rejected.status).toBe(429);
        expect(held.status).toBe(200);
    });

    it("admits exactly 5 of 8 connects fired at once, before any of them is answered", async () => {
        // Arrange
        const openStreams = new Map<string, number>();
        const { port } = await makeApp({ openStreams });
        const answered: OpenedStream[] = [];

        // Act
        for (let index = 0; index < 8; index += 1) {
            void connectPending(port, ipA).opened.then((stream) => answered.push(stream));
        }
        await vi.waitFor(() => expect(answered).toHaveLength(3));

        // Assert
        expect(answered.map((stream) => stream.status)).toEqual([429, 429, 429]);
        expect(openStreams.get(ipA)).toBe(5);
        expect(capWarnings()).toHaveLength(3);
    });

    it("never writes to or ends a stream that is already open", async () => {
        // Arrange
        const openStreams = new Map<string, number>();
        const { server, port } = await makeApp({ openStreams });
        const held = await holdMany(port, ipA, 5);
        const rejected = await request(server).get(STREAM_PATH).set("X-Forwarded-For", ipA);

        // Act
        for (const response of heldResponses) {
            response.write('event: prediction\ndata: {"frame":2}\n\n');
        }

        // Assert
        expect(rejected.status).toBe(429);
        for (const stream of held) {
            await vi.waitFor(() => expect(stream.frameCount()).toBe(2));
        }
        for (const response of heldResponses) {
            expect(response.writableEnded).toBe(false);
            expect(response.destroyed).toBe(false);
        }
        expect(openStreams.get(ipA)).toBe(5);
    });

    it("logs every rejection once, with the path and none of the query string", async () => {
        // Arrange
        const query = "?stop=349&mode=hold";
        const { server, port } = await makeApp();
        await holdMany(port, ipA, 5, query);

        // Act
        const first = await request(server).get(`${STREAM_PATH}${query}`).set("X-Forwarded-For", ipA);
        const second = await request(server).get(`${STREAM_PATH}${query}`).set("X-Forwarded-For", ipA);

        // Assert
        expect([first.status, second.status]).toEqual([429, 429]);
        const expected =
            "Concurrent stream cap reached for 203.0.113.10 on /api/v1/predictions/stream; rejecting the new stream";
        expect(capWarnings()).toEqual([[expected], [expected]]);
        const logged = JSON.stringify(warnSpy.mock.calls);
        for (const fragment of ["stop=", "349", "?"]) {
            expect(logged).not.toContain(fragment);
        }
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it("lets the shared bucket count every connect, including the ones the cap rejects", async () => {
        // Arrange
        const { server, port } = await makeApp({ withLimiter: true });
        await holdMany(port, ipA, 5);

        // Act
        const sixth = await request(server).get(STREAM_PATH).set("X-Forwarded-For", ipA);
        const seventh = await request(server).get(STREAM_PATH).set("X-Forwarded-For", ipA);

        // Assert
        expect(sixth.status).toBe(429);
        expect(sixth.body).toEqual(CAP_BODY);
        expect(remainingOf(sixth.headers)).toBe(54);
        expect(seventh.status).toBe(429);
        expect(seventh.body).toEqual(CAP_BODY);
        expect(remainingOf(seventh.headers)).toBe(53);
    });

    it("never claims a slot for a connect the shared bucket rejects", { timeout: 15_000 }, async () => {
        // Arrange
        const openStreams = new Map<string, number>();
        const { server, port } = await makeApp({ openStreams, withLimiter: true });
        for (let index = 0; index < 60; index += 1) {
            await request(server).get(`${STREAM_PATH}?status=404`).set("X-Forwarded-For", ipC);
        }
        await vi.waitFor(() => expect(openStreams.has(ipC)).toBe(false));
        const claimSpy = vi.spyOn(openStreams, "set");

        // Act
        const rejected = await hold(port, ipC);
        await rejected.ended;

        // Assert
        expect(rejected.status).toBe(429);
        expect(JSON.parse(rejected.text())).toEqual(RATE_LIMITED_BODY);
        expect(openStreams.has(ipC)).toBe(false);
        expect(claimSpy).not.toHaveBeenCalled();
        expect(capWarnings()).toHaveLength(0);
    });

    it("keeps independent counts for separate instances", async () => {
        // Arrange
        const first = await makeApp();
        const second = await makeApp();
        await holdMany(first.port, ipA, 5);

        // Act
        const served = await hold(second.port, ipA);

        // Assert
        expect(served.status).toBe(200);
    });
});

describe("createStreamConcurrencyCap on mock requests", () => {
    const makeMockReq = (ip: string | undefined): Request =>
        ({ ip, baseUrl: "/api/v1/predictions", path: "/stream" }) as unknown as Request;

    const makeMockRes = (destroyed = false): Response => {
        const res = { destroyed, on: vi.fn(), set: vi.fn(), status: vi.fn(), json: vi.fn() } as unknown as Response;
        (res.set as ReturnType<typeof vi.fn>).mockReturnValue(res);
        (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
        return res;
    };

    // Fires every 'close' listener the cap registered on the mock response.
    const emitClose = (res: Response): void => {
        const calls = (res.on as ReturnType<typeof vi.fn>).mock.calls as [string, () => void][];
        for (const [event, listener] of calls) {
            if (event === "close") {
                listener();
            }
        }
    };

    it("drops a connect whose connection is already closed without claiming a slot", () => {
        // Arrange
        const openStreams = new Map<string, number>();
        const cap = createStreamConcurrencyCap(openStreams);
        const deadRes = makeMockRes(true);
        const deadNext = vi.fn();
        const liveNext = vi.fn();

        // Act
        cap(makeMockReq("203.0.113.40"), deadRes, deadNext);
        const sizeAfterDead = openStreams.size;
        for (let index = 0; index < 5; index += 1) {
            cap(makeMockReq("203.0.113.40"), makeMockRes(), liveNext);
        }

        // Assert
        expect(deadNext).not.toHaveBeenCalled();
        expect(deadRes.status).not.toHaveBeenCalled();
        expect(sizeAfterDead).toBe(0);
        expect(liveNext).toHaveBeenCalledTimes(5);
    });

    it("caps requests with no req.ip under one shared key", () => {
        // Arrange
        const openStreams = new Map<string, number>();
        const cap = createStreamConcurrencyCap(openStreams);
        const next = vi.fn();
        const admitted = Array.from({ length: 5 }, () => makeMockRes());
        const rejectedRes = makeMockRes();
        const rejectedNext = vi.fn();

        // Act
        for (const res of admitted) {
            cap(makeMockReq(undefined), res, next);
        }
        const countAtCap = openStreams.get("unknown");
        cap(makeMockReq(undefined), rejectedRes, rejectedNext);
        emitClose(admitted[0] as Response);

        // Assert
        expect(next).toHaveBeenCalledTimes(5);
        expect(countAtCap).toBe(5);
        expect(rejectedNext).not.toHaveBeenCalled();
        expect(rejectedRes.status).toHaveBeenCalledWith(429);
        expect(rejectedRes.set).toHaveBeenCalledWith("Retry-After", "5");
        expect(capWarnings()).toHaveLength(1);
        expect(String(capWarnings()[0]?.[0])).toContain("for unknown on /api/v1/predictions/stream");
        expect(openStreams.get("unknown")).toBe(4);
    });

    it("releases each claim once, never below zero, and forgets an idle client", () => {
        // Arrange
        const openStreams = new Map<string, number>();
        const cap = createStreamConcurrencyCap(openStreams);
        const first = makeMockRes();
        const second = makeMockRes();
        cap(makeMockReq("203.0.113.60"), first, vi.fn());
        cap(makeMockReq("203.0.113.60"), second, vi.fn());

        // Act
        emitClose(first);
        emitClose(first);
        const afterRepeatedClose = openStreams.get("203.0.113.60");
        emitClose(second);
        const keptAfterLastClose = openStreams.has("203.0.113.60");
        emitClose(first);
        emitClose(second);

        // Assert
        expect(afterRepeatedClose).toBe(1);
        expect(keptAfterLastClose).toBe(false);
        expect(openStreams.size).toBe(0);
    });

    it("keys clients exactly as the shared bucket does", () => {
        // Arrange
        const openStreams = new Map<string, number>();
        const cap = createStreamConcurrencyCap(openStreams);
        const fullStreams = new Map<string, number>();
        const fullCap = createStreamConcurrencyCap(fullStreams);
        const sixthRes = makeMockRes();
        const sixthNext = vi.fn();

        // Act
        cap(makeMockReq("::ffff:127.0.0.1"), makeMockRes(), vi.fn());
        cap(makeMockReq("2001:db8:abcd:1200::1"), makeMockRes(), vi.fn());
        cap(makeMockReq("2001:db8:abcd:12ff::2"), makeMockRes(), vi.fn());
        cap(makeMockReq("2001:db8:abcd:1300::1"), makeMockRes(), vi.fn());
        for (const suffix of ["1", "2", "3", "4", "5"]) {
            fullCap(makeMockReq(`2001:db8:abcd:12${suffix}0::${suffix}`), makeMockRes(), vi.fn());
        }
        fullCap(makeMockReq("2001:db8:abcd:12aa::6"), sixthRes, sixthNext);

        // Assert
        expect(ipKeyGenerator("::ffff:127.0.0.1")).toBe("127.0.0.1");
        expect(openStreams.get(ipKeyGenerator("::ffff:127.0.0.1"))).toBe(1);
        expect(ipKeyGenerator("2001:db8:abcd:1200::1")).toBe(ipKeyGenerator("2001:db8:abcd:12ff::2"));
        expect(openStreams.get(ipKeyGenerator("2001:db8:abcd:1200::1"))).toBe(2);
        expect(openStreams.get(ipKeyGenerator("2001:db8:abcd:1300::1"))).toBe(1);
        expect(openStreams.size).toBe(3);
        expect(fullStreams.get(ipKeyGenerator("2001:db8:abcd:1200::1"))).toBe(5);
        expect(sixthNext).not.toHaveBeenCalled();
        expect(sixthRes.status).toHaveBeenCalledWith(429);
    });
});
