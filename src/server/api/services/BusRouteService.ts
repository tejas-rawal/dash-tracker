import axios from 'axios';
import { environment } from '../../config/environment';
import { logger } from '../../app';
import type { BusRoute } from '../models/BusRoute';

const { baseUrl, agency, apiKey } = environment.dashApi;

export async function getAgencyRoutes(): Promise<BusRoute[]> {
    try {
        const apiUrl = `${baseUrl}/info/${agency}/routes`;
        logger.info(`api URL: ${apiUrl}`);
        const response = await axios.get(apiUrl, {
            headers: {
                'Authorization': apiKey
            }
        });
        const { data: { routes }} = response.data;
        return serializeRoutes(routes);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message: 'Unknown error';
        throw new Error(`Failed to fetch routes: ${message}`);
    }
}

function serializeRoutes(routes: unknown[]): BusRoute[] {
    // Check if data exists and has the expected structure
    if (!routes || routes.length === 0) {
        return [];
    }

    return routes.map((route: any): BusRoute => ({
        id: route.id,
        longName: route.longName || '',
        shortName: route.shortName || '',
        name: route.name || '',
        type: route.type
    }));
}
