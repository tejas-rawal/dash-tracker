import type { ServiceAlertSummary, StopWithAlerts } from "./ServiceAlertSummary";

export interface RouteDirectionStops {
    directionId: string;
    title: string;
    stops: StopWithAlerts[];
}

export interface NearbySearchOptions {
    radius?: number;
    count?: number;
}

export interface NearbyStop {
    id: string;
    name: string;
    code: number;
    lat: number;
    lon: number;
    distance: number;
    alerts: ServiceAlertSummary[];
}
