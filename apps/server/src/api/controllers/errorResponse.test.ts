import type { Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from "../../config";
import { DataNotReadyError, NotFoundError, UpstreamApiError } from "../errors";
import { sendErrorResponse } from "./errorResponse";

const GENERIC_500_BODY = { error: "Request Failed", details: "An unexpected error occurred" };

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

const expectStatusThenSingleJson = (res: Response): void => {
    const status = vi.mocked(res.status);
    const json = vi.mocked(res.json);
    expect(json).toHaveBeenCalledTimes(1);
    expect(status.mock.invocationCallOrder[0]).toBeLessThan(json.mock.invocationCallOrder[0]);
};

describe("sendErrorResponse", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("maps NotFoundError to 404 Not Found with its message", () => {
        // Arrange
        const res = makeMockRes();

        // Act
        sendErrorResponse(res, new NotFoundError("Route not found: 9Z"));

        // Assert
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Not Found", details: "Route not found: 9Z" });
        expectStatusThenSingleJson(res);
        expect(res.set).not.toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled();
    });

    it("maps DataNotReadyError to 503 Service Unavailable and sets Retry-After to 5 seconds", () => {
        // Arrange
        const res = makeMockRes();

        // Act
        sendErrorResponse(res, new DataNotReadyError("Route and stop data is still loading"));

        // Assert
        expect(res.set).toHaveBeenCalledTimes(1);
        expect(res.set).toHaveBeenCalledWith("Retry-After", "5");
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith({
            error: "Service Unavailable",
            details: "Route and stop data is still loading",
        });
        expectStatusThenSingleJson(res);
        expect(logger.error).not.toHaveBeenCalled();
    });

    it("maps UpstreamApiError to 502 Bad Gateway with its message", () => {
        // Arrange
        const res = makeMockRes();

        // Act
        sendErrorResponse(res, new UpstreamApiError("DASH API request timed out after 200ms"));

        // Assert
        expect(res.status).toHaveBeenCalledWith(502);
        expect(res.json).toHaveBeenCalledWith({
            error: "Bad Gateway",
            details: "DASH API request timed out after 200ms",
        });
        expectStatusThenSingleJson(res);
        expect(res.set).not.toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled();
    });

    it("never echoes the thrown message in a 500 and logs it once as a string", () => {
        // Arrange
        const res = makeMockRes();

        // Act
        sendErrorResponse(res, new Error("db exploded at /srv/secret/path"));

        // Assert
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(GENERIC_500_BODY);
        const serializedBody = JSON.stringify(vi.mocked(res.json).mock.calls[0][0]);
        expect(serializedBody).not.toContain("db exploded");
        expect(serializedBody).not.toContain("/srv/secret/path");
        const logCalls = vi.mocked(logger.error).mock.calls;
        expect(logCalls).toHaveLength(1);
        expect(logCalls[0]).toHaveLength(1);
        const [logged] = logCalls[0];
        expect(typeof logged).toBe("string");
        expect(logged).toMatch(/^Unexpected error while handling a request: /);
        expect(logged).toContain("db exploded at /srv/secret/path");
    });

    it("treats an Error subclass outside the typed errors as a generic 500", () => {
        // Arrange
        const res = makeMockRes();

        // Act
        sendErrorResponse(res, new TypeError("cannot read properties of undefined"));

        // Assert
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(GENERIC_500_BODY);
        expect(res.set).not.toHaveBeenCalled();
    });

    it("treats a thrown non-Error value as a generic 500", () => {
        // Arrange
        const res = makeMockRes();

        // Act
        sendErrorResponse(res, "boom");

        // Assert
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(GENERIC_500_BODY);
        const logCalls = vi.mocked(logger.error).mock.calls;
        expect(logCalls).toHaveLength(1);
        expect(logCalls[0]).toHaveLength(1);
        expect(logCalls[0][0]).toContain("boom");
    });
});
