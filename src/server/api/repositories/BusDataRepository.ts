// BusDataRepository.ts
import { BusRoute, RouteDirection, BusStop, type RouteType } from '../models';
import { axios, environment, logger } from '../../config';

// Define interfaces for data structures to improve type safety
interface RouteData {
    id: string;
    longName?: string;
    shortName?: string;
    name?: string;
    type: RouteType;
    directions?: DirectionData[];
}

interface DirectionData {
    id: string;
    title: string;
    stops?: StopData[];
    headSigns?: string[];
}

interface StopData {
    id: string;
    name: string;
    code: string | number;
    lat: string | number;
    lon: string | number;
}

export class BusDataRepository {
    private routes: Map<string, BusRoute> = new Map();
    private routesByShortName: Map<string, BusRoute> = new Map();
    private stops: Map<string, BusStop> = new Map();
    private isInitialized = false;
    private initializationPromise: Promise<void> | null = null;

    private static instance: BusDataRepository;

    private constructor() {}

    // Singleton pattern
    public static getInstance(): BusDataRepository {
        if (!BusDataRepository.instance) {
            BusDataRepository.instance = new BusDataRepository();
        }
        return BusDataRepository.instance;
    }

    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = this.fetchAndProcessData()
            .then(({ routes, routesByShortName, stops }) => {
                this.routes = routes;
                this.routesByShortName = routesByShortName;
                this.stops = stops;
                this.isInitialized = true;
            })
            .catch((error) => {
                this.initializationPromise = null;
                const message = error instanceof Error ? error.message : 'Unknown error';
                logger.error(`Failed to initialize bus data: ${message}`);
                throw new Error(`Failed to initialize bus data: ${message}`);
            });

        return this.initializationPromise;
    }

    // Method to refresh data if needed
    public async refreshData(): Promise<void> {
        const refreshPromise = this.fetchAndProcessData()
            .then(({ routes, routesByShortName, stops }) => {
                this.routes = routes;
                this.routesByShortName = routesByShortName;
                this.stops = stops;
                this.isInitialized = true;
                this.initializationPromise = null;
            })
            .catch((error) => {
                const message = error instanceof Error ? error.message : 'Unknown error';
                logger.error(`Failed to refresh bus data: ${message}`);
                throw new Error(`Failed to refresh bus data: ${message}`);
            });

        this.initializationPromise = refreshPromise;
        return refreshPromise;
    }

    private async fetchAndProcessData(): Promise<{
        routes: Map<string, BusRoute>;
        routesByShortName: Map<string, BusRoute>;
        stops: Map<string, BusStop>;
    }> {
        try {
            const { agency } = environment.dashApi;
            const apiUrl = `/info/${agency}/routes?verbose=true`;
            logger.info(`Fetching bus data from API: ${apiUrl}`);
            const response = await axios.get(apiUrl);

            const { data: { routes } } = response.data;

            const stagingRoutes = new Map<string, BusRoute>();
            const stagingRoutesByShortName = new Map<string, BusRoute>();
            const stagingStops = new Map<string, BusStop>();

            if (!routes || !Array.isArray(routes) || routes.length === 0) {
                logger.warn('No routes found in API response');
                return { routes: stagingRoutes, routesByShortName: stagingRoutesByShortName, stops: stagingStops };
            }

            // Process all routes in a single pass into staging maps
            for (const routeData of routes) {
                const directions = this.processDirectionsAndStops(routeData.directions || [], stagingStops);
                const route = this.createRoute(routeData, directions);
                stagingRoutes.set(route.id, route);
                if (route.shortName) {
                    stagingRoutesByShortName.set(route.shortName, route);
                }
            }

            logger.info(`Processed ${stagingRoutes.size} routes and ${stagingStops.size} stops`);
            return { routes: stagingRoutes, routesByShortName: stagingRoutesByShortName, stops: stagingStops };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`Failed to fetch and process data: ${message}`);
            throw new Error(`Failed to fetch and process data: ${message}`);
        }
    }

    /**
     * Process directions and their stops in a single pass
     * @param directionsData The direction data from the API
     * @param stagingStops The staging stops map
     * @returns An array of RouteDirection instances with their stops
     */
    private processDirectionsAndStops(
        directionsData: DirectionData[],
        stagingStops: Map<string, BusStop>
    ): RouteDirection[] {
        return directionsData.map(directionData => {
            const stops = (directionData.stops || []).map(stopData => {
                // Check if we've already processed this stop
                let stop = stagingStops.get(stopData.id);

                if (!stop) {
                    // Create the stop if it doesn't exist
                    stop = this.createStop(stopData);
                    stagingStops.set(stop.id, stop);
                }

                return stop;
            });

            // Create and return the direction with its stops
            return this.createDirection(directionData, stops);
        });
    }

    /**
     * Pure function to create a BusRoute instance
     * @param routeData The route data from the API
     * @param directions The processed direction objects
     * @returns A new BusRoute instance
     */
    private createRoute(routeData: RouteData, directions: RouteDirection[]): BusRoute {
        return new BusRoute({
            id: routeData.id,
            longName: routeData.longName || '',
            shortName: routeData.shortName || '',
            name: routeData.name || '',
            type: routeData.type,
            directions
        });
    }

    /**
     * Pure function to create a BusStop instance
     * @param stopData The stop data from the API
     * @returns A new BusStop instance
     */
    private createStop(stopData: StopData): BusStop {
        const code = typeof stopData.code === 'string' ? Number.parseInt(stopData.code, 10) : stopData.code;
        const lat = typeof stopData.lat === 'string' ? Number.parseFloat(stopData.lat) : stopData.lat;
        const lon = typeof stopData.lon === 'string' ? Number.parseFloat(stopData.lon) : stopData.lon;

        if (Number.isNaN(code)) {
            throw new Error(`Invalid stop code for stop '${stopData.id}': '${stopData.code}'`);
        }
        if (Number.isNaN(lat) || Number.isNaN(lon)) {
            throw new Error(`Invalid coordinates for stop '${stopData.id}': lat='${stopData.lat}', lon='${stopData.lon}'`);
        }

        return new BusStop({ id: stopData.id, name: stopData.name, code, lat, lon });
    }

    /**
     * Pure function to create a RouteDirection instance
     * @param directionData The direction data from the API
     * @param stops The processed stops for this direction
     * @returns A new RouteDirection instance
     */
    private createDirection(directionData: DirectionData, stops: BusStop[]): RouteDirection {
        return new RouteDirection({
            id: directionData.id,
            title: directionData.title,
            stops,
            headSigns: directionData.headSigns || []
        });
    }

    private assertInitialized(): void {
        if (!this.isInitialized) {
            throw new Error('BusDataRepository has not been initialized. Call initialize() before accessing data.');
        }
    }

    // Public methods to access data
    public getAllRoutes(): BusRoute[] {
        this.assertInitialized();
        return Array.from(this.routes.values());
    }

    public getRouteById(id: string): BusRoute | undefined {
        this.assertInitialized();
        return this.routes.get(id);
    }

    /**
     * Get a route by its short name
     * @param shortName The short name of the route
     * @returns The route with the given short name, or undefined if not found
     */
    public getRouteByShortName(shortName: string): BusRoute | undefined {
        this.assertInitialized();
        return this.routesByShortName.get(shortName);
    }

    public getAllStops(): BusStop[] {
        this.assertInitialized();
        return Array.from(this.stops.values());
    }

    public getStopById(id: string): BusStop | undefined {
        this.assertInitialized();
        return this.stops.get(id);
    }

    /**
     * Get all routes that contain a specific stop
     * @param stopId The ID of the stop
     * @returns An array of routes that contain the stop
     */
    public getRoutesForStop(stopId: string): BusRoute[] {
        this.assertInitialized();
        return Array.from(this.routes.values()).filter(route => {
            return route.directions.some(direction =>
                direction.stops.some(stop => stop.id === stopId)
            );
        });
    }
}
