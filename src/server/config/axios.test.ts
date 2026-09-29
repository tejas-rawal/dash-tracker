import http from "node:http";
import type { AddressInfo } from "node:net";
import { inspect } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { UpstreamApiError } from "../api/errors";
import { axiosInstance } from "./axios";

const servers: http.Server[] = [];

function startServer(listener: http.RequestListener): Promise<string> {
    const server = http.createServer(listener);
    servers.push(server);
    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            const { port } = server.address() as AddressInfo;
            resolve(`http://127.0.0.1:${port}`);
        });
    });
}

async function stopServer(server: http.Server): Promise<void> {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
}

const neverRespond: http.RequestListener = () => {};

const respondOk: http.RequestListener = (_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
};

const respond503: http.RequestListener = (_req, res) => {
    res.writeHead(503);
    res.end();
};

afterEach(async () => {
    for (const server of servers) {
        await stopServer(server);
    }
    servers.length = 0;
});

describe("shared DASH axios client", () => {
    it("rejects a blackholed request with the timeout message once the deadline passes", async () => {
        // Arrange
        const baseUrl = await startServer(neverRespond);
        const startedAt = performance.now();

        // Act
        const error = await axiosInstance.get(`${baseUrl}/slow`).catch((caught: unknown) => caught);

        // Assert
        const elapsedMs = performance.now() - startedAt;
        expect(error).toBeInstanceOf(UpstreamApiError);
        expect((error as UpstreamApiError).message).toBe("DASH API request timed out after 200ms");
        expect(elapsedMs).toBeGreaterThanOrEqual(150);
        expect(elapsedMs).toBeLessThan(2000);
    });

    it("cuts off an upstream that trickles bytes without finishing at the same deadline", async () => {
        // Arrange
        const baseUrl = await startServer((_req, res) => {
            res.writeHead(200, { "Content-Type": "application/json" });
            // Steady bytes keep an idle-based timeout from ever firing.
            const interval = setInterval(() => res.write(" "), 50);
            res.on("close", () => clearInterval(interval));
        });
        const startedAt = performance.now();

        // Act
        const error = await axiosInstance.get(`${baseUrl}/trickle`).catch((caught: unknown) => caught);

        // Assert
        const elapsedMs = performance.now() - startedAt;
        expect(error).toBeInstanceOf(UpstreamApiError);
        expect((error as UpstreamApiError).message).toBe("DASH API request timed out after 200ms");
        expect(elapsedMs).toBeLessThan(2000);
    });

    it("gives every request its own deadline, so a call after an earlier deadline window still succeeds", async () => {
        // Arrange
        const okUrl = await startServer(respondOk);
        const blackholedUrl = await startServer(neverRespond);

        // Act
        const first = await axiosInstance.get(`${okUrl}/first`);
        await new Promise((resolve) => setTimeout(resolve, 300));
        const second = await axiosInstance.get(`${okUrl}/second`);
        const timedOut = await axiosInstance.get(`${blackholedUrl}/slow`).catch((caught: unknown) => caught);
        const third = await axiosInstance.get(`${okUrl}/third`);

        // Assert
        expect(first.data).toEqual({ ok: true });
        expect(second.data).toEqual({ ok: true });
        expect(timedOut).toBeInstanceOf(UpstreamApiError);
        expect((timedOut as UpstreamApiError).message).toBe("DASH API request timed out after 200ms");
        expect(third.data).toEqual({ ok: true });
    });

    it("maps a refused connection to the generic failure message", async () => {
        // Arrange
        const baseUrl = await startServer(respondOk);
        const server = servers.pop() as http.Server;
        await stopServer(server);

        // Act
        const error = await axiosInstance.get(`${baseUrl}/refused`).catch((caught: unknown) => caught);

        // Assert
        expect(error).toBeInstanceOf(UpstreamApiError);
        const { message } = error as UpstreamApiError;
        expect(message.startsWith("DASH API request failed: ")).toBe(true);
        expect(message).toContain("ECONNREFUSED");
    });

    it("maps a non-2xx upstream response to the generic failure message", async () => {
        // Arrange
        const baseUrl = await startServer(respond503);

        // Act
        const error = await axiosInstance.get(`${baseUrl}/unavailable`).catch((caught: unknown) => caught);

        // Assert
        expect(error).toBeInstanceOf(UpstreamApiError);
        expect((error as UpstreamApiError).message).toBe(
            "DASH API request failed: Request failed with status code 503",
        );
    });

    it.each([
        { label: "timed-out", listener: neverRespond },
        { label: "non-2xx", listener: respond503 },
    ])("wraps a $label failure without the API key, the request path or the axios error", async ({ listener }) => {
        // Arrange
        const baseUrl = await startServer(listener);
        const query = new URLSearchParams({ lat: "38.8048", lon: "-77.0469", meters: "805" });
        const url = `${baseUrl}/real-time/test-agency/predictions-near-location?${query.toString()}`;

        // Act
        const error = await axiosInstance.get(url).catch((caught: unknown) => caught);

        // Assert
        expect(error).toBeInstanceOf(UpstreamApiError);
        for (const property of ["config", "request", "response", "cause"]) {
            expect(error).not.toHaveProperty(property);
        }
        const texts = [(error as UpstreamApiError).message, inspect(error, { depth: 5 })];
        for (const text of texts) {
            for (const forbidden of ["test-api-key", "38.8048", "-77.0469", "predictions-near-location"]) {
                expect(text).not.toContain(forbidden);
            }
        }
    });

    it("still sends the API key upstream as the Authorization header", async () => {
        // Arrange
        let receivedAuthorization: string | undefined;
        const baseUrl = await startServer((req, res) => {
            receivedAuthorization = req.headers.authorization;
            respondOk(req, res);
        });

        // Act
        await axiosInstance.get(`${baseUrl}/auth`);

        // Assert
        expect(receivedAuthorization).toBe("test-api-key");
    });
});
