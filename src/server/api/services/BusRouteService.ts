import type { BusRoute, BusStop } from '../models';
import type { BusDataRepository } from '../repositories';
import { NotFoundError } from '../errors';

export interface BusRouteService {
    getAgencyRoutes(): BusRoute[];
    getAgencyRoute(shortName: string): BusRoute;
    getAgencyStop(stopId: string): BusStop;
    getAgencyStops(): BusStop[];
    getRoutesForStop(stopId: string): BusRoute[];
}

export function createBusRouteService(repository: BusDataRepository): BusRouteService {
    function getAgencyRoutes(): BusRoute[] {
        return repository.getAllRoutes();
    }

    function getAgencyRoute(shortName: string): BusRoute {
        const route = repository.getRouteByShortName(shortName);
        if (!route) {
            throw new NotFoundError(`Route not found: ${shortName}`);
        }
        return route;
    }

    function getAgencyStop(stopId: string): BusStop {
        const stop = repository.getStopById(stopId);
        if (!stop) {
            throw new NotFoundError(`Stop not found: ${stopId}`);
        }
        return stop;
    }

    function getAgencyStops(): BusStop[] {
        return repository.getAllStops();
    }

    function getRoutesForStop(stopId: string): BusRoute[] {
        return repository.getRoutesForStop(stopId);
    }

    return { getAgencyRoutes, getAgencyRoute, getAgencyStop, getAgencyStops, getRoutesForStop };
}
