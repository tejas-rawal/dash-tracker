import { axios, environment, logger } from "../../config";
import { NotFoundError } from "../errors";
import type {
    DashApiResponse,
    DashPredictionData,
    PredictionOptions,
    RoutePrediction,
    StopPredictionsResponse,
} from "../models/Prediction";
import { BusDataRepository } from "../repositories";

const repository = BusDataRepository.getInstance();

function validateStopExists(stopId: string): void {
    const stop = repository.getStopById(stopId);
    if (!stop) {
        throw new NotFoundError(`Stop not found: ${stopId}`);
    }
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

function mapToRoutePredictions(predictionsData: DashPredictionData[]): RoutePrediction[] {
    return predictionsData.map((item) => ({
        routeId: item.routeId,
        routeName: item.routeName,
        routeShortName: item.routeShortName,
        stopId: item.stopId,
        stopName: item.stopName,
        stopCode: item.stopCode,
        destinations: item.destinations,
    }));
}

export async function getPredictionsForStop(
    stopId: string,
    options: PredictionOptions = {},
): Promise<StopPredictionsResponse> {
    validateStopExists(stopId);

    const dashResponse = await fetchFromDashApi(stopId, options);

    if (!dashResponse.success) {
        throw new Error(`DASH API returned success: false for stop ${stopId}`);
    }

    const stop = repository.getStopById(stopId);

    return {
        success: true,
        data: {
            agencyKey: dashResponse.data.agencyKey,
            stop: {
                id: stopId,
                name: stop?.name ?? "",
                code: stop?.code ?? 0,
            },
            routes: mapToRoutePredictions(dashResponse.data.predictionsData),
        },
    };
}
