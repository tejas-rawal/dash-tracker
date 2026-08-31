import type { Request, RequestHandler, Response } from "express";
import { NotFoundError } from "../errors";
import type { RecentsService } from "../services/RecentsService";

export interface RecentsController {
    listRecents: RequestHandler;
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

function resolveDeviceId(req: Request): string {
    const raw = req.headers["x-device-id"];
    return (Array.isArray(raw) ? raw[0] : raw) as string;
}

export function createRecentsController(service: RecentsService): RecentsController {
    const listRecents: RequestHandler = async (req: Request, res: Response) => {
        try {
            const result = await service.listRecents(resolveDeviceId(req));
            res.json(result);
        } catch (error: unknown) {
            res.status(resolveErrorStatus(error)).json(resolveErrorBody(error));
        }
    };

    return { listRecents };
}
