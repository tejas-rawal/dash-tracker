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
