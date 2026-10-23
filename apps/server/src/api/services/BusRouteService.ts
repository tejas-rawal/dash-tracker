import { NotFoundError } from "../errors";
import type { BusRoute, BusStop } from "../models";
import type { RouteWithAlerts } from "../models/ServiceAlertSummary";
import type { BusDataRepository, ServiceAlertRepository } from "../repositories";
import { mapToServiceAlertSummaries } from "./serviceAlertMapping";

export interface BusRouteService {
    getAgencyRoutes(): RouteWithAlerts[];
    getAgencyRoute(shortName: string): RouteWithAlerts;
    getAgencyStop(stopId: string): BusStop;
    getAgencyStops(): BusStop[];
    getRoutesForStop(stopId: string): BusRoute[];
}

export function createBusRouteService(
    repository: BusDataRepository,
    serviceAlertRepository: ServiceAlertRepository,
): BusRouteService {
    function attachAlerts(route: BusRoute): RouteWithAlerts {
        const alerts = mapToServiceAlertSummaries(serviceAlertRepository.getActiveAlertsForRoute(route.id));
        // RouteWithAlerts intersects the BusRoute class type for field-shape purposes only; the
        // response is JSON-serialized so the class's prototype methods are never invoked on it.
        return { ...route, alerts } as RouteWithAlerts;
    }

    function getAgencyRoutes(): RouteWithAlerts[] {
        return repository.getAllRoutes().map(attachAlerts);
    }

    function getAgencyRoute(shortName: string): RouteWithAlerts {
        const route = repository.getRouteByShortName(shortName);
        if (!route) {
            throw new NotFoundError(`Route not found: ${shortName}`);
        }
        return attachAlerts(route);
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
