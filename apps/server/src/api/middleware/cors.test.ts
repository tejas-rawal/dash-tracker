import type { Server } from "node:http";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createCorsMiddleware } from "./cors";

const A = "http://a.example";
const B = "http://b.example";

const servers: Server[] = [];

// One server per app that stays up until afterEach, as in upstreamRateLimit.test.ts: a bare app would start a
// throwaway server per request, and a pooled keep-alive socket could then reach a different, earlier server.
async function makeApp(allowedOrigins: readonly string[]): Promise<Server> {
    const app = express();
    app.use(createCorsMiddleware(allowedOrigins));
    app.get("/ping", (_req, res) => {
        res.status(200).json({ ok: true });
    });
    const server = app.listen(0);
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    return server;
}

async function allowedOriginFor(server: Server, origin: string): Promise<string | undefined> {
    const response = await request(server).get("/ping").set("Origin", origin);
    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
    return response.headers["access-control-allow-origin"];
}

const PROBES = [A, B, "http://c.example", "HTTP://A.EXAMPLE", "http://A.example", `${A}/`, "null"];

describe("createCorsMiddleware", () => {
    afterEach(async () => {
        for (const server of servers.splice(0)) {
            server.closeAllConnections();
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });

    it.each([
        ["in order", [A, B]],
        ["reversed with a duplicate", [B, A, A]],
    ])("allows exactly a and b, echoing each byte for byte, with the list %s", async (_label, list) => {
        // Arrange
        const server = await makeApp(list);

        // Act
        const results = await Promise.all(PROBES.map((origin) => allowedOriginFor(server, origin)));

        // Assert
        expect(results).toEqual([A, B, undefined, undefined, undefined, undefined, undefined]);
    });

    it("gives the same answer for every probe whatever the entry order and duplicates (edge CORS-01/ordering)", async () => {
        // Arrange
        const ordered = await makeApp([A, B]);
        const shuffled = await makeApp([B, A, A]);

        // Act
        const fromOrdered = await Promise.all(PROBES.map((origin) => allowedOriginFor(ordered, origin)));
        const fromShuffled = await Promise.all(PROBES.map((origin) => allowedOriginFor(shuffled, origin)));

        // Assert
        expect(fromShuffled).toEqual(fromOrdered);
    });

    it("allows no origin at all for an empty list, and never answers *", async () => {
        // Arrange
        const server = await makeApp([]);

        // Act
        const results = await Promise.all(PROBES.map((origin) => allowedOriginFor(server, origin)));
        const preflight = await request(server)
            .options("/ping")
            .set("Origin", A)
            .set("Access-Control-Request-Method", "GET");

        // Assert
        expect(results).toEqual(PROBES.map(() => undefined));
        // Not answered by cors: Express answers the OPTIONS itself, without any Access-Control-* header.
        expect(preflight.status).toBe(200);
        expect(Object.keys(preflight.headers).filter((name) => name.startsWith("access-control-"))).toEqual([]);
    });

    it("leaves a request with no Origin untouched", async () => {
        // Arrange
        const server = await makeApp([A, B]);

        // Act
        const response = await request(server).get("/ping");

        // Assert
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ ok: true });
        expect(Object.keys(response.headers).filter((name) => name.startsWith("access-control-"))).toEqual([]);
        expect(response.headers.vary).toBeUndefined();
    });
});
