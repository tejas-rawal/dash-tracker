import type { Request, RequestHandler, Response } from 'express';
import { getAgencyRoutes, getAgencyRoute } from '../services/BusRouteService';
import { NotFoundError } from '../errors';

export const getAllRoutes: RequestHandler = (_req: Request, res: Response) => {
    try {
        const routes = getAgencyRoutes();
        res.json(routes);
    } catch (error: unknown) {
        res.status(error instanceof NotFoundError ? 404 : 500).json({
            error: error instanceof NotFoundError ? 'Not Found' : 'Request Failed',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}

export const getRoute: RequestHandler = (req: Request, res: Response) => {
    try {
        const { shortName } = req.params;
        const route = getAgencyRoute(shortName);
        res.json(route);
    } catch (error: unknown) {
        res.status(error instanceof NotFoundError ? 404 : 500).json({
            error: error instanceof NotFoundError ? 'Not Found' : 'Request Failed',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
