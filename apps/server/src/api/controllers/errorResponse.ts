import type { Response } from "express";
import { logger } from "../../config";
import { DataNotReadyError, NotFoundError, UpstreamApiError } from "../errors";

// A short fixed hint: the first route/stop load normally lands within seconds of DASH answering, and the
// value is deliberately not tied to the loader's backoff (D-03).
const RETRY_AFTER_SECONDS = 5;
const UNEXPECTED_ERROR_DETAILS = "An unexpected error occurred";

export function sendErrorResponse(res: Response, error: unknown): void {
    if (error instanceof NotFoundError) {
        res.status(404).json({ error: "Not Found", details: error.message });
        return;
    }
    if (error instanceof DataNotReadyError) {
        res.set("Retry-After", String(RETRY_AFTER_SECONDS));
        res.status(503).json({ error: "Service Unavailable", details: error.message });
        return;
    }
    if (error instanceof UpstreamApiError) {
        res.status(502).json({ error: "Bad Gateway", details: error.message });
        return;
    }

    // The body stays generic because an unexpected error's text can carry internals (WR-02/IN-04). Only the
    // stack or string form is logged, never the error object, which could serialize DASH_API_KEY from an
    // axios config (Phase 12 D-12). The request URL is not logged either: /stops/nearby carries rider
    // coordinates. Formatted inline because controller tests mock the config barrel with only a logger.
    const description = error instanceof Error ? (error.stack ?? error.message) : String(error);
    logger.error(`Unexpected error while handling a request: ${description}`);
    res.status(500).json({ error: "Request Failed", details: UNEXPECTED_ERROR_DETAILS });
}
