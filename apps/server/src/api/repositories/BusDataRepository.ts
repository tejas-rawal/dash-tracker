import { axios, environment } from "../../config";
import { DataNotReadyError } from "../errors";
// BusDataRepository.ts
import { BusRoute, BusStop, RouteDirection, type RouteType } from "../models";

// Define interfaces for data structures to improve type safety
interface RouteData {
    id: unknown;
    longName?: string;
    shortName?: string;
    name?: string;
    type: RouteType;
    directions?: DirectionData[];
}

interface DirectionData {
    id: unknown;
    title: string;
    stops?: StopData[];
    headSigns?: string[];
}

interface StopData {
    id: unknown;
    name: string;
    code: unknown;
    lat: unknown;
    lon: unknown;
}

// DASH may send these fields as numbers or numeric strings. Anything else (absent, null, boolean,
// object) becomes NaN so the caller's finite check rejects it; null used to slip through as a value.
function parseDashNumber(value: unknown, parseText: (text: string) => number): number {
    if (typeof value === "number") {
        return value;
    }
    if (typeof value === "string") {
        return parseText(value);
    }
    return Number.NaN;
}

// An id is a map key, and a missing one used to be stored under the key "undefined". The id is
// kept untrimmed; whitespace-only ids are rejected because they cannot name anything.
function requireId(value: unknown, entity: "route" | "direction" | "stop"): string {
    if (typeof value === "string" && value.trim() !== "") {
        return value;
    }
    throw new Error(`Invalid ${entity} id: '${String(value)}'`);
}

export interface BusDataLoadState {
    lastLoadedAt?: Date;
    lastFailedAt?: Date;
    lastError?: string;
}

export interface BusDataLoadSummary {
    routeCount: number;
    stopCount: number;
}

export class BusDataRepository {
    private routes: Map<string, BusRoute> = new Map();
    private routesByShortName: Map<string, BusRoute> = new Map();
    private stops: Map<string, BusStop> = new Map();
    private lastLoadedAt?: Date;
    private lastFailedAt?: Date;
    private lastError?: string;

    private static instance: BusDataRepository;

    private constructor() {}

    // Singleton pattern
    public static getInstance(): BusDataRepository {
        if (!BusDataRepository.instance) {
            BusDataRepository.instance = new BusDataRepository();
        }
        return BusDataRepository.instance;
    }

    /**
     * The only way to fetch route/stop data. Either commits a complete dataset through applyData or
     * changes nothing riders can see, and records the outcome for getLoadState().
     */
    public async load(): Promise<BusDataLoadSummary> {
        try {
            const data = await this.fetchAndProcessData();
            this.applyData(data);
            return { routeCount: data.routes.size, stopCount: data.stops.size };
        } catch (error) {
            // Only the message is kept or rethrown: an axios-shaped error carries the Authorization
            // header (DASH_API_KEY), so the original error object must never be stored or propagated.
            const message = error instanceof Error ? error.message : "Unknown error";
            this.lastFailedAt = new Date();
            this.lastError = message;
            throw new Error(message);
        }
    }

    /** Phase 14 readiness serializes this snapshot; "ready" means lastLoadedAt is defined. */
    public getLoadState(): BusDataLoadState {
        return {
            lastLoadedAt: this.lastLoadedAt === undefined ? undefined : new Date(this.lastLoadedAt.getTime()),
            lastFailedAt: this.lastFailedAt === undefined ? undefined : new Date(this.lastFailedAt.getTime()),
            lastError: this.lastError,
        };
    }

    /**
     * The single synchronous commit step: all three maps switch together, so readers never see one
     * load's routes with another load's stops.
     */
    private applyData(data: {
        routes: Map<string, BusRoute>;
        routesByShortName: Map<string, BusRoute>;
        stops: Map<string, BusStop>;
    }): void {
        this.routes = data.routes;
        this.routesByShortName = data.routesByShortName;
        this.stops = data.stops;
        this.lastLoadedAt = new Date();
        this.lastFailedAt = undefined;
        this.lastError = undefined;
    }

    private async fetchAndProcessData(): Promise<{
        routes: Map<string, BusRoute>;
        routesByShortName: Map<string, BusRoute>;
        stops: Map<string, BusStop>;
    }> {
        const { agency } = environment.dashApi;
        const apiUrl = `/info/${agency}/routes?verbose=true`;
        const response = await axios.get(apiUrl);
        const routes: RouteData[] | null | undefined = response.data?.data?.routes;

        // An empty dataset is a failed attempt, never applied: a refresh must not wipe live data.
        if (!Array.isArray(routes) || routes.length === 0) {
            throw new Error("DASH API returned no routes");
        }

        const stagingRoutes = new Map<string, BusRoute>();
        const stagingRoutesByShortName = new Map<string, BusRoute>();
        const stagingStops = new Map<string, BusStop>();

        // Process all routes in a single pass into staging maps
        for (const routeData of routes) {
            // Each id is checked before its children, so a rejection names the first bad item in DASH order.
            const routeId = requireId(routeData.id, "route");
            const directions = this.processDirectionsAndStops(routeData.directions || [], stagingStops);
            const route = this.createRoute({ id: routeId, routeData, directions });
            stagingRoutes.set(route.id, route);
            if (route.shortName) {
                stagingRoutesByShortName.set(route.shortName, route);
            }
        }

        return { routes: stagingRoutes, routesByShortName: stagingRoutesByShortName, stops: stagingStops };
    }

    /**
     * Process directions and their stops in a single pass
     * @param directionsData The direction data from the API
     * @param stagingStops The staging stops map
     * @returns An array of RouteDirection instances with their stops
     */
    private processDirectionsAndStops(
        directionsData: DirectionData[],
        stagingStops: Map<string, BusStop>,
    ): RouteDirection[] {
        return directionsData.map((directionData) => {
            const directionId = requireId(directionData.id, "direction");
            const stops = (directionData.stops || []).map((stopData) => {
                const stopId = requireId(stopData.id, "stop");
                // A stop listed under several directions resolves to its first occurrence
                let stop = stagingStops.get(stopId);

                if (!stop) {
                    stop = this.createStop({ id: stopId, stopData });
                    stagingStops.set(stopId, stop);
                }

                return stop;
            });

            return this.createDirection({ id: directionId, directionData, stops });
        });
    }

    /**
     * Pure function to create a BusRoute instance
     * @param id The validated route id
     * @param routeData The route data from the API
     * @param directions The processed direction objects
     * @returns A new BusRoute instance
     */
    private createRoute({
        id,
        routeData,
        directions,
    }: { id: string; routeData: RouteData; directions: RouteDirection[] }): BusRoute {
        return new BusRoute({
            id,
            longName: routeData.longName || "",
            shortName: routeData.shortName || "",
            name: routeData.name || "",
            type: routeData.type,
            directions,
        });
    }

    /**
     * Pure function to create a BusStop instance
     * @param id The validated stop id
     * @param stopData The stop data from the API
     * @returns A new BusStop instance
     */
    private createStop({ id, stopData }: { id: string; stopData: StopData }): BusStop {
        const code = parseDashNumber(stopData.code, (text) => Number.parseInt(text, 10));
        const lat = parseDashNumber(stopData.lat, Number.parseFloat);
        const lon = parseDashNumber(stopData.lon, Number.parseFloat);

        if (!Number.isFinite(code)) {
            throw new Error(`Invalid stop code for stop '${id}': '${String(stopData.code)}'`);
        }
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            throw new Error(
                `Invalid coordinates for stop '${id}': lat='${String(stopData.lat)}', lon='${String(stopData.lon)}'`,
            );
        }

        return new BusStop({ id, name: stopData.name, code, lat, lon });
    }

    /**
     * Pure function to create a RouteDirection instance
     * @param id The validated direction id
     * @param directionData The direction data from the API
     * @param stops The processed stops for this direction
     * @returns A new RouteDirection instance
     */
    private createDirection({
        id,
        directionData,
        stops,
    }: { id: string; directionData: DirectionData; stops: BusStop[] }): RouteDirection {
        return new RouteDirection({
            id,
            title: directionData.title,
            stops,
            headSigns: directionData.headSigns || [],
        });
    }

    private assertLoaded(): void {
        if (this.lastLoadedAt === undefined) {
            throw new DataNotReadyError("Route and stop data is still loading");
        }
    }

    // Public methods to access data
    public getAllRoutes(): BusRoute[] {
        this.assertLoaded();
        return Array.from(this.routes.values());
    }

    public getRouteById(id: string): BusRoute | undefined {
        this.assertLoaded();
        return this.routes.get(id);
    }

    /**
     * Get a route by its short name
     * @param shortName The short name of the route
     * @returns The route with the given short name, or undefined if not found
     */
    public getRouteByShortName(shortName: string): BusRoute | undefined {
        this.assertLoaded();
        return this.routesByShortName.get(shortName);
    }

    public getAllStops(): BusStop[] {
        this.assertLoaded();
        return Array.from(this.stops.values());
    }

    public getStopById(id: string): BusStop | undefined {
        this.assertLoaded();
        return this.stops.get(id);
    }

    /**
     * Get all routes that contain a specific stop
     * @param stopId The ID of the stop
     * @returns An array of routes that contain the stop
     */
    public getRoutesForStop(stopId: string): BusRoute[] {
        this.assertLoaded();
        return Array.from(this.routes.values()).filter((route) => {
            return route.directions.some((direction) => direction.stops.some((stop) => stop.id === stopId));
        });
    }
}
