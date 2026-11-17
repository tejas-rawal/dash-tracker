import type { BusStop } from "./BusStop";
import type { RouteDirection } from "./RouteDirection";

export enum RouteType {
    Tram = "0",
    Subway = "1",
    Rail = "2",
    Bus = "3",
}

export class BusRoute {
    id: string;
    longName: string;
    shortName: string;
    name: string;
    type: RouteType;
    // DASH's 6-hex-digit route colors without `#`, omitted when DASH has none (D-16, D-17).
    color?: string;
    textColor?: string;
    directions: RouteDirection[];

    constructor(data: {
        id: string;
        longName: string;
        shortName: string;
        name: string;
        type: RouteType;
        color?: string;
        textColor?: string;
        directions: RouteDirection[];
    }) {
        this.id = data.id;
        this.longName = data.longName;
        this.shortName = data.shortName;
        this.name = data.name;
        this.type = data.type;
        this.color = data.color;
        this.textColor = data.textColor;
        this.directions = data.directions;
    }

    // Add methods
    getAllStops(): BusStop[] {
        const allStops: BusStop[] = [];
        const stopIds = new Set<string>();

        for (const direction of this.directions) {
            for (const stop of direction.stops) {
                if (!stopIds.has(stop.id)) {
                    stopIds.add(stop.id);
                    allStops.push(stop);
                }
            }
        }

        return allStops;
    }

    getDirectionById(directionId: string): RouteDirection | undefined {
        return this.directions.find((dir) => dir.id === directionId);
    }
}
