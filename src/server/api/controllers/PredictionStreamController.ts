import type { Request, RequestHandler, Response } from "express";
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

        try {
            const { initialPayload, unsubscribe } = await streamService.subscribe(stop, send);

            res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                // biome-ignore lint/style/useNamingConvention: HTTP header name, casing is fixed by the spec
                Connection: "keep-alive",
            });
            send(initialPayload);

            req.on("close", () => {
                unsubscribe();
                res.end();
            });
        } catch (error: unknown) {
            res.status(resolveErrorStatus(error)).json(resolveErrorBody(error));
        }
    };

    return { getPredictionsStream };
}
