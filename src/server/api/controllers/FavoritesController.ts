import type { Request, RequestHandler, Response } from "express";
import { NotFoundError } from "../errors";
import type { FavoritesService } from "../services/FavoritesService";

export interface FavoritesController {
    favorite: RequestHandler;
    unfavorite: RequestHandler;
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

export function createFavoritesController(service: FavoritesService): FavoritesController {
    const favorite: RequestHandler = async (req: Request, res: Response) => {
        const { entityType, entityId } = req.body as { entityType?: unknown; entityId?: unknown };

        if (entityType !== "route" && entityType !== "stop") {
            res.status(400).json({
                error: "Bad Request",
                details: 'entityType must be exactly "route" or "stop"',
            });
            return;
        }

        if (typeof entityId !== "string" || entityId.trim().length === 0) {
            res.status(400).json({ error: "Bad Request", details: "entityId is required" });
            return;
        }

        try {
            await service.addFavorite(resolveDeviceId(req), entityType, entityId);
            res.json({ success: true });
        } catch (error: unknown) {
            res.status(resolveErrorStatus(error)).json(resolveErrorBody(error));
        }
    };

    const unfavorite: RequestHandler = async (req: Request, res: Response) => {
        const rawEntityType = req.params.entityType;
        const rawEntityId = req.params.entityId;
        const entityType = Array.isArray(rawEntityType) ? rawEntityType[0] : rawEntityType;
        const entityId = Array.isArray(rawEntityId) ? rawEntityId[0] : rawEntityId;

        if (entityType !== "route" && entityType !== "stop") {
            res.status(400).json({
                error: "Bad Request",
                details: 'entityType must be exactly "route" or "stop"',
            });
            return;
        }

        try {
            await service.removeFavorite(resolveDeviceId(req), entityType, entityId);
            res.json({ success: true });
        } catch (error: unknown) {
            res.status(resolveErrorStatus(error)).json(resolveErrorBody(error));
        }
    };

    return { favorite, unfavorite };
}
