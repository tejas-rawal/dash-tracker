import { NotFoundError } from "../errors";
import type { RouteDirectionStops } from "../models";
import type { BusDataRepository } from "../repositories";

export interface StopService {
    getStopsForRoute(shortName: string): RouteDirectionStops[];
}

export function createStopService(repository: BusDataRepository): StopService {
    function getStopsForRoute(shortName: string): RouteDirectionStops[] {
        const route = repository.getRouteByShortName(shortName);
        if (!route) {
            throw new NotFoundError(`Route not found: ${shortName}`);
        }

        return route.directions.map((direction) => ({
            directionId: direction.id,
            title: direction.title,
            stops: direction.stops,
        }));
    }

    return { getStopsForRoute };
}
