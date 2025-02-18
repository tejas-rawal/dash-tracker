import axios from 'axios';
import type { BusRoute } from '../models/BusRoute';


const BASE_URL = 'YOUR_TRANSIT_API_BASE_URL';

export async function getAgencyRoutes(): Promise<BusRoute[]> {
    try {
        const response = await axios.get(`${BASE_URL}/routes`);
        return serializeRoutes(response.data);
    } catch (error: unknown) {
				const message = error instanceof Error ? error.message: 'Unknown error';
        throw new Error(`Failed to fetch routes: ${message}`);
    }
}

function serializeRoutes(data: any): BusRoute[] {
// Transform API response into BusRoute objects
return data.routes.map((route: any) => ({
    id: route.id,
    longName: route.longName,
    shortName: route.shortName,
    name: route.name,
    type: route.type
}));
}
