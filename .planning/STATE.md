---
gsd_state_version: "1.0"
milestone: v0.7
milestone_name: Frontend Foundation
current_phase: 19
current_phase_name: App Foundation & Route List
status: planning
stopped_at: Phase 18 complete, ready to plan Phase 19
last_updated: "2026-11-17T21:40:04.288Z"
last_activity: 2026-11-17
last_activity_desc: Phase 18 complete, transitioned to Phase 19
state_head: d2bd388633f9c0bfed3a99e0dcb5d38e8c4e1d35
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 9
  completed_plans: 9
  percent: 40
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-17)

**Core value:** Riders can always see accurate, near-real-time arrival predictions for their stop.
**Current focus:** Phase 19 — App Foundation & Route List

## Current Position

Phase: 19 — App Foundation & Route List
Plan: Not started
Status: Ready to plan
Last activity: 2026-11-17 — Phase 18 complete, transitioned to Phase 19

Progress (v0.7): [████░░░░░░] 40% (2/5 phases)

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
| 17 | 3 | - | - |
| 18 | 6 | - | - |

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
| Phase 17 P01 | 3h 2m | 3 tasks | 5 files |
| Phase 17 P02 | 8min | 3 tasks | 127 files |
| Phase 17 P03 | 4min | 3 tasks | 6 files |
| Phase 18 P01 | 3 min | 3 tasks | 6 files |
| Phase 18 P02 | 6 min | 2 tasks | 5 files |
| Phase 18 P03 | 5min | 2 tasks | 26 files |
| Phase 18 P04 | 5 min | 2 tasks | 13 files |
| Phase 18 P05 | 3 min | 2 tasks | 5 files |
| Phase 18 P06 | 5min | 2 tasks | 6 files |

## Accumulated Context

### Decisions

Decisions are logged in the PROJECT.md Key Decisions table. The per-phase decision logs for v0.6 are in `.planning/milestones/v0.6-phases/*/*-SUMMARY.md` and `*-CONTEXT.md`. Earlier milestones are in their own `v0.X-phases/` archives.

Recent decisions affecting v0.7:

- [Roadmap v0.7] Five phases, not the research's six. Coarse granularity merges the toolchain and CORS work into Phase 18: both are server-only, both must land before app code, and each change still gets its own commits. The restructure stays alone in Phase 17 so it gets its own gate and can ship as its own PR. REST (Phase 20) and SSE (Phase 21) stay separate so the core flow ships even if streaming slips.
- [Requirements v0.7] Bun is pinned at 1.3.14 (not 1.4). `CORS_ALLOWED_ORIGINS` is optional and defaults to empty, which means no browser access. Biome moves to 2.5 in this milestone. Route colors (CORS-05) depend on what the live payload carries.
- [Research v0.7] SSE runs over global `fetch` with `eventsource-parser`, not react-native-sse. v0.7 adds no REST polling alongside the stream and no server heartbeat. Freshness is measured from when the client receives data: stale banner at 75 s, watchdog reconnect at 90 s. The API base URL fails loudly when unset, with no fallback.
- [Phase 17]: Pin linker = hoisted explicitly in bunfig.toml: a regenerated bun.lock gets configVersion 1, which would silently switch to isolated installs
- [Phase 17]: Declare no trustedDependencies in Phase 17: a partial list replaces Bun's default trust list and blocks esbuild/Biome postinstalls (TOOL-07, Phase 18)
- [Phase 17]: CI uses only the plain pull_request event, never pull_request_target
- [Phase 17]: @vitest/coverage-v8@3.2.6 approved by the user despite SUS (too-new) seam verdict driven by newer 4.x/5.x publishes
- [Phase 17]: Root owns @biomejs/biome 1.9.4 (exact) since the root runs the single Biome lint; the workspace no longer lists it
- [Phase 17]: typecheck uses apps/server/tsconfig.typecheck.json (extends tsconfig.json, noEmit, tests included) so build keeps test files out of dist
- [Phase 17]: streamConcurrencyCap 'never claims a slot' hang under coverage load deferred: pre-existing, fix lives in src/test/streamClient.ts outside 17-02's allowed test files
- [Phase 17]: Superset run is cd apps/server && exec bun run dev-server; exec lets bun receive SIGTERM/SIGINT under any /bin/sh, proven by a fresh-worktree simulation with no orphans
- [Phase 18]: Node pinned to 24.22.2 LTS (ABI 137) in .node-version; every CI job sets it up with actions/setup-node@v7 before bun install
- [Phase 18]: trustedDependencies = [@biomejs/biome, better-sqlite3, esbuild]; it replaces Bun's default list and bun pm untrusted must stay empty
- [Phase 18]: Biome 1.9.4 lint baseline for 18-03: 36 warnings, 0 errors
- [Phase 18]: User approved @types/node@24.19.2 and @biomejs/biome@2.5.15 (SUS too-new) for plans 18-02 and 18-03
- [Phase 18]: Server tsconfig extends @tsconfig/node24 and overrides module to commonjs and moduleResolution to bundler; nodenext would break typecheck on the extensionless dynamic imports in environment.test.ts
- [Phase 18]: Explicit types ["node"] in apps/server/tsconfig.json keeps test-only @types out of the build; tsconfig.typecheck.json inherits it and needs no vitest/globals
- [Phase 18]: dev-server is tsx watch src/app.ts; it restarts on changes to imported files only, so an edit to apps/server/.env needs a manual restart
- [Phase 18]: 18-03: Biome 2.5.15 replaces 1.9.4; biome.json names each 1.9.4 style.all rule at its 1.9.4 severity (Biome 2 has no all); new Biome 2 style rules stay off; lint stays at the 36-warning baseline
- [Phase 18]: 18-03: noUselessUndefinedInitialization fixed with a null sentinel (let unsubscribe: (() => void) | null = null) because a bare let trips a Biome 1.9.4 useConst false positive
- [Phase 18]: 18-03: lint is red only at the migrate commit 597be9a (D-10 vs D-01, call out in PR); the Phase 18 PR must merge with a merge commit so .git-blame-ignore-revs keeps pointing at 86e09f1 (D-02)
- [Phase 18]: 18-04: createApp() in apps/server/src/createApp.ts is the one app wiring for app.ts and the tests; src/test/app.ts stays a thin default export
- [Phase 18]: 18-04: cors origin is a callback over a Set answering false off-list, not the array form, so requests without an allowed Origin are untouched (CORS-04)
- [Phase 18]: 18-04: CORS_ALLOWED_ORIGINS entries must equal their own URL.origin (http/https); a bad entry fails startup naming CORS_ALLOWED_ORIGINS.<i> and the entry
- [Phase 18]: 18-05: route colors pass through parseHexColor (exactly 6 hex digits, never throws); the exact DASH string is kept, anything else omits only that field and never rejects load()
- [Phase 18]: 18-06: No production fix needed for CORS; every D-14 row (SSE 200, both 429s, 503, 404, preflights) passed against 18-04's middleware, and writeHead keeps the cors headers
- [Phase 18]: 18-06: Characterization RED by mutation when the feature already shipped (allowlist removed: 14/28 fail, RED_EVIDENCE_OK; array origin form: 17/28 fail incl. every no-Origin row)

### Pending Todos

None yet.

### Blockers/Concerns

**v0.7 (new):**

- ⚠️ [Phase 19] Expo SDK 58 (RN 0.88.0 and every 58.0.x patch) is behind the 7-day release-age gate until about 2026-10-22 to 26. Install only once the newest `expo` patch's whole dependency closure has cleared it. If execution reaches Phase 19 earlier, wait. Don't drop to SDK 57, and don't use `minimumReleaseAgeExcludes`.
- ⚠️ [Phase 19] Research before planning: the SDK 58 blank TypeScript template plus expo-router, jest-expo/Jest 30/RNTL 14 under the hoisted linker, which Biome 2 rules fire on Expo files, and whether `expo install` writes `~` despite `exact = true`. SDK 58 Expo Go isn't in the iOS App Store yet, so UAT runs on the iOS simulator, on Android or with a dev build.
- ⚠️ [Phase 21] Spike before planning. On an Android debug build and the iOS simulator, confirm that `expo/fetch` delivers stream chunks as they arrive and that `abort()` frees the server's stream slot. If it fails, replan Phase 21; the REST flow from Phase 20 is unaffected.
- ⚠️ [Phase 20] Capture the default number of `/predictions?stop=` entries per destination before planning. (Phase 18's half is done: the live routes payload carries `color`/`textColor`, see `18-dash-routes-payload.txt`.)
- ⚠️ [Phase 17 / Phase 19] MONO-01 (workspace with both apps) and TOOL-09 (TypeScript 6 in both workspaces) are mapped to Phases 17 and 18, where only `apps/server` exists. The mobile half of each is checked by Phase 19 success criterion 5.

**Carried forward:**

- ⚠️ [Phase 3] Code review (archived: `.planning/milestones/v0.2-phases/03-stop-discovery/03-REVIEW.md`) flagged 2 non-blocking edge cases: empty-string `lat`/`lng` query params coerce to `0` instead of 400ing in `StopController`; `StopService.getNearbyStops` doesn't lower-bound `count` if called directly (not reachable via the controller today).
- ⚠️ [v0.2] An unrelated, pre-existing uncommitted fix to `BusDataRepository.ts` (dedupe `initialize()`/`refreshData()` load paths) was swept into the v0.2 execution history by the automated code-review-fix pipeline (commit `b52c130`) — correct fix, but out of Phase 3/4 scope and not explicitly approved before landing. Flagged to the user; left in place.
- ⚠️ [Phase 6, v0.3] `FavoritesController.unfavorite` doesn't validate `entityId` the way `favorite` does, and `favorite`'s `entityId` is trim-validated but the untrimmed value is what's persisted/looked up — both whitespace-padded-id edge cases (WR-01/WR-03, `.planning/milestones/v0.3-phases/06-favorites-routes-stops/06-REVIEW.md`). Non-blocking.
- ⚠️ [Phase 7, v0.3] `RecentsController.resolveDeviceId` unsafely casts the device-id header to `string` with no in-controller guard; its `NotFoundError`→404 branch is unreachable; device-id header parsing is duplicated across 4 files; the recents cap (`5`) is a magic number in a SQL string; `resolveEntity` is duplicated verbatim between `RecentsService`/`FavoritesService` (WR-02/WR-03/IN-01/IN-02/IN-03, `.planning/milestones/v0.3-phases/07-recents-routes-stops/07-REVIEW.md`). Non-blocking.
- ⚠️ [Phase 9] `RouteWithAlerts` (`BusRoute & { alerts }`) is built via object spread over a `BusRoute` class instance, losing its prototype methods even though the static type doesn't reflect that (WR-01, `09-REVIEW.md`). No live call site hits it today.
- ⚠️ [Phase 12] `exitAfterLogFlush` in `processHandlers.ts` calls `logger.end()` and then waits for the flush; a log call in that window hits Winston's unhandled "write after end" error and the process exits 7 instead of 1, sometimes losing the crash reason (see `12-VERIFICATION.md`). Still non-zero, so a supervisor restarts it. Fix: attach an error listener before `logger.end()`, or skip `logger.end()` and wait only for stdout.
- ⚠️ [Phase 10] CR-02's fix (dropping vehicles with malformed `loc.time` instead of crashing the request) has no committed regression test (info-level gap in `10-VERIFICATION.md`); recommend adding the 3 spot-check cases to `VehicleService.test.ts`.
- ⚠️ [Phase 13] Code review (`13-REVIEW.md`) left 2 non-blocking warnings: numeric route/stop fields parsed with lenient `parseInt`/`parseFloat` and lat/lon not range-checked (WR-01); string fields unchecked, so a numeric `shortName` 404s on `/routes/:shortName` and a missing stop `name` is dropped (WR-02 — coerce, don't reject). Also open: no guard against overlapping `load()` calls (IN-03); permanent load failures log only at warn.
- ⚠️ [Phase 14] Code review (`14-REVIEW.md`), all non-blocking and adjudicated in `14-VERIFICATION.md`: CR-01 (accepted per D-08) — once stale, an instance stays 503 for up to ~1h after DASH recovers; WR-01 — `trust proxy = 0` silences express-rate-limit's XFF warning (map 0 → `false`); WR-03 — fixed 5-min grace breaks the 3-failure guarantee when `DASH_API_TIMEOUT_MS` > ~100s; (WR-04 fixed in Phase 17: `src/test/setup.ts` pins `TRUST_PROXY_HOPS=0`.)
- ⚠️ [Phase 15] Code review (`15-REVIEW.md`), all non-blocking and adjudicated in `15-VERIFICATION.md`: WR-01 — an open start is ignored when merging alert periods, so a currently active alert can be hidden (real bug, needs its own fix); WR-04 — `Math.min`/`Math.max` spread can throw `RangeError` on a huge alert; WR-02 — date parsing depends on server TZ; WR-03 — alert text fields have no runtime type check; IN-05 — an alert whose ids are all non-strings is kept but shown nowhere.
- ⚠️ [Phase 15] `upstreamRateLimit.test.ts` ("allows the 59th and 60th requests and rejects the 61st and 62nd") hit its 5 s timeout once under full-suite coverage load; passes alone and on re-run. Raise that test's timeout if it recurs (watch for it in Phase 17's root-run coverage gate).
- ⚠️ [Phase 16] Before the first production deploy, work through `.planning/DEPLOY-CHECKLIST.md`: with `TRUST_PROXY_HOPS` left at 0 behind a proxy, the whole service shares 5 streams and one 60/min bucket. Pairs with Phase 14 WR-01.
- ⚠️ [Phase 17 UAT] `apps/server/src/api/routes/healthRoutes.test.ts` is order-dependent within the file (fails under `--sequence.shuffle.tests`; the `BusDataRepository` singleton is never reset). Pre-existing since v0.6; backlog 999.1.
- [Phase 17 UAT] In a hand run, SIGHUP to `cd apps/server && exec bun run dev-server` left the server running; SIGTERM, SIGINT and Superset/Paradev terminal dispose all stop it cleanly (re-checked under tsx in Phase 18 UAT 2–3). Low priority.
- [Phase 17-02] streamConcurrencyCap.test.ts 'never claims a slot for a connect the shared bucket rejects' hung past its 15 s timeout in 1 of 8 root coverage runs (pre-existing; connectStream in src/test/streamClient.ts swallows pre-response socket errors). See 17 deferred-items.md; fix in Phase 18 or a quick task.

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

Last session: 2026-11-17T22:00:00Z
Stopped at: Phase 18 complete (UAT 4/4, security verified), ready to discuss Phase 19
Resume file: None

## Operator Next Steps

- Merge PR #18 with a merge commit (D-02: `.git-blame-ignore-revs` lists `86e09f1`); triage code review WR-01/WR-02 first if desired
- Phase 19 needs research before planning (Expo SDK 58 template, jest-expo under the hoisted linker, Biome 2 on Expo files): /gsd-discuss-phase 19
