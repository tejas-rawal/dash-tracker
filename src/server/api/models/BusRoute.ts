enum RouteType {
    Tram = "0",
    Subway = "1",
    Rail = "2"
}

export interface BusRoute {
    id: string;
    longName: string;
    shortName: string;
    name: string;
    type: RouteType;
}
