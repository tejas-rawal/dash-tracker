import { NotFoundError } from "../errors";
import type { NearbySearchOptions, NearbyStop, RouteDirectionStops } from "../models";
import type { BusDataRepository } from "../repositories";
import { haversineDistanceMiles } from "./distance";

const DEFAULT_RADIUS_MILES = 0.5;
const DEFAULT_COUNT = 10;
const MAX_COUNT = 50;

export interface StopService {
    getStopsForRoute(shortName: string): RouteDirectionStops[];
    getNearbyStops(lat: number, lng: number, options?: NearbySearchOptions): NearbyStop[];
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

    function getNearbyStops(lat: number, lng: number, options?: NearbySearchOptions): NearbyStop[] {
        const radius = options?.radius ?? DEFAULT_RADIUS_MILES;
        const count = Math.min(options?.count ?? DEFAULT_COUNT, MAX_COUNT);

        return repository
            .getAllStops()
            .map((stop) => {
                const location = stop.getLocation();
                return {
                    id: stop.id,
                    name: stop.name,
                    code: stop.code,
                    lat: location.lat,
                    lon: location.lon,
                    distance: haversineDistanceMiles({ lat, lon: lng }, location),
                };
            })
            .filter((stop) => stop.distance <= radius)
            .sort((a, b) => a.distance - b.distance)
            .slice(0, count);
    }

    return { getStopsForRoute, getNearbyStops };
}
