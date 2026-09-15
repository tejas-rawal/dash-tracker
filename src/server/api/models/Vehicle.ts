export interface DashVehicle {
    id: string;
    routeId: string;
    routeShortName: string;
    tripId: string;
    directionId: string;
    headsign: string;
    lat: number;
    lon: number;
    heading: number;
    speed: number;
    lastUpdated: number;
}

export interface DashVehiclesApiResponse {
    success: boolean;
    route: string;
    data: {
        agencyKey: string;
        vehicles: DashVehicle[];
    };
}

export interface VehiclePosition {
    id: string;
    routeId: string;
    routeShortName: string;
    tripId: string;
    directionId: string;
    headsign: string;
    lat: number;
    lon: number;
    heading: number;
    speed: number;
    lastUpdated: number;
}

export interface VehiclePositionsResponse {
    success: boolean;
    generatedAt: string;
    data: {
        agencyKey: string;
        vehicles: VehiclePosition[];
    };
}

export interface VehicleOptions {
    route?: string;
}
