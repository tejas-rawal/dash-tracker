import type { Request, RequestHandler, Response } from "express";
import { UpstreamApiError } from "../errors";
import type { NearbyPredictionService } from "../services/NearbyPredictionService";

export interface NearbyPredictionController {
    getNearbyPredictions: RequestHandler;
}

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

        try {
            const result = await service.getNearbyPredictions(lat, lng);
            res.json(result);
        } catch (error: unknown) {
            res.status(resolveErrorStatus(error)).json(resolveErrorBody(error));
        }
    };

    return { getNearbyPredictions };
}
