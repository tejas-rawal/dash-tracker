import { logger } from "../../config";
import { NotFoundError } from "../errors";
import type { StopPredictionsResponse } from "../models/Prediction";
import type { PredictionService } from "./PredictionService";

const POLL_INTERVAL_MS = 30_000;

export interface StreamSubscriber {
    onUpdate: (payload: StopPredictionsResponse) => void;
    onEnd: () => void;
}

interface StreamLoop {
    subscribers: Set<StreamSubscriber>;
    lastData: StopPredictionsResponse;
    timer: NodeJS.Timeout;
}

export interface PredictionStreamService {
    subscribe(
        stopId: string,
        subscriber: StreamSubscriber,
    ): Promise<{ initialPayload: StopPredictionsResponse; unsubscribe: () => void }>;
}

export function createPredictionStreamService(predictionService: PredictionService): PredictionStreamService {
    const loops = new Map<string, StreamLoop>();
    const pendingFirstFetch = new Map<string, Promise<StopPredictionsResponse>>();

    function endLoop(stopId: string, entry: StreamLoop, reason: string): void {
        // A tick from a loop that was since removed (and possibly replaced) must not tear down the newer one.
        if (loops.get(stopId) !== entry) {
            return;
        }

        // The loop is gone before any onEnd runs, so an unsubscribe made from inside onEnd is a no-op.
        clearInterval(entry.timer);
        loops.delete(stopId);
        const subscribers = Array.from(entry.subscribers);
        entry.subscribers.clear();
        if (subscribers.length === 0) {
            return;
        }

        logger.warn(`Ending ${subscribers.length} prediction stream(s) for stop ${stopId}: ${reason}`);
        for (const subscriber of subscribers) {
            try {
                subscriber.onEnd();
            } catch (endError) {
                const message = endError instanceof Error ? endError.message : "Unknown error";
                logger.error(`Failed to end prediction stream for stop ${stopId}: ${message}`);
            }
        }
    }

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
                    subscriber.onUpdate(result);
                } catch (deliveryError) {
                    const message = deliveryError instanceof Error ? deliveryError.message : "Unknown error";
                    logger.error(`Failed to deliver prediction update for stop ${stopId}: ${message}`);
                }
            }
        } catch (error) {
            // Since the hourly refresh (Phase 13) the dataset can drop a stop. Every later tick would then throw
            // NotFoundError forever, leaving riders on a stream that never updates. Ending it lets an EventSource
            // reconnect land on the same 404 a fresh request gets.
            if (error instanceof NotFoundError) {
                endLoop(stopId, entry, error.message);
                return;
            }
            const message = error instanceof Error ? error.message : "Unknown error";
            logger.error(`Failed to poll predictions for stop ${stopId}: ${message}`);
        }
    }

    function unsubscribeFrom(stopId: string, subscriber: StreamSubscriber): void {
        const entry = loops.get(stopId);
        if (!entry) {
            return;
        }

        entry.subscribers.delete(subscriber);
        if (entry.subscribers.size === 0) {
            clearInterval(entry.timer);
            loops.delete(stopId);
        }
    }

    async function subscribe(
        stopId: string,
        subscriber: StreamSubscriber,
    ): Promise<{ initialPayload: StopPredictionsResponse; unsubscribe: () => void }> {
        const existing = loops.get(stopId);
        if (existing) {
            existing.subscribers.add(subscriber);
            return {
                initialPayload: existing.lastData,
                unsubscribe: () => unsubscribeFrom(stopId, subscriber),
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
            raced.subscribers.add(subscriber);
            return {
                initialPayload: raced.lastData,
                unsubscribe: () => unsubscribeFrom(stopId, subscriber),
            };
        }

        const entry: StreamLoop = {
            subscribers: new Set([subscriber]),
            lastData: initialPayload,
            timer: setInterval(() => {
                void poll(stopId);
            }, POLL_INTERVAL_MS),
        };
        loops.set(stopId, entry);

        return {
            initialPayload,
            unsubscribe: () => unsubscribeFrom(stopId, subscriber),
        };
    }

    return { subscribe };
}
