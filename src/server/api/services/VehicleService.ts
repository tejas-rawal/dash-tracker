import { axios, environment, logger } from "../../config";
import { NotFoundError, UpstreamApiError } from "../errors";
import type {
    DashVehicle,
    DashVehiclesApiResponse,
    VehicleOptions,
    VehiclePosition,
    VehiclePositionsResponse,
} from "../models/Vehicle";
import type { BusDataRepository } from "../repositories";

export interface VehicleService {
    getVehiclePositions(options?: VehicleOptions): Promise<VehiclePositionsResponse>;
}

export function createVehicleService(repository: BusDataRepository): VehicleService {
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

    function isValidCoordinate(value: unknown): value is number {
        return typeof value === "number" && Number.isFinite(value);
    }

    function mapToVehiclePositions(vehicles: DashVehicle[]): VehiclePosition[] {
        return vehicles
            .filter((vehicle) => {
                const valid =
                    isValidCoordinate(vehicle.loc?.lat) &&
                    isValidCoordinate(vehicle.loc?.lon) &&
                    isValidCoordinate(vehicle.loc?.time);
                if (!valid) {
                    logger.warn(`Dropping vehicle ${vehicle.id} with invalid loc data`);
                }
                return valid;
            })
            .map((vehicle) => ({
                id: vehicle.id,
                routeId: vehicle.routeId,
                routeShortName: vehicle.routeShortName,
                directionId: vehicle.directionId,
                headsign: vehicle.headsign,
                lat: vehicle.loc.lat,
                lon: vehicle.loc.lon,
                heading: vehicle.loc.heading,
                speed: vehicle.loc.speed,
                vehicleType: vehicle.vehicleType,
                lastUpdated: new Date(vehicle.loc.time * 1000).toISOString(),
            }));
    }

    async function getVehiclePositions(options: VehicleOptions = {}): Promise<VehiclePositionsResponse> {
        if (options.route !== undefined) {
            const route = repository.getRouteByShortName(options.route);
            if (!route) {
                throw new NotFoundError(`Route not found: ${options.route}`);
            }
        }

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
