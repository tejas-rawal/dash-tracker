import { logger } from "../../config";
import type { StopPredictionsResponse } from "../models/Prediction";
import type { PredictionService } from "./PredictionService";

const POLL_INTERVAL_MS = 30_000;

type Subscriber = (payload: StopPredictionsResponse) => void;

interface StreamLoop {
    subscribers: Set<Subscriber>;
    lastData: StopPredictionsResponse;
    timer: NodeJS.Timeout;
}

export interface PredictionStreamService {
    subscribe(
        stopId: string,
        onUpdate: Subscriber,
    ): Promise<{ initialPayload: StopPredictionsResponse; unsubscribe: () => void }>;
}

export function createPredictionStreamService(predictionService: PredictionService): PredictionStreamService {
    const loops = new Map<string, StreamLoop>();
    const pendingFirstFetch = new Map<string, Promise<StopPredictionsResponse>>();

    async function poll(stopId: string): Promise<void> {
        const entry = loops.get(stopId);
        if (!entry) {
            return;
        }

        try {
            const result = await predictionService.getPredictionsForStop(stopId);
            entry.lastData = result;
            for (const subscriber of entry.subscribers) {
                try {
                    subscriber(result);
                } catch (deliveryError) {
                    const message = deliveryError instanceof Error ? deliveryError.message : "Unknown error";
                    logger.error(`Failed to deliver prediction update for stop ${stopId}: ${message}`);
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            logger.error(`Failed to poll predictions for stop ${stopId}: ${message}`);
        }
    }

    function unsubscribeFrom(stopId: string, onUpdate: Subscriber): void {
        const entry = loops.get(stopId);
        if (!entry) {
            return;
        }

        entry.subscribers.delete(onUpdate);
        if (entry.subscribers.size === 0) {
            clearInterval(entry.timer);
            loops.delete(stopId);
        }
    }

    async function subscribe(
        stopId: string,
        onUpdate: Subscriber,
    ): Promise<{ initialPayload: StopPredictionsResponse; unsubscribe: () => void }> {
        const existing = loops.get(stopId);
        if (existing) {
            existing.subscribers.add(onUpdate);
            return {
                initialPayload: existing.lastData,
                unsubscribe: () => unsubscribeFrom(stopId, onUpdate),
            };
        }

        let fetchPromise = pendingFirstFetch.get(stopId);
        if (!fetchPromise) {
            fetchPromise = predictionService.getPredictionsForStop(stopId);
            pendingFirstFetch.set(stopId, fetchPromise);
        }

        let initialPayload: StopPredictionsResponse;
        try {
            initialPayload = await fetchPromise;
        } finally {
            pendingFirstFetch.delete(stopId);
        }

        // Another concurrent caller may have already created the loop while we awaited the shared fetch.
        const raced = loops.get(stopId);
        if (raced) {
            raced.subscribers.add(onUpdate);
            return {
                initialPayload: raced.lastData,
                unsubscribe: () => unsubscribeFrom(stopId, onUpdate),
            };
        }

        const entry: StreamLoop = {
            subscribers: new Set([onUpdate]),
            lastData: initialPayload,
            timer: setInterval(() => {
                void poll(stopId);
            }, POLL_INTERVAL_MS),
        };
        loops.set(stopId, entry);

        return {
            initialPayload,
            unsubscribe: () => unsubscribeFrom(stopId, onUpdate),
        };
    }

    return { subscribe };
}
