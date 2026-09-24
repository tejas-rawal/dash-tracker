import { axios, environment, logger } from "../../config";
import { UpstreamApiError } from "../errors";
import type {
    DashNearbyApiResponse,
    DashNearbyPredictionData,
    NearbyPredictionOptions,
    NearbyPredictionsResponse,
    NearbyStopPredictions,
} from "../models/Prediction";
import type { ServiceAlertRepository } from "../repositories";
import { mapToRoutePrediction } from "./predictionMapping";
import { mapToServiceAlertSummaries } from "./serviceAlertMapping";

const DEFAULT_RADIUS_MILES = 0.5;
const METERS_PER_MILE = 1609.344;

export interface NearbyPredictionService {
    getNearbyPredictions(
        lat: number,
        lng: number,
        options?: NearbyPredictionOptions,
    ): Promise<NearbyPredictionsResponse>;
}

export function createNearbyPredictionService(serviceAlertRepository: ServiceAlertRepository): NearbyPredictionService {
    // Ceiling so the upstream search is never 0 m and never narrower than the requested radius.
    function toMeters(radiusMiles: number): number {
        return Math.ceil(radiusMiles * METERS_PER_MILE);
    }

    function buildDashApiUrl(lat: number, lng: number, meters: number, number: number | undefined): string {
        const { agency } = environment.dashApi;
        // Upstream names the longitude parameter `lon`; our public API uses `lng`.
        const params = new URLSearchParams({ lat: String(lat), lon: String(lng), meters: String(meters) });

        if (number !== undefined) {
            params.set("number", String(number));
        }

        return `/real-time/${agency}/predictions-near-location?${params.toString()}`;
    }

    async function fetchFromDashApi(
        lat: number,
        lng: number,
        options: NearbyPredictionOptions,
    ): Promise<DashNearbyApiResponse> {
        const meters = toMeters(options.radius ?? DEFAULT_RADIUS_MILES);
        const url = buildDashApiUrl(lat, lng, meters, options.number);
        // The rider's coordinates are deliberately kept out of the log line.
        logger.info(`Fetching nearby predictions from DASH API: predictions-near-location (meters=${meters})`);
        const response = await axios.get(url);
        return response.data as DashNearbyApiResponse;
    }

    function groupByStop(entries: DashNearbyPredictionData[]): NearbyStopPredictions[] {
        const stops = new Map<string, NearbyStopPredictions>();

        for (const entry of entries) {
            let stop = stops.get(entry.stopId);
            if (stop === undefined) {
                stop = {
                    id: entry.stopId,
                    name: entry.stopName,
                    code: entry.stopCode,
                    distance: entry.distanceToStop / METERS_PER_MILE,
                    routes: [],
                    alerts: mapToServiceAlertSummaries(serviceAlertRepository.getActiveAlertsForStop(entry.stopId)),
                };
                stops.set(entry.stopId, stop);
            }
            stop.routes.push(mapToRoutePrediction(entry));
        }

        return Array.from(stops.values()).sort((a, b) => a.distance - b.distance);
    }

    async function getNearbyPredictions(
        lat: number,
        lng: number,
        options: NearbyPredictionOptions = {},
    ): Promise<NearbyPredictionsResponse> {
        const dashResponse = await fetchFromDashApi(lat, lng, options);

        if (dashResponse.success !== true) {
            throw new UpstreamApiError("DASH API returned success: false for nearby predictions");
        }

        return {
            success: true,
            generatedAt: new Date().toISOString(),
            data: {
                agencyKey: dashResponse.data.agencyKey,
                stops: groupByStop(dashResponse.data.predictionsData),
            },
        };
    }

    return { getNearbyPredictions };
}
