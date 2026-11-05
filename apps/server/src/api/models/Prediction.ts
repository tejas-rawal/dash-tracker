import type { ServiceAlertSummary } from "./ServiceAlertSummary";

export interface Prediction {
    min: number;
    sec: number;
    time: number;
    tripId: string;
    vehicleId: string;
}

export interface Destination {
    directionId: string;
    headsign: string;
    predictions: Prediction[];
}

export interface RoutePrediction {
    routeId: string;
    routeName: string;
    routeShortName: string;
    stopId: string;
    stopName: string;
    stopCode: number;
    destinations: Destination[];
}

export interface StopPredictionsResponse {
    success: boolean;
    generatedAt: string;
    data: {
        agencyKey: string;
        stop: {
            id: string;
            name: string;
            code: number;
        };
        routes: RoutePrediction[];
    };
}

export interface PredictionOptions {
    number?: number;
    route?: string;
    deviceId?: string;
}

export interface DashPrediction {
    min: number;
    sec: number;
    time: number;
    tripId: string;
    vehicleId: string;
}

export interface DashDestination {
    directionId: string;
    headsign: string;
    predictions: DashPrediction[];
}

export interface DashPredictionData {
    routeId: string;
    routeName: string;
    routeShortName: string;
    stopId: string;
    stopName: string;
    stopCode: number;
    destinations: DashDestination[];
}

export interface DashApiResponse {
    success: boolean;
    route: string;
    data: {
        agencyKey: string;
        predictionsData: DashPredictionData[];
    };
}

// Live alexandria-dash payload confirmed 2026-09-23: flat, one entry per (route, stop) pair.
export interface DashNearbyPredictionData extends DashPredictionData {
    distanceToStop: number; // meters
}

export interface DashNearbyApiResponse {
    success: boolean;
    route: string;
    data: {
        agencyKey: string;
        predictionsData: DashNearbyPredictionData[];
    };
}

export interface NearbyPredictionOptions {
    radius?: number; // miles
    number?: number;
}

export interface NearbyStopPredictions {
    id: string;
    name: string;
    code: number;
    distance: number; // miles
    routes: RoutePrediction[];
    alerts: ServiceAlertSummary[];
}

export interface NearbyPredictionsResponse {
    success: boolean;
    generatedAt: string;
    data: {
        agencyKey: string;
        stops: NearbyStopPredictions[];
    };
}
