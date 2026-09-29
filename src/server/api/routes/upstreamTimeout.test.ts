import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { type MockInstance, afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { axios, logger } from "../../config";
import app from "../../test/app";

// Accepts the connection and reads the request, but never responds.
function startBlackholedDash(): Promise<http.Server> {
    const server = http.createServer(() => {});
    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => resolve(server));
    });
}

describe("upstream deadline against a blackholed DASH", () => {
    let server: http.Server;
    let originalBaseUrl: string | undefined;
    let infoSpy: MockInstance;
    let warnSpy: MockInstance;
    let errorSpy: MockInstance;

    beforeAll(async () => {
        server = await startBlackholedDash();
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

    function loggedText(): string {
        return JSON.stringify([infoSpy.mock.calls, warnSpy.mock.calls, errorSpy.mock.calls]);
    }

    it("returns 502 for GET /api/v1/vehicles shortly after the deadline, without leaking the API key", async () => {
        // Arrange
        const startedAt = performance.now();

        // Act
        const response = await request(app).get("/api/v1/vehicles");

        // Assert
        const elapsedMs = performance.now() - startedAt;
        expect(response.status).toBe(502);
        expect(response.body).toEqual({
            error: "Bad Gateway",
            details: "DASH API request timed out after 200ms",
        });
        expect(elapsedMs).toBeGreaterThanOrEqual(150);
        expect(elapsedMs).toBeLessThan(2000);
        expect(JSON.stringify(response.body)).not.toContain("test-api-key");
        expect(loggedText()).not.toContain("test-api-key");
    });

    it("returns 502 for GET /api/v1/predictions/nearby with only the shared client's timeout message, without leaking the API key or the rider's coordinates", async () => {
        // Arrange
        const secrets = ["test-api-key", "38.8048", "-77.0469"];

        // Act
        const response = await request(app).get("/api/v1/predictions/nearby?lat=38.8048&lng=-77.0469");

        // Assert
        expect(response.status).toBe(502);
        expect(response.body).toEqual({
            error: "Bad Gateway",
            details: "DASH API request timed out after 200ms",
        });
        const body = JSON.stringify(response.body);
        const logged = loggedText();
        for (const secret of secrets) {
            expect(body).not.toContain(secret);
            expect(logged).not.toContain(secret);
        }
    });
});
