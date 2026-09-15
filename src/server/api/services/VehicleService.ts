import { axios, environment, logger } from "../../config";
import { UpstreamApiError } from "../errors";
import type {
    DashVehicle,
    DashVehiclesApiResponse,
    VehicleOptions,
    VehiclePosition,
    VehiclePositionsResponse,
} from "../models/Vehicle";

export interface VehicleService {
    getVehiclePositions(options?: VehicleOptions): Promise<VehiclePositionsResponse>;
}

export function createVehicleService(): VehicleService {
    function buildDashApiUrl(options: VehicleOptions): string {
        const { agency } = environment.dashApi;
        const params = new URLSearchParams();

        if (options.route !== undefined) {
            params.set("route", options.route);
        }

        const query = params.toString();
        return `/real-time/${agency}/vehicles${query ? `?${query}` : ""}`;
    }

    async function fetchFromDashApi(options: VehicleOptions): Promise<DashVehiclesApiResponse> {
        const url = buildDashApiUrl(options);
        logger.info(`Fetching vehicle positions from DASH API: ${url}`);
        const response = await axios.get(url);
        return response.data as DashVehiclesApiResponse;
    }

    function mapToVehiclePositions(vehicles: DashVehicle[]): VehiclePosition[] {
        return vehicles.map((vehicle) => ({
            id: vehicle.id,
            routeId: vehicle.routeId,
            routeShortName: vehicle.routeShortName,
            tripId: vehicle.tripId,
            directionId: vehicle.directionId,
            headsign: vehicle.headsign,
            lat: vehicle.lat,
            lon: vehicle.lon,
            heading: vehicle.heading,
            speed: vehicle.speed,
            lastUpdated: vehicle.lastUpdated,
        }));
    }

    async function getVehiclePositions(options: VehicleOptions = {}): Promise<VehiclePositionsResponse> {
        const dashResponse = await fetchFromDashApi(options);

        if (!dashResponse.success) {
            throw new UpstreamApiError("DASH API returned success: false for vehicle positions");
        }

        return {
            success: true,
            generatedAt: new Date().toISOString(),
            data: {
                agencyKey: dashResponse.data.agencyKey,
                vehicles: mapToVehiclePositions(dashResponse.data.vehicles),
            },
        };
    }

    return { getVehiclePositions };
}
