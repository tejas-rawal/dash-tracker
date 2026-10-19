import type { NextFunction, Request, Response } from "express";
import { type AugmentedRequest, type Options, type RateLimitRequestHandler, rateLimit } from "express-rate-limit";
import { logger } from "../../config";

const UPSTREAM_RATE_LIMIT = 60; // Requests per window per client IP across every live DASH route (D-12).
const UPSTREAM_RATE_WINDOW_MS = 60_000; // One minute: long enough to absorb a page load's burst (D-12).
// Matches the API's { error, details } bodies and points the client at the header that says when to retry (D-13).
const RATE_LIMITED_DETAILS = "Too many live requests from this client; retry after the Retry-After interval";

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function createUpstreamRateLimiter(): RateLimitRequestHandler {
    return rateLimit({
        windowMs: UPSTREAM_RATE_WINDOW_MS,
        limit: UPSTREAM_RATE_LIMIT,
        // RateLimit + RateLimit-Policy (D-14). Must stay on: the library only sets Retry-After on a 429 while
        // standard or legacy headers are enabled.
        standardHeaders: "draft-8",
        legacyHeaders: false, // No X-RateLimit-* headers (D-14).
        // Library validation and store messages go through Winston, message only, never the object (Phase 12 D-12).
        logger: {
            warn: (error: unknown): void => {
                logger.warn(`express-rate-limit: ${messageOf(error)}`);
            },
            error: (error: unknown): void => {
                logger.error(`express-rate-limit: ${messageOf(error)}`);
            },
        },
        handler: (req: Request, res: Response, _next: NextFunction, options: Options): void => {
            const { used, key } = (req as AugmentedRequest).rateLimit;
            // The MemoryStore keeps counting rejected hits, so exactly one request per key per window sees
            // limit + 1: one warn per IP per window (D-15). Only baseUrl + path is logged, because the full
            // request URL carries the query string and /predictions/nearby's query holds rider coordinates
            // (D-15, Phase 11 rule).
            if (used === UPSTREAM_RATE_LIMIT + 1) {
                logger.warn(
                    `Rate limit exceeded for ${key} on ${req.baseUrl}${req.path}; rejecting until the window resets`,
                );
            }
            res.status(options.statusCode).json({ error: "Too Many Requests", details: RATE_LIMITED_DETAILS });
        },
    });
}

// The one shared bucket for every live-upstream route (D-10). Created at module load because express-rate-limit
// flags instances created inside a request handler.
export const upstreamRateLimiter = createUpstreamRateLimiter();
