import type { Request, RequestHandler, Response } from "express";
import { NotFoundError } from "../errors";
import type { StopService } from "../services/StopService";

export interface StopController {
    getStopsForRoute: RequestHandler;
    getNearbyStops: RequestHandler;
}

function parseCoordinateParam(raw: unknown, min: number, max: number): number | undefined {
    if (raw === undefined) {
        return undefined;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

function parsePositiveFloatParam(raw: unknown): number | undefined {
    if (raw === undefined) {
        return undefined;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseCountParam(raw: unknown): number | undefined {
    if (raw === undefined) {
        return undefined;
    }
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function resolveErrorStatus(error: unknown): number {
    if (error instanceof NotFoundError) {
        return 404;
    }
    return 500;
}

function resolveErrorBody(error: unknown): { error: string; details: string } {
    const details = error instanceof Error ? error.message : "Unknown error";
    const label = error instanceof NotFoundError ? "Not Found" : "Request Failed";
    return { error: label, details };
}

export function createStopController(service: StopService): StopController {
    const getStopsForRoute: RequestHandler = (req: Request, res: Response) => {
        try {
            const { shortName } = req.params;
            const result = service.getStopsForRoute(Array.isArray(shortName) ? shortName[0] : shortName);
            res.json(result);
        } catch (error: unknown) {
            res.status(resolveErrorStatus(error)).json(resolveErrorBody(error));
        }
    };

    const getNearbyStops: RequestHandler = (req: Request, res: Response) => {
        const rawLat = req.query.lat;
        const lat = parseCoordinateParam(rawLat, -90, 90);
        if (lat === undefined) {
            res.status(400).json({
                error: "Bad Request",
                details: "lat parameter is required and must be a valid latitude (-90 to 90)",
            });
            return;
        }

        const rawLng = req.query.lng;
        const lng = parseCoordinateParam(rawLng, -180, 180);
        if (lng === undefined) {
            res.status(400).json({
                error: "Bad Request",
                details: "lng parameter is required and must be a valid longitude (-180 to 180)",
            });
            return;
        }

        const rawRadius = req.query.radius;
        const radius = parsePositiveFloatParam(rawRadius);
        if (rawRadius !== undefined && radius === undefined) {
            res.status(400).json({ error: "Bad Request", details: "radius parameter must be a positive number" });
            return;
        }

        const rawCount = req.query.count;
        const count = parseCountParam(rawCount);
        if (rawCount !== undefined && count === undefined) {
            res.status(400).json({ error: "Bad Request", details: "count parameter must be a positive integer" });
            return;
        }

        try {
            const result = service.getNearbyStops(lat, lng, { radius, count });
            res.json(result);
        } catch (error: unknown) {
            res.status(resolveErrorStatus(error)).json(resolveErrorBody(error));
        }
    };

    return { getStopsForRoute, getNearbyStops };
}
