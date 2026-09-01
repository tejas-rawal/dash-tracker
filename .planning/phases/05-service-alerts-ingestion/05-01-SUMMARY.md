---
phase: 05-service-alerts-ingestion
plan: 01
subsystem: service-alerts-ingestion
tags: [gtfs-rt, service-alerts, poll-loop, dash-api, singleton-repository, factory-di]

requires:
  - phase: 04-live-predictions-via-sse
    provides: PredictionStreamService's setInterval poll-loop and catch-and-log pattern, mirrored here for the alerts driver
provides:
  - "ServiceAlert domain model with Dash*-shaped raw upstream types, mirroring Prediction.ts's split"
  - "ServiceAlertService.fetchAlerts(): DASH /real-time/{agency}/service-alerts fetch, active-window collapse (D-02/D-03), raw cause/effect passthrough (D-04/D-05)"
  - "ServiceAlertRepository: singleton in-memory store with atomic applyAlerts() swap and inclusive-boundary getActiveAlerts() query"
  - "ServiceAlertPollService: boot-triggered, non-blocking 5-minute poll loop wired into app.ts ahead of BusDataRepository.initialize()"
affects: [06-service-alerts-surfacing]

actuals:
  tokens: 8494
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "Dash*-prefixed raw upstream types separated from domain types (mirrors Prediction.ts/DashPrediction split)"
    - "Boot-triggered, unawaited setInterval poll loop started before an existing blocking-init promise chain, never inside its .then()/.catch()"
    - "Atomic full-Map-replacement swap in applyAlerts() to avoid partial/torn state under overlapping poll ticks"
    - "Catch-and-log (never rethrow) poll failure handling that leaves the previous in-memory dataset intact (stale-but-available)"

key-files:
  created:
    - src/server/api/models/ServiceAlert.ts
    - src/server/api/services/ServiceAlertService.ts
    - src/server/api/services/ServiceAlertService.test.ts
    - src/server/api/repositories/ServiceAlertRepository.ts
    - src/server/api/repositories/ServiceAlertRepository.test.ts
    - src/server/api/services/ServiceAlertPollService.ts
    - src/server/api/services/ServiceAlertPollService.test.ts
  modified:
    - src/server/app.ts
    - src/server/api/models/index.ts
    - src/server/api/repositories/index.ts

key-decisions:
  - "Active-window filtering happens at query time (getActiveAlerts(referenceTime)), not at fetch/store time, so a not-yet-active alert is never stuck unfiltered for up to 5 minutes past when it should activate."
  - "Inclusive boundary on both ends of activePeriod (start <= referenceTime <= end); an alert becomes inactive the instant referenceTime > end."
  - "No poll-overlap guard on ServiceAlertPollService — mirrors PredictionStreamService's no-guard precedent; applyAlerts()'s atomic Map swap makes overlapping ticks resolve to last-write-wins with no torn state."
  - "A globally-scoped alert (no informed_entity) is stored, not dropped, with informedRouteIds/informedStopIds as [] — matching/filtering by route/stop is explicitly Phase 6's job."

patterns-established:
  - "Boot-triggered, non-blocking background poll: call start() synchronously before an existing await-gated startup promise chain, never inside its .then()/.catch()."

requirements-completed: [ALRT-01, ALRT-02, ALRT-03, ALRT-04]

coverage:
  - id: D1
    description: "Server fetches, normalizes, and stores GTFS-RT service alerts from the DASH/Swiftly API on a dedicated ~5-minute background poll"
    requirement: "ALRT-01, ALRT-02"
    verification:
      - kind: unit
        ref: "src/server/api/services/ServiceAlertPollService.test.ts#triggers an immediate fetch + apply on start()"
        status: pass
      - kind: unit
        ref: "src/server/api/services/ServiceAlertPollService.test.ts#triggers exactly one additional poll cycle after advancing 5 minutes"
        status: pass
    human_judgment: false
  - id: D2
    description: "ServiceAlert captures affected route(s)/stop(s), description, raw cause/effect, and a collapsed active window per alert"
    requirement: "ALRT-03"
    verification:
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#maps a Dash alert entity with one active_period..."
        status: pass
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#collapses two active_period entries to {start: earliest start, end: latest end} (D-02)"
        status: pass
    human_judgment: false
  - id: D3
    description: "ServiceAlertRepository.getActiveAlerts() returns only alerts whose active window contains the current time; expired/future alerts excluded"
    requirement: "ALRT-04"
    verification:
      - kind: unit
        ref: "src/server/api/repositories/ServiceAlertRepository.test.ts#includes an alert whose window contains referenceTime"
        status: pass
      - kind: unit
        ref: "src/server/api/repositories/ServiceAlertRepository.test.ts#end-to-end: fetch -> normalize -> filter-active -> query"
        status: pass
    human_judgment: false
  - id: D4
    description: "Alerts poll never blocks app.listen() and runs independently of PredictionStreamService's 30s poll"
    requirement: "ALRT-01, ALRT-02"
    verification:
      - kind: manual
        ref: "src/server/app.ts — serviceAlertPollService.start() precedes repository.initialize(), no await between construction and app.listen()"
        status: pass
    human_judgment: true
    rationale: "Non-blocking startup ordering is structurally verified by grep + code inspection (confirmed during execution), not exercised by an automated integration test that boots the real Express server — a human/verifier pass over app.ts confirms the ordering invariant holds."

duration: 190min
completed: 2026-09-01
status: complete
---

# Phase 05 Plan 01: Service Alerts Ingestion Summary

**GTFS-RT service alert fetch, normalize, and active-window filtering pipeline (ServiceAlert model, ServiceAlertService, ServiceAlertRepository, ServiceAlertPollService) with a boot-triggered, non-blocking 5-minute poll wired into app.ts.**

## Performance
- **Duration:** 190min (includes an interrupted/resumed execution session)
- **Started:** 2026-09-01T20:28:05Z
- **Completed:** 2026-09-01T23:38:13Z
- **Tasks:** 3
- **Files modified:** 10 (7 created, 3 modified)

## Accomplishments
- `ServiceAlert.ts` domain model with `Dash*`-shaped raw upstream types (`DashAlert`, `DashAlertEntity`, `DashAlertsApiResponse`), mirroring `Prediction.ts`'s domain/Dash split
- `ServiceAlertService.fetchAlerts()`: fetches `/real-time/{agency}/service-alerts`, collapses multi-period active windows to earliest-start/latest-end (D-02), treats zero/omitted periods as always-active (D-03), passes `cause`/`effect` through unmapped (D-04/D-05), throws `UpstreamApiError` on a malformed (`entity` present but non-array) response (STRIDE T-05-01 mitigation)
- `ServiceAlertRepository`: singleton in-memory store with atomic `applyAlerts()` full-replacement swap and inclusive-boundary `getActiveAlerts(referenceTime)` query — no `assertInitialized()` guard, empty-before-first-fetch is a valid state (D-06)
- `ServiceAlertPollService`: fires an immediate fetch+apply on `start()` without waiting for the first tick (D-07), then continues on a dedicated 5-minute `setInterval`, entirely independent of `PredictionStreamService`'s 30s per-stop poll; a rejected fetch is logged via `logger.error` and leaves the repository untouched (stale-but-available)
- Wired into `app.ts`: `serviceAlertPollService.start()` called synchronously before `repository.initialize()`, outside its `.then()`/`.catch()` chain — never awaited, never blocks `app.listen()`
- Full edge-case test coverage locking in D-02/D-03 branches, malformed-feed rejection, empty/omitted `informed_entity` handling, inclusive-boundary active-window checks, and stable insertion-order output

## Task Commits
1. **Task 1: End-to-end fetch -> normalize -> filter-active -> query (tracer)** - `e08be36` (test, RED) / `26b9c89` (feat, GREEN)
2. **Task 2: Boot-triggered 5-minute poll driver, wired into app.ts non-blocking** - `e357e5f` (test, RED) / `9490a90` (feat, GREEN)
3. **Task 3: Harden active-window edge cases** - `19a55cd` (test)

**Plan metadata:** commit pending (this SUMMARY.md commit)

## Files Created/Modified
- `src/server/api/models/ServiceAlert.ts` - `ServiceAlert`/`ServiceAlertActivePeriod` domain types plus `Dash*` raw upstream types
- `src/server/api/services/ServiceAlertService.ts` - fetch, active-window derivation, Dash-to-domain mapping
- `src/server/api/services/ServiceAlertService.test.ts` - 12 tests covering fetch, mapping, D-02/D-03, malformed-feed rejection, empty-entity handling
- `src/server/api/repositories/ServiceAlertRepository.ts` - singleton store, atomic apply, active-window query
- `src/server/api/repositories/ServiceAlertRepository.test.ts` - 11 tests covering empty-before-apply, boundary inclusivity, insertion order, end-to-end path
- `src/server/api/services/ServiceAlertPollService.ts` - boot-triggered 5-minute poll driver
- `src/server/api/services/ServiceAlertPollService.test.ts` - 4 tests covering immediate fetch, interval cadence, failure/success handling
- `src/server/app.ts` - wires `serviceAlertPollService.start()` non-blocking, before `repository.initialize()`
- `src/server/api/models/index.ts` - exports `ServiceAlert`
- `src/server/api/repositories/index.ts` - exports `ServiceAlertRepository`

## Decisions Made
- Followed CONTEXT.md decisions D-02 through D-07 exactly as specified (multi-period collapse, always-active zero-period window, raw cause/effect passthrough, no derived severity, non-blocking boot-triggered poll with an immediate first fetch).
- Used per-field `biome-ignore lint/style/useNamingConvention` comments (matching the existing `environment.ts` precedent) for the GTFS-RT snake_case `Dash*` fields, since this Biome version (1.9.4) does not support `biome-ignore-start`/`-end` block suppressions — confirmed by running `biome check` directly against a block-suppression attempt before falling back to the per-field convention.
- Verified the DASH service-alerts endpoint path assumption (`/real-time/{agency}/service-alerts`, flagged assumption 7 in PLAN.md) could not be confirmed against a live API in this ingestion-only phase; the URL-builder/mapping logic is isolated to `ServiceAlertService.ts` so a shape mismatch is a same-file fix with no architectural blast radius, matching the plan's stated reversibility rating.

## Deviations from Plan

None - plan executed exactly as written, including the tracer feedback gate after Task 1 (re-ran Task 1's `<verify>` end-to-end before expanding into Tasks 2/3, per HUMAN_VERIFY_MODE=end-of-phase with no `<human-check>` present).

**Total deviations:** 0 auto-fixed. **Impact:** none — no scope creep, no architectural changes required.

## Issues Encountered
- Execution was interrupted mid-Task-2 by an idle/stall timeout after the `ServiceAlertPollService.ts` GREEN implementation file had already been written to disk but not yet verified or committed. Resumed in the same worktree per the coordinator's explicit state recap, verified the existing implementation was correct (all 4 poll-service tests passed unmodified), then completed the remaining Task 2 steps (barrel exports, `app.ts` wiring, commit) and all of Task 3 without redoing any prior work.

## User Setup Required
None - no external service configuration required. No new environment variables introduced; reuses the existing `DASH_API_BASE_URL`/`DASH_API_AGENCY`/`DASH_API_KEY` configuration.

## Next Phase Readiness
Phase complete, ready for next step. `ServiceAlertRepository.getActiveAlerts()` is exported via the repositories barrel as the stable query surface Phase 6 (ALRT-05..09) will import to embed active alerts into route/stop/prediction responses. No client-facing HTTP surface exists yet by design (ingestion only, per this phase's scope).

---
*Phase: 05-service-alerts-ingestion*
*Completed: 2026-09-01*
