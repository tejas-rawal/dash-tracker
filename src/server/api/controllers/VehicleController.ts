import type { Request, RequestHandler, Response } from "express";
import { NotFoundError, UpstreamApiError } from "../errors";
import type { VehicleService } from "../services/VehicleService";

export interface VehicleController {
    getVehiclePositions: RequestHandler;
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

export function createVehicleController(service: VehicleService): VehicleController {
    const getVehiclePositions: RequestHandler = async (req: Request, res: Response) => {
        const { route } = req.query as Record<string, string | undefined>;

        try {
            const result = await service.getVehiclePositions({ route });
            res.json(result);
        } catch (error: unknown) {
            res.status(resolveErrorStatus(error)).json(resolveErrorBody(error));
        }
    };

    return { getVehiclePositions };
}
