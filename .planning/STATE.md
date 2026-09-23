---
gsd_state_version: "1.0"
milestone: v0.5
milestone_name: Nearby Stop Predictions
current_phase: 11
current_phase_name: v0.5's only phase
status: planning
stopped_at: Phase 11 context gathered
last_updated: "2026-09-23T20:43:57.206Z"
last_activity: 2026-09-23
last_activity_desc: v0.5 roadmap created (Phase 11, NEAR-01..09 mapped)
state_head: aa4092bec9f88219c31bd85a83a803e09023b409
progress:
  total_phases: 2
  completed_phases: 10
  total_plans: 0
  completed_plans: 0
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-22)

**Core value:** Riders can always see accurate, near-real-time arrival predictions for their stop.
**Current focus:** Phase 11 — Nearby Stop Predictions (v0.5)

## Current Position

Phase: 11 of 11 (Nearby Stop Predictions) — v0.5's only phase
Plan: — (not yet planned)
Status: Ready to plan
Last activity: 2026-09-23 — v0.5 roadmap created (Phase 11, NEAR-01..09 mapped)

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed (v0.5): 0
- Average duration: - min
- Total execution time: 0 hours

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
| 11 (v0.5) | TBD | - | - |

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

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

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

### Pending Todos

None yet.

### Blockers/Concerns

- ⚠️ [v0.5, Phase 11] `predictions-near-location` payload shape is unverified — confirm against a live DASH/Swiftly response (requires `DASH_API_KEY`) before locking `Dash*` nearby types, including whether returned stop IDs are in the `BusStop.id` space needed for alert embedding (NEAR-06). Same risk class as Phase 8 alerts and Phase 10 vehicles.
- ⚠️ [Phase 1, v0.1] `lint:fix` uses Biome's deprecated `--apply-unsafe` flag (should become `--write --unsafe` per Biome 1.9.4); non-blocking, not yet addressed.
- ⚠️ [Phase 3] Code review (archived: `.planning/milestones/v0.2-phases/03-stop-discovery/03-REVIEW.md`) flagged 2 non-blocking edge cases: empty-string `lat`/`lng` query params coerce to `0` instead of 400ing in `StopController`; `StopService.getNearbyStops` doesn't lower-bound `count` if called directly (not reachable via the controller today). Neither blocks Phase 3 completion. Relevant to Phase 11: the new nearby-predictions validation must not copy this empty-string coercion bug (NEAR-08).
- ⚠️ [Phase 4, v0.2] Residual WR-05 from the 3-iteration code-review fix cycle (archived: `.planning/milestones/v0.2-phases/04-live-predictions-via-sse/04-REVIEW.md`): `PredictionStreamController`'s initial SSE write is guarded only against synchronous throws — a mid-write client-socket error surfaces asynchronously via an `'error'` event with no handler anywhere in `src/server`. Non-blocking, doesn't violate any LIVE-01..05 requirement.
- ⚠️ [v0.2] An unrelated, pre-existing uncommitted fix to `BusDataRepository.ts` (dedupe `initialize()`/`refreshData()` load paths) was swept into the v0.2 execution history by the automated code-review-fix pipeline (commit `b52c130`) — correct fix, but out of Phase 3/4 scope and not explicitly approved before landing. Flagged to the user; left in place.
- ⚠️ [Phase 6, v0.3] `FavoritesController.unfavorite` doesn't validate `entityId` the way `favorite` does, and `favorite`'s `entityId` is trim-validated but the untrimmed value is what's persisted/looked up — both whitespace-padded-id edge cases (WR-01/WR-03, `.planning/milestones/v0.3-phases/06-favorites-routes-stops/06-REVIEW.md`). Non-blocking, doesn't violate any FAV-01..05/DEVICE-01 requirement.
- ⚠️ [Phase 7, v0.3] `RecentsController.resolveDeviceId` unsafely casts the device-id header to `string` with no in-controller guard; its `NotFoundError`→404 branch is unreachable; device-id header parsing is duplicated across 4 files; the recents cap (`5`) is a magic number in a SQL string; `resolveEntity` is duplicated verbatim between `RecentsService`/`FavoritesService` (WR-02/WR-03/IN-01/IN-02/IN-03, `.planning/milestones/v0.3-phases/07-recents-routes-stops/07-REVIEW.md`). Non-blocking, doesn't violate any RECENT-01..06 requirement.
- ⚠️ [Phase 8, v0.4 — STILL OPEN after Phase 9] The confirmed live DASH alert payload (G-05-5) includes `deletedAt`/`deletedBy` fields that `ServiceAlertService`/`ServiceAlertRepository` currently ignore entirely. If the DASH admin tool soft-deletes alerts instead of removing them from the feed, a deleted-but-still-time-active alert could still surface via `getActiveAlerts()` — and Phase 9 now exposes that data publicly on route/stop responses without addressing it. Was flagged as "consider before Phase 9 exposes alerts publicly" but not picked up during Phase 9 planning/execution. Worth a follow-up before/early in the next milestone. Phase 11 (NEAR-06) will expose alerts on one more endpoint.
- ⚠️ [Phase 9] `RouteWithAlerts` (`BusRoute & { alerts }`) is built via object spread over a `BusRoute` class instance, losing its prototype methods even though the static type doesn't reflect that (WR-01, `09-REVIEW.md`). No live call site hits it today.
- ⚠️ [Phase 9] `ServiceAlertRepository.isAlertActive`'s date-boundary checks fail open on a malformed `activePeriod` date string rather than excluding/logging it (WR-02, `09-REVIEW.md`).
- ⚠️ [Phase 10] CR-02's fix (dropping vehicles with malformed `loc.time` instead of crashing the request) has no committed regression test — production code is correct and independently spot-checked by both the code fixer and the phase verifier, but a future refactor could silently reintroduce the crash with nothing to catch it. Flagged as an info-level gap in `10-VERIFICATION.md`; recommend adding the 3 spot-check cases to the committed `VehicleService.test.ts` suite.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260827-j3c | Discard current changes to CLAUDE.md, add Engineering Principles section, remove Core Value/Constraints sections from CLAUDE.md and AGENTS.md | 2026-08-27 | fd24325 | [260827-j3c-discard-current-changes-to-claude-md-add](./quick/260827-j3c-discard-current-changes-to-claude-md-add/) |
| 260827-jaa | Consolidate root CLAUDE.md and .claude/CLAUDE.md into a single canonical .claude/CLAUDE.md; delete root CLAUDE.md | 2026-08-27 | 09f054c | [260827-jaa-consolidate-root-claude-md-and-claude-cl](./quick/260827-jaa-consolidate-root-claude-md-and-claude-cl/) |
| 260915-fc8 | Ensure predictions endpoint uses Swiftly real-time predictions API; add vehicle positions endpoint using Swiftly real-time vehicles API | 2026-09-15 | 04a2b66 | [260915-fc8-ensure-predictions-endpoint-uses-swiftly](./quick/260915-fc8-ensure-predictions-endpoint-uses-swiftly/) |

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| Requirement | NEAR-10: Live SSE stream of nearby-location predictions | Deferred (future) | Requirements definition | v0.5 |
| Requirement | NEAR-11: Optional `route` filter on nearby predictions | Deferred (future) | Requirements definition | v0.5 |
| Requirement | LIVE-06: Bidirectional WebSocket support for switching subscribed stop without reconnecting | Deferred to v2 | Roadmap creation | v0.2 |
| Requirement | LIVE-07: Client-configurable poll/update interval | Deferred to v2 | Roadmap creation | v0.2 |

## Session Continuity

Last session: 2026-09-23T20:43:57.184Z
Stopped at: Phase 11 context gathered
Resume file: .planning/phases/11-nearby-stop-predictions/11-CONTEXT.md

## Operator Next Steps

- Plan Phase 11 with /gsd-plan-phase 11 (or /gsd-discuss-phase 11 first)
