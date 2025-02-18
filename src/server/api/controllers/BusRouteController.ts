import type { Request, RequestHandler, Response } from 'express';
import { getAgencyRoutes } from '../services/BusRouteService';

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
