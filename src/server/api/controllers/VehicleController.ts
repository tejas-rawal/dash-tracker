import type { Request, RequestHandler, Response } from "express";
import type { VehicleService } from "../services/VehicleService";
import { sendErrorResponse } from "./errorResponse";

export interface VehicleController {
    getVehiclePositions: RequestHandler;
}

export function createVehicleController(service: VehicleService): VehicleController {
    const getVehiclePositions: RequestHandler = async (req: Request, res: Response) => {
        const { route } = req.query as Record<string, string | undefined>;

        try {
            const result = await service.getVehiclePositions({ route });
            res.json(result);
        } catch (error: unknown) {
            sendErrorResponse(res, error);
        }
    };

    return { getVehiclePositions };
}
