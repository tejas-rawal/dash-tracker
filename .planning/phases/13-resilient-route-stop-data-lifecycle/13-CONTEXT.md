# Phase 13: Resilient Route/Stop Data Lifecycle - Context

**Gathered:** 2026-09-30
**Status:** Ready for planning

<domain>
## Phase Boundary

The server listens immediately even when DASH is unreachable at boot, loads route/stop data in the background with capped exponential backoff (data-dependent endpoints return 503 until the first successful load), then refreshes route/stop data hourly for the life of the process, keeping the last good copy through any failed refresh. The repository records load state (`lastLoadedAt`, plus last failure time/reason) for Phase 14's readiness endpoint. Background timers stop cleanly on SIGTERM/SIGINT.

Requirements: BOOT-01, BOOT-02, BOOT-03, DATA-01, DATA-02, DATA-03.

Not in this phase: the readiness/liveness endpoints themselves (Phase 14), rate limiting (Phase 14), any change to rider-facing response bodies.

</domain>

<decisions>
## Implementation Decisions

### 503 gating
- **D-01:** "Not loaded yet" is a **typed error**. `BusDataRepository.assertInitialized()` throws a new `DataNotReadyError` (added to `src/server/api/errors/index.ts` beside `NotFoundError`/`UpstreamApiError`) instead of a plain `Error`. No router-level readiness middleware. Any endpoint that actually reads route/stop data gets a 503, and endpoints that don't read it keep working.
- **D-02:** Extract **one shared controller error-response helper** that maps `NotFoundError` → 404, `DataNotReadyError` → 503, `UpstreamApiError` → 502, and anything else → 500. Every controller that currently has its own mapper uses it: BusRoute, Stop, Prediction, PredictionStream, Vehicle, NearbyPrediction, Favorites, Recents. This closes the pending WR-02/IN-04 follow-up in STATE.md, so the 500 response must use a generic message and must no longer echo raw `error.message`. Existing 404/502 bodies and labels stay the same apart from that. — **Reversibility:** costly — touches every controller's error path and its tests.
- **D-03:** A 503 uses the existing `{ error, message }` body shape (e.g. `error: "Service Unavailable"`, `message` saying route/stop data is still loading) **plus a `Retry-After` header** with a **fixed short constant** (about 5 seconds; the planner sets the exact value). It is not tied to the scheduler's next attempt.
- **D-04:** SSE `/predictions/stream` gets no special gate. If its stop validation reads the repository before the stream opens, `DataNotReadyError` goes through the shared helper and returns 503, the same as REST predictions.

### Boot retry backoff
- **D-05:** The initial load uses **exponential backoff**: 1s, doubling, **capped at 60s**, with jitter.
- **D-06:** It **retries forever** for the life of the process and never gives up or exits. Phase 14 readiness will report "never loaded" in the meantime.
- **D-07:** The backoff numbers (base, cap, jitter) and the refresh interval are **named module constants**, not env vars (same approach as `POLL_INTERVAL_MS` in `ServiceAlertPollService`).
- **D-08:** Each failed attempt logs **one `warn`** with the attempt number, a message-only error, and the next delay, so success criterion 1's "increasing delays" can be seen in the logs. The first success logs one `info`. Today `fetchAndProcessData` and `handleLoadError` each log `error` for the same failure. Consolidate so each attempt produces exactly one log line.

### Refresh cadence & what counts as a good load
- **D-09:** After the first success, refresh **every hour**.
- **D-10:** Attempts are chained: the next one is scheduled with `setTimeout` only after the current one settles, so attempts **never overlap**. The same loop handles boot backoff (before the first success) and the hourly refresh (after it). The alert poll's `setInterval` pattern is deliberately not copied here.
- **D-11:** A successful DASH response with **zero routes is a failed load**. It throws and never applies the empty data. At boot it counts as a failed attempt and is retried. On refresh the last good data stays. (Today it returns empty maps, and a refresh would wipe live data.)
- **D-12:** Keep **all-or-nothing** loads. One malformed stop (bad code/coords) fails the whole attempt, and the last good data stays. There is no per-stop dropping. The user explicitly wants a failed refresh caused this way to be visible. That visibility comes from D-13/D-14, not from rider responses.
- **D-13:** Surface a failed refresh through **Phase 14's readiness endpoint only**. Rider-facing responses (bodies and headers) do not change.
- **D-14:** The repository records failure state along with success. Loaded data is applied only on success, through the existing atomic map swap in `applyData`, so nothing is ever half-applied.
  - On success, set `lastLoadedAt` and clear `lastFailedAt`/`lastError`.
  - On failure, set `lastFailedAt` and a **message-only** `lastError`, and leave `lastLoadedAt` and the maps untouched.
  - `lastError` must never contain `DASH_API_KEY`. Use the same message-only rule as Phase 12 D-06/D-12.

### Lifecycle ownership
- **D-15:** Scheduling lives in a **separate service**, `createBusDataRefreshService(repository)` with `start()`/`stop()`, mirroring `ServiceAlertPollService`. The repository only loads data, swaps it atomically, and holds load state. The service owns the timers, backoff, and attempt counting. `stop()` clears any pending timer, whether it's a backoff retry or the hourly refresh. The planner decides whether `stop()` also prevents rescheduling after an attempt that is already in flight when it's called.
- **D-16:** Load state is exposed as **one snapshot**, `getLoadState(): { lastLoadedAt?: Date; lastFailedAt?: Date; lastError?: string }`. "Ready" means `lastLoadedAt` is defined, and Phase 14 serializes this snapshot directly.
- **D-17:** Add **`ServiceAlertPollService.stop()`** (clears its interval) and call it in the same shutdown path as the refresh service's `stop()`.
- **D-18:** Boot order in `src/server/app.ts`: register process handlers, then **await SQLite (`FavoritesRecentsRepository.initialize()`), which stays fatal (exit 1) if it fails**, then `listen`, then start the refresh service and the alert poll in the background. The DASH load no longer blocks `listen` or causes an exit. SIGTERM/SIGINT stop both background services before or alongside `server.close`.
- **D-19:** Per the no-backward-compat principle, remove whatever becomes obsolete, such as the unused `initializationPromise` dedupe machinery or the `initialize()` vs. `refreshData()` split, and don't keep parallel load paths. The planner decides the exact repository API as long as D-14/D-16 hold.

### Claude's Discretion
- Exact jitter formula (full vs. equal jitter) and the exact `Retry-After` seconds (about 5).
- Name, location, and signature of the shared controller error helper (e.g. `src/server/api/controllers/errorResponse.ts`).
- Whether the refresh service takes a clock/scheduler dependency for tests or relies on `vi.useFakeTimers()`.
- Exact `DataNotReadyError` message text.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope
- `.planning/ROADMAP.md` §"Phase 13: Resilient Route/Stop Data Lifecycle": goal and 5 success criteria
- `.planning/REQUIREMENTS.md`: BOOT-01..03, DATA-01..03; the Out of Scope table ("Exiting the process when DASH is down at boot" was replaced)

### Prior decisions this phase builds on
- `.planning/phases/12-bounded-upstream-calls-error-safety-nets/12-CONTEXT.md`: D-01 (one 10s deadline covers the bulk load too), D-05/D-06 (central message-only `UpstreamApiError` mapping), D-10/D-12 (rejection handling, secret-safe logging)
- `.planning/STATE.md` §Blockers/Concerns: the WR-02/IN-04 shared controller error helper follow-up, closed by D-02

### Downstream consumer
- `.planning/ROADMAP.md` §"Phase 14: Health Checks & Rate Limiting": readiness consumes `getLoadState()` (D-16)

### Codebase analysis
- `.planning/codebase/CONCERNS.md`: "Application startup dependency on external API" and "Data initialization with no fallback" (this phase resolves both)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `BusDataRepository.applyData()` (`src/server/api/repositories/BusDataRepository.ts`): already swaps all three maps at once. Keep it as the only commit point.
- `BusDataRepository.refreshData()`: exists but nothing calls it. The refresh service drives the load path, which may be restructured per D-19.
- `ServiceAlertPollService` (`src/server/api/services/ServiceAlertPollService.ts`): factory + `start()` shape to mirror, and gains `stop()` (D-17).
- Error classes in `src/server/api/errors/index.ts`: add `DataNotReadyError` here.

### Established Patterns
- Services throw typed errors and controllers translate them to HTTP. Right now each of about 8 controllers duplicates this mapping (see the `instanceof NotFoundError`/`UpstreamApiError` checks in `src/server/api/controllers/*`).
- DI via factory functions. Route modules build services with `BusDataRepository.getInstance()` (`src/server/api/routes/*.ts`).
- Tests reset the singleton with `@ts-expect-error` in `beforeEach`/`afterEach`. New load-state fields must reset too.
- Upstream errors are message-only everywhere (never serialize an axios error).

### Integration Points
- `src/server/app.ts`: boot order changes (D-18). Shutdown adds `refreshService.stop()` and `serviceAlertPollService.stop()`.
- Repository readers that will return 503 before load: `BusRouteService`, `StopService`, `PredictionService` (stop/route validation), `VehicleService` (route filter validation), `FavoritesService`/`RecentsService` (`resolveEntity` hydration).
- `NearbyPredictionService` does not read the repository, so nearby predictions stay available before load.

</code_context>

<specifics>
## Specific Ideas

- The user specifically wants a failed refresh caused by malformed upstream data to be visible rather than silently hidden behind stale data. `lastFailedAt` and `lastError` exist for exactly this, and Phase 14 readiness should show them.

</specifics>

<deferred>
## Deferred Ideas

- Per-response data-freshness signal for the rider app (e.g. an `X-Data-Loaded-At` header or a `dataLoadedAt` body field). Considered and not chosen: freshness is surfaced through readiness only. Revisit if the Expo client needs to show "data may be out of date".
- Per-stop drop-and-warn for malformed upstream stops (instead of all-or-nothing). Rejected for now in favor of D-12.

</deferred>

---

*Phase: 13-resilient-route-stop-data-lifecycle*
*Context gathered: 2026-09-30*
