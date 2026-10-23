import type { NextFunction, Request, RequestHandler, Response } from "express";

export const requireDeviceId: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    const deviceId = req.headers["x-device-id"];
    const value = Array.isArray(deviceId) ? deviceId[0] : deviceId;
    if (value === undefined || value.trim().length === 0) {
        res.status(400).json({ error: "Bad Request", details: "X-Device-Id header is required" });
        return;
    }
    next();
};
