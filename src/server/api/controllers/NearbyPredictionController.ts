import type { Request, RequestHandler, Response } from "express";
import { UpstreamApiError } from "../errors";
import type { NearbyPredictionService } from "../services/NearbyPredictionService";

export interface NearbyPredictionController {
    getNearbyPredictions: RequestHandler;
}

// Caps bound the cost of each upstream call; out-of-range values are rejected, never clamped.
const MAX_RADIUS_MILES = 1;
const MAX_PREDICTIONS_PER_DESTINATION = 10;

// Only a single non-blank string is accepted: Number("") and Number(" ") are 0, and the
// query parser can hand us arrays (repeated params) or objects (nested params).
function parseStrictNumber(raw: unknown): number | undefined {
    if (typeof raw !== "string" || raw.trim() === "") {
        return undefined;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function parseCoordinateParam(raw: unknown, min: number, max: number): number | undefined {
    const parsed = parseStrictNumber(raw);
    return parsed !== undefined && parsed >= min && parsed <= max ? parsed : undefined;
}

function parseRadiusParam(raw: unknown): number | undefined {
    const parsed = parseStrictNumber(raw);
    return parsed !== undefined && parsed > 0 && parsed <= MAX_RADIUS_MILES ? parsed : undefined;
}

function parseNumberParam(raw: unknown): number | undefined {
    const parsed = parseStrictNumber(raw);
    return parsed !== undefined && Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_PREDICTIONS_PER_DESTINATION
        ? parsed
        : undefined;
}

function resolveErrorStatus(error: unknown): number {
    return error instanceof UpstreamApiError ? 502 : 500;
}

function resolveErrorBody(error: unknown): { error: string; details: string } {
    const details = error instanceof Error ? error.message : "Unknown error";
    const label = error instanceof UpstreamApiError ? "Bad Gateway" : "Request Failed";
    return { error: label, details };
}

export function createNearbyPredictionController(service: NearbyPredictionService): NearbyPredictionController {
    const getNearbyPredictions: RequestHandler = async (req: Request, res: Response) => {
        const lat = parseCoordinateParam(req.query.lat, -90, 90);
        if (lat === undefined) {
            res.status(400).json({
                error: "Bad Request",
                details: "lat parameter is required and must be a valid latitude (-90 to 90)",
            });
            return;
        }

        const lng = parseCoordinateParam(req.query.lng, -180, 180);
        if (lng === undefined) {
            res.status(400).json({
                error: "Bad Request",
                details: "lng parameter is required and must be a valid longitude (-180 to 180)",
            });
            return;
        }

        const rawRadius = req.query.radius;
        const radius = parseRadiusParam(rawRadius);
        if (rawRadius !== undefined && radius === undefined) {
            res.status(400).json({
                error: "Bad Request",
                details: "radius parameter must be a positive number no greater than 1 (miles)",
            });
            return;
        }

        const rawNumber = req.query.number;
        const number = parseNumberParam(rawNumber);
        if (rawNumber !== undefined && number === undefined) {
            res.status(400).json({ error: "Bad Request", details: "number parameter must be an integer from 1 to 10" });
            return;
        }

        try {
            const result = await service.getNearbyPredictions(lat, lng, { radius, number });
            res.json(result);
        } catch (error: unknown) {
            res.status(resolveErrorStatus(error)).json(resolveErrorBody(error));
        }
    };

    return { getNearbyPredictions };
}
