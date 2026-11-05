import type { DashDestination, DashPredictionData, Destination, RoutePrediction } from "../models/Prediction";

// The field-by-field copy is deliberate: it drops any extra upstream prediction fields
// (e.g. the block identifier) so they never leak into public responses.
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

export function mapToRoutePrediction(item: DashPredictionData): RoutePrediction {
    return {
        routeId: item.routeId,
        routeName: item.routeName,
        routeShortName: item.routeShortName,
        stopId: item.stopId,
        stopName: item.stopName,
        stopCode: item.stopCode,
        destinations: mapToDestinations(item.destinations),
    };
}

export function mapToRoutePredictions(predictionsData: DashPredictionData[]): RoutePrediction[] {
    return predictionsData.map(mapToRoutePrediction);
}
