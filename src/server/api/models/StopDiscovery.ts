import type { BusStop } from "./BusStop";

export interface RouteDirectionStops {
    directionId: string;
    title: string;
    stops: BusStop[];
}
