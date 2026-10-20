---
gsd_state_version: "1.0"
milestone: v0.7
milestone_name: Frontend Foundation
status: planning
last_updated: "2026-10-20T21:00:17.000Z"
last_activity: 2026-10-20
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-20)

**Core value:** Riders can always see accurate, near-real-time arrival predictions for their stop.
**Current focus:** v0.7 Frontend Foundation — Phase 17: Monorepo Restructure

## Current Position

Phase: 17 of 17-21 (Monorepo Restructure)
Plan: —
Status: Ready to plan (roadmap created)
Last activity: 2026-10-20 — v0.7 roadmap created (Phases 17-21, 36/36 requirements mapped)

Progress (v0.7): [░░░░░░░░░░] 0%

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
| 15 | 3 | - | - |
| 16 | 1 | - | - |

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
| Phase 15 P02 | 3 min | 2 tasks | 3 files |
| Phase 15 P03 | 4min | 2 tasks | 4 files |
| Phase 16 P01 | 6min | 3 tasks | 7 files |

## Accumulated Context

### Decisions

Decisions are logged in the PROJECT.md Key Decisions table. The per-phase decision logs for v0.6 are in `.planning/milestones/v0.6-phases/*/*-SUMMARY.md` and `*-CONTEXT.md`. Earlier milestones are in their own `v0.X-phases/` archives.

Recent decisions affecting v0.7:

- [Roadmap v0.7] Five phases, not the research's six. Coarse granularity merges the toolchain and CORS work into Phase 18: both are server-only, both must land before app code, and each change still gets its own commits. The restructure stays alone in Phase 17 so it gets its own gate and can ship as its own PR. REST (Phase 20) and SSE (Phase 21) stay separate so the core flow ships even if streaming slips.
- [Requirements v0.7] Bun is pinned at 1.3.14 (not 1.4). `CORS_ALLOWED_ORIGINS` is optional and defaults to empty, which means no browser access. Biome moves to 2.5 in this milestone. Route colors (CORS-05) depend on what the live payload carries.
- [Research v0.7] SSE runs over global `fetch` with `eventsource-parser`, not react-native-sse. v0.7 adds no REST polling alongside the stream and no server heartbeat. Freshness is measured from when the client receives data: stale banner at 75 s, watchdog reconnect at 90 s. The API base URL fails loudly when unset, with no fallback.

### Pending Todos

None yet.

### Blockers/Concerns

**v0.7 (new):**

- ⚠️ [Phase 19] Expo SDK 58 (RN 0.88.0 and every 58.0.x patch) is behind the 7-day release-age gate until about 2026-10-22 to 26. Install only once the newest `expo` patch's whole dependency closure has cleared it. If execution reaches Phase 19 earlier, wait. Don't drop to SDK 57, and don't use `minimumReleaseAgeExcludes`.
- ⚠️ [Phase 19] Research before planning: the SDK 58 blank TypeScript template plus expo-router, jest-expo/Jest 30/RNTL 14 under the hoisted linker, which Biome 2 rules fire on Expo files, and whether `expo install` writes `~` despite `exact = true`. SDK 58 Expo Go isn't in the iOS App Store yet, so UAT runs on the iOS simulator, on Android or with a dev build.
- ⚠️ [Phase 21] Spike before planning. On an Android debug build and the iOS simulator, confirm that `expo/fetch` delivers stream chunks as they arrive and that `abort()` frees the server's stream slot. If it fails, replan Phase 21; the REST flow from Phase 20 is unaffected.
- ⚠️ [Phase 17] Ask the user whether to land the restructure as its own PR or to merge the milestone PR without squashing. A squash merge would lose the pure-rename commit that keeps `git log --follow` and blame intact.
- ⚠️ [Phase 18 / Phase 20] Capture live DASH payloads before planning. Phase 18 needs to know whether `/routes?verbose=true` carries `color`/`textColor` (decides CORS-05). Phase 20 needs the default number of `/predictions?stop=` entries per destination.
- ⚠️ [Phase 17 / Phase 19] MONO-01 (workspace with both apps) and TOOL-09 (TypeScript 6 in both workspaces) are mapped to Phases 17 and 18, where only `apps/server` exists. The mobile half of each is checked by Phase 19 success criterion 5.

**Carried forward:**

- ⚠️ [Phase 1, v0.1] `lint:fix` uses Biome's deprecated `--apply-unsafe` flag. Scheduled: Phase 18 (TOOL-10).
- ⚠️ [Phase 3] Code review (archived: `.planning/milestones/v0.2-phases/03-stop-discovery/03-REVIEW.md`) flagged 2 non-blocking edge cases: empty-string `lat`/`lng` query params coerce to `0` instead of 400ing in `StopController`; `StopService.getNearbyStops` doesn't lower-bound `count` if called directly (not reachable via the controller today).
- ⚠️ [v0.2] An unrelated, pre-existing uncommitted fix to `BusDataRepository.ts` (dedupe `initialize()`/`refreshData()` load paths) was swept into the v0.2 execution history by the automated code-review-fix pipeline (commit `b52c130`) — correct fix, but out of Phase 3/4 scope and not explicitly approved before landing. Flagged to the user; left in place.
- ⚠️ [Phase 6, v0.3] `FavoritesController.unfavorite` doesn't validate `entityId` the way `favorite` does, and `favorite`'s `entityId` is trim-validated but the untrimmed value is what's persisted/looked up — both whitespace-padded-id edge cases (WR-01/WR-03, `.planning/milestones/v0.3-phases/06-favorites-routes-stops/06-REVIEW.md`). Non-blocking.
- ⚠️ [Phase 7, v0.3] `RecentsController.resolveDeviceId` unsafely casts the device-id header to `string` with no in-controller guard; its `NotFoundError`→404 branch is unreachable; device-id header parsing is duplicated across 4 files; the recents cap (`5`) is a magic number in a SQL string; `resolveEntity` is duplicated verbatim between `RecentsService`/`FavoritesService` (WR-02/WR-03/IN-01/IN-02/IN-03, `.planning/milestones/v0.3-phases/07-recents-routes-stops/07-REVIEW.md`). Non-blocking.
- ⚠️ [Phase 9] `RouteWithAlerts` (`BusRoute & { alerts }`) is built via object spread over a `BusRoute` class instance, losing its prototype methods even though the static type doesn't reflect that (WR-01, `09-REVIEW.md`). No live call site hits it today.
- ⚠️ [Phase 12] `exitAfterLogFlush` in `processHandlers.ts` calls `logger.end()` and then waits for the flush; a log call in that window hits Winston's unhandled "write after end" error and the process exits 7 instead of 1, sometimes losing the crash reason (see `12-VERIFICATION.md`). Still non-zero, so a supervisor restarts it. Fix: attach an error listener before `logger.end()`, or skip `logger.end()` and wait only for stdout.
- ⚠️ [Phase 10] CR-02's fix (dropping vehicles with malformed `loc.time` instead of crashing the request) has no committed regression test (info-level gap in `10-VERIFICATION.md`); recommend adding the 3 spot-check cases to `VehicleService.test.ts`.
- ⚠️ [Phase 13] Code review (`13-REVIEW.md`) left 2 non-blocking warnings: numeric route/stop fields parsed with lenient `parseInt`/`parseFloat` and lat/lon not range-checked (WR-01); string fields unchecked, so a numeric `shortName` 404s on `/routes/:shortName` and a missing stop `name` is dropped (WR-02 — coerce, don't reject). Also open: no guard against overlapping `load()` calls (IN-03); permanent load failures log only at warn.
- ⚠️ [Phase 13] `.claude/CLAUDE.md`/`AGENTS.md` endpoint list is incomplete (stops, favorites/recents, nearby, stream, vehicles missing). Phase 17 (MONO-04) rewrites their paths, which is a natural time to complete the list.
- ⚠️ [Phase 14] Code review (`14-REVIEW.md`), all non-blocking and adjudicated in `14-VERIFICATION.md`: CR-01 (accepted per D-08) — once stale, an instance stays 503 for up to ~1h after DASH recovers; WR-01 — `trust proxy = 0` silences express-rate-limit's XFF warning (map 0 → `false`); WR-03 — fixed 5-min grace breaks the 3-failure guarantee when `DASH_API_TIMEOUT_MS` > ~100s; WR-04 — `rateLimit.test.ts` reads `TRUST_PROXY_HOPS` from the local `.env` (pin it in `test/setup.ts`). WR-04 matters in Phase 17, where `.env` moves to `apps/server`.
- ⚠️ [Phase 15] Code review (`15-REVIEW.md`), all non-blocking and adjudicated in `15-VERIFICATION.md`: WR-01 — an open start is ignored when merging alert periods, so a currently active alert can be hidden (real bug, needs its own fix); WR-04 — `Math.min`/`Math.max` spread can throw `RangeError` on a huge alert; WR-02 — date parsing depends on server TZ; WR-03 — alert text fields have no runtime type check; IN-05 — an alert whose ids are all non-strings is kept but shown nowhere.
- ⚠️ [Phase 15] `upstreamRateLimit.test.ts` ("allows the 59th and 60th requests and rejects the 61st and 62nd") hit its 5 s timeout once under full-suite coverage load; passes alone and on re-run. Raise that test's timeout if it recurs (watch for it in Phase 17's root-run coverage gate).
- ⚠️ [Phase 16] Before the first production deploy, work through `.planning/DEPLOY-CHECKLIST.md`: with `TRUST_PROXY_HOPS` left at 0 behind a proxy, the whole service shares 5 streams and one 60/min bucket. Pairs with Phase 14 WR-01.
- [Phase 13-05] Bun 1.0.31 `bunx` does not forward SIGTERM/SIGINT to its child, so signalling a `bunx tsx` wrapper orphans the server; smokes ran `./node_modules/.bin/tsx` directly. Phase 17 (Bun 1.3.14) and Phase 18 (`tsx` replaces ts-node) change both sides of this, so re-check signal forwarding then.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| verification_override | 12-bounded-upstream-calls-error-safety-nets/12-VERIFICATION.md | passed (flagged stale: later phases / quick task 261013-r6p edited covered files; full suite, lint and build green 2026-10-15) | 2026-10-15 | v0.6 |
| verification_override | 13-resilient-route-stop-data-lifecycle/13-VERIFICATION.md | passed (flagged stale: later phases / quick task 261013-r6p edited covered files; full suite, lint and build green 2026-10-15) | 2026-10-15 | v0.6 |
| verification_override | 14-health-checks-rate-limiting/14-VERIFICATION.md | passed (flagged stale: later phases / quick task 261013-r6p edited covered files; full suite, lint and build green 2026-10-15) | 2026-10-15 | v0.6 |
| verification_override | 15-alert-nearby-data-hygiene/15-VERIFICATION.md | passed (flagged stale: later phases / quick task 261013-r6p edited covered files; full suite, lint and build green 2026-10-15) | 2026-10-15 | v0.6 |
| seeds | SEED-001-service-alerts-per-route | dormant | 2026-09-24 | v0.5 |
| seeds | SEED-002-schedule-adherence | dormant | 2026-09-24 | v0.5 |
| verification_override | 11-nearby-stop-predictions/11-VERIFICATION.md | passed (flagged stale: REQUIREMENTS.md checkboxes edited after verification; no code change) | 2026-09-24 | v0.5 |
| Requirement | NEAR-10: Live SSE stream of nearby-location predictions | Deferred (future) | Requirements definition | v0.5 |
| Requirement | NEAR-11: Optional `route` filter on nearby predictions | Deferred (future) | Requirements definition | v0.5 |
| Requirement | LIVE-06: Bidirectional WebSocket support for switching subscribed stop without reconnecting | Deferred to v2 | Roadmap creation | v0.2 |
| Requirement | LIVE-07: Client-configurable poll/update interval | Deferred to v2 | Roadmap creation | v0.2 |

## Session Continuity

Last session: 2026-10-20
Stopped at: v0.7 roadmap created (Phases 17-21); ready to discuss/plan Phase 17
Resume file: None

## Operator Next Steps

- Discuss Phase 17 with /gsd-discuss-phase 17, or plan it directly with /gsd-plan-phase 17
- Decide the merge policy for the restructure (its own PR, or a non-squash milestone merge) before Phase 17 executes
