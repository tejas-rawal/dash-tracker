import type { BusStop } from './BusStop';

enum RouteType {
    Tram = "0",
    Subway = "1",
    Rail = "2",
    Bus = "3",
}

interface RouteDirection {
    id: string,
    title: string,
    stops: BusStop[],
    headSigns: string[]
}

export interface BusRoute {
    id: string;
    longName: string;
    shortName: string;
    name: string;
    type: RouteType;
    directions: RouteDirection[];
}
