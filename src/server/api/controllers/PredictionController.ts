import type { Request, RequestHandler, Response } from "express";
import { NotFoundError } from "../errors";
import { getPredictionsForStop } from "../services/PredictionService";

function parseNumberParam(raw: unknown): number | undefined {
    if (raw === undefined) {
        return undefined;
    }
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : Number.NaN;
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

export const getPredictions: RequestHandler = async (req: Request, res: Response) => {
    const { stop, route } = req.query as Record<string, string | undefined>;

    if (!stop) {
        res.status(400).json({ error: "Bad Request", details: "stop parameter is required" });
        return;
    }

    const number = parseNumberParam(req.query.number);
    if (Number.isNaN(number)) {
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
