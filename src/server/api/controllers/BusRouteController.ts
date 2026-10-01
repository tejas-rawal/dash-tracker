import type { Request, RequestHandler, Response } from "express";
import type { BusRouteService } from "../services/BusRouteService";
import { sendErrorResponse } from "./errorResponse";

export interface BusRouteController {
    getAllRoutes: RequestHandler;
    getRoute: RequestHandler;
}

export function createBusRouteController(service: BusRouteService): BusRouteController {
    const getAllRoutes: RequestHandler = (_req: Request, res: Response) => {
        try {
            const routes = service.getAgencyRoutes();
            res.json(routes);
        } catch (error: unknown) {
            sendErrorResponse(res, error);
        }
    };

    const getRoute: RequestHandler = (req: Request, res: Response) => {
        try {
            const { shortName } = req.params;
            const route = service.getAgencyRoute(Array.isArray(shortName) ? shortName[0] : shortName);
            res.json(route);
        } catch (error: unknown) {
            sendErrorResponse(res, error);
        }
    };

    return { getAllRoutes, getRoute };
}
