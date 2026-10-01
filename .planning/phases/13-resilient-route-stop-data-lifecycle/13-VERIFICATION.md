---
phase: 13-resilient-route-stop-data-lifecycle
verified: 2026-10-01T14:41:50Z
status: gaps_found
score: 11/12 must-haves verified
covered_files:
  - .planning/REQUIREMENTS.md
  - .planning/phases/13-resilient-route-stop-data-lifecycle/13-01-PLAN.md
  - .planning/phases/13-resilient-route-stop-data-lifecycle/13-01-SUMMARY.md
  - .planning/phases/13-resilient-route-stop-data-lifecycle/13-02-PLAN.md
  - .planning/phases/13-resilient-route-stop-data-lifecycle/13-02-SUMMARY.md
  - .planning/phases/13-resilient-route-stop-data-lifecycle/13-03-PLAN.md
  - .planning/phases/13-resilient-route-stop-data-lifecycle/13-03-SUMMARY.md
  - .planning/phases/13-resilient-route-stop-data-lifecycle/13-04-PLAN.md
  - .planning/phases/13-resilient-route-stop-data-lifecycle/13-04-SUMMARY.md
  - .planning/phases/13-resilient-route-stop-data-lifecycle/13-05-PLAN.md
  - .planning/phases/13-resilient-route-stop-data-lifecycle/13-05-SUMMARY.md
  - src/server/api/controllers/BusRouteController.ts
  - src/server/api/controllers/FavoritesController.ts
  - src/server/api/controllers/NearbyPredictionController.ts
  - src/server/api/controllers/PredictionController.ts
  - src/server/api/controllers/PredictionStreamController.ts
  - src/server/api/controllers/RecentsController.ts
  - src/server/api/controllers/StopController.ts
  - src/server/api/controllers/VehicleController.ts
  - src/server/api/controllers/errorResponse.ts
  - src/server/api/errors/index.ts
  - src/server/api/repositories/BusDataRepository.ts
  - src/server/api/services/BusDataRefreshService.ts
  - src/server/api/services/ServiceAlertPollService.ts
  - src/server/app.ts
covered_digest: "v1:sha256:dfea68c4f171fb0157c5a13a6ec159b333d9e23f571cb05d09910fc4432b1204"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "The server never loses its last good route/stop copy to a malformed upstream dataset: one malformed stop (bad code/coords) fails the whole attempt and changes nothing riders see (phase goal clause; D-12; 13-03 prohibition 'MUST NOT replace the last good route/stop data with a partial, empty or malformed upstream response'; 13-05 prohibition that a malformed-upstream refresh failure is always visible)"
    status: failed
    reason: "createStop() only rejects values that parse to NaN. Absent or null code/lat/lon pass Number.isNaN (undefined and null are not NaN), so a DASH payload whose stops lack coordinates or codes is committed as a successful load: applyData swaps it in, lastLoadedAt advances, lastError is cleared and the loader logs info 'Route/stop data refreshed'. Reproduced against the real load() through the bounded client: stops [{id:'s-missing'}, {id:'s-null', code:null, lat:null, lon:null}] -> load resolved {routeCount:1, stopCount:2}. Before this phase, data loaded once at boot, so there was no last good copy to lose. The hourly refresh now replaces a good dataset with this one silently. That is the exact outcome the user asked to make visible (13-CONTEXT specifics). Route and direction ids are not validated either, so a route with no id is stored under the key 'undefined'."
    artifacts:
      - path: "src/server/api/repositories/BusDataRepository.ts"
        issue: "createStop (lines 190-205) uses Number.isNaN, which fails open for missing or null code/lat/lon. createRoute and createDirection accept a missing id."
      - path: "src/server/api/repositories/BusDataRepository.test.ts"
        issue: "The 'fails the whole load on one malformed stop' tests only cover unparseable strings ('abc'). They don't cover absent or null fields."
    missing:
      - "Validate stop code, lat and lon with Number.isFinite (after string parsing), or parse the DASH routes payload with Zod, which the project already uses. Reject a stop whose code, lat or lon is absent, null or non-finite."
      - "Reject routes and directions whose id is not a non-empty string."
      - "Add unit tests: a load with a stop missing lat/lon, a stop with null code, and a route with no id each rejects, records lastError and keeps the previous dataset. Add one E2E row to dataReload.test.ts in which a successful load followed by such a payload keeps GET /api/v1/routes/all deep-equal to the good body."
deferred:
  - truth: "A host or orchestrator can tell that a listening instance cannot yet serve route/stop data (review WR-03: getLoadState() has no production consumer; GET / answers 200 while every data endpoint answers 503)"
    addressed_in: "Phase 14"
    evidence: "Phase 14 SC2: 'The readiness endpoint ... returns 503 before the first load and when refreshes have failed long enough for the data to go stale, and it reports the data age (or that data was never loaded)'. Phase 14 depends on Phase 13 for exactly this load state, and 13-CONTEXT puts readiness endpoints out of scope here."
---

# Phase 13: Resilient Route/Stop Data Lifecycle Verification Report

**Phase goal:** The server comes up and serves what it can even when DASH is down at boot, becomes fully usable on its own once DASH is reachable, and keeps route/stop data current for as long as it runs without ever losing its last good copy.
**Verified:** 2026-10-01T14:41:50Z
**Status:** gaps_found
**Re-verification:** No. This is the initial verification.

## Goal Achievement

### Observable Truths

Truths 1 to 5 are the ROADMAP success criteria. Truths 6 to 12 are plan must-haves and goal clauses merged in without reducing scope.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: started with DASH unreachable, the server accepts HTTP connections right away instead of exiting, and the logs show the initial load retried with increasing delays | ✓ VERIFIED | Ran the real process myself (`./node_modules/.bin/tsx src/server/app.ts`, DASH at 127.0.0.1:1). It logged "Server is running on port …"; `GET /` returned 200; `GET /api/v1/routes/all` returned 503. Warn lines showed attempt 1, 2 and 3 failed with next delays of 512, 1356 and 3240 ms (SIGINT run: 550, 1515, 3050 ms). The API key did not appear in the log. |
| 2 | SC2: until the first successful load, the data-dependent endpoints return 503 instead of 500, and once DASH is reachable they return 200 without a restart | ✓ VERIFIED | `dataNotReady.test.ts` runs the real router on a never-loaded singleton and covers 7 GET endpoints plus POST /favorites: each returns 503 with `Retry-After: 5`. `dataBootRetry.test.ts` covers 503, then the loader retry, then 200 with exactly two DASH calls. A real-process recovery smoke showed 503 before DASH came up, then "loaded on attempt 3" and 200 on `/routes/all` and `/routes/1A/stops`. |
| 3 | SC3: after the first load, route/stop data is re-fetched on a background interval for the life of the process, so upstream changes appear without a restart | ✓ VERIFIED | `BusDataRefreshService.ts` re-arms with `schedule(REFRESH_INTERVAL_MS)` (3,600,000 ms) after every settled post-load attempt. Fake-timer tests cover the hourly boundary at 3,599,999 vs 3,600,000 ms and that a failed refresh keeps the hourly cadence. In `dataReload.test.ts` step 4, a new route set and a new order appear in `/routes/all`. |
| 4 | SC4: a failed refresh is logged and every endpoint keeps serving the last successfully loaded data, with no 5xx and no partial swap | ✓ VERIFIED (for detected failures) | `load()` commits only through the synchronous `applyData` swap. `dataReload.test.ts` covers zero routes and a DASH 503: `/routes/all` stays 200 and deep-equal to the good body. Unit tests cover the unparseable-stop case and in-flight reads. The loader logs one warn per failed attempt. See truth 6 for malformed data that is *not* detected as a failure. |
| 5 | SC5: the repository records the last successful load time, advancing it on success and leaving it unchanged on failure, and background timers stop cleanly on SIGTERM/SIGINT | ✓ VERIFIED | The `getLoadState()` snapshot is covered by 6 unit tests, including copy-on-read and key-free `lastError`. The shutdown path calls `refreshService.stop()` and `serviceAlertPollService.stop()` before `server.close`. Real-process SIGTERM and SIGINT each logged "Server is gracefully shutting down" and exited 0. Unit tests cover `stop()` cancelling a pending backoff, a pending hourly refresh and an in-flight attempt, plus the alert poll's `stop()`. |
| 6 | Goal clause, D-12 and 13-03 prohibition: a malformed upstream dataset never replaces the last good copy | ✗ FAILED | `createStop` validates with `Number.isNaN`, which passes `undefined` and `null`. A repro with stops missing `code`/`lat`/`lon`, and with them set to null, resolved `{routeCount:1, stopCount:2}` and committed the stops. On a refresh this silently replaces good data, clears `lastError` and logs info "refreshed". Matches review WR-02. |
| 7 | D-01/D-02: one shared error mapping (404/503+Retry-After/502/generic 500) used by all 8 controllers; no 500 echoes the thrown message | ✓ VERIFIED | `errorResponse.ts` is the only file with `instanceof NotFoundError/DataNotReadyError/UpstreamApiError`. All 8 `*Controller.ts` files call `sendErrorResponse(res, error)` (between 1 and 3 call sites each). The 500 body is the constant "An unexpected error occurred", and the handler logs once with the stack only. |
| 8 | D-05 to D-10: capped exponential backoff with equal jitter (1s, then 60s cap), chained `setTimeout`, no overlap, retry forever, one log line per attempt, never at error level | ✓ VERIFIED | `computeRetryDelayMs` and `runAttempt` match the spec. `setInterval` does not appear in the loader. The suite covers the 500/1000/…/30000 sequence, no shrinking delay over 20 attempts, no overlap across 24 h of pending time, `start()` idempotence and the non-Error "Unknown error" case. |
| 9 | D-14/Phase 12: `lastError` and every loader log line are message-only and never contain DASH_API_KEY | ✓ VERIFIED | `load()` stores and rethrows only `error.message`. A unit test covers an error carrying `config.headers.Authorization`. `dataReload` and `dataBootRetry` assert the logs and state don't contain the key, and the real-process smokes grepped 0 key leaks. |
| 10 | D-19: one load path; `initialize()`/`refreshData()`/`initializationPromise`/`handleLoadError` and the repository logger are gone | ✓ VERIFIED | None of those identifiers appears in BusDataRepository (the `isInitialized` matches are in FavoritesRecentsRepository, which is unrelated). `BusDataRepository.ts` does not import the logger. `load()` is the only fetch path. |
| 11 | D-01: endpoints that don't read route/stop data stay available before the first load (nearby predictions, `/vehicles` without a route filter) | ✓ VERIFIED | `NearbyPredictionService` has no repository dependency. `upstreamTimeout.test.ts` runs on the never-loaded singleton and gets 502 (not 503) for `/predictions/nearby` and `/vehicles`. `VehicleService` reads the repository only when `options.route` is set. |
| 12 | D-18: boot order is process handlers, then SQLite (fatal), then listen, then the loader and alert poll start; DASH never gates listen or exits | ✓ VERIFIED | `app.ts` lines 10 and 39-46 match. A real-process run with `DB_PATH=/dev/null/smoke/db.sqlite` exited 1 with "Failed to initialize the favorites/recents database: …", with no "Server is running" line and no load attempt. |

**Score:** 11/12 truths verified (0 present but behavior-unverified)

### Prohibitions (must-NOT)

| Plan | Prohibition | Tier | Status | Evidence |
|------|-------------|------|--------|----------|
| 13-01 | MUST NOT answer a route/stop-dependent request with 200 and an empty or partial body before the first load | test | ✓ VERIFIED | Enforcement is wired: `dataNotReady.test.ts` checks 8 endpoints for 503 and also checks that POST /favorites does not touch SQLite. Edge case IN-01: `GET /favorites` and `GET /recents` for a device with no rows return `200 []` before load. That answer is truthful, because nothing needs hydrating. |
| 13-03 | MUST NOT replace the last good data with a partial, empty or malformed upstream response | test | ✗ FAILED | Empty and unparseable responses are rejected, and tests cover them. Malformed responses with absent or null fields are committed (repro above). The test enforcement exists, but it does not cover the failing input class. |
| 13-05 | MUST NOT let a failed load or refresh pass silently | test | ✓ VERIFIED as worded, but undermined by truth 6 | Every attempt that `load()` rejects produces exactly one warn plus `lastFailedAt`/`lastError` (fake-timer tests). However, a malformed refresh that `load()` *accepts* is logged as a success. Same root cause as the gap. |

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Readiness signal for a listening instance that cannot yet serve data (review WR-03); `getLoadState()` has no production consumer yet | Phase 14 | Phase 14 SC2 (readiness 503 before the first load, reports data age or never loaded). 13-CONTEXT excludes readiness endpoints from this phase. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/server/api/errors/index.ts` | `DataNotReadyError` | ✓ VERIFIED | Exported beside `NotFoundError`/`UpstreamApiError`; thrown by `assertLoaded()` |
| `src/server/api/controllers/errorResponse.ts` | `sendErrorResponse`, `RETRY_AFTER_SECONDS = 5` | ✓ VERIFIED | Imported by all 8 controllers |
| `src/server/api/repositories/BusDataRepository.ts` | atomic `load()`, `getLoadState()`, `DataNotReadyError` guard | ✓ VERIFIED (validation gap, see truth 6) | Every getter calls `assertLoaded()`; `applyData` is the single commit point |
| `src/server/api/services/BusDataRefreshService.ts` | chained loader with `start`/`stop` | ✓ VERIFIED | DI repository with no `getInstance()`; wired in `app.ts` |
| `src/server/api/services/ServiceAlertPollService.ts` | `stop()` | ✓ VERIFIED | `clearInterval`; called in shutdown |
| `src/server/app.ts` | D-18 boot and shutdown | ✓ VERIFIED | The 13-03 artifact pattern `repository.load()` is intentionally superseded by 13-05, where the loader owns `load()` |
| `dataNotReady.test.ts`, `dataReload.test.ts`, `dataBootRetry.test.ts`, `BusDataRefreshService.test.ts`, `errorResponse.test.ts` | E2E and unit coverage | ✓ VERIFIED | All pass in the single full-suite run |

`gsd-tools verify.artifacts`: 13-01 5/5, 13-02 4/4, 13-03 3/4 (the `app.ts` `repository.load()` pattern is superseded by 13-05), 13-04 5/5, 13-05 5/5.

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `BusDataRepository.ts` | `errors/index.ts` | `throw new DataNotReadyError(` while `lastLoadedAt === undefined` | ✓ WIRED |
| 8 controllers | `errorResponse.ts` | `sendErrorResponse(res, error)` in every catch | ✓ WIRED |
| `errorResponse.ts` | `errors/index.ts` | `instanceof DataNotReadyError` leads to 503 + Retry-After | ✓ WIRED |
| `FavoritesService`/`RecentsService` | `BusDataRepository` | `resolveEntity` calls `getRouteById`/`getStopById` with no catch, so not-ready propagates | ✓ WIRED |
| `app.ts` | `BusDataRefreshService.ts` | `createBusDataRefreshService(BusDataRepository.getInstance())`, started after listen and stopped in shutdown | ✓ WIRED |
| `BusDataRefreshService.ts` | `BusDataRepository.ts` | `await repository.load()` | ✓ WIRED |
| `app.ts` | `ServiceAlertPollService.ts` | `serviceAlertPollService.stop()` | ✓ WIRED |
| `app.ts` | `BusDataRepository.ts` (13-03 link, `repository.load()`) | Superseded by 13-05 | ℹ️ Superseded, not a gap |
| `BusDataRepository.getLoadState()` | readiness endpoint | none yet | ⏭ Deferred to Phase 14 |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| `/routes/all` and the other data endpoints | `routes`/`stops` maps | `axios.get('/info/{agency}/routes?verbose=true')` → `fetchAndProcessData` → `applyData` | Yes (real-process recovery smoke against a fake DASH returned the served route) | ✓ FLOWING |
| `getLoadState()` | `lastLoadedAt`/`lastFailedAt`/`lastError` | Set in `applyData` / the `load()` catch | Yes | ✓ FLOWING (no production reader yet; deferred to Phase 14) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite (run once), typecheck, lint | `bun run test`, `tsc --noEmit`, `bun run lint` | 43 files, 630 tests passed, no type errors; lint has 0 errors and 34 warnings (the warnings in phase-touched files are pre-existing misplaced `biome-ignore` lines in `BusRouteController.test.ts`) | ✓ PASS |
| SC1/SC5, real process, SIGTERM | `tsx src/server/app.ts` with DASH refused, curl, then `kill -TERM` | `routes_all=503`, `Retry-After: 5`, 3 growing warn attempts, "gracefully shutting down", exit 0, 0 key leaks | ✓ PASS |
| SC5, real process, SIGINT | same, with `kill -INT` | 503, growing delays, exit 0, 0 key leaks | ✓ PASS |
| SC2, real process recovery | Fake DASH started on the configured port after boot | before: 503; then "loaded on attempt 3: 1 routes, 1 stops"; after: `/routes/all` returns the route and `/routes/1A/stops` returns 200; SIGTERM exit 0 | ✓ PASS |
| D-18, SQLite fatal | `DB_PATH=/dev/null/smoke/db.sqlite tsx src/server/app.ts` | exit 1, database-failure error line, no listen, no load attempt | ✓ PASS |
| WR-02 repro | `tsx` script: `BusDataRepository.load()` against a fake DASH with stops missing or null `code`/`lat`/`lon` | `load resolved: {"routeCount":1,"stopCount":2}`, stops committed with no coordinates | ✗ FAIL (gap) |

### Probe Execution

Step 7c: no probes are declared in the PLANs or SUMMARYs, and there is no `scripts/*/tests/probe-*.sh` in the repo. SKIPPED.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| BOOT-01 | 13-05 | Server starts listening even when DASH is unreachable at boot | ✓ SATISFIED | Truths 1 and 12; real-process smoke |
| BOOT-02 | 13-05 | Initial load retries with backoff in the background until it succeeds | ✓ SATISFIED | Truth 8; `dataBootRetry.test.ts`; recovery smoke |
| BOOT-03 | 13-01, 13-02, 13-04 | Data-dependent endpoints return 503 (not 500) until the first load | ✓ SATISFIED | Truths 2 and 7; `dataNotReady.test.ts` |
| DATA-01 | 13-03, 13-05 | Route/stop data refreshed on a background interval for the process lifetime | ✓ SATISFIED | Truth 3. `refreshData()`, named in the requirement text, was replaced by `load()` per D-19, which is the intended change. |
| DATA-02 | 13-03, 13-05 | A failed refresh is logged and the last good data keeps serving | ✓ SATISFIED as worded | Truth 4. The goal-level gap (truth 6) is about malformed data that `load()` does not count as a failure. |
| DATA-03 | 13-03 | Repository records when data was last successfully loaded | ✓ SATISFIED | Truth 5; `getLoadState()` |

Orphaned requirements: none. REQUIREMENTS.md maps exactly BOOT-01..03 and DATA-01..03 to Phase 13, and each one is claimed by at least one plan.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/server/api/repositories/BusDataRepository.ts` | 191-202 | `Number.isNaN` validation fails open for `undefined`/`null` (WR-02) | 🛑 Blocker | Malformed refresh replaces the last good copy silently (gap) |
| `src/server/api/services/PredictionStreamService.ts` | 32-46 | Poll loop treats `NotFoundError` as transient (WR-01) | ⚠️ Warning | After a refresh drops a stop, its SSE subscribers stay connected but never get another frame, and an error line is logged every 30 s per stranded stop until the clients leave. This is a new consequence of SC3, not a violation of any SC or requirement; see the review assessment. |
| `src/server/api/services/BusDataRefreshService.ts` | 58-65 | Permanent failure (for example a 401 from a bad key) is logged only at warn, forever (WR-04) | ⚠️ Warning | Operators alerting on error level get no signal. Phase 14 readiness will expose `lastError`, which partly mitigates this. |
| `src/server/api/services/ServiceAlertPollService.ts` | 31-36 | `start()` is not idempotent (IN-02) | ℹ️ Info | `app.ts` calls it once, so there is no current impact |
| `.claude/CLAUDE.md` | Architecture | Still describes "init repository, then start Express", read-only maps and no 503 (IN-05) | ℹ️ Info | Stale contributor and agent guidance; update after gap closure |
| `package.json` `start-server` | n/a | The executor found that `bunx tsx` does not forward SIGTERM under Bun 1.0.31. The ts-node `start-server` signal path was not exercised by anyone, me included. | ℹ️ Info | Deployment note, outside the phase's code contract |

No TBD, FIXME, XXX, TODO or HACK markers appear in the 33 files the phase changed.

### Assessment of Review Warnings (13-REVIEW.md)

- **WR-01 (stranded SSE streams after a refresh drops a stop): follow-up, not goal-defeating.** I confirmed it in the code. The goal clauses "keeps route/stop data current" and "never loses last good copy" both still hold, and no SC or requirement covers live-stream behavior across a dataset change. Riders on a stop that DASH removed get a frozen stream, not wrong data. The same frozen-stream behavior already happens when DASH fails mid-poll. It is still a new failure mode, and the log noise is created by the system itself. Fix it in the gap-closure plan or a follow-up: treat `NotFoundError` as terminal in `poll()` and add a test that reloads a dataset without a subscribed stop.
- **WR-02 (missing/null fields pass `createStop`): defeats the goal clause and the phase's own prohibition, so it is the one blocker.** The code predates the phase, but Phase 13 is what turns it into a way to lose the last good copy, because a one-time boot load became an hourly silent replacement. It also contradicts the user's explicit wish that malformed-upstream refreshes be visible. The fix is small and local.
- **WR-03 (no readiness signal): deferred to Phase 14.** This is a real operational gap if Phase 13 ships on its own, but readiness is Phase 14's explicit scope (HLTH-02), and DATA-03 only requires that the state be *recorded*, which it is. If Phases 13 and 14 might ship separately, add a deploy note saying not to health-check `/` or the TCP port.
- **WR-04 (permanent failures only at warn): follow-up.** D-08 chose warn deliberately, and Phase 14 readiness will surface `lastError`. Escalating after N consecutive failures or on a 401/403 is a reasonable hardening step, but no requirement asks for it.

### Human Verification Required

None. Every behavior-dependent truth (state transitions, cancellation on stop/shutdown, no-overlap ordering, atomic swap) is exercised by a passing named test or by a real-process run I performed.

### Gaps Summary

The lifecycle mechanics work. Under real-process conditions I confirmed that the server boots and listens with DASH down, returns 503 with `Retry-After`, retries with growing capped delays, recovers to 200 with no restart, refreshes hourly, keeps the last good data through zero-route, upstream-error and unparseable-stop failures, records load state, and shuts down cleanly with exit 0. All six requirement IDs are satisfied as worded.

One goal-level gap remains. **The guarantee "without ever losing its last good copy" only holds for failures that `load()` detects, and its stop validation does not detect absent or null fields.** A DASH payload with stops missing `code`, `lat` or `lon`, or with them set to null, or with routes missing an `id`, is committed as a successful refresh. It replaces the good dataset, clears `lastError` and logs at info. That breaks D-12 and plan 13-03's must-NOT, and it is the silent malformed-data refresh the user specifically asked to make visible. The fix belongs in one place (`BusDataRepository.createStop`/`createRoute`/`createDirection`, ideally a Zod schema for the routes payload) plus tests for that input class. WR-01 is a sensible addition to the same gap-closure plan, since both come from the new hourly refresh.

---

_Verified: 2026-10-01T14:41:50Z_
_Verifier: Claude (gsd-verifier)_
