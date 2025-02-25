import axios from '../../config/axios';
import { environment } from '../../config/environment';
import { logger } from '../../app';
import type { BusRoute, BusStop } from '../models';

const { agency } = environment.dashApi;

export async function getAgencyRoutes(): Promise<BusRoute[]> {
    try {
        const apiUrl = `/info/${agency}/routes?verbose=true`;
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
        const apiUrl = `/info/${agency}/routes?route=${shortName}&verbose=true`;
        logger.info(`api URL: ${apiUrl}`);
        const response = await axios.get(apiUrl);
        const { data: { routes }} = response.data;
        return serializeRoute(routes[0]);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message: 'Unknown error';
        throw new Error(`Failed to fetch route: ${message}`);
    }
}

function serializeStop(stop: any): BusStop {
    return {
        id: stop.id,
        name: stop.name,
        code: stop.code,
        lat: stop.lat,
        lon: stop.lon
    };
}

function serializeRoute(route: any): BusRoute {
    return {
        id: route.id,
        longName: route.longName || '',
        shortName: route.shortName || '',
        name: route.name || '',
        type: route.type,
        directions: route.directions?.map((direction: any) => ({
            id: direction.id,
            title: direction.title,
            stops: direction.stops?.map((stop: any) => serializeStop(stop)) || [],
            headSigns: direction.headSigns
        })) || []
    };
}

function serializeRoutes(routes: unknown[]): BusRoute[] {
    // Check if data exists and has the expected structure
    if (!routes || routes.length === 0) {
        return [];
    }

    return routes.map((route: any): BusRoute => serializeRoute(route));
}
