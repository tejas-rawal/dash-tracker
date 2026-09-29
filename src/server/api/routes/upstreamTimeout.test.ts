import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { type MockInstance, afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { axios, logger } from "../../config";
import app from "../../test/app";
import { BusStop } from "../models";
import { BusDataRepository, ServiceAlertRepository } from "../repositories";
import { createServiceAlertPollService } from "../services/ServiceAlertPollService";
import { createServiceAlertService } from "../services/ServiceAlertService";

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

    // The stop lookup is in-memory, so stubbing it leaves only the DASH call under test. Never seed the
    // repository with initialize() in this file: the startup-load test relies on the singleton never
    // having loaded successfully.
    function stubKnownStop(): void {
        vi.spyOn(BusDataRepository.getInstance(), "getStopById").mockReturnValue(
            new BusStop({ id: "stop-1", name: "Main St", code: 101, lat: 38.8, lon: -77.1 }),
        );
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

    it("returns 502 for GET /api/v1/predictions shortly after the deadline, without leaking the API key", async () => {
        // Arrange
        stubKnownStop();
        const startedAt = performance.now();

        // Act
        const response = await request(app).get("/api/v1/predictions?stop=stop-1");

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

    it("times out concurrent live requests independently", async () => {
        // Arrange
        stubKnownStop();
        const startedAt = performance.now();

        // Act
        const responses = await Promise.all([
            request(app).get("/api/v1/predictions?stop=stop-1"),
            request(app).get("/api/v1/predictions/nearby?lat=38.8048&lng=-77.0469"),
            request(app).get("/api/v1/vehicles"),
        ]);

        // Assert
        const elapsedMs = performance.now() - startedAt;
        for (const response of responses) {
            expect(response.status).toBe(502);
            expect(response.body.details).toBe("DASH API request timed out after 200ms");
        }
        expect(elapsedMs).toBeLessThan(2000);
    });

    describe("background DASH calls", () => {
        afterEach(() => {
            vi.useRealTimers();
        });

        it("fails the startup route/stop load with a logged timeout error instead of hanging", async () => {
            // Arrange
            const repository = BusDataRepository.getInstance();

            // Act & Assert
            await expect(repository.initialize()).rejects.toThrow("DASH API request timed out after 200ms");
            expect(errorSpy).toHaveBeenCalledWith(
                expect.stringContaining(
                    "Failed to initialize bus data: Failed to fetch and process data: DASH API request timed out after 200ms",
                ),
            );
            expect(loggedText()).not.toContain("test-api-key");
        });

        it("logs a timeout error from the service-alert poll instead of hanging", async () => {
            // Arrange
            // Keeps start()'s 5-minute interval from firing or leaking; AbortSignal.timeout stays on real timers.
            vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
            const pollService = createServiceAlertPollService(
                createServiceAlertService(),
                ServiceAlertRepository.getInstance(),
            );

            // Act
            pollService.start();

            // Assert
            await vi.waitFor(
                () =>
                    expect(errorSpy).toHaveBeenCalledWith(
                        "Failed to poll service alerts: DASH API request timed out after 200ms",
                    ),
                { timeout: 2000 },
            );
            expect(loggedText()).not.toContain("test-api-key");
        });
    });
});
