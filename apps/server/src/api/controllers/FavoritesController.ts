import type { Request, RequestHandler, Response } from "express";
import type { FavoritesService } from "../services/FavoritesService";
import { sendErrorResponse } from "./errorResponse";

export interface FavoritesController {
    favorite: RequestHandler;
    unfavorite: RequestHandler;
    listFavorites: RequestHandler;
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
            sendErrorResponse(res, error);
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
            sendErrorResponse(res, error);
        }
    };

    const listFavorites: RequestHandler = async (req: Request, res: Response) => {
        try {
            const result = await service.listFavorites(resolveDeviceId(req));
            res.json(result);
        } catch (error: unknown) {
            sendErrorResponse(res, error);
        }
    };

    return { favorite, unfavorite, listFavorites };
}
