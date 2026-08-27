# Phase 4: Live Predictions via SSE - Context

**Gathered:** 2026-08-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Riders can subscribe to a stop and receive arrival predictions that update automatically over a live connection (Server-Sent Events), backed by a shared per-stop poll loop against the upstream DASH API. The existing REST predictions endpoint stays available unchanged as a fallback/initial-load path. Both REST and SSE responses report a `generatedAt` freshness timestamp. No client app work (Expo is a future milestone).

</domain>

<decisions>
## Implementation Decisions

### Project-Level (already locked, carried into this phase)
- **D-00a:** Server-Sent Events (not WebSocket) for live predictions; REST retained as fallback.
- **D-00b:** One shared 30s upstream poll per subscribed stop — starts on first subscriber, stops when idle, resumes automatically on a new subscriber.

### SSE Endpoint & Event Design
- **D-01:** Exact URL/query shape for the SSE endpoint is Claude's discretion during planning — follow existing router/query-string conventions (`predictionRoutes.ts` style).
- **D-02:** On connect, a subscriber gets an immediate prediction push rather than waiting for the next 30s tick. If a poll loop is already running for that stop, reuse its last known data for this immediate push instead of forcing an extra upstream call; if no loop is running yet, this connection triggers the loop's first fetch.
- **D-03:** SSE events use a named event type: `event: prediction\ndata: {...}` — not a plain unnamed `data:`-only message. Chosen for extensibility (future event types) over minimal simplicity.

### Poll Loop Lifecycle & Failure Handling
- **D-04:** When an upstream poll fails mid-loop for a stop, subscribers keep receiving their last successfully-fetched prediction data (stale-but-served); the failure is logged server-side; the loop retries on the next 30s tick. No `error` SSE event is emitted and the connection is not closed. — **Reversibility:** costly — once clients depend on the stream never emitting error events or closing on transient upstream failure, adding an error-event path later is a client-visible behavior change.
- **D-05:** The shared per-stop poll-loop state (interval timer + subscriber list + last known data) lives in a new service (e.g. `PredictionStreamService`), separate from the existing `PredictionService`. The new service calls into `PredictionService` for the actual upstream fetch — no duplication of the fetch/mapping logic. Mirrors the Phase 3 precedent of splitting `StopService` out from `BusRouteService` for a distinct concern. — **Reversibility:** costly — merging back into `PredictionService` later would require re-threading timer/subscriber state through a service whose tests currently assume single-shot request/response behavior.
- **D-06:** Subscriber disconnect is detected via the standard Express/Node pattern: `req.on("close", ...)` on the request object. No heartbeat/ping mechanism needed.

### generatedAt Placement & Format
- **D-07:** `generatedAt` is added at the top level of the response, alongside `data` (i.e. `{ success, generatedAt, data: {...} }`), for both the REST response and every SSE `prediction` event payload — not nested inside `data`. Treated as response metadata, not domain data.
- **D-08:** `generatedAt` is an ISO 8601 string (e.g. `"2026-08-27T14:20:15.042Z"`), matching timestamp formatting used elsewhere in this project (e.g. STATE.md).

### REST Endpoint Changes
- **D-09:** `GET /api/v1/predictions` is unchanged — it always makes its own independent upstream call via the existing `PredictionService`, regardless of whether a `PredictionStreamService` poll loop happens to be active for that stop. REST does not read from the stream's cache. Keeps REST's freshness/latency behavior fully independent of SSE subscriber activity, matching its role as an independent fallback path.

### Claude's Discretion
- Exact URL/query-string shape of the SSE endpoint (D-01).
- Internal implementation of the poll-loop timer/subscriber-map data structure inside `PredictionStreamService`.
- Exact SSE framing/headers setup (`Content-Type: text/event-stream`, `Cache-Control`, etc.) — standard Express SSE conventions.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & Requirements
- `.planning/ROADMAP.md` — Phase 4 goal, success criteria, requirements LIVE-01 through LIVE-05
- `.planning/REQUIREMENTS.md` — LIVE-01, LIVE-02, LIVE-03, LIVE-04, LIVE-05 definitions
- `.planning/PROJECT.md` — v0.2 milestone goal, SSE-vs-WebSocket decision, shared-poll-loop decision

### Codebase Maps
- `.planning/codebase/ARCHITECTURE.md`
- `.planning/codebase/CONVENTIONS.md`
- `.planning/codebase/STRUCTURE.md`
- `.planning/codebase/INTEGRATIONS.md`

### Prior Phase Context
- `.planning/phases/03-stop-discovery/03-CONTEXT.md` — establishes the precedent of splitting a new concern into its own Service/Controller pair rather than folding into an existing one

No external specs/ADRs beyond the above — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PredictionService.getPredictionsForStop(stopId, options)` (`src/server/api/services/PredictionService.ts`) — existing single-shot fetch/map logic against the DASH API; the new poll loop calls this rather than reimplementing upstream fetch/mapping.
- `BusDataRepository.getStopById(stopId)` — existing stop validation, already used by `PredictionService` for `NotFoundError` on unknown stop.
- `NotFoundError` / `UpstreamApiError` (`src/server/api/errors/index.ts`) — reuse for stop validation and upstream failure classification.

### Established Patterns
- Factory-function DI: `createXService(repository)` / `createXController(service)` — new `createPredictionStreamService(...)` / SSE controller handler must follow this.
- Controllers map errors to HTTP status via `resolveErrorStatus`/`resolveErrorBody` (see `PredictionController.ts`) — SSE controller reuses this shape for the initial connection-validation errors (e.g., unknown stop before upgrading to a stream).
- `parseNumberParam()` pattern in `PredictionController.ts` — reuse for any numeric query params on the new SSE endpoint.
- Route files wire the dependency graph and export a `Router` as default export (see `predictionRoutes.ts`, `stopRoutes.ts`) — new/extended route file follows the same shape.
- `src/server/api/routes/index.ts` mounts routers under `/routes`, `/predictions`, `/stops` — the SSE route mounts under one of these per D-01.

### Integration Points
- `src/server/api/services/PredictionService.ts` — consumed by the new `PredictionStreamService` for actual upstream fetches.
- `src/server/api/controllers/PredictionController.ts` / `src/server/api/routes/predictionRoutes.ts` — existing REST endpoint stays as-is (D-09); new SSE handler is added alongside, not merged into, the existing controller logic.
- `src/server/config/` (`axios.ts`, `logger.ts`) — poll loop reuses the shared axios instance (via `PredictionService`) and Winston logger for failure logging (D-04).
- `src/server/app.ts` — no changes expected; server startup/shutdown behavior (repository init gate, graceful shutdown) is unaffected by adding a new stream endpoint.

</code_context>

<specifics>
## Specific Ideas

No particular external references beyond what's captured in decisions above — standard Express SSE conventions (`res.write` with `event:`/`data:` framing, `Content-Type: text/event-stream`) and this codebase's existing service/controller/route style.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 4-Live Predictions via SSE*
*Context gathered: 2026-08-27*
