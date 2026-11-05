import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ipKeyGenerator } from "express-rate-limit";
import { logger } from "../../config";

// A bare D-xx in this file is a Phase 16 decision; older decisions name their phase.

// A rider app with a few stops open fits within it, and it bounds one IP to at most 5 extra DASH polls every 30 s
// (D-01, D-03).
const MAX_CONCURRENT_STREAMS_PER_IP = 5;
// A short fixed backoff hint, like the not-ready 503's, so a client that reconnects on its own backs off instead of
// looping. A slot frees the moment one of the client's own streams closes, so there is no window to wait out (D-11).
const STREAM_CAP_RETRY_AFTER_SECONDS = 5;
// Same { error, details } shape as the bucket's 429, but it names the concurrency cap (D-10).
const STREAM_CAP_DETAILS = "Too many open prediction streams from this client; close one before opening another";
// Express derives req.ip from the socket address, which is gone once the socket closes. Such a request is still
// capped, under one shared key, so no request path skips the cap (D-09).
const UNKNOWN_CLIENT_KEY = "unknown";

// Each instance counts on its own map so tests never share counts (D-13). The map is a parameter, the way
// express-rate-limit takes a store, so a test can read exact counts.
export function createStreamConcurrencyCap(openStreams: Map<string, number> = new Map()): RequestHandler {
    // Synchronous up to next(): the claim has to land before the controller's async subscribe, so parallel connects
    // cannot all pass the check (D-04).
    return (req: Request, res: Response, next: NextFunction): void => {
        // The connection is already gone, so its 'close' has fired and a claim could never be released, which
        // would lock this client out for good. Nobody is left to read a response, so the connect is dropped
        // without next().
        if (res.destroyed) {
            return;
        }

        // The shared bucket's own key, so IPv4-mapped IPv6 reads as IPv4 and an IPv6 client is one /56; req.ip
        // already honors TRUST_PROXY_HOPS (D-09, Phase 14 D-17).
        const key = req.ip === undefined ? UNKNOWN_CLIENT_KEY : ipKeyGenerator(req.ip);
        const open = openStreams.get(key) ?? 0;

        if (open >= MAX_CONCURRENT_STREAMS_PER_IP) {
            // Logged on every rejection; the bucket already bounds the volume (D-12). Only baseUrl + path is
            // logged, because the full request URL carries the query string (Phase 14 D-15).
            logger.warn(
                `Concurrent stream cap reached for ${key} on ${req.baseUrl}${req.path}; rejecting the new stream`,
            );
            res.set("Retry-After", String(STREAM_CAP_RETRY_AFTER_SECONDS));
            res.status(429).json({ error: "Too Many Requests", details: STREAM_CAP_DETAILS });
            return;
        }

        openStreams.set(key, open + 1);
        let released = false;

        // 'close' covers client disconnect, the controller's res.end() on server end, socket errors, the shutdown
        // force-close and every finished error answer. The guard runs the release once per claim, and the delete
        // keeps idle IPs out of memory (D-05, D-06). The response, not the request, tracks the connection: the
        // request closes as soon as its body is consumed, while the client may still be listening (D-14, Phase 12
        // WR-04).
        const release = (): void => {
            if (released) {
                return;
            }
            released = true;
            const remaining = (openStreams.get(key) ?? 1) - 1;
            if (remaining > 0) {
                openStreams.set(key, remaining);
            } else {
                openStreams.delete(key);
            }
        };
        res.on("close", release);

        next();
    };
}

// The one shared cap, wired on /predictions/stream only (D-13).
export const streamConcurrencyCap = createStreamConcurrencyCap();
