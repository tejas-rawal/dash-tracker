import type { BusRoute, BusStop } from '../models';
import { BusDataRepository } from '../repositories';
import { NotFoundError } from '../errors';

const repository = BusDataRepository.getInstance();

export function getAgencyRoutes(): BusRoute[] {
    return repository.getAllRoutes();
}

export function getAgencyRoute(shortName: string): BusRoute {
    const route = repository.getRouteByShortName(shortName);
    if (!route) {
        throw new NotFoundError(`Route not found: ${shortName}`);
    }
    return route;
}

export function getAgencyStop(stopId: string): BusStop {
    const stop = repository.getStopById(stopId);
    if (!stop) {
        throw new NotFoundError(`Stop not found: ${stopId}`);
    }
    return stop;
}

export function getAgencyStops(): BusStop[] {
    return repository.getAllStops();
}

export function getRoutesForStop(stopId: string): BusRoute[] {
    return repository.getRoutesForStop(stopId);
}
