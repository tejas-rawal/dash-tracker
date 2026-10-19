---
phase: 13-resilient-route-stop-data-lifecycle
plan: 03
subsystem: api
tags: [repository, atomic-swap, load-state, vitest, supertest, e2e]

# Dependency graph
requires:
  - phase: 13-01
    provides: DataNotReadyError thrown by the repository's not-loaded guard
  - phase: 12-bounded-upstream-calls-error-safety-nets
    provides: bounded shared axios client with message-only UpstreamApiError and timeout messages
provides:
  - BusDataRepository.load(): Promise<BusDataLoadSummary>, the single atomic load path
  - BusDataRepository.getLoadState(): BusDataLoadState snapshot with copied Dates (for Phase 14 readiness)
  - Exported BusDataLoadState / BusDataLoadSummary interfaces via the repositories barrel
  - "DASH API returned no routes" failure for empty/null/missing routes (D-11)
  - Real-app E2E src/server/api/routes/dataReload.test.ts with a fake DASH server
affects: [13-05, 14-health-checks-rate-limiting]

actuals:
  tokens: 12713
  tasks: 2
  commits: 2
plan_head_before: 32a4658f17e0d7e0b31ebcbb58b8db1951845cba

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One load path: load() fetches, commits through applyData (the only commit point), or records failure and changes nothing"
    - "Readiness derives from lastLoadedAt; no separate initialized flag"
    - "Load failures store and rethrow only error.message (new Error(message)), never the axios error object"
    - "Fake-DASH E2E: local http server swapped in via axios.defaults.baseURL, mutable reply driven step by step"

key-files:
  created:
    - src/server/api/routes/dataReload.test.ts
  modified:
    - src/server/api/repositories/BusDataRepository.ts
    - src/server/api/repositories/BusDataRepository.test.ts
    - src/server/app.ts
    - src/server/api/routes/upstreamTimeout.test.ts

key-decisions:
  - "load() wraps fetch + applyData in one try/catch; any failure sets lastFailedAt/lastError and throws new Error(message) with no prefix"
  - "All four repository log calls removed; load() resolves { routeCount, stopCount } so the plan 13-05 loader can log one success line"
  - "getLoadState() always returns all three keys (undefined when unset) so toEqual on the snapshot is exact"

patterns-established:
  - "dataReload.test.ts: drive one shared singleton through a success/failure/success sequence with routesReply()/makeDashRoute()"

requirements-completed: [DATA-01, DATA-02, DATA-03]

coverage:
  - id: D1
    description: "A failed reload (zero routes, 503) keeps GET /api/v1/routes/all answering 200 with a body deep-equal to the last good body; a later reordered success replaces it in DASH order"
    requirement: DATA-02
    verification:
      - kind: e2e
        ref: "src/server/api/routes/dataReload.test.ts#keeps serving the last good routes through failed reloads and records when data last loaded and why the latest attempt failed"
        status: pass
    human_judgment: false
  - id: D2
    description: "getLoadState() records lastLoadedAt on success (clearing failure fields) and lastFailedAt/lastError on failure without touching lastLoadedAt; returned Dates are copies"
    requirement: DATA-03
    verification:
      - kind: unit
        ref: "src/server/api/repositories/BusDataRepository.test.ts#getLoadState (6 cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "lastError and the load() rejection are message-only and never contain the API key"
    verification:
      - kind: unit
        ref: "src/server/api/repositories/BusDataRepository.test.ts#records only the message of an upstream error that carries the API key"
        status: pass
      - kind: e2e
        ref: "src/server/api/routes/upstreamTimeout.test.ts#fails a route/stop load against a blackholed DASH with the timeout message and records it, without leaking the API key"
        status: pass
    human_judgment: false
  - id: D4
    description: "Empty/null/missing routes reject with 'DASH API returned no routes' and apply nothing; one malformed stop fails the whole load and keeps prior data; a single route with a single stop loads"
    requirement: DATA-01
    verification:
      - kind: unit
        ref: "src/server/api/repositories/BusDataRepository.test.ts#load: empty and malformed responses (11 cases)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Routes follow DASH order, shared stops appear once, and in-flight reads see the previous complete dataset or DataNotReadyError, with all three maps switching together"
    requirement: DATA-01
    verification:
      - kind: unit
        ref: "src/server/api/repositories/BusDataRepository.test.ts#load: ordering and in-flight reads (4 cases)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The repository makes no log call on any load (D-08); app.ts boots through repository.load()"
    verification:
      - kind: unit
        ref: "src/server/api/repositories/BusDataRepository.test.ts#makes no log call on a successful or a failed load"
        status: pass
      - kind: e2e
        ref: "src/server/api/routes/dataReload.test.ts#keeps serving the last good routes through failed reloads (step 5)"
        status: pass
    human_judgment: false

# Metrics
duration: 3min
completed: 2026-10-01
status: complete
---

# Phase 13 Plan 03: Single Atomic Route/Stop Load Path Summary

**`BusDataRepository.load()` is now the only way to load route/stop data. It either commits a complete DASH dataset in one synchronous swap or changes nothing, and it records `lastLoadedAt` / `lastFailedAt` / a key-free `lastError` in a copied `getLoadState()` snapshot. A real-app E2E proves `/routes/all` keeps serving the last good data through zero-route and 503 reloads.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-10-01T14:16:31Z
- **Completed:** 2026-10-01T14:19:32Z
- **Tasks:** 2
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments
- `initialize()`, `refreshData()`, `handleLoadError`, the in-flight promise field and the `isInitialized` flag are gone. In their place is `load(): Promise<BusDataLoadSummary>`, which resolves `{ routeCount, stopCount }`.
- `applyData` is still the only commit point. It now also stamps `lastLoadedAt` and clears the failure fields. The not-loaded guard is renamed `assertLoaded()` and keys off `lastLoadedAt === undefined`.
- A DASH response with empty, null or missing routes now fails with `"DASH API returned no routes"`. Before this plan, a refresh would have wiped live data. A single malformed stop still fails the whole attempt.
- The repository no longer imports the logger or makes any log call (D-08).
- `app.ts` boots through `repository.load()`. Boot order is unchanged; plan 13-05 moves the load to the background.
- `upstreamTimeout.test.ts`'s startup-load test now asserts `load()`'s timeout rejection and the recorded `getLoadState()`, with no key leak.
- New `dataReload.test.ts` walks the real bounded client, repository, service and route through four steps against a local fake DASH: success, zero routes, 503, then a reordered success.

## Task Commits

1. **Task 1: single atomic load() with load state, proven E2E** - `d1924bc` (feat)
2. **Task 2: pin load-state, all-or-nothing and in-flight edges** - `bde77c3` (test)

## Files Created/Modified
- `src/server/api/repositories/BusDataRepository.ts` - `load()`, `getLoadState()`, the `BusDataLoadState`/`BusDataLoadSummary` exports, `assertLoaded()`, the D-11 empty check, and no logging
- `src/server/api/repositories/BusDataRepository.test.ts` - rewritten against `load()`; new describes `getLoadState`, `load: failure keeps the last good data`, `load: empty and malformed responses`, `load: ordering and in-flight reads`
- `src/server/app.ts` - boot calls `repository.load()`
- `src/server/api/routes/upstreamTimeout.test.ts` - startup-load test rewritten against `load()` + `getLoadState()`; comment reworded
- `src/server/api/routes/dataReload.test.ts` - new real-app E2E with a fake DASH server

## Decisions Made
- `load()` keeps fetch and `applyData` in one try/catch and rethrows `new Error(message)` with no prefix. The old `"Failed to initialize bus data: Failed to fetch and process data: ..."` double prefix is gone.
- `getLoadState()` always returns all three keys, set to undefined when unset, so a `toEqual` on the snapshot is exact.

## Deviations from Plan

None. The plan was executed as written. One follow-the-precedent adjustment: the `Authorization` key in the Task 2 key-leak fixture got the same `biome-ignore lint/style/useNamingConvention` comment, with its reason, that `processHandlers.test.ts` already uses. This keeps the file at its one pre-existing Biome warning.

## TDD Gate Compliance

Task 2 is `tdd="true"`, but its stated purpose is to pin the behavior Task 1 (the tracer) had already built. So the first run was an unexpected GREEN: all 55 tests passed before any implementation change.

- **Investigation:** I applied four temporary mutations to `BusDataRepository.ts`. They were: return `lastLoadedAt` without copying it, rethrow the original error, skip clearing `lastError` on success, and accept an empty routes array. With those mutations, 6 targeted tests failed:
  - snapshot copy;
  - key-free rejection;
  - T1/T2/T3 transitions;
  - three empty-array cases.
- **Restore:** The source was restored byte-identical before committing.
- **Commits:** The RED-style commit is `test(13-03)` `bde77c3`. There is no Task 2 `feat` commit, because no implementation change was needed. The GREEN implementation lives in Task 1's `feat(13-03)` `d1924bc`, which comes before the test commit.

## Issues Encountered
- I ran one stray, read-only `git stash list` (with output discarded) while collecting metrics. It changed no stash state.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness
- Plan 13-05 can drive `repository.load()` from its interval/backoff loader and log one line per attempt, using `{ routeCount, stopCount }` on success and the rejection message on failure.
- Phase 14 readiness can serialize `getLoadState()` directly. "Ready" means `lastLoadedAt` is defined.
- Flagged assumptions from the plan are still open for the user:
  - Last good data has no staleness cutoff.
  - `lastLoadedAt` is in-memory only and resets on restart.

## Verification
- `bun run test`: 41 files, 595 tests passed, no type errors.
- `bun run test:coverage`: all files at 98.55% statements/lines, 94.76% branches, 98.37% functions (80% threshold).
- `bunx tsc --noEmit -p tsconfig.json`: exit 0.
- `bunx biome check` on all five files: no errors. The only warning is the pre-existing `useFilenamingConvention` warning on `BusDataRepository.test.ts`.
- `bun run lint`: exit 0 (warnings only, all pre-existing).

## Self-Check: PASSED
- FOUND: src/server/api/routes/dataReload.test.ts, src/server/api/repositories/BusDataRepository.ts, src/server/app.ts
- FOUND commits: d1924bc, bde77c3

---
*Phase: 13-resilient-route-stop-data-lifecycle*
*Completed: 2026-10-01*
