---
gsd_state_version: "1.0"
milestone: v0.6
milestone_name: Solidifying the backend
current_phase: 15
current_phase_name: Alert & Nearby Data Hygiene
status: executing
stopped_at: Completed 15-01-PLAN.md
last_updated: "2026-10-07T19:05:44.646Z"
last_activity: 2026-10-07
last_activity_desc: Phase 15 execution started
state_head: aa902c8e4aa9e8ecdfcd136abf394f76f351499a
progress:
  total_phases: 5
  completed_phases: 14
  total_plans: 16
  completed_plans: 15
  percent: 94
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-07)

**Core value:** Riders can always see accurate, near-real-time arrival predictions for their stop.
**Current focus:** Phase 15 — Alert & Nearby Data Hygiene

## Current Position

Phase: 15 (Alert & Nearby Data Hygiene) — EXECUTING
Plan: 2 of 2
Status: Ready to execute
Last activity: 2026-10-07 — Phase 15 execution started

Progress (v0.6): [██████░░░░] 3/5 phases (60%)

## Performance Metrics

**Velocity:**

- Total plans completed (v0.5): 3
- Average duration: 5 min
- Total execution time: ~14 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 (v0.1) | 1 | - | - |
| 2 (v0.1) | 1 | - | - |
| 3 (v0.2) | 2 | - | - |
| 4 (v0.2) | 1 | 8min | 8min |
| 5 (v0.3) | 2 | - | - |
| 6 (v0.3) | 1 | - | - |
| 7 (v0.3) | 1 | - | - |
| 8 (v0.4) | 6 | - | - |
| 9 (v0.4) | 2 | - | - |
| 10 (standalone) | 1 | - | - |
| 11 (v0.5) | 3 | 14min | 5min |
| 12 | 4 | - | - |
| 13 | 7 | - | - |
| 14 | 3 | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 04 P01 | 8min | 3 tasks | 11 files |
| Phase 05 P02 | 45min | 3 tasks | 12 files |
| Phase 06 P01 | 8min | 3 tasks | 12 files |
| Phase 11 P01 | 5min | 2 tasks | 9 files |
| Phase 11 P02 | 4min | 2 tasks | 3 files |
| Phase 11 P03 | 5min | 2 tasks | 3 files |
| Phase 12 P01 | 2min | 2 tasks | 7 files |
| Phase 12 P03 | 3min | 2 tasks | 2 files |
| Phase 12 P04 | 3min | 2 tasks | 4 files |
| Phase 12 P02 | 3min | 2 tasks | 4 files |
| Phase 13 P01 | 3min | 3 tasks | 9 files |
| Phase 13 P02 | 2min | 3 tasks | 9 files |
| Phase 13 P03 | 3 min | 2 tasks | 5 files |
| Phase 13 P04 | 2min | 3 tasks | 9 files |
| Phase 13 P05 | 6min | 3 tasks | 7 files |
| Phase 13 P06 | 5min | 3 tasks | 5 files |
| Phase 13 P07 | 5min | 2 tasks | 5 files |
| Phase 15 P01 | 5min | 3 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase 14]: Health probes + one shared 60/min per-IP limiter on the four live-DASH routes; `TRUST_PROXY_HOPS` (default 0) picks the client IP; UAT 2026-10-07 confirmed an open SSE stream survives its IP being limited
- [Phase 14 UAT]: Review WR-02 (open streams not counted, so one IP can multiply DASH polls) scheduled as v0.6 Phase 16 — per-IP concurrent-stream cap
- [v0.6 roadmap] v0.6 is 4 phases (12-15), ordered reliability → operational basics → tech debt: 12 bounded upstream calls + error safety nets (UPST, ERR); 13 resilient route/stop data lifecycle (BOOT, DATA); 14 health + rate limiting (HLTH, RATE); 15 alert/nearby data hygiene (ALRT-12, ALRT-13, NEAR-12)
- [v0.6 roadmap] Timeouts come first because boot retry and periodic refresh are only meaningful if each attempt is bounded; readiness (HLTH-02) waits on Phase 13's loaded-state + last-loaded timestamp (DATA-03); Phase 15 is independent and could run earlier if needed
- [v0.5 roadmap] v0.5 is a single phase (Phase 11) — one endpoint with no internal dependency boundary; coarse granularity. Live-payload confirmation of `predictions-near-location` is a success criterion gating DTO lock-in, not a separate phase
- [v0.3, Phase 6] Favorites/recents identity is an anonymous device ID sent via `X-Device-Id` header, no auth system — device ID becomes a natural foreign key if real accounts are added later
- [v0.3, Phase 5/6] Favorites/recents persisted in SQLite behind a new repository, isolated from the existing `BusDataRepository` — zero ops, fits existing repository-pattern architecture
- [v0.3, Phase 6] Unfavorite is a plain SQL DELETE with no rows-affected check; repository upsert uses `INSERT ... ON CONFLICT DO UPDATE` — makes both favorite-an-already-favorited and unfavorite-a-non-favorite true no-op successes, no read-then-write race
- [v0.3, Phase 7] Recents are auto-logged on any prediction/stop lookup rather than requiring a dedicated "log view" call — reflects actual usage automatically
- [v0.3, Phase 7] Route recents are persisted keyed by the route's internal `id` (resolved from the client-supplied short name at write time), not the short name — matches the id-keyed lookup `resolveEntity`/`getRouteById` already uses; caught as a pre-ship BLOCKER (CR-01) in code review after route recents silently failed to hydrate
- v0.2: Use Server-Sent Events (not WebSocket) for live predictions, with REST retained as fallback
- v0.2: Server runs one shared 30s upstream poll per subscribed stop, stopping when idle, resuming on new subscriber
- v0.2: Repo will eventually house both backend and Expo/React Native frontend (monorepo); frontend itself deferred
- [Phase 3] Stop discovery lives in a new `StopController`/`StopService` pair, kept separate from `BusRouteController`/`BusRouteService`
- [Phase 3] `GET /:shortName/stops` groups stops by direction (not a deduped flat list) — locked public contract, iterate `route.directions` directly
- [Phase 05]: Installed better-sqlite3@^12.11.1 (not latest 13.0.3): v13 requires Node >=22 and its native binary crashed under both Bun 1.0.31 and system Node 20.20.2 in this environment
- [Phase 8] Request `?format=json` explicitly from DASH/Swiftly's `gtfs-rt-alerts/v2` endpoint — it defaults to protobuf-binary otherwise
- [Phase 8] Live alert payload is a flat, custom Swiftly/Alexandria JSON format (bare top-level array, camelCase, ISO-8601 dates) — not the nested GTFS-RT-protobuf-derived `{entities:[...]}` shape early rounds assumed from an auto-generated doc example
- [Phase 9] Match alerts to routes/stops via internal `BusRoute.id`/`BusStop.id` (DASH's own ID space), not `shortName`/`code`
- [Phase 9] Agency-wide alerts (no informed route/stop) are dropped from responses in v0.4; ALRT-09 (predictions embedding) deferred to v2
- [Phase 10] `VehicleService` now validates `route` filters via `repository.getRouteByShortName` before any upstream DASH fetch, matching `BusRouteService`'s existing 404 pattern (D-04)
- [Phase 10] Coordinate/timestamp safety filter uses `typeof value === "number" && Number.isFinite(value)`, not literal `NaN` checks — code review (CR-01/CR-02) found the NaN-only check missed missing/undefined/null lat/lon and let a malformed `loc.time` crash the whole request instead of dropping just the bad vehicle
- [Phase 11]: [Phase 11-01] Nearby radius converts to upstream meters with Math.ceil(radius * 1609.344) (0.5 mi -> 805), never 0 and never narrower than requested
- [Phase 11]: [Phase 11-01] Nearby upstream errors wrap as UpstreamApiError from error.message only (never the axios error object, which carries DASH_API_KEY); rider lat/lng are never logged
- [Phase 11]: [Phase 11-02] Nearby radius/number caps (MAX_RADIUS_MILES = 1, MAX_PREDICTIONS_PER_DESTINATION = 10) are controller constants; out-of-range values return 400 and are never clamped
- [Phase 11]: [Phase 11-02] An empty radius= or number= on /predictions/nearby is provided-but-invalid (400), not a fallback to the default
- [Phase 11]: [Phase 11-03] Nearby prediction elements are validated in isValidNearbyEntry (finite min/sec/time, string tripId/vehicleId, no coercion); one malformed element drops its whole entry with the existing single warn. Hand-rolled guard kept per D-18 (no Zod)
- [Phase 11]: [Phase 11-03] WR-02 (500 path echoes raw error.message) deferred to a follow-up quick task extracting one shared controller error-response helper for Prediction/Vehicle/NearbyPrediction controllers (WR-02 + IN-04); T-11-16 accepted low
- [Phase 12]: [Phase 12-01] DASH deadline is a fresh AbortSignal.timeout(DASH_API_TIMEOUT_MS) per request via an axios request interceptor (no axios idle timeout); axios.isCancel identifies a fired deadline
- [Phase 12]: [Phase 12-01] One response-error interceptor on the shared DASH client maps every transport failure to a message-only UpstreamApiError ('timed out after {ms}ms' vs 'request failed: {message}'); services need no transport try/catch
- [Phase 12]: [Phase 12-03] SSE res 'error' logs warn 'SSE response error for stop <stop>: <message>' (message only) and runs the disconnect cleanup; one guarded cleanup closure serves res close + res error (runs once in either order; disconnect moved from req to res 'close' in review fix WR-04), registered before subscribe is awaited so a close/error during a pending subscribe is replayed once the subscription exists
- [Phase 12]: [Phase 12-04] Process error handlers live in src/server/config/processHandlers.ts (registerProcessErrorHandlers), called first in app.ts; unhandledRejection logs and keeps running (D-10), uncaughtException logs then exits 1 (D-11)
- [Phase 12]: [Phase 12-04] One describeReason formatter (stack ?? message for Error, String(reason) otherwise) passed as the single logger.error argument, so no reason object or DASH_API_KEY is ever serialized (D-12)
- [Phase 12]: [Phase 12-02] NearbyPredictionService no longer wraps axios rejections (D-07): the shared client's interceptor is the single transport-error wrap, so nearby 502 details are exactly the interceptor's message; content-level UpstreamApiErrors stay
- [Phase 12]: [code review] uncaughtException exits only after Winston and stdout flush (1 s fallback, WR-02); graceful shutdown exits 1 if the repository close fails (WR-03) and force-closes connections after a 10 s grace period so SSE streams cannot block exit (WR-05); DASH_API_TIMEOUT_MS capped at 2,147,483,647 (WR-01); a caller's abort signal is combined with the deadline and only a real timeout is reported as one (IN-01)
- [Phase 12]: [Phase 12-02] BusDataRepository.fetchAndProcessData catch/rethrow left unchanged: it already rethrows message-only, and the E2E shows a startup timeout is logged as a Failed to initialize bus data error with the timeout text
- [Phase 13]: 13-01: not-ready is DataNotReadyError from the repository guard; sendErrorResponse maps it to 503 { error: 'Service Unavailable', details } + Retry-After: 5
- [Phase 13]: 13-01: 500 responses use fixed details 'An unexpected error occurred' and log one string (stack or String(value)); closes WR-02/IN-04 for migrated controllers
- [Phase 13]: 13-02: BusRoute, Stop and REST Prediction controllers use only sendErrorResponse; 404/502/400 bodies unchanged, 500 is the generic 'An unexpected error occurred'
- [Phase 13]: 13-03: BusDataRepository.load() is the single atomic load path; failures store/rethrow only error.message and change no data; readiness derives from lastLoadedAt; the repository never logs
- [Phase 13]: 13-03: an empty/null/missing DASH routes list is a failed load ('DASH API returned no routes'), never applied
- [Phase 13]: 13-04: All 8 controllers map errors only through sendErrorResponse; no controller keeps a local mapper (D-02 complete, WR-02/IN-04 closed)
- [Phase 13]: 13-04: Favorites/recents hydration propagates DataNotReadyError as 503 rather than silently dropping entries; no service-side change was needed
- [Phase 13]: 13-05: Route/stop data loads in the background via BusDataRefreshService (chained setTimeout): equal-jitter backoff 1 s base / 60 s cap until first success, then hourly; one warn/info per attempt; stop() also blocks in-flight rescheduling
- [Phase 13]: 13-05: app.ts boot order is process handlers -> SQLite initialize (fatal) -> listen -> start loader + alert poll; shutdown stops both loops before server.close
- [Phase 13]: 13-06: Malformed DASH routes payloads (absent/null/non-finite stop code/lat/lon, missing/empty/non-string ids) are rejected inside load() with hand-rolled checks, not a Zod schema, so only the five fields the gap names are validated
- [Phase 13]: 13-07: a stop dropped by a reload ends its SSE streams on the next poll tick with no farewell event; the reconnect gets the existing 404 (D-13)
- [Phase 13]: 13-07: only NotFoundError is terminal for a stream loop; UpstreamApiError and other tick failures stay transient so a DASH blip never ends a rider's stream
- [Phase 13]: 13-07: PredictionStreamService.subscribe takes a StreamSubscriber { onUpdate, onEnd }; the controller wires onEnd to its single cleanup path so the response ends exactly once
- [Phase 15]: Phase 15: alert hygiene lives only in ServiceAlertService.fetchAlerts(); repository unchanged, ServiceAlert gains no deletion field (D-05, D-06)
- [Phase 15]: Phase 15: any non-null deletedAt drops the alert silently, checked before date validation (D-08, D-09, D-10)
- [Phase 15]: Phase 15: a malformed activePeriods bound drops only its whole alert with one id-and-bound warn; the poll applies the rest (D-01 to D-04)

### Pending Todos

None yet.

### Blockers/Concerns

- ⚠️ [Phase 1, v0.1] `lint:fix` uses Biome's deprecated `--apply-unsafe` flag (should become `--write --unsafe` per Biome 1.9.4); non-blocking, not yet addressed.
- ⚠️ [Phase 3] Code review (archived: `.planning/milestones/v0.2-phases/03-stop-discovery/03-REVIEW.md`) flagged 2 non-blocking edge cases: empty-string `lat`/`lng` query params coerce to `0` instead of 400ing in `StopController`; `StopService.getNearbyStops` doesn't lower-bound `count` if called directly (not reachable via the controller today). Neither blocks Phase 3 completion. Relevant to Phase 11: the new nearby-predictions validation must not copy this empty-string coercion bug (NEAR-08).
- ⚠️ [v0.2] An unrelated, pre-existing uncommitted fix to `BusDataRepository.ts` (dedupe `initialize()`/`refreshData()` load paths) was swept into the v0.2 execution history by the automated code-review-fix pipeline (commit `b52c130`) — correct fix, but out of Phase 3/4 scope and not explicitly approved before landing. Flagged to the user; left in place.
- ⚠️ [Phase 6, v0.3] `FavoritesController.unfavorite` doesn't validate `entityId` the way `favorite` does, and `favorite`'s `entityId` is trim-validated but the untrimmed value is what's persisted/looked up — both whitespace-padded-id edge cases (WR-01/WR-03, `.planning/milestones/v0.3-phases/06-favorites-routes-stops/06-REVIEW.md`). Non-blocking, doesn't violate any FAV-01..05/DEVICE-01 requirement.
- ⚠️ [Phase 7, v0.3] `RecentsController.resolveDeviceId` unsafely casts the device-id header to `string` with no in-controller guard; its `NotFoundError`→404 branch is unreachable; device-id header parsing is duplicated across 4 files; the recents cap (`5`) is a magic number in a SQL string; `resolveEntity` is duplicated verbatim between `RecentsService`/`FavoritesService` (WR-02/WR-03/IN-01/IN-02/IN-03, `.planning/milestones/v0.3-phases/07-recents-routes-stops/07-REVIEW.md`). Non-blocking, doesn't violate any RECENT-01..06 requirement.
- ⚠️ [Phase 8, v0.4 — STILL OPEN after Phase 9] The confirmed live DASH alert payload (G-05-5) includes `deletedAt`/`deletedBy` fields that `ServiceAlertService`/`ServiceAlertRepository` currently ignore entirely. If the DASH admin tool soft-deletes alerts instead of removing them from the feed, a deleted-but-still-time-active alert could still surface via `getActiveAlerts()` — and Phase 9 now exposes that data publicly on route/stop responses without addressing it. Was flagged as "consider before Phase 9 exposes alerts publicly" but not picked up during Phase 9 planning/execution. Worth a follow-up before/early in the next milestone. Phase 11 (NEAR-06) now exposes alerts on one more endpoint (`/predictions/nearby`). Scheduled: v0.6 Phase 15 (ALRT-12).
- ⚠️ [Phase 9] `RouteWithAlerts` (`BusRoute & { alerts }`) is built via object spread over a `BusRoute` class instance, losing its prototype methods even though the static type doesn't reflect that (WR-01, `09-REVIEW.md`). No live call site hits it today.
- ⚠️ [Phase 9] `ServiceAlertRepository.isAlertActive`'s date-boundary checks fail open on a malformed `activePeriod` date string rather than excluding/logging it (WR-02, `09-REVIEW.md`). Scheduled: v0.6 Phase 15 (ALRT-13).
- ⚠️ [Phase 12] `exitAfterLogFlush` in `processHandlers.ts` calls `logger.end()` and then waits for the flush; a log call in that window (two uncaught exceptions in one tick, or other logging while stdout is slow) hits Winston's unhandled "write after end" error and the process exits 7 instead of 1, sometimes losing the crash reason (reproduced; see `12-VERIFICATION.md`). Still non-zero, so a supervisor restarts it. Fix is a few lines plus a test that fires the handler twice: attach an error listener before `logger.end()`, or skip `logger.end()` and wait only for stdout.
- ⚠️ [Phase 10] CR-02's fix (dropping vehicles with malformed `loc.time` instead of crashing the request) has no committed regression test — production code is correct and independently spot-checked by both the code fixer and the phase verifier, but a future refactor could silently reintroduce the crash with nothing to catch it. Flagged as an info-level gap in `10-VERIFICATION.md`; recommend adding the 3 spot-check cases to the committed `VehicleService.test.ts` suite.
- ⚠️ [Phase 13] Code review (`13-REVIEW.md`) left 2 non-blocking warnings: numeric route/stop fields parsed with lenient `parseInt`/`parseFloat` and lat/lon not range-checked (WR-01); string fields unchecked, so a numeric `shortName` 404s on `/routes/:shortName` and a missing stop `name` is dropped (WR-02 — coerce, don't reject). Also open: no guard against overlapping `load()` calls (IN-03); permanent load failures log only at warn. Readiness signal (old WR-03) shipped in Phase 14 (HLTH-02).
- ⚠️ [Phase 13] `.claude/CLAUDE.md`/`AGENTS.md` still list Vitest 2.1.5 (package.json pins 3.2.6) and an incomplete endpoint list.
- ⚠️ [Phase 14] Code review (`14-REVIEW.md`), all non-blocking and adjudicated in `14-VERIFICATION.md`: CR-01 (accepted per D-08) — once stale, an instance stays 503 for up to ~1h after DASH recovers because post-load retries are hourly; revisit before deploying behind an orchestrator that de-routes on readiness (WR-05: every replica de-routes together). WR-01 — `trust proxy = 0` silences express-rate-limit's XFF misconfiguration warning (map 0 → `false`). WR-02 scheduled as Phase 16. WR-03 — fixed 5-min grace breaks the 3-failure guarantee when `DASH_API_TIMEOUT_MS` > ~100s. WR-04 — `rateLimit.test.ts` reads `TRUST_PROXY_HOPS` from the local `.env` (pin it in `test/setup.ts`).
- [Phase 13-05] Bun 1.0.31 'bunx' does not forward SIGTERM/SIGINT to its child: signalling a 'bunx tsx' wrapper orphans the server. Smokes ran ./node_modules/.bin/tsx directly. Check how production is supervised (start-server uses ts-node via bun run, untested).

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260827-j3c | Discard current changes to CLAUDE.md, add Engineering Principles section, remove Core Value/Constraints sections from CLAUDE.md and AGENTS.md | 2026-08-27 | fd24325 | [260827-j3c-discard-current-changes-to-claude-md-add](./quick/260827-j3c-discard-current-changes-to-claude-md-add/) |
| 260827-jaa | Consolidate root CLAUDE.md and .claude/CLAUDE.md into a single canonical .claude/CLAUDE.md; delete root CLAUDE.md | 2026-08-27 | 09f054c | [260827-jaa-consolidate-root-claude-md-and-claude-cl](./quick/260827-jaa-consolidate-root-claude-md-and-claude-cl/) |
| 260915-fc8 | Ensure predictions endpoint uses Swiftly real-time predictions API; add vehicle positions endpoint using Swiftly real-time vehicles API | 2026-09-15 | 04a2b66 | [260915-fc8-ensure-predictions-endpoint-uses-swiftly](./quick/260915-fc8-ensure-predictions-endpoint-uses-swiftly/) |
| 4 | Fix bun run lint failure: Biome format error in .superset/config.json | 2026-09-29 | 9be1043 | — |

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| seeds | SEED-001-service-alerts-per-route | dormant | 2026-09-24 | v0.5 |
| seeds | SEED-002-schedule-adherence | dormant | 2026-09-24 | v0.5 |
| verification_override | 11-nearby-stop-predictions/11-VERIFICATION.md | passed (flagged stale: REQUIREMENTS.md checkboxes edited after verification; no code change) | 2026-09-24 | v0.5 |
| Requirement | NEAR-10: Live SSE stream of nearby-location predictions | Deferred (future) | Requirements definition | v0.5 |
| Requirement | NEAR-11: Optional `route` filter on nearby predictions | Deferred (future) | Requirements definition | v0.5 |
| Requirement | LIVE-06: Bidirectional WebSocket support for switching subscribed stop without reconnecting | Deferred to v2 | Roadmap creation | v0.2 |
| Requirement | LIVE-07: Client-configurable poll/update interval | Deferred to v2 | Roadmap creation | v0.2 |

## Session Continuity

Last session: 2026-10-07T19:05:44.598Z
Stopped at: Completed 15-01-PLAN.md
Resume file: None

## Operator Next Steps

- Discuss the next v0.6 phase with /gsd-discuss-phase 15
