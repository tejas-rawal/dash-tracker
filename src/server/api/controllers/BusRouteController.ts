import type { Request, RequestHandler, Response } from 'express';
import type { BusRouteService } from '../services/BusRouteService';
import { NotFoundError } from '../errors';

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
                error: error instanceof NotFoundError ? 'Not Found' : 'Request Failed',
                details: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    };

    const getRoute: RequestHandler = (req: Request, res: Response) => {
        try {
            const { shortName } = req.params;
            const route = service.getAgencyRoute(shortName);
            res.json(route);
        } catch (error: unknown) {
            res.status(error instanceof NotFoundError ? 404 : 500).json({
                error: error instanceof NotFoundError ? 'Not Found' : 'Request Failed',
                details: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    };

    return { getAllRoutes, getRoute };
}
