import type { Request, RequestHandler, Response } from "express";
import { NotFoundError, UpstreamApiError } from "../errors";
import { getPredictionsForStop } from "../services/PredictionService";

function parseNumberParam(raw: unknown): number | undefined {
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
    if (error instanceof UpstreamApiError) {
        return 502;
    }
    return 500;
}

function resolveErrorBody(error: unknown): { error: string; details: string } {
    const details = error instanceof Error ? error.message : "Unknown error";
    let label: string;
    if (error instanceof NotFoundError) {
        label = "Not Found";
    } else if (error instanceof UpstreamApiError) {
        label = "Bad Gateway";
    } else {
        label = "Request Failed";
    }
    return { error: label, details };
}

export const getPredictions: RequestHandler = async (req: Request, res: Response) => {
    const { stop, route } = req.query as Record<string, string | undefined>;

    if (!stop) {
        res.status(400).json({ error: "Bad Request", details: "stop parameter is required" });
        return;
    }

    const rawNumber = req.query.number;
    const number = parseNumberParam(rawNumber);
    if (rawNumber !== undefined && number === undefined) {
        res.status(400).json({ error: "Bad Request", details: "number parameter must be a positive integer" });
        return;
    }

    try {
        const result = await getPredictionsForStop(stop, { number, route });
        res.json(result);
    } catch (error: unknown) {
        res.status(resolveErrorStatus(error)).json(resolveErrorBody(error));
    }
};
