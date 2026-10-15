# Phase 16: Concurrent SSE Stream Cap per IP - Pattern Map

**Mapped:** 2026-10-12
**Files analyzed:** 5 (2 new, 3 modified) plus 1 optional route-level test
**Analogs found:** 5 / 5 (every file has a tracked, in-repo analog)

All analog paths below are git-tracked source (verified with `git ls-files`).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/server/api/middleware/streamConcurrencyCap.ts` (NEW) | middleware | request-response + event-driven (res lifecycle) | `src/server/api/middleware/upstreamRateLimit.ts` (shape, constants, 429, warn log) + `src/server/api/controllers/PredictionStreamController.ts` lines 24-49 (guarded, once-only `res` close/error release) | exact (role) + exact (lifecycle) |
| `src/server/api/middleware/streamConcurrencyCap.test.ts` (NEW) | test | request-response + streaming | `src/server/api/middleware/upstreamRateLimit.test.ts` (fresh instance per app, long-lived server, `closeAllConnections`) + `src/server/api/routes/dataReloadStream.test.ts` (raw `http.get` held-open stream, server-ended stream) | exact |
| `src/server/api/routes/predictionRoutes.ts` (MODIFY, line 23) | route | request-response | itself (line 20-24 middleware chaining) | exact |
| `src/server/api/routes/rateLimit.test.ts` (MODIFY, optional) or new `src/server/api/routes/streamConcurrencyCap.test.ts` | test (route integration) | request-response | `src/server/api/routes/rateLimit.test.ts` | exact |
| `.claude/CLAUDE.md` (MODIFY, line 75 "Rate limiting" bullet) | config/docs | n/a | itself | exact |

`src/server/api/controllers/errorResponse.ts` and `src/server/api/controllers/PredictionStreamController.ts` are referenced but NOT modified (D-13, D-11 discretion: mirror the constant, do not export from `errorResponse.ts`).

---

## Pattern Assignments

### `src/server/api/middleware/streamConcurrencyCap.ts` (middleware, request-response + res lifecycle)

**Primary analog:** `src/server/api/middleware/upstreamRateLimit.ts` (49 lines)

**Imports pattern** (lines 1-3) - relative paths, `type` imports for Express, logger from the config barrel:
```typescript
import type { NextFunction, Request, Response } from "express";
import { type AugmentedRequest, type Options, type RateLimitRequestHandler, rateLimit } from "express-rate-limit";
import { logger } from "../../config";
```
For the cap: `import type { NextFunction, Request, RequestHandler, Response } from "express";` and `import { logger } from "../../config";`. If key parity is adopted (see "Client key" below) also `import { ipKeyGenerator } from "express-rate-limit";`.

**Named constants with D-ref "why" comments** (lines 5-8) - copy this exact style:
```typescript
const UPSTREAM_RATE_LIMIT = 60; // Requests per window per client IP across every live DASH route (D-12).
const UPSTREAM_RATE_WINDOW_MS = 60_000; // One minute: long enough to absorb a page load's burst (D-12).
// Matches the API's { error, details } bodies and points the client at the header that says when to retry (D-13).
const RATE_LIMITED_DETAILS = "Too many live requests from this client; retry after the Retry-After interval";
```
Cap equivalents: `MAX_CONCURRENT_STREAMS_PER_IP = 5` (comment per D-03: a rider app with a few stops open fits; bounds one IP to at most 5 extra DASH polls every 30s), a `..._RETRY_AFTER_SECONDS = 5` constant (D-11), and a `..._DETAILS` string that names the concurrency cap and does NOT mention a window (D-10), e.g. `"Too many open prediction streams from this client; close one before opening another"`.

**Factory + module-level shared instance** (lines 14-15 and 47-49):
```typescript
export function createUpstreamRateLimiter(): RateLimitRequestHandler {
    return rateLimit({
    ...
}

// The one shared bucket for every live-upstream route (D-10). Created at module load because express-rate-limit
// flags instances created inside a request handler.
export const upstreamRateLimiter = createUpstreamRateLimiter();
```
Cap: `export function createStreamConcurrencyCap(): RequestHandler` whose closure owns `const openStreams = new Map<string, number>();` (D-13, one map per instance so tests never bleed), then `export const streamConcurrencyCap = createStreamConcurrencyCap();` at module bottom with a comment explaining it is the one shared instance wired on `/stream`. If a read-only accessor is exposed for tests (Claude's discretion), return an object type like `PredictionStreamController` does (`interface X { handler: RequestHandler; openCount(ip): number }`) - but the simplest choice matching the analog is returning a bare `RequestHandler` and testing through HTTP.

**429 response + warn log, baseUrl + path only** (lines 31-43):
```typescript
        handler: (req: Request, res: Response, _next: NextFunction, options: Options): void => {
            const { used, key } = (req as AugmentedRequest).rateLimit;
            // ... Only baseUrl + path is logged, because the full
            // request URL carries the query string and /predictions/nearby's query holds rider coordinates
            // (D-15, Phase 11 rule).
            if (used === UPSTREAM_RATE_LIMIT + 1) {
                logger.warn(
                    `Rate limit exceeded for ${key} on ${req.baseUrl}${req.path}; rejecting until the window resets`,
                );
            }
            res.status(options.statusCode).json({ error: "Too Many Requests", details: RATE_LIMITED_DETAILS });
        },
```
Cap differences: warn on EVERY rejection (D-12, no `used === limit + 1` gate), message must not say "window" and must start with a distinct, filterable prefix (tests filter warns by `startsWith`, see `upstreamRateLimit.test.ts` lines 57-61), e.g. `` `Concurrent stream cap reached for ${key} on ${req.baseUrl}${req.path}; rejecting new stream` ``. Never log `req.url`/`req.originalUrl` (they carry the query string). Respond with `res.set("Retry-After", String(...))` then `res.status(429).json({ error: "Too Many Requests", details: ... })` and `return` without calling `next()`.

**Retry-After header pattern** - `src/server/api/controllers/errorResponse.ts` lines 5-7 and 15-18:
```typescript
// A short fixed hint: the first route/stop load normally lands within seconds of DASH answering, and the
// value is deliberately not tied to the loader's backoff (D-03).
const RETRY_AFTER_SECONDS = 5;
...
    if (error instanceof DataNotReadyError) {
        res.set("Retry-After", String(RETRY_AFTER_SECONDS));
        res.status(503).json({ error: "Service Unavailable", details: error.message });
        return;
    }
```
`RETRY_AFTER_SECONDS` is not exported and its comment is 503-specific, so the cap should MIRROR it as its own named constant in `streamConcurrencyCap.ts` (with its own "why" comment: a backoff hint so EventSource does not tight-loop reconnects), not import or export it. Leave `RateLimit`/`RateLimit-Policy` headers as the bucket set them; add no new rate headers (D-11 discretion).

**Hand-written middleware signature** - `src/server/api/middleware/requireDeviceId.ts` lines 1-11 (the only non-library middleware in the repo):
```typescript
import type { NextFunction, Request, RequestHandler, Response } from "express";

export const requireDeviceId: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    ...
    if (value === undefined || value.trim().length === 0) {
        res.status(400).json({ error: "Bad Request", details: "X-Device-Id header is required" });
        return;
    }
    next();
};
```
Copy: synchronous handler typed `RequestHandler`, early `res.status(...).json(...)` + bare `return`, `next()` on pass. The cap must stay fully synchronous up to `next()` so the claim happens before any async controller work (D-04).

**Secondary analog for the release lifecycle:** `src/server/api/controllers/PredictionStreamController.ts` lines 24-49 - the guarded, run-once cleanup bound to `res` (not `req`) events:
```typescript
        let cleanedUp = false;

        // One cleanup path for both client disconnect and response socket errors. The guard makes an
        // error followed by a close (or the reverse) run it only once (D-14). ...
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
        res.on("error", (error: unknown): void => { ... cleanup(); });
```
Cap equivalent (D-04, D-06, D-14): after the check passes, increment the map synchronously, then create a per-claim `let released = false; const release = (): void => { if (released) return; released = true; const next = (map.get(key) ?? 1) - 1; if (next <= 0) map.delete(key); else map.set(key, next); }` and register it with `res.once("close", release)` before calling `next()`. Registering an `'error'` listener is NOT needed for safety - the controller already registers one on the same `res` (line 45), so no unhandled `'error'` throw; Node emits `'close'` after `'error'`/destroy, so `'close'` alone covers socket error, client disconnect, `res.end()` from server `onEnd` (controller line 39), the 400/404/503/502 JSON responses (`res.json` ends the response, `'close'` follows) and `server.closeAllConnections()` at shutdown (`src/server/app.ts` line 73). The `released` guard plus delete-at-zero satisfies "never negative, no idle memory" (D-06). Reuse the controller's comment wording about `res` vs `req` (Phase 12 WR-04).

**Client key (D-09) - flag for the planner:** the bucket does not key on raw `req.ip`. express-rate-limit 8.7.0's default `keyGenerator` returns `ipKeyGenerator(request.ip, 56)` (`node_modules/express-rate-limit/dist/index.cjs` lines 48-61, 833-846): it maps `::ffff:127.0.0.1` to `127.0.0.1` and collapses IPv6 to its /56 network. `rateLimit.test.ts` line 89 relies on this (`resetKey("127.0.0.1")`). To make the cap use "the same key the shared bucket uses" (D-09) and stop one IPv6 client from rotating addresses inside its /64, use `ipKeyGenerator(req.ip)` (exported, typed `ipKeyGenerator(ip: string, ipv6Subnet?: number | false): string` in `dist/index.d.ts` line 20) - this leans on an existing dependency per CLAUDE.md. `req.ip` is typed `string | undefined` (`@types/express-serve-static-core/index.d.ts` line 573) under `@tsconfig/strictest`, so handle `undefined` explicitly (e.g. pass straight to `next()` - a request with no socket address cannot hold a stream - or a fixed fallback key; state the reason in a comment). If raw `req.ip` is chosen instead, tests will see `::ffff:127.0.0.1` in the warn text.

---

### `src/server/api/middleware/streamConcurrencyCap.test.ts` (test, request-response + streaming)

**Primary analog:** `src/server/api/middleware/upstreamRateLimit.test.ts` (260 lines)

**Imports + fresh-instance app on one long-lived server** (lines 1-6, 15-33):
```typescript
import type { Server } from "node:http";
import express from "express";
import request from "supertest";
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../config";
import { createUpstreamRateLimiter } from "./upstreamRateLimit";
...
const servers: Server[] = [];

// A fresh limiter per app keeps every test's bucket its own. The app is served from one server that stays up
// until afterEach. Handing supertest the bare app would start a throwaway server per request, and Node 20's
// keep-alive agent can then reuse a pooled socket to an earlier, closed server that the OS gave the same port,
// so the request lands on a different app and limiter.
async function makeApp(options: { trustProxyHops?: number } = {}): Promise<Server> {
    const app = express();
    if (options.trustProxyHops !== undefined) {
        app.set("trust proxy", options.trustProxyHops);
    }
    app.get(PATH, createUpstreamRateLimiter(), (_req, res) => {
        res.json({ ok: true });
    });
    const server = app.listen(0);
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    return server;
}
```
For the cap: `app.get(PATH, createStreamConcurrencyCap(), fakeStreamHandler)` where the fake handler either holds the response open (`res.writeHead(200, { "Content-Type": "text/event-stream" }); res.write(...)` and never ends) or answers by query flag (`?fail=404` -> `res.status(404).json(...)`, `?end=1` -> `res.end()` later to mimic server `onEnd`, `?pending=1` -> never responds, to mimic disconnect during pending subscribe). Use `trustProxyHops: 1` + `X-Forwarded-For` to get two distinct IPs (IP A vs IP B, SC1), exactly as lines 158-175.

**Spies + teardown** (lines 63-79):
```typescript
    beforeEach(() => {
        ...
        warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);
        errorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        for (const server of servers.splice(0)) {
            server.closeAllConnections();
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });
```
`closeAllConnections()` is essential here: held-open streams would otherwise hang `server.close`. No fake timers are needed for the cap (it has no window).

**Warn filtering by message prefix** (lines 57-61) and **no-query-string log assertion** (lines 138-156):
```typescript
    function rateLimitWarnings(): unknown[][] {
        return warnSpy.mock.calls.filter(
            ([message]) => typeof message === "string" && message.startsWith("Rate limit exceeded for "),
        );
    }
...
        const logged = JSON.stringify(warnSpy.mock.calls);
        for (const fragment of ["38.8048", "-77.0469", "lat=", "lng=", "?"]) {
            expect(logged).not.toContain(fragment);
        }
```
Use a `stop=349`-style query on the cap tests and assert `"stop="`, `"349"`, `"?"` never appear in logs (D-12).

**Parallel burst exactness** (lines 177-188) - copy for "parallel connects never exceed 5". Note: `Promise.all` of supertest requests waits for full responses, which never arrive for held streams; for the cap, open held streams with raw `http.get` (below) and count responses by status as each one's headers arrive.
```typescript
        const responses = await Promise.all(Array.from({ length: 70 }, () => request(app).get(PATH)));
        expect(responses.filter((response) => response.status === 200)).toHaveLength(60);
        expect(responses.filter((response) => response.status === 429)).toHaveLength(10);
```

**Separate instances have separate counts** (lines 245-259) - copy for the D-13 "no count bleed" test.

**Secondary analog for held-open streams:** `src/server/api/routes/dataReloadStream.test.ts`

Raw `http.get` that captures status on headers and resolves on first chunk / `end` (lines 123-153):
```typescript
        let resolveFirstChunk: () => void = () => {};
        const firstChunk = new Promise<void>((resolve) => {
            resolveFirstChunk = resolve;
        });
        let resolveEnd: () => void = () => {};
        const ended = new Promise<void>((resolve) => {
            resolveEnd = resolve;
        });
        const req = http.get(`http://127.0.0.1:${appPort}/api/v1/predictions/stream?stop=stop-1`, (res) => {
            statusCode = res.statusCode;
            contentType = res.headers["content-type"];
            res.on("data", (chunk: Buffer) => {
                text += chunk.toString();
                resolveFirstChunk();
            });
            res.on("end", () => resolveEnd());
        });
        req.on("error", () => {
            // The server ending the stream is the expected outcome; ...
        });
```
Use `127.0.0.1` (not `localhost`) like this file so the server sees an IPv4 socket. Client disconnect = `req.destroy()` then a short `setTimeout(..., 20)` wait so the server-side `'close'` fires before the next connect (pattern from `predictionRoutes.test.ts` lines 232-245, 343-345). For "open streams keep receiving events at the cap" (D-08), have the fake handler expose a `write` hook or interval and assert the 5 held streams still get a frame after the 6th is rejected.

**Unit-level alternative (mock `res` with event emission):** `src/server/api/controllers/PredictionStreamController.test.ts` lines 15-41 - `makeMockRes` with `on: vi.fn()` and `emitResponseEvent(res, "close" | "error")` that replays registered listeners. Useful for proving idempotent release (close twice, error then close) without sockets; if used, `res.once` must be mocked too (or the middleware should use `res.on` with the `released` guard, matching the controller). Unit tests for a middleware with mock req/res: `src/server/api/middleware/requireDeviceId.test.ts` lines 5-34 (`makeMockReq`, `makeMockRes`, `next = vi.fn()`, `expect(next).not.toHaveBeenCalled()`).

**Test style:** every `it` uses `// Arrange`, `// Act`, `// Assert` comments (all analogs).

---

### `src/server/api/routes/predictionRoutes.ts` (route, MODIFY line 21-23)

**Analog:** itself, lines 5 and 20-24:
```typescript
import { upstreamRateLimiter } from "../middleware/upstreamRateLimit";
...
router.get("/", upstreamRateLimiter, controller.getPredictions);
// One shared bucket, attached per handler (D-10, D-16). An SSE connect is counted once when it opens; the
// limiter never touches a stream that is already open (D-11).
router.get("/stream", upstreamRateLimiter, streamController.getPredictionsStream);
router.get("/nearby", upstreamRateLimiter, nearbyController.getNearbyPredictions);
```
Change: add `import { streamConcurrencyCap } from "../middleware/streamConcurrencyCap";` (Biome `organizeImports` places it directly before the `upstreamRateLimit` import) and make line 23 `router.get("/stream", upstreamRateLimiter, streamConcurrencyCap, streamController.getPredictionsStream);` (D-07 order: bucket first, cap second). Extend the line 21-22 comment with one sentence: the cap runs after the bucket, so every connect is still counted once, and it bounds open streams per IP (Phase 16 D-01/D-07). No other route gets the cap.

**Bleed check for existing route tests that go through the shared instance:** vitest isolates modules per test file, so each file gets its own `streamConcurrencyCap` map (same reason `rateLimit.test.ts` line 10 gives for the bucket). Existing stream tests stay well under 5 concurrent per file: `predictionRoutes.test.ts` holds at most 1 open stream at a time and waits 20ms after `req.destroy()`; `rateLimit.test.ts` "four live routes" test sends 15 sequential `/stream` connects that each get 503 and close (each releases); `dataReloadStream.test.ts` and `trustProxy.test.ts` open at most 1. No reset hook is required, but the planner should run the full suite to confirm.

---

### Route-level integration test (optional; in `src/server/api/routes/rateLimit.test.ts` or a new `src/server/api/routes/streamConcurrencyCap.test.ts`)

**Analog:** `src/server/api/routes/rateLimit.test.ts`

Covers SC3 end to end through the real `test/app`: cap-rejected connects still spend the bucket. Copy:
- Long-lived server lifecycle (lines 64-86) and per-test bucket reset (line 88-90):
```typescript
    beforeEach(() => {
        // supertest connects from ::ffff:127.0.0.1, which the default key generator normalizes to 127.0.0.1.
        upstreamRateLimiter.resetKey("127.0.0.1");
        getSpy = vi.spyOn(axios, "get").mockRejectedValue(new Error("unexpected DASH call in rateLimit.test.ts"));
        ...
    });
```
- `remainingOf()` helper (lines 58-61) to read `r=` from the draft-8 `RateLimit` header and prove each cap-rejected connect decremented it.
- Note: before any route/stop load, `/stream` answers 503 immediately (line 22-23 comment), so streams cannot be held open through the real app without loading data. Holding 5 real streams needs the fake-DASH setup from `dataReloadStream.test.ts` lines 16-43 and 80-97 (`startFakeDash`, `axios.defaults.baseURL` swap, `repository.load()`). Simpler alternative: prove SC3 in the middleware unit test by mounting `createUpstreamRateLimiter(), createStreamConcurrencyCap(), holdOpen` on one fresh app and checking `RateLimit` `r=` on the 6th (429) response. The planner should pick one; the middleware-level version needs no DASH fake.

---

### `.claude/CLAUDE.md` (docs, MODIFY line 75)

**Analog:** itself, line 75:
```
- Rate limiting: one shared `express-rate-limit` bucket (`src/server/api/middleware/upstreamRateLimit.ts`, 60 requests per minute per client IP) sits in front of the routes that call DASH live (`/predictions`, `/predictions/nearby`, `/predictions/stream`, `/vehicles`) and answers 429 `{ error, details }` with `Retry-After`; in-memory endpoints and the health probes are never limited, and the client IP honors `TRUST_PROXY_HOPS`
```
Append a clause in the same voice: `/predictions/stream` additionally passes a per-IP concurrent-stream cap (`src/server/api/middleware/streamConcurrencyCap.ts`, 5 open streams per client IP, checked after the bucket) that answers 429 `{ error, details }` with a fixed `Retry-After` and frees a slot when the stream's response closes. The line sits inside the `<!-- GSD:architecture-* -->` managed block (line 76 closes it); edit the line in place only. Only `.claude/CLAUDE.md` is tracked (no root `CLAUDE.md`).

---

## Shared Patterns

### Error body shape
**Source:** `src/server/api/middleware/upstreamRateLimit.ts` line 42, `src/server/api/controllers/errorResponse.ts` lines 12, 17, 21
**Apply to:** the cap's 429
```typescript
res.status(options.statusCode).json({ error: "Too Many Requests", details: RATE_LIMITED_DETAILS });
```

### Logging rule (no query strings, message-only strings)
**Source:** `src/server/api/middleware/upstreamRateLimit.ts` lines 33-41; `errorResponse.ts` lines 25-30
**Apply to:** the cap's warn. Log `${key} on ${req.baseUrl}${req.path}` only; pass a single string to `logger.warn` (tests assert one string arg, see `upstreamRateLimit.test.ts` lines 237-242).

### Named constants, not env vars
**Source:** `upstreamRateLimit.ts` lines 5-8, `errorResponse.ts` lines 5-7
**Apply to:** cap size, Retry-After seconds, details text. Each gets a trailing or preceding "why" comment with its D-ref.

### Factory + shared module instance (DI, no state bleed)
**Source:** `upstreamRateLimit.ts` lines 14 and 47-49; `PredictionStreamController.ts` lines 7-11, 87 (closure-owned state, returned handler)
**Apply to:** `createStreamConcurrencyCap()` + `export const streamConcurrencyCap`.

### `res` (not `req`) owns connection lifetime; guarded once-only cleanup
**Source:** `PredictionStreamController.ts` lines 24-49 (Phase 12 WR-04, D-14)
**Apply to:** the cap's slot release.

### Test server hygiene
**Source:** `upstreamRateLimit.test.ts` lines 15-33, 72-79; `rateLimit.test.ts` lines 64-86; Phase 14 `deferred-items.md`
**Apply to:** every new test that serves an app: one long-lived `listen(0)` server per app, `closeAllConnections()` then `close()` in teardown, never `request(bareApp)` when the file builds several apps.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | | | Every file has a direct analog. The only novel element is a concurrency counter (`Map<string, number>` with claim/release); no existing file counts concurrent connections. D-15: `express-rate-limit` 8.7.0 is window-based only (its `MemoryStore` counts hits per window, `dist/index.cjs` line ~64), and no concurrency-limit package is in `package.json` dependencies, so the hand-rolled map is the default. |

## Metadata

**Analog search scope:** `src/server/api/middleware/`, `src/server/api/routes/`, `src/server/api/controllers/`, `src/server/app.ts`, `src/server/test/app.ts`, `node_modules/express-rate-limit/dist/`, `node_modules/@types/express-serve-static-core/`, `.claude/CLAUDE.md`, `.planning/phases/14-health-checks-rate-limiting/`
**Files scanned:** 16
**Pattern extraction date:** 2026-10-12
