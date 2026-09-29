import type { Request, RequestHandler, Response } from "express";
import { logger } from "../../config";
import { NotFoundError, UpstreamApiError } from "../errors";
import type { StopPredictionsResponse } from "../models/Prediction";
import type { PredictionStreamService } from "../services/PredictionStreamService";

export interface PredictionStreamController {
    getPredictionsStream: RequestHandler;
}

function resolveErrorStatus(error: unknown): number {
    if (error instanceof NotFoundError) {
        return 404;
    }
    if (error instanceof UpstreamApiError) {
        return 502;
    }
    return 500;
}

function resolveErrorBody(error: unknown): { error: string; details: string } {
    const details = error instanceof Error ? error.message : "Unknown error";
    let label: string;
    if (error instanceof NotFoundError) {
        label = "Not Found";
    } else if (error instanceof UpstreamApiError) {
        label = "Bad Gateway";
    } else {
        label = "Request Failed";
    }
    return { error: label, details };
}

export function createPredictionStreamController(streamService: PredictionStreamService): PredictionStreamController {
    const getPredictionsStream: RequestHandler = async (req: Request, res: Response) => {
        const { stop } = req.query as Record<string, string | undefined>;

        if (!stop) {
            res.status(400).json({ error: "Bad Request", details: "stop parameter is required" });
            return;
        }

        const send = (payload: StopPredictionsResponse) => {
            res.write(`event: prediction\ndata: ${JSON.stringify(payload)}\n\n`);
        };

        let finished = false;
        let unsubscribe: (() => void) | undefined = undefined;
        let cleanedUp = false;

        // One cleanup path for both client disconnect and response socket errors. The guard makes an
        // error followed by a close (or the reverse) run it only once (D-14). It is registered before
        // subscribe is awaited so an error before or around writeHead is still caught: an 'error' event
        // with no listener would be thrown as an uncaught exception and take the process down.
        const cleanup = (): void => {
            finished = true;
            if (cleanedUp || !unsubscribe) {
                return;
            }
            cleanedUp = true;
            unsubscribe();
            res.end();
        };

        // The response, not the request, tracks the connection: the request closes as soon as its body is
        // consumed (express.json() reads any GET body), while the client may still be listening.
        res.on("close", cleanup);
        res.on("error", (error: unknown): void => {
            const message = error instanceof Error ? error.message : "Unknown error";
            logger.warn(`SSE response error for stop ${stop}: ${message}`);
            cleanup();
        });

        let subscription: { initialPayload: StopPredictionsResponse; unsubscribe: () => void };
        try {
            subscription = await streamService.subscribe(stop, send);
        } catch (error: unknown) {
            // A client that already disconnected has no one to read the error response.
            if (finished || res.headersSent) {
                return;
            }
            res.status(resolveErrorStatus(error)).json(resolveErrorBody(error));
            return;
        }

        const { initialPayload } = subscription;
        unsubscribe = subscription.unsubscribe;

        if (finished || res.destroyed) {
            cleanup();
            return;
        }

        try {
            res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                // biome-ignore lint/style/useNamingConvention: HTTP header name, casing is fixed by the spec
                Connection: "keep-alive",
            });
            send(initialPayload);
        } catch (writeError: unknown) {
            const message = writeError instanceof Error ? writeError.message : "Unknown error";
            logger.error(`Failed to write initial SSE frame for stop ${stop}: ${message}`);
            cleanup();
        }
    };

    return { getPredictionsStream };
}
