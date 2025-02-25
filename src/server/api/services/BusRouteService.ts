import axios from '../../config/axios';
import { environment } from '../../config/environment';
import { logger } from '../../app';
import type { BusRoute } from '../models/BusRoute';

const { agency } = environment.dashApi;

export async function getAgencyRoutes(): Promise<BusRoute[]> {
    try {
        const apiUrl = `/info/${agency}/routes`;
        logger.info(`api URL: ${apiUrl}`);
        const response = await axios.get(apiUrl);
        const { data: { routes }} = response.data;
        return serializeRoutes(routes);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message: 'Unknown error';
        throw new Error(`Failed to fetch routes: ${message}`);
    }
}

export async function getAgencyRoute(shortName: string): Promise<BusRoute> {
    try {
        const apiUrl = `/info/${agency}/routes?route=${shortName}`;
        logger.info(`api URL: ${apiUrl}`);
        const response = await axios.get(apiUrl);
        const { data: { routes }} = response.data;
        return serializeRoute(routes[0]);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message: 'Unknown error';
        throw new Error(`Failed to fetch route: ${message}`);
    }
}

function serializeRoute(route: any): BusRoute {
    return {
        id: route.id,
        longName: route.longName || '',
        shortName: route.shortName || '',
        name: route.name || '',
        type: route.type
    };
}

function serializeRoutes(routes: unknown[]): BusRoute[] {
    // Check if data exists and has the expected structure
    if (!routes || routes.length === 0) {
        return [];
    }

    return routes.map((route: any): BusRoute => serializeRoute(route));
}
