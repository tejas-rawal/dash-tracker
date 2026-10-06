import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import type { ReadinessReport } from "../services/HealthService";
import { createHealthController } from "./HealthController";

const makeMockRes = () => {
    const res = {
        json: vi.fn(),
        status: vi.fn(),
        set: vi.fn(),
    } as unknown as Response;
    (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
    (res.set as ReturnType<typeof vi.fn>).mockReturnValue(res);
    return res;
};

const makeMockReq = (): Request => ({}) as unknown as Request;

const makeMockService = () => ({
    getReadiness: vi.fn(),
});

const makeReadinessReport = (overrides: Partial<ReadinessReport> = {}): ReadinessReport => ({
    status: "ready",
    dataAgeSeconds: 42,
    lastLoadedAt: "2026-10-06T12:00:00.000Z",
    lastFailedAt: null,
    ...overrides,
});

const setHeaderNames = (res: Response): unknown[] =>
    (res.set as ReturnType<typeof vi.fn>).mock.calls.map((call: unknown[]) => call[0]);

describe("HealthController", () => {
    it("exposes a liveness and a readiness handler", () => {
        // Arrange & Act
        const controller = createHealthController(makeMockService());

        // Assert
        expect(Object.keys(controller).sort()).toEqual(["getLiveness", "getReadiness"]);
    });

    describe("getLiveness", () => {
        it("answers 200 ok with Cache-Control no-store", () => {
            // Arrange
            const { getLiveness } = createHealthController(makeMockService());
            const res = makeMockRes();

            // Act
            getLiveness(makeMockReq(), res, vi.fn());

            // Assert
            expect(res.set).toHaveBeenCalledWith("Cache-Control", "no-store");
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ status: "ok" });
        });

        it("never reads readiness from the service", () => {
            // Arrange
            const mockService = makeMockService();
            const { getLiveness } = createHealthController(mockService);

            // Act
            getLiveness(makeMockReq(), makeMockRes(), vi.fn());

            // Assert
            expect(mockService.getReadiness).not.toHaveBeenCalled();
        });

        it("never sets a Retry-After header", () => {
            // Arrange
            const { getLiveness } = createHealthController(makeMockService());
            const res = makeMockRes();

            // Act
            getLiveness(makeMockReq(), res, vi.fn());

            // Assert
            expect(setHeaderNames(res)).not.toContain("Retry-After");
        });
    });

    describe("getReadiness", () => {
        it("answers 200 with the ready report unchanged and Cache-Control no-store", () => {
            // Arrange
            const mockService = makeMockService();
            const report = makeReadinessReport();
            mockService.getReadiness.mockReturnValue(report);
            const { getReadiness } = createHealthController(mockService);
            const res = makeMockRes();

            // Act
            getReadiness(makeMockReq(), res, vi.fn());

            // Assert
            expect(res.set).toHaveBeenCalledWith("Cache-Control", "no-store");
            expect(res.status).toHaveBeenCalledWith(200);
            expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(report);
        });

        it.each([
            ["never_loaded", makeReadinessReport({ status: "not_ready", reason: "never_loaded", dataAgeSeconds: null })],
            ["stale", makeReadinessReport({ status: "not_ready", reason: "stale", dataAgeSeconds: 11_101 })],
        ])("answers 503 with the %s report unchanged and no Retry-After", (_reason, report) => {
            // Arrange
            const mockService = makeMockService();
            mockService.getReadiness.mockReturnValue(report);
            const { getReadiness } = createHealthController(mockService);
            const res = makeMockRes();

            // Act
            getReadiness(makeMockReq(), res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(503);
            expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(report);
            expect(res.set).toHaveBeenCalledWith("Cache-Control", "no-store");
            expect(setHeaderNames(res)).not.toContain("Retry-After");
        });

        it("reads readiness from the service exactly once per request", () => {
            // Arrange
            const mockService = makeMockService();
            mockService.getReadiness.mockReturnValue(makeReadinessReport());
            const { getReadiness } = createHealthController(mockService);

            // Act
            getReadiness(makeMockReq(), makeMockRes(), vi.fn());

            // Assert
            expect(mockService.getReadiness).toHaveBeenCalledTimes(1);
        });
    });
});
