import cors from "cors";
import type { RequestHandler } from "express";

// A bare D-xx in this file is a Phase 18 decision; older decisions name their phase.

// Retry-After tells a browser client when to retry a 429 or 503; RateLimit and RateLimit-Policy are the draft-8
// headers the shared upstream bucket already sends (D-13, Phase 14 D-14).
const EXPOSED_HEADERS = ["Retry-After", "RateLimit", "RateLimit-Policy"];

// The exact allowlist comes in as a parameter, so tests can build the middleware for any list (D-13, D-15).
export function createCorsMiddleware(allowedOrigins: readonly string[]): RequestHandler {
    const allowed = new Set(allowedOrigins);

    return cors({
        // A callback instead of the array: given an array, cors writes Vary and Access-Control-Expose-Headers on
        // every response and answers every OPTIONS itself. Answering false makes it call next() without touching
        // the response, so a request with no Origin, or an Origin off the list, behaves exactly as before CORS
        // (CORS-04, D-13). A match echoes that exact origin, never *, and an empty list allows none (D-15).
        origin: (requestOrigin, callback): void => {
            if (requestOrigin !== undefined && allowed.has(requestOrigin)) {
                callback(null, requestOrigin);
                return;
            }
            callback(null, false);
        },
        exposedHeaders: EXPOSED_HEADERS,
        // No credentials: favorites and recents are keyed by the X-Device-Id header, not cookies, so
        // Access-Control-Allow-Credentials is never sent. allowedHeaders stays unset, so a preflight's
        // Access-Control-Request-Headers (X-Device-Id) is echoed back (D-13).
    });
}
