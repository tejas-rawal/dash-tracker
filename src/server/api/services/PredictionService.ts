import { axios, environment, logger } from "../../config";
import { NotFoundError, UpstreamApiError } from "../errors";
import type { BusStop } from "../models";
import type {
    DashApiResponse,
    DashDestination,
    DashPredictionData,
    Destination,
    PredictionOptions,
    RoutePrediction,
    StopPredictionsResponse,
} from "../models/Prediction";
import type { BusDataRepository, FavoritesRecentsRepository } from "../repositories";

export interface PredictionService {
    getPredictionsForStop(stopId: string, options?: PredictionOptions): Promise<StopPredictionsResponse>;
}

export function createPredictionService(
    repository: BusDataRepository,
    recentsRepository: FavoritesRecentsRepository,
): PredictionService {
    async function recordRecentView(deviceId: string, stopId: string, routeId?: string): Promise<void> {
        const writes = [recentsRepository.upsertRecent(deviceId, "stop", stopId)];
        if (routeId !== undefined) {
            writes.push(recentsRepository.upsertRecent(deviceId, "route", routeId));
        }
        await Promise.all(writes);
    }

    function resolveRouteIdForRecent(routeShortName?: string): string | undefined {
        const trimmed = routeShortName?.trim();
        if (!trimmed) {
            return undefined;
        }
        return repository.getRouteByShortName(trimmed)?.id;
    }

    function getValidatedStop(stopId: string): BusStop {
        const stop = repository.getStopById(stopId);
        if (!stop) {
            throw new NotFoundError(`Stop not found: ${stopId}`);
        }
        return stop;
    }

    function buildDashApiUrl(stopId: string, options: PredictionOptions): string {
        const { agency } = environment.dashApi;
        const params = new URLSearchParams({ stop: stopId });

        if (options.number !== undefined) {
            params.set("number", String(options.number));
        }
        if (options.route !== undefined) {
            params.set("route", options.route);
        }

        return `/real-time/${agency}/predictions?${params.toString()}`;
    }

    async function fetchFromDashApi(stopId: string, options: PredictionOptions): Promise<DashApiResponse> {
        const url = buildDashApiUrl(stopId, options);
        logger.info(`Fetching predictions from DASH API: ${url}`);
        const response = await axios.get(url);
        return response.data as DashApiResponse;
    }

    function mapToDestinations(destinations: DashDestination[]): Destination[] {
        return destinations.map((dest) => ({
            directionId: dest.directionId,
            headsign: dest.headsign,
            predictions: dest.predictions.map((pred) => ({
                min: pred.min,
                sec: pred.sec,
                time: pred.time,
                tripId: pred.tripId,
                vehicleId: pred.vehicleId,
            })),
        }));
    }

    function mapToRoutePredictions(predictionsData: DashPredictionData[]): RoutePrediction[] {
        return predictionsData.map((item) => ({
            routeId: item.routeId,
            routeName: item.routeName,
            routeShortName: item.routeShortName,
            stopId: item.stopId,
            stopName: item.stopName,
            stopCode: item.stopCode,
            destinations: mapToDestinations(item.destinations),
        }));
    }

    async function getPredictionsForStop(
        stopId: string,
        options: PredictionOptions = {},
    ): Promise<StopPredictionsResponse> {
        const stop = getValidatedStop(stopId);

        const dashResponse = await fetchFromDashApi(stopId, options);

        if (!dashResponse.success) {
            throw new UpstreamApiError(`DASH API returned success: false for stop ${stopId}`);
        }

        const response: StopPredictionsResponse = {
            success: true,
            generatedAt: new Date().toISOString(),
            data: {
                agencyKey: dashResponse.data.agencyKey,
                stop: {
                    id: stopId,
                    name: stop.name,
                    code: stop.code,
                },
                routes: mapToRoutePredictions(dashResponse.data.predictionsData),
            },
        };

        const deviceId = options.deviceId;
        if (deviceId !== undefined && deviceId.trim().length > 0) {
            recordRecentView(deviceId, stopId, resolveRouteIdForRecent(options.route)).catch((error) => {
                const message = error instanceof Error ? error.message : "Unknown error";
                logger.warn(`Failed to record recents for device ${deviceId}: ${message}`);
            });
        }

        return response;
    }

    return { getPredictionsForStop };
}
