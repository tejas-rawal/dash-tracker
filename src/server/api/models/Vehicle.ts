export interface DashVehicle {
    id: string;
    routeId: string;
    routeShortName: string;
    directionId: string;
    headsign: string;
    loc: {
        lat: number;
        lon: number;
        heading: number;
        speed: number;
        time: number;
    };
    vehicleType: string;
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
    directionId: string;
    headsign: string;
    lat: number;
    lon: number;
    heading: number;
    speed: number;
    vehicleType: string;
    lastUpdated: string;
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
