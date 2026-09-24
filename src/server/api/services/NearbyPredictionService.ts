import { axios, environment, logger } from "../../config";
import { UpstreamApiError } from "../errors";
import type {
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

// The shared mapping dereferences every prediction element, so a non-array predictions or a
// non-object element would throw there and turn the whole request into a 500. Such an entry is
// invalidated here instead, so only it is dropped.
function isValidNearbyEntry(entry: unknown): entry is DashNearbyPredictionData {
    if (!isRecord(entry)) {
        return false;
    }
    const { stopId, distanceToStop, destinations } = entry;
    return (
        typeof stopId === "string" &&
        stopId !== "" &&
        typeof distanceToStop === "number" &&
        Number.isFinite(distanceToStop) &&
        distanceToStop >= 0 &&
        Array.isArray(destinations) &&
        destinations.every(
            (destination) =>
                isRecord(destination) &&
                Array.isArray(destination.predictions) &&
                destination.predictions.every(isRecord),
        )
    );
}

function describeEntry(entry: unknown): string {
    const field = (key: string): string => {
        const value = isRecord(entry) ? entry[key] : undefined;
        return typeof value === "string" && value !== "" ? value : "unknown";
    };
    return `stop ${field("stopId")}, route ${field("routeShortName")}`;
}

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

    async function fetchFromDashApi(lat: number, lng: number, options: NearbyPredictionOptions): Promise<unknown> {
        const meters = toMeters(options.radius ?? DEFAULT_RADIUS_MILES);
        const url = buildDashApiUrl(lat, lng, meters, options.number);
        // The rider's coordinates are deliberately kept out of the log line.
        logger.info(`Fetching nearby predictions from DASH API: predictions-near-location (meters=${meters})`);
        try {
            const response = await axios.get(url);
            return response.data;
        } catch (error: unknown) {
            // Only the message may leave this block: axios errors carry config.headers.Authorization,
            // which is DASH_API_KEY, so the error object is never logged or rethrown.
            const message = error instanceof Error ? error.message : "Unknown error";
            throw new UpstreamApiError(`DASH API request failed for nearby predictions: ${message}`);
        }
    }

    function parseDashResponse(body: unknown): { agencyKey: string; predictionsData: unknown[] } {
        if (!isRecord(body)) {
            throw new UpstreamApiError(
                "DASH API returned a malformed nearby predictions response (body is not an object)",
            );
        }
        if (body.success !== true) {
            throw new UpstreamApiError("DASH API returned success: false for nearby predictions");
        }
        const { data } = body;
        if (!isRecord(data) || !Array.isArray(data.predictionsData)) {
            throw new UpstreamApiError(
                "DASH API returned a malformed nearby predictions response (predictionsData is not an array)",
            );
        }
        return { agencyKey: data.agencyKey as string, predictionsData: data.predictionsData };
    }

    function filterValidEntries(entries: unknown[]): DashNearbyPredictionData[] {
        return entries.filter((entry): entry is DashNearbyPredictionData => {
            const valid = isValidNearbyEntry(entry);
            if (!valid) {
                logger.warn(`Dropping malformed nearby prediction entry (${describeEntry(entry)})`);
            }
            return valid;
        });
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
        const { agencyKey, predictionsData } = parseDashResponse(await fetchFromDashApi(lat, lng, options));

        return {
            success: true,
            generatedAt: new Date().toISOString(),
            data: {
                agencyKey,
                stops: groupByStop(filterValidEntries(predictionsData)),
            },
        };
    }

    return { getNearbyPredictions };
}
