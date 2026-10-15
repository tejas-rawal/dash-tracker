---
phase: 13-resilient-route-stop-data-lifecycle
plan: 04
subsystem: api
tags: [express, error-handling, http-503, retry-after, vitest, supertest, favorites, recents]

# Dependency graph
requires:
  - phase: 13-resilient-route-stop-data-lifecycle
    provides: "13-01: DataNotReadyError, sendErrorResponse(res, error), the dataNotReady.test.ts E2E file; 13-02: five controllers already migrated"
provides:
  - FavoritesController, RecentsController and NearbyPredictionController migrated to sendErrorResponse; all 8 controllers now share one error mapping (D-02 complete)
  - POST /api/v1/favorites answers 503 + Retry-After 5 before the first route/stop load (real-app E2E)
  - Pinned DataNotReadyError propagation through favorites/recents hydration (no dropped entries, no SQLite write)
  - Generic, non-echoing 500 on every controller (WR-02/IN-04 closed)
affects: [13-05, 14-health-checks-rate-limiting]

actuals:
  tokens: 5816
  tasks: 3
  commits: 3
plan_head_before: 06e1e95581a74cb7dace54a5cc8e6508d913454e

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Every *Controller.ts hands caught errors to sendErrorResponse(res, error); errorResponse.ts is the only file that tests typed errors with instanceof"
    - "Hydration services (FavoritesService, RecentsService) never catch repository errors, so DataNotReadyError surfaces as 503 instead of a truncated list"

key-files:
  created: []
  modified:
    - src/server/api/controllers/FavoritesController.ts
    - src/server/api/controllers/FavoritesController.test.ts
    - src/server/api/services/FavoritesService.test.ts
    - src/server/api/controllers/RecentsController.ts
    - src/server/api/controllers/RecentsController.test.ts
    - src/server/api/services/RecentsService.test.ts
    - src/server/api/controllers/NearbyPredictionController.ts
    - src/server/api/controllers/NearbyPredictionController.test.ts
    - src/server/api/routes/dataNotReady.test.ts

key-decisions:
  - "13-04: All 8 controllers map errors only through sendErrorResponse; no controller keeps a local mapper (D-02 complete, WR-02/IN-04 closed)"
  - "13-04: Favorites/recents hydration propagates DataNotReadyError as 503 rather than silently dropping entries; no service-side change was needed"

patterns-established:
  - "Controller unit tests' makeMockRes mocks set() (returning res) alongside status() and json() so the 503 path can be asserted"

requirements-completed: [BOOT-03]

coverage:
  - id: D1
    description: "Before the first route/stop load, POST /api/v1/favorites (X-Device-Id device-a, route-1) answers 503 JSON with Retry-After 5 and the loading message through the real app, without an open SQLite database"
    requirement: BOOT-03
    verification:
      - kind: e2e
        ref: "src/server/api/routes/dataNotReady.test.ts#POST /api/v1/favorites answers 503 with Retry-After before the first route/stop load"
        status: pass
    human_judgment: false
  - id: D2
    description: "FavoritesService.addFavorite and listFavorites, and RecentsService.listRecents, reject with DataNotReadyError when the repository throws it; addFavorite never writes"
    requirement: BOOT-03
    verification:
      - kind: unit
        ref: "src/server/api/services/FavoritesService.test.ts#addFavorite rejects with DataNotReadyError and never writes when route/stop data has not loaded"
        status: pass
      - kind: unit
        ref: "src/server/api/services/FavoritesService.test.ts#listFavorites rejects with DataNotReadyError instead of dropping entries when route/stop data has not loaded"
        status: pass
      - kind: unit
        ref: "src/server/api/services/RecentsService.test.ts#listRecents rejects with DataNotReadyError instead of dropping entries when route/stop data has not loaded"
        status: pass
    human_judgment: false
  - id: D3
    description: "FavoritesController and RecentsController answer DataNotReadyError with 503 + Retry-After 5 via the shared helper"
    requirement: BOOT-03
    verification:
      - kind: unit
        ref: "src/server/api/controllers/FavoritesController.test.ts#responds to listFavorites with 503 and Retry-After when route/stop data has not loaded yet"
        status: pass
      - kind: unit
        ref: "src/server/api/controllers/RecentsController.test.ts#responds with 503 and Retry-After when route/stop data has not loaded yet"
        status: pass
    human_judgment: false
  - id: D4
    description: "Favorites, Recents and NearbyPrediction 500s are the generic Request Failed body and never echo the thrown text; nearby keeps its 400/502 behavior and stays 502 (not 503) on a never-loaded repository"
    verification:
      - kind: unit
        ref: "src/server/api/controllers/FavoritesController.test.ts#responds with 500 and a generic Request Failed body that does not echo the thrown message (x3)"
        status: pass
      - kind: unit
        ref: "src/server/api/controllers/RecentsController.test.ts#responds with 500 and a generic Request Failed body that does not echo the thrown message"
        status: pass
      - kind: unit
        ref: "src/server/api/controllers/NearbyPredictionController.test.ts#responds with 500 and a generic Request Failed body that does not echo the thrown message"
        status: pass
      - kind: e2e
        ref: "src/server/api/routes/upstreamTimeout.test.ts#returns 502 for GET /api/v1/predictions/nearby with only the shared client's timeout message, without leaking the API key or the rider's coordinates"
        status: pass
    human_judgment: false
  - id: D5
    description: "Directory gate: all 8 *Controller.ts files call sendErrorResponse(res, error) and none tests NotFoundError/UpstreamApiError/DataNotReadyError with instanceof"
    verification:
      - kind: other
        ref: "grep -L \"sendErrorResponse(res, error)\" src/server/api/controllers/*Controller.ts (empty) and the instanceof count over all controllers (0)"
        status: pass
    human_judgment: false

# Metrics
duration: 2min
completed: 2026-10-01
status: complete
---

# Phase 13 Plan 04: Favorites/Recents Not-Ready 503 and Last Controllers on the Shared Helper Summary

**Favorites, Recents and NearbyPrediction now use `sendErrorResponse`, so all 8 controllers share one error mapping and none echoes thrown text in a 500. `POST /api/v1/favorites` answers 503 with `Retry-After: 5` before the first route/stop load. Favorites and recents hydration propagate `DataNotReadyError` instead of dropping entries.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-10-01T14:21:36Z
- **Completed:** 2026-10-01T14:23:39Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- The three remaining controllers dropped their module-private status/body mappers and call `sendErrorResponse(res, error)` in every catch. D-02 is complete: `errorResponse.ts` is the only file in `src/server/api/controllers/` that checks typed errors with `instanceof`.
- A real-app E2E proves `POST /api/v1/favorites` returns 503 + `Retry-After: 5` with the exact `NOT_READY_BODY` on the never-loaded singleton. `resolveEntity` reads the repository before any SQLite write, so the test needs no database.
- Service tests pin the SC2 "favorites/recents hydration" behavior. `addFavorite` and `listFavorites`/`listRecents` reject with `DataNotReadyError`, never return a truncated list, and `addFavorite` never calls `upsertFavorite`. The services already had no catch, so no production change was needed there.
- Nearby predictions stay ungated. Their 400 bodies, the 502 Bad Gateway mapping and the radius/number caps are unchanged, and `upstreamTimeout.test.ts` still reports 502 for `/predictions/nearby`.

## Task Commits

1. **Task 1: Favorites 503 tracer (controller migration, service propagation tests, POST E2E)**: `e19c2ae` (feat)
2. **Task 2: Recents hydration 503 (controller migration, 503 case, service propagation test)**: `bd54eb7` (feat)
3. **Task 3: NearbyPrediction on the shared helper and the 8-controller directory gate**: `d71825d` (feat)

**Plan metadata:** committed separately as `docs(13-04): complete ...`

## Files Created/Modified
- `src/server/api/controllers/FavoritesController.ts`: three catches call the helper; mappers and the `NotFoundError` import removed; `resolveDeviceId` and 400 bodies unchanged
- `src/server/api/controllers/FavoritesController.test.ts`: `set` added to the mock res; three 500 tests now assert the generic body with no echo; a listFavorites 503 case was added
- `src/server/api/services/FavoritesService.test.ts`: two `DataNotReadyError` propagation cases (write path and hydration path)
- `src/server/api/controllers/RecentsController.ts`: catch calls the helper; mappers and the error import removed
- `src/server/api/controllers/RecentsController.test.ts`: `set` added to the mock res; generic 500 with no echo; 503 + Retry-After case
- `src/server/api/services/RecentsService.test.ts`: `DataNotReadyError` propagation case
- `src/server/api/controllers/NearbyPredictionController.ts`: catch calls the helper; the 502/500 mappers and the `UpstreamApiError` import removed
- `src/server/api/controllers/NearbyPredictionController.test.ts`: both 500 tests (Error and non-Error throw) now expect the generic body with no echo
- `src/server/api/routes/dataNotReady.test.ts`: the `POST /api/v1/favorites` E2E case

## Decisions Made
- No change to `FavoritesService` or `RecentsService`. The new tests passed on first run, which confirms that neither service swallows repository errors.
- The plan's flagged assumption holds: the GET favorites and recents list paths open SQLite before they read route/stop data, so they are proven at the service and controller level rather than through E2E.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The plan's thrown test messages overlapped the generic 500 text, so the no-echo assertions could never pass**
- **Found during:** Tasks 1, 2 and 3
- **Issue:** The plan threw `new Error("unexpected")` in the Favorites/Recents 500 tests and asserted the body does not contain "unexpected". The required generic details, "An unexpected error occurred", contain that word, the same defect 13-01 found. NearbyPrediction's `"x"` likewise appears inside "unexpected", so a no-echo check on it would prove nothing.
- **Fix:** Each test throws a distinctive message that shares no word with the generic text: "favorites store corrupted", "favorites delete crashed", "favorites listing crashed", "recents listing crashed", "nearby merge crashed", and the non-Error value "nearby raw failure". Each test still asserts the exact generic body with `toHaveBeenCalledWith`. The NearbyPrediction tests also gained the no-echo assertion, as the plan's titles imply.
- **Files modified:** FavoritesController.test.ts, RecentsController.test.ts, NearbyPredictionController.test.ts
- **Verification:** All rewritten tests pass. Full suite: 41 files, 601 tests.
- **Committed in:** e19c2ae, bd54eb7, d71825d

---

**Total deviations:** 1 auto-fixed (Rule 1, a test-spec defect repeated across three tasks)
**Impact on plan:** Test data only. Production behavior and scope are unchanged.

## Issues Encountered
- Biome reports only the pre-existing `useFilenamingConvention` warnings on PascalCase test files. There are no errors (`bun run lint` exits 0).
- The 500-path controller tests print one `error:` log line each. This is the helper's intended single log line, not a failure.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- D-02 and WR-02/IN-04 are closed across all 8 controllers. Plan 13-05 (boot order, refresh service wiring, shutdown) can proceed with no controller-side follow-up.
- Phase 14 readiness can rely on the fact that every route/stop-dependent endpoint, including favorites/recents hydration, answers 503 before the first load.

## Verification
- `bun run test:coverage`: 41 files, 601 tests passed, no type errors. All files 98.59% statements, 95.37% branches, 98.29% functions, 98.59% lines.
- `bunx tsc --noEmit -p tsconfig.json`: exit 0. `bunx biome check src/server/api/controllers`: exit 0. `bun run lint`: exit 0.
- Directory gates: `grep -L "sendErrorResponse(res, error)" src/server/api/controllers/*Controller.ts` prints nothing (8 files), and the typed-error `instanceof` count across all controllers is 0.

## Self-Check: PASSED
- FOUND: all 9 modified files listed in key-files
- FOUND commits: e19c2ae, bd54eb7, d71825d (3 commits since plan_head_before 06e1e95, measured with `git rev-list --count`)
- No stubs (`TODO`/`FIXME`/placeholder) in any changed file

---
*Phase: 13-resilient-route-stop-data-lifecycle*
*Completed: 2026-10-01*
