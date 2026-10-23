import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { requireDeviceId } from "./requireDeviceId";

const makeMockRes = () => {
    const res = {
        json: vi.fn(),
        status: vi.fn(),
    } as unknown as Response;
    (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
    return res;
};

const makeMockReq = (headers: Record<string, string | string[] | undefined> = {}): Request =>
    ({ headers }) as unknown as Request;

describe("requireDeviceId", () => {
    it("responds with 400 when the X-Device-Id header is missing", () => {
        // Arrange
        const req = makeMockReq({});
        const res = makeMockRes();
        const next = vi.fn();

        // Act
        requireDeviceId(req, res, next);

        // Assert
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: "Bad Request",
            details: "X-Device-Id header is required",
        });
        expect(next).not.toHaveBeenCalled();
    });

    it("responds with 400 when the X-Device-Id header is an empty string", () => {
        // Arrange
        const req = makeMockReq({ "x-device-id": "" });
        const res = makeMockRes();
        const next = vi.fn();

        // Act
        requireDeviceId(req, res, next);

        // Assert
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: "Bad Request",
            details: "X-Device-Id header is required",
        });
        expect(next).not.toHaveBeenCalled();
    });

    it("responds with 400 when the X-Device-Id header is a single whitespace character", () => {
        // Arrange
        const req = makeMockReq({ "x-device-id": " " });
        const res = makeMockRes();
        const next = vi.fn();

        // Act
        requireDeviceId(req, res, next);

        // Assert
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });

    it("responds with 400 when the X-Device-Id header is a tab character", () => {
        // Arrange
        const req = makeMockReq({ "x-device-id": "\t" });
        const res = makeMockRes();
        const next = vi.fn();

        // Act
        requireDeviceId(req, res, next);

        // Assert
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).not.toHaveBeenCalled();
    });

    it("calls next() and does not respond when a real device id value is present", () => {
        // Arrange
        const req = makeMockReq({ "x-device-id": "device-abc-123" });
        const res = makeMockRes();
        const next = vi.fn();

        // Act
        requireDeviceId(req, res, next);

        // Assert
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
    });

    it("normalizes an array-valued header by using the first entry", () => {
        // Arrange
        const req = makeMockReq({ "x-device-id": ["device-1", "device-2"] });
        const res = makeMockRes();
        const next = vi.fn();

        // Act
        requireDeviceId(req, res, next);

        // Assert
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });
});
