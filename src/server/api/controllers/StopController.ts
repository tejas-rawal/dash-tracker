import type { Request, RequestHandler, Response } from "express";
import { NotFoundError } from "../errors";
import type { StopService } from "../services/StopService";

export interface StopController {
    getStopsForRoute: RequestHandler;
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
            const result = service.getStopsForRoute(shortName);
            res.json(result);
        } catch (error: unknown) {
            res.status(resolveErrorStatus(error)).json(resolveErrorBody(error));
        }
    };

    return { getStopsForRoute };
}
