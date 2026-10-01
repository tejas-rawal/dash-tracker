---
phase: 13-resilient-route-stop-data-lifecycle
verified: 2026-10-01T19:08:37Z
status: passed
score: 19/19 must-haves verified
covered_files:
  - .claude/CLAUDE.md
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
  - .planning/phases/13-resilient-route-stop-data-lifecycle/13-06-PLAN.md
  - .planning/phases/13-resilient-route-stop-data-lifecycle/13-06-SUMMARY.md
  - .planning/phases/13-resilient-route-stop-data-lifecycle/13-07-PLAN.md
  - .planning/phases/13-resilient-route-stop-data-lifecycle/13-07-SUMMARY.md
  - AGENTS.md
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
  - src/server/api/services/PredictionStreamService.ts
  - src/server/api/services/ServiceAlertPollService.ts
  - src/server/app.ts
covered_digest: "v1:sha256:69afa032f55a5ef91f2092be8f6681179b330b1151b6b176724ee865fbad320a"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 11/12
  gaps_closed:
    - "The server never loses its last good route/stop copy to a malformed upstream dataset: one malformed stop (bad code/coords) fails the whole attempt and changes nothing riders see (gap truth 6, review WR-02)"
    - "Live prediction streams on a stop that a reload drops are ended instead of stranded (prior review WR-01, folded into gap closure as plan 13-07)"
  gaps_remaining: []
  regressions: []
deferred:
  - truth: "A host or orchestrator can tell that a listening instance cannot yet serve route/stop data (review WR-03: getLoadState() has no production consumer; GET / answers 200 while every data endpoint answers 503)"
    addressed_in: "Phase 14"
    evidence: "Phase 14 SC2: 'The readiness endpoint ... returns 503 before the first load and when refreshes have failed long enough for the data to go stale, and it reports the data age (or that data was never loaded)'"
---

# Phase 13: Resilient Route/Stop Data Lifecycle Verification Report

**Phase goal:** The server comes up and serves what it can even when DASH is down at boot, becomes fully usable on its own once DASH is reachable, and keeps route/stop data current for as long as it runs without ever losing its last good copy.
**Verified:** 2026-10-01T19:08:37Z
**Status:** passed
**Re-verification:** Yes. This pass follows gap-closure plans 13-06 (malformed-field validation) and 13-07 (stream teardown when a reload drops a stop).

## Goal Achievement

### Observable Truths

Truths 1 to 12 are the previous pass's must-haves, reused as written. Truth 6 was the open gap. Truths 13 to 19 are the must-haves added by plans 13-06 and 13-07.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: started with DASH unreachable, the server accepts HTTP connections right away and retries the initial load with increasing delays | ✓ VERIFIED (regression check) | `app.ts` has not changed since the prior pass. I re-ran the real process (`tsx src/server/app.ts`, DASH at 127.0.0.1:1). It logged "Server is running on port 3917", `GET /` returned 200, and the warn lines for attempts 1 to 3 showed next delays of 778, 1976 and 3023 ms. The key appeared 0 times in the log. |
| 2 | SC2: data-dependent endpoints return 503 until the first load, then 200 without a restart | ✓ VERIFIED (regression check) | In the same run, `/routes/all` returned 503 with `Retry-After: 5` and body "Route and stop data is still loading". `dataNotReady.test.ts` (8 tests) and `dataBootRetry.test.ts` both pass. |
| 3 | SC3: route/stop data is re-fetched hourly in the background for the life of the process | ✓ VERIFIED (regression check) | `BusDataRefreshService.ts` has not changed. `BusDataRefreshService.test.ts` (25 tests) passes. In `dataReload.test.ts` step 5, a new route set and a new order appear. |
| 4 | SC4: a failed refresh is logged and every endpoint keeps serving the last good data, with no partial swap | ✓ VERIFIED | The qualifier from the prior pass ("for detected failures") is gone. Malformed data is now detected, see truth 6. In `dataReload.test.ts`, the empty, 503 and malformed refreshes each keep `/routes/all` deep-equal to the good body. |
| 5 | SC5: the repository records the last successful load time, and timers stop cleanly on SIGTERM/SIGINT | ✓ VERIFIED | In the real-process run, SIGTERM logged "gracefully shutting down" and exited 0. The `getLoadState` unit tests and the malformed-row assertions `getLoadState() == {lastLoadedAt: T1, lastFailedAt: T2, lastError: message}` pass. |
| 6 | **Previous gap.** A malformed upstream dataset never replaces the last good copy: one malformed stop fails the whole attempt | ✓ VERIFIED (gap closed) | `parseDashNumber` turns any non-number, non-string value into NaN, and `Number.isFinite` gates code, lat and lon (`BusDataRepository.ts:33-41, 220-231`). `requireId` gates the route, direction and stop ids (`:45-50, 150, 173, 175`). I re-ran the prior pass's repro through the real `load()` and a fake DASH. A stop with missing code/lat/lon was REJECTED ("Invalid stop code for stop 's1': 'undefined'") with keptPrevious=true. A stop with null fields was REJECTED ('null') with keptPrevious=true. A route with no id was REJECTED ("Invalid route id: 'undefined'") with keptPrevious=true. |
| 7 | D-01/D-02: one shared error mapping in all 8 controllers, and no 500 echoes the message | ✓ VERIFIED (regression check) | `errorResponse.ts` and 7 of the controllers are unchanged. The only change in `PredictionStreamController.ts` is the `subscribe` call. Its catch still routes through `sendErrorResponse` (line 60). |
| 8 | D-05 to D-10: capped jittered backoff, chained `setTimeout`, no overlap, retry forever, one line per attempt | ✓ VERIFIED (regression check) | The loader has not changed and its suite passes. The smoke run showed delays growing across attempts. |
| 9 | D-14: `lastError` and log lines never contain DASH_API_KEY | ✓ VERIFIED | `load()` still stores only the message. Both `dataReload` and `dataReloadStream` assert the key is absent. The smoke run had 0 key leaks. |
| 10 | D-19: one load path, with the legacy identifiers and the repository logger gone | ✓ VERIFIED | `BusDataRepository.ts` does not import a logger. `load()` is still the only fetch path. |
| 11 | D-01: endpoints that do not read route/stop data stay available before the first load | ✓ VERIFIED (regression check) | `upstreamTimeout.test.ts` (7 tests) passes on the never-loaded singleton. |
| 12 | D-18: boot order is handlers, then SQLite (fatal), then listen, then loaders | ✓ VERIFIED (regression check) | `app.ts` has not changed since the prior pass, which ran the real process with a bad DB_PATH and got exit 1. |
| 13 | 13-06: exact rejection messages; `load()` rejects with the message, and `lastError` equals it | ✓ VERIFIED | The 14 `malformedRows` cases assert both `rejects.toThrow(message)` and `getLoadState().lastError === message`. The E2E asserts "Invalid stop code for stop 'stop-3': 'null'". |
| 14 | 13-06: absent, null, empty, boolean or 'Infinity' code/lat/lon and bad ids reject. Null entries and non-list `directions`/`stops` fail closed | ✓ VERIFIED | The `malformedRows` and `structuralRows` (4 cases) tests pass. Each one confirms the T1 routes and stops are kept. |
| 15 | 13-06: zero is a value. Numeric 0 or string "0" loads as 0 | ✓ VERIFIED | The tests "loads numeric zero code and coordinates as 0" and "loads string zero ... as numeric 0" pass. |
| 16 | 13-06: the rejection names the first malformed item in DASH order (route id, then direction id, then stop id, code, coordinates) | ✓ VERIFIED | Three ordering tests pass, and the code checks ids before descending (`:150, :173, :175`). |
| 17 | 13-06: tolerance. Every payload shape that loaded before and is not named above still loads (null shortName/longName/name becomes '', null headSigns/stops/directions becomes []) | ✓ VERIFIED | Six tolerance tests pass. My repro confirms the review's new warning cases still load, which is what this truth requires (see the warnings assessment). |
| 18 | 13-06: a malformed refresh gets a loader warn line, never an info "refreshed" line. The docs match the code | ✓ VERIFIED | Because `load()` now rejects, the 13-05 loader's tested one-warn-per-rejected-attempt contract applies. The repository still has no logger call, asserted by the malformed rows. On disk, both `.claude/CLAUDE.md:70-73` and `AGENTS.md:47-50` describe the listen-first boot, the atomic `load()`, `BusDataRefreshService`, the 503 with `Retry-After`, and the generic 500. |
| 19 | 13-07: a reload that drops a stop ends its SSE streams on the next tick. There is one warn and no error, no DASH call for that stop, and a reconnect gets 404. Other stops keep streaming, transient failures keep the stream open, and teardown and concurrency are safe | ✓ VERIFIED | `poll()` treats `NotFoundError` as terminal and calls `endLoop` (`PredictionStreamService.ts:30-54, 77-80`). The identity guard in `endLoop` stops a stale tick, the loop is deleted before any `onEnd` runs, and each `onEnd` is isolated. The controller passes `onEnd: cleanup` (`:54`). Every invariant has a named test that passed: 7 tests under "when a reload removes the stop", including the stale tick, leave-while-in-flight, the isolated throwing `onEnd`, re-subscribe with no zombie loop, and selectivity; the transient-timeout test; 2 controller tests that use the real service; and the E2E `dataReloadStream.test.ts`, which covers end-of-stream, a single frame, a single DASH call, one warn and a reconnect 404. |

**Score:** 19/19 truths verified (0 present but behavior-unverified)

### Prohibitions (must-NOT)

All prohibitions are test-tier. Each has wired test enforcement that ran green.

| Plan | Prohibition | Status | Evidence |
|------|-------------|--------|----------|
| 13-01 | MUST NOT answer a route/stop request with 200 and an empty or partial body before the first load | ✓ VERIFIED | `dataNotReady.test.ts`; smoke run returned 503 |
| 13-03 / 13-06 | MUST NOT replace the last good data with a partial, empty or malformed response | ✓ VERIFIED (previously FAILED) | Malformed and structural matrix tests, the E2E step 4, and my repro (all rejected with keptPrevious=true) |
| 13-05 / 13-06 | MUST NOT let a failed or malformed refresh pass silently | ✓ VERIFIED | Malformed payloads now reject and so take the tested loader warn path. Nothing logs "refreshed" for them. |
| 13-06 | MUST NOT reject for a field the server does not validate, or for a legitimate value such as 0 | ✓ VERIFIED | Zero-value and tolerance tests pass |
| 13-07 | MUST NOT end a stream because of a transient failure | ✓ VERIFIED | "keeps the stream open when a poll tick times out upstream..." and "logs and keeps the interval running when a poll tick's fetch rejects..." both pass. Upstream errors arrive as `UpstreamApiError`, never `NotFoundError`. |

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Readiness signal for a listening instance that has no data yet (WR-03); `getLoadState()` has no production reader | Phase 14 | Phase 14 SC2: readiness returns 503 before the first load and reports the data age or that data was never loaded |

### Advisory (New Scope, Unevidenced)

None. The two new review warnings are assessed below. I reproduced both, so they are evidenced. I judged them not goal-defeating and recorded them as ⚠️ Warnings, not Blockers.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/server/api/repositories/BusDataRepository.ts` | Finite and id validation inside the single load path | ✓ VERIFIED | Contains `requireId` and `parseDashNumber`; `applyData` is still the single commit point |
| `src/server/api/repositories/BusDataRepository.test.ts` | Malformed, structural, zero, ordering and tolerance tests | ✓ VERIFIED | 82 tests pass |
| `src/server/api/routes/dataReload.test.ts` | Real-app E2E malformed-refresh step | ✓ VERIFIED | Step 4 contains "Invalid stop code for stop 'stop-3'" |
| `.claude/CLAUDE.md`, `AGENTS.md` | Phase 13 lifecycle in Architecture | ✓ VERIFIED | Both mention `BusDataRefreshService` and have matching bullets |
| `src/server/api/services/PredictionStreamService.ts` | `StreamSubscriber`, terminal-NotFound teardown | ✓ VERIFIED | Exports `StreamSubscriber`; contains `endLoop` |
| `src/server/api/controllers/PredictionStreamController.ts` | `onEnd: cleanup` | ✓ VERIFIED | Line 54 |
| `src/server/api/routes/dataReloadStream.test.ts` | Real-app stream E2E | ✓ VERIFIED | Passes |
| `src/server/api/services/PredictionStreamService.test.ts` | Teardown and concurrency tests | ✓ VERIFIED | 18 tests pass |
| Artifacts from plans 13-01 to 13-05 | (prior pass) | ✓ VERIFIED (regression check) | None of these files changed after d32b18a except the controller line above |

`gsd-tools verify.artifacts`: 13-06 5/5, 13-07 4/4. `verify.key-links`: 13-06 3/3, 13-07 3/3.

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `BusDataRepository.fetchAndProcessData` | `applyData` | `requireId(` and finite checks run before the staging maps are returned | ✓ WIRED |
| `dataReload.test.ts` | `BusDataRepository.ts` | Real bounded client sends a malformed payload; the last good body is still served | ✓ WIRED |
| `BusDataRefreshService.ts` | `BusDataRepository.ts` | `await repository.load()`, whose rejection triggers the warn | ✓ WIRED |
| `PredictionStreamService.ts` | `PredictionService.ts` | `error instanceof NotFoundError` from `getValidatedStop` | ✓ WIRED |
| `PredictionStreamController.ts` | `PredictionStreamService.ts` | `subscribe(stop, { onUpdate: send, onEnd: cleanup })` | ✓ WIRED |
| `dataReloadStream.test.ts` | `BusDataRepository.ts` | `repository.load()` drops the subscribed stop | ✓ WIRED |
| Links from the prior pass (8 controllers to `errorResponse`, `app.ts` to the loader and alert poll, `DataNotReadyError` guard) | — | — | ✓ WIRED (files unchanged) |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| `/routes/all` and other data endpoints | route and stop maps | `axios.get('/info/{agency}/routes?verbose=true')`, then validation, then `applyData` | Yes: E2E against a fake DASH, and my repro | ✓ FLOWING |
| `/predictions/stream` | per-stop loop, `lastData` | `PredictionService.getPredictionsForStop`, which calls DASH predictions | Yes: E2E counts the fake-DASH prediction calls | ✓ FLOWING |
| `getLoadState()` | `lastLoadedAt`, `lastFailedAt`, `lastError` | `applyData` / the `load()` catch | Yes | ✓ FLOWING (reader is deferred to Phase 14) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite (run once), typecheck, lint | `bun run test`, `tsc --noEmit`, `bun run lint` | 44 files, 670 tests pass, no type errors; lint 0 errors, 34 warnings (same as the prior pass) | ✓ PASS |
| SC1/SC2/SC5, real process | `tsx src/server/app.ts` with DASH refused, curl, then SIGTERM | `/` 200; `/routes/all` 503 with `Retry-After: 5`; 3 attempts with growing delays; graceful shutdown, exit 0; 0 key leaks | ✓ PASS |
| Prior gap repro (WR-02 input class) | `tsx` scratch script: real `load()` against a fake DASH | Missing, null and no-id payloads REJECTED with keptPrevious=true; lastError holds the message | ✓ PASS (gap closed) |
| New review WR-01/WR-02 inputs | same script | `code "12abc"` committed as 12; `"101.7"` committed as 101; `lat 999, lon -500` committed; `shortName 42` committed as a number key, so `getRouteByShortName("42")` is undefined; a stop with no name committed with no `name` | ⚠️ Reproduced, judged a Warning (below) |

### Probe Execution

Step 7c: no probes are declared in any PLAN or SUMMARY, and the repo has no `scripts/*/tests/probe-*.sh`. SKIPPED.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| BOOT-01 | 13-05 | Server listens even when DASH is unreachable at boot | ✓ SATISFIED | Truths 1 and 12; smoke run |
| BOOT-02 | 13-05 | Initial load retries with backoff until it succeeds | ✓ SATISFIED | Truth 8; `dataBootRetry.test.ts`; smoke run |
| BOOT-03 | 13-01, 13-02, 13-04 | Data-dependent endpoints return 503 (not 500) until the first load | ✓ SATISFIED | Truths 2 and 7; `dataNotReady.test.ts` |
| DATA-01 | 13-03, 13-05, 13-07 | Route/stop data refreshed in the background for the process lifetime | ✓ SATISFIED | Truths 3 and 19 |
| DATA-02 | 13-03, 13-05, 13-06 | A failed refresh is logged and the last good data keeps serving | ✓ SATISFIED | Truths 4, 6 and 14; the malformed input class now counts as a failure |
| DATA-03 | 13-03, 13-06 | Repository records the last successful load | ✓ SATISFIED | Truths 5 and 13 |

Orphaned requirements: none. REQUIREMENTS.md maps exactly these six IDs to Phase 13, and each is claimed by at least one plan.

Bookkeeping note: REQUIREMENTS.md currently shows DATA-01..03 as `[x]`/Complete, but BOOT-01..03 still show `[ ]`/"Gaps Found" (left over from `45a0d7b`). With this pass, the orchestrator should mark all six Complete.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/server/api/repositories/BusDataRepository.ts` | 33-41, 220-231 | `parseInt`/`parseFloat` prefix-parse numeric strings; no integer or range check (new review WR-01) | ⚠️ Warning | Partial or out-of-range values such as `"12abc"`, `"101.7"` or `lat 999` commit as stop data. This behaviour predates the phase; see the assessment below. |
| `src/server/api/repositories/BusDataRepository.ts` | 7-29, 154-156, 203-209, 233 | String fields (`shortName`, `name`, `title`, `type`) are not narrowed from upstream (new review WR-02) | ⚠️ Warning | A numeric `shortName` is listed but cannot be looked up, and a missing stop `name` drops the field from responses. This also predates the phase. |
| `src/server/api/services/BusDataRefreshService.ts` | 58-65 | A permanent failure is logged only at warn (prior WR-04) | ⚠️ Warning | Unchanged. Phase 14 readiness will expose `lastError`. |
| `src/server/api/repositories/BusDataRepository.ts` | 148-151, 172-174 | Structural failures surface the engine's TypeError text in `lastError` (review IN-01) | ℹ️ Info | They fail closed correctly; only the message is unhelpful for operators |
| `src/server/api/routes/dataReloadStream.test.ts` | 147-153 | Watchdog timer is never cleared, and its rejection can go unhandled (review IN-03) | ℹ️ Info | Noisy output only when the test fails |
| `.claude/CLAUDE.md`, `AGENTS.md` | 37 / Endpoints | Lists Vitest 2.1.5 (package.json pins 3.2.6); endpoint list incomplete; stream teardown not mentioned (review IN-04) | ℹ️ Info | Stale guidance outside the 13-06 docs must-have, which is met |

The 10 files changed in gap closure contain no TBD, FIXME, XXX, TODO or HACK markers.

### Assessment of the New Review Warnings (13-REVIEW.md, commit 892dc21)

Both warnings are flagged in a file modified since the prior pass, so the evidence gate cannot downgrade them by default. I reproduced both, so they are evidenced. I judged each on its merits against the phase goal and must-haves. **Neither is a blocker.** Both are ⚠️ Warnings and should go to the backlog or a quick task.

**New WR-01 (lenient `parseInt`/`parseFloat`, no integer or range check): Warning, not a Blocker.**
- **It predates the phase.** The pre-phase `createStop` (`8f82cb6~1:BusDataRepository.ts:198-205`) used the same `parseInt`/`parseFloat` calls. 13-06 only added rejection of non-number and non-string values, so these inputs behave exactly as before.
- **It is outside the gap contract.** The prior gap's `missing:` list and the 13-06 must-have scoped the fix to "absent, null or not finite". That contract is met in full.
- **The goal still holds.** These inputs are well-shaped fields carrying implausible values, not a structurally broken dataset. A refresh with them still commits a complete route and stop set, so riders never lose service. The worst case is one wrong stop code, or one stop missing from nearby results.
- **Fixing it is safe.** Whole-string `Number()`, `Number.isInteger(code)` and coordinate range checks would reject only values that are never legitimate. Under the third 13-06 prohibition, rejection is only unsafe for legitimate values. The fix is cheap and worth doing, but the phase goal does not depend on it.

**New WR-02 (unchecked string fields): Warning, not a Blocker.**
- **It predates the phase.** `shortName || ""` and `name: stopData.name` are unchanged from before Phase 13.
- **A must-have requires these shapes to load.** 13-06's tolerance truth (truth 17) says "every payload shape that loads today and is not named above still loads". Rejecting a missing stop name or a numeric `shortName` would break that truth and risk the permanent 503 that the third 13-06 prohibition forbids.
- **The right fix is normalization, not rejection.** Use `String(shortName)` and `name ?? ""`, and check `type` against `RouteType` with a fallback.
- **Impact is degraded lookups and display, not loss of data.** A plausible failure is DASH switching `shortName` to numbers: `/routes/:shortName` would then return 404 while `/routes/all` still works. That is a real robustness gap, but it does not break any success criterion or requirement.

### Human Verification Required

None. Every behavior-dependent truth has passing named-test evidence or a real-process run that I performed: the atomic swap, keep-on-reject, the loader's backoff and cancellation, and stream teardown including the stale-tick and in-flight races.

### Gaps Summary

**Both prior issues are closed.**
- **Gap truth 6:** `load()` now rejects absent, null, non-finite and wrong-typed code/lat/lon and ids. I confirmed this with the prior pass's own repro against the real load path: each payload was rejected, `lastError` was recorded and the previous dataset kept serving. The E2E holds `/routes/all` deep-equal to the good body across a malformed refresh.
- **Prior review WR-01:** streams on a dropped stop now end once, with one warn and no DASH calls, and reconnects get 404.

No regressions. The files behind the 12 earlier truths are unchanged except for one controller line. The full suite (670 tests), tsc and lint are clean, and the real-process smoke run matches the prior pass.

The goal is achieved: the server listens and serves what it can with DASH down, recovers to 200 on its own, refreshes hourly, and keeps its last good copy through empty, errored and malformed refreshes.

**Open follow-ups.** The two new review warnings are pre-existing parsing leniencies, outside the agreed gap scope, and the stricter half of WR-02 conflicts with a tolerance must-have. Recommended follow-up: whole-string numeric parsing with integer and range checks, plus normalized string fields. Readiness (WR-03) is deferred to Phase 14.

---

_Verified: 2026-10-01T19:08:37Z_
_Verifier: Claude (gsd-verifier)_
