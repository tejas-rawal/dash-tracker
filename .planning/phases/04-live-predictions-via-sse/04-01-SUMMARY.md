---
phase: 04-live-predictions-via-sse
plan: 01
subsystem: predictions-api
tags: [sse, server-sent-events, polling, express, real-time]

requires: []
provides:
  - PredictionStreamService (shared per-stop 30s poll loop, fan-out subscribers)
  - PredictionStreamController (SSE request handler)
  - "GET /api/v1/predictions/stream?stop={id} route"
  - "StopPredictionsResponse.generatedAt (REST + SSE freshness timestamp)"
affects:
  - src/server/api/routes/predictionRoutes.ts
  - src/server/api/models/Prediction.ts
  - src/server/api/services/PredictionService.ts

requirements-completed: [LIVE-01, LIVE-02, LIVE-03, LIVE-04, LIVE-05]

tech-stack:
  added: []
  patterns:
    - "Factory-function DI for the new service/controller pair, matching StopService/PredictionService"
    - "Module-scoped Map<string, StreamLoop> holding a shared setInterval + Set of subscriber callbacks per stop"
    - "SSE headers written only after the async subscribe() call resolves, so pre-stream errors map to normal JSON 4xx/5xx"

key-files:
  created:
    - src/server/api/services/PredictionStreamService.ts
    - src/server/api/services/PredictionStreamService.test.ts
    - src/server/api/controllers/PredictionStreamController.ts
    - src/server/api/controllers/PredictionStreamController.test.ts
  modified:
    - src/server/api/routes/predictionRoutes.ts
    - src/server/api/routes/predictionRoutes.test.ts
    - src/server/api/models/Prediction.ts
    - src/server/api/services/PredictionService.ts
    - src/server/api/services/PredictionService.test.ts
    - src/server/api/controllers/PredictionController.test.ts

decisions:
  - "Suppressed Biome's useNamingConvention on the SSE `Connection` header key via biome-ignore (HTTP header casing is fixed by the spec, not a naming choice) — applied identically in the controller and its test"
  - "Added a short (20ms) settle delay after req.destroy() in disconnect-driven tests before closing the test HTTP server, to let the server-side close event tear down the per-stop interval before the test process moves on — avoids leaking 30s timers across test files"

actuals:
  tokens: 7700
  tasks: 3
  commits: 3

metrics:
  duration_minutes: 25
  completed: 2026-08-27

status: complete
---

# Phase 4 Plan 1: Live Predictions via SSE Summary

SSE endpoint `GET /api/v1/predictions/stream?stop={id}` delivers live-updating arrival predictions backed by one shared 30-second upstream poll loop per subscribed stop, with the existing REST endpoint kept fully independent and both response shapes now carrying a `generatedAt` freshness timestamp.

## What Was Built

- **`PredictionStreamService`** (`src/server/api/services/PredictionStreamService.ts`) — owns a module-scoped `Map<string, StreamLoop>` where each entry holds a `Set` of subscriber callbacks, the last successfully fetched payload, and a `setInterval` timer. `subscribe(stopId, onUpdate)` either starts a brand-new loop (first fetch + interval) or joins an existing one (returning the cached `lastData` with zero extra upstream calls — D-02/LIVE-02). A poll tick that fails is logged via `logger.error` and swallowed — subscribers keep seeing the last good payload and the interval is never cleared on failure (D-04). When the last subscriber for a stop unsubscribes, the interval is cleared and the loop entry removed (LIVE-03); the next `subscribe` call for that stop starts completely fresh.
- **`PredictionStreamController`** (`src/server/api/controllers/PredictionStreamController.ts`) — validates the `stop` query param (400 if missing), calls `streamService.subscribe`, and only writes SSE headers (`text/event-stream`, `no-cache`, `keep-alive`) after that promise resolves. Errors from `subscribe` (unknown stop → `NotFoundError`, upstream failure → `UpstreamApiError`) are mapped to normal JSON 404/502 responses before any stream upgrade happens, reusing the same `resolveErrorStatus`/`resolveErrorBody` shape as `PredictionController`. `req.on("close", ...)` calls `unsubscribe()` and `res.end()` (D-06).
- **`predictionRoutes.ts`** — mounts `GET /stream` alongside the existing `GET /`, wiring `streamService` from the *same* `PredictionService` instance used by the REST controller (D-05/D-09 — one PredictionService, two independent consumers).
- **`generatedAt`** — added as a required top-level ISO 8601 field on `StopPredictionsResponse` (D-07/D-08), stamped once per call inside `PredictionService.getPredictionsForStop`. Both REST responses and every SSE `prediction` event pass this same value straight through with no separate stream-layer stamping.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Lint] Suppressed Biome naming-convention warning on the SSE `Connection` header key**
- **Found during:** Task 1 (`bun run lint` after writing `PredictionStreamController.ts`)
- **Issue:** Biome's `useNamingConvention` flagged the `Connection: "keep-alive"` object property as not camelCase.
- **Fix:** Added `// biome-ignore lint/style/useNamingConvention: HTTP header name, casing is fixed by the spec` immediately above the line, in both the controller and its unit test's equivalent assertion object.
- **Files modified:** `src/server/api/controllers/PredictionStreamController.ts`, `src/server/api/controllers/PredictionStreamController.test.ts`
- **Commit:** 2adc357 (controller), b145b40 (test)

**2. [Rule 1 - Test reliability] Added a settle delay before closing test HTTP servers in disconnect-driven SSE tests**
- **Found during:** Task 1, one transient full-suite failure (unrelated test timed out) surfaced during a full `bun run test` re-run, not reproducible in isolation
- **Issue:** Closing the raw-http test server immediately after `req.destroy()` raced the server-side `req.on("close")` handler, risking a leaked 30s `setInterval` bleeding into later tests in the same process.
- **Fix:** Inserted a short (20ms) `setTimeout` after `req.destroy()`/on first data chunk, before closing the server, in the tracer test and the two Task 3 lifecycle tests that open a raw HTTP connection. Confirmed stable across 5+ repeated full-suite runs after the change.
- **Files modified:** `src/server/api/routes/predictionRoutes.test.ts`
- **Commit:** 2adc357 (tracer test), b145b40 (lifecycle tests)

No other deviations — the rest of the plan executed exactly as written.

### Auth Gates

None encountered.

## Verification

- `bun run test` (full suite, `--typecheck`): 213/213 tests pass, zero type errors, stable across 5 repeated runs.
- `bun run test:coverage`: 98.6% statements / 94.3% branches / 98.61% functions / 98.6% lines project-wide — well above the 80% threshold. `PredictionStreamService.ts` itself sits at 93.22%/80%/83.33%/93.22% (uncovered lines are the trivial `if (!entry) return` short-circuits in `poll`/`unsubscribeFrom` that aren't reachable via the currently-tested lifecycle sequences).
- `bun run build`: compiles cleanly, no errors.
- `bun run lint`: no new warnings beyond the pre-existing 15 (now +2 filename-convention warnings for the two new `.test.ts` files, consistent with every other test file in the repo — see PROJECT.md's documented baseline).

## Requirements Coverage

- **LIVE-01** — A client opening `GET /api/v1/predictions/stream?stop={id}` gets an immediate `event: prediction` frame, proven end-to-end via a real HTTP request in the tracer test.
- **LIVE-02** — `PredictionStreamService.test.ts` proves two subscribers on the same stop produce exactly one additional upstream fetch per 30s tick (fan-out), not one per subscriber.
- **LIVE-03** — Idle teardown and fresh-fetch-on-resume both covered at the service-unit level and, in `predictionRoutes.test.ts`, through a real disconnect → reconnect over an actual HTTP connection.
- **LIVE-04** — `predictionRoutes.test.ts`'s REST-independence test opens a stream loop for a stop, then issues a REST call for the same stop and asserts an additional independent upstream fetch occurred.
- **LIVE-05** — `generatedAt` is a required field on `StopPredictionsResponse`, exercised by a new `PredictionService.test.ts` assertion and present on every SSE frame via the shared response shape.

## Self-Check: PASSED

- FOUND: src/server/api/services/PredictionStreamService.ts
- FOUND: src/server/api/services/PredictionStreamService.test.ts
- FOUND: src/server/api/controllers/PredictionStreamController.ts
- FOUND: src/server/api/controllers/PredictionStreamController.test.ts
- FOUND: commit 2adc357 (Task 1)
- FOUND: commit 03d38f6 (Task 2)
- FOUND: commit b145b40 (Task 3)
