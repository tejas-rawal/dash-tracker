import type { Request, RequestHandler, Response } from "express";
import type { RecentsService } from "../services/RecentsService";
import { sendErrorResponse } from "./errorResponse";

export interface RecentsController {
    listRecents: RequestHandler;
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
            sendErrorResponse(res, error);
        }
    };

    return { listRecents };
}
