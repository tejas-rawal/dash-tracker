import type { BusStop } from "./BusStop";

export interface RouteDirectionStops {
    directionId: string;
    title: string;
    stops: BusStop[];
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
}
