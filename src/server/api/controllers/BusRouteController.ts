import type { Request, RequestHandler, Response } from 'express';
import { getAgencyRoutes, getAgencyRoute } from '../services/BusRouteService';

export const getAllRoutes: RequestHandler = async (_req: Request, res: Response) => {
    try {
        const routes = await getAgencyRoutes();
        res.json(routes);
    } catch (error: unknown) {
        res.status(500).json({
            error: 'Request Failed',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}

export const getRoute: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { shortName } = req.params;
        const route = await getAgencyRoute(shortName);
        res.json(route);
    } catch (error: unknown) {
        res.status(500).json({
            error: 'Request Failed',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
