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
import { BusDataRepository } from "../repositories";

const repository = BusDataRepository.getInstance();

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

export async function getPredictionsForStop(
    stopId: string,
    options: PredictionOptions = {},
): Promise<StopPredictionsResponse> {
    const stop = getValidatedStop(stopId);

    const dashResponse = await fetchFromDashApi(stopId, options);

    if (!dashResponse.success) {
        throw new UpstreamApiError(`DASH API returned success: false for stop ${stopId}`);
    }

    return {
        success: true,
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
}
