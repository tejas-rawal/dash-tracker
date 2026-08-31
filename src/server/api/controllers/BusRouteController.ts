import type { Request, RequestHandler, Response } from "express";
import { NotFoundError } from "../errors";
import type { BusRouteService } from "../services/BusRouteService";

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
            res.status(error instanceof NotFoundError ? 404 : 500).json({
                error: error instanceof NotFoundError ? "Not Found" : "Request Failed",
                details: error instanceof Error ? error.message : "Unknown error",
            });
        }
    };

    const getRoute: RequestHandler = (req: Request, res: Response) => {
        try {
            const { shortName } = req.params;
            const route = service.getAgencyRoute(Array.isArray(shortName) ? shortName[0] : shortName);
            res.json(route);
        } catch (error: unknown) {
            res.status(error instanceof NotFoundError ? 404 : 500).json({
                error: error instanceof NotFoundError ? "Not Found" : "Request Failed",
                details: error instanceof Error ? error.message : "Unknown error",
            });
        }
    };

    return { getAllRoutes, getRoute };
}
