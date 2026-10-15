---
phase: 13-resilient-route-stop-data-lifecycle
plan: 02
subsystem: api
tags: [express, error-handling, http-503, retry-after, vitest, supertest]

# Dependency graph
requires:
  - phase: 13-resilient-route-stop-data-lifecycle
    provides: "13-01: DataNotReadyError, sendErrorResponse(res, error), and the dataNotReady.test.ts NOT_READY_ROWS table"
provides:
  - BusRouteController, StopController and PredictionController migrated to sendErrorResponse (no per-controller mappers)
  - Generic, non-echoing 500 for route list/detail, route stops, nearby stops and REST predictions
  - Five more real-app E2E rows proving 503 + Retry-After 5 before the first route/stop load
affects: [13-03, 13-04, 13-05, 14-health-checks-rate-limiting]

actuals:
  tokens: 4718
  tasks: 3
  commits: 3
plan_head_before: 617a8127bf3832840586c89e673237d116151c05

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Controllers hand every caught error to sendErrorResponse(res, error); 400 validation bodies stay inline in the controller"
    - "500 no-echo tests throw a distinctive message that shares no word with 'An unexpected error occurred', then assert the serialized body does not contain it"

key-files:
  created: []
  modified:
    - src/server/api/controllers/BusRouteController.ts
    - src/server/api/controllers/BusRouteController.test.ts
    - src/server/api/routes/busRoutes.test.ts
    - src/server/api/controllers/StopController.ts
    - src/server/api/controllers/StopController.test.ts
    - src/server/api/controllers/PredictionController.ts
    - src/server/api/controllers/PredictionController.test.ts
    - src/server/api/routes/predictionRoutes.test.ts
    - src/server/api/routes/dataNotReady.test.ts

key-decisions:
  - "13-02: BusRoute, Stop and REST Prediction controllers use only sendErrorResponse; their 404/502 bodies are unchanged and their 500 is the generic 'An unexpected error occurred'"

patterns-established:
  - "Non-Error throw tests now expect the full generic 500 body instead of details 'Unknown error'"

requirements-completed: [BOOT-03]

coverage:
  - id: D1
    description: "Before the first load, GET /api/v1/routes/all and GET /api/v1/routes/1A answer 503 JSON with Retry-After: 5 and the loading message"
    requirement: BOOT-03
    verification:
      - kind: e2e
        ref: "src/server/api/routes/dataNotReady.test.ts#GET /api/v1/routes/all answers 503 with Retry-After before the first route/stop load"
        status: pass
      - kind: e2e
        ref: "src/server/api/routes/dataNotReady.test.ts#GET /api/v1/routes/:shortName answers 503 with Retry-After before the first route/stop load"
        status: pass
    human_judgment: false
  - id: D2
    description: "Before the first load, GET /api/v1/routes/1A/stops and GET /api/v1/stops/nearby?lat=38.8&lng=-77.1 answer 503 JSON with Retry-After: 5"
    requirement: BOOT-03
    verification:
      - kind: e2e
        ref: "src/server/api/routes/dataNotReady.test.ts#GET /api/v1/routes/:shortName/stops answers 503 with Retry-After before the first route/stop load"
        status: pass
      - kind: e2e
        ref: "src/server/api/routes/dataNotReady.test.ts#GET /api/v1/stops/nearby answers 503 with Retry-After before the first route/stop load"
        status: pass
    human_judgment: false
  - id: D3
    description: "Before the first load, GET /api/v1/predictions?stop=stop-1 answers 503 JSON with Retry-After: 5, while a stubbed known stop still yields 502 on an upstream timeout"
    requirement: BOOT-03
    verification:
      - kind: e2e
        ref: "src/server/api/routes/dataNotReady.test.ts#GET /api/v1/predictions answers 503 with Retry-After before the first route/stop load"
        status: pass
      - kind: e2e
        ref: "src/server/api/routes/upstreamTimeout.test.ts#returns 502 for GET /api/v1/predictions shortly after the deadline, without leaking the API key"
        status: pass
    human_judgment: false
  - id: D4
    description: "The three migrated controllers answer a generic 500 that never echoes the thrown text, in unit and route-level tests; 404/502/400 bodies unchanged"
    verification:
      - kind: unit
        ref: "src/server/api/controllers/BusRouteController.test.ts#responds with a generic Request Failed body that does not echo the thrown message"
        status: pass
      - kind: unit
        ref: "src/server/api/controllers/StopController.test.ts#responds with 500 and a generic Request Failed body that does not echo the thrown message"
        status: pass
      - kind: unit
        ref: "src/server/api/controllers/PredictionController.test.ts#responds with a generic Request Failed body that does not echo the thrown message"
        status: pass
      - kind: integration
        ref: "src/server/api/routes/busRoutes.test.ts#responds with 500 and a generic Request Failed body that does not echo the thrown message"
        status: pass
      - kind: integration
        ref: "src/server/api/routes/predictionRoutes.test.ts#responds with 500 when the service throws a generic error"
        status: pass
    human_judgment: false

# Metrics
duration: 2min
completed: 2026-10-01
status: complete
---

# Phase 13 Plan 02: Route, Stop and REST Prediction Controllers on the Shared Error Helper Summary

**Route list/detail, route stops, nearby stops and REST predictions now pass every caught error to `sendErrorResponse`. Before the first route/stop load they answer 503 with `Retry-After: 5` instead of 500, and their 500s no longer echo the thrown message.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-10-01T14:12:42Z
- **Completed:** 2026-10-01T14:14:47Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- `BusRouteController`, `StopController` and `PredictionController` have no error mapping of their own. Removed: the inline 404/500 ternaries in BusRoute, and the private `resolveErrorStatus`/`resolveErrorBody` pairs in Stop and Prediction. The 400 validation bodies in Stop and Prediction are unchanged.
- Against the real app with the never-loaded singleton, `/api/v1/routes/all`, `/api/v1/routes/1A`, `/api/v1/routes/1A/stops`, `/api/v1/stops/nearby?lat=38.8&lng=-77.1` and `/api/v1/predictions?stop=stop-1` all answer 503 with `{ error: "Service Unavailable", details: "Route and stop data is still loading" }` and `Retry-After: 5`. With 13-01's rows, the table now has 7 rows.
- Every 500 assertion that previously checked for the echoed message, including the non-Error `"Unknown error"` cases, now expects the exact generic body and checks that the thrown text is absent.
- `upstreamTimeout.test.ts` is unchanged and still passes: a stubbed known stop still produces 502 `DASH API request timed out after 200ms`.

## Task Commits

1. **Task 1: Route list answers 503 until data loads (tracer)**: `b7bd1aa` (feat)
2. **Task 2: Route stops and nearby stops answer 503**: `1d6d163` (feat)
3. **Task 3: REST predictions answer 503**: `463c33c` (feat)

**Plan metadata:** committed separately as `docs(13-02): complete ...`

## Files Created/Modified
- `src/server/api/controllers/BusRouteController.ts`: both catches call `sendErrorResponse`; `NotFoundError` import dropped
- `src/server/api/controllers/BusRouteController.test.ts`: generic-body 500 tests for both handlers; non-Error cases expect the generic body
- `src/server/api/routes/busRoutes.test.ts`: both route-level 500 tests use `toEqual` on the generic body and check for no echo
- `src/server/api/controllers/StopController.ts`: both catches call `sendErrorResponse`; mappers and error import removed; parse helpers and 400 bodies kept
- `src/server/api/controllers/StopController.test.ts`: generic 500 tests for `getStopsForRoute` and (new) `getNearbyStops`
- `src/server/api/controllers/PredictionController.ts`: the catch calls `sendErrorResponse`; mappers and error imports removed
- `src/server/api/controllers/PredictionController.test.ts`: generic 500 body and no-echo check; the non-Error case expects the generic body
- `src/server/api/routes/predictionRoutes.test.ts`: the 500 test asserts the generic body and no "upstream failure" echo
- `src/server/api/routes/dataNotReady.test.ts`: five new `NOT_READY_ROWS` entries

## Decisions Made
- These three controllers use the helper's labels and status codes as they are. None needed a per-controller override, so the helper stays the only mapping.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two no-echo assertions in the plan could never pass, because "unexpected" is part of the generic text**
- **Found during:** Tasks 1 and 2
- **Issue:** The plan had `busRoutes.test.ts` (GET /routes/:shortName) and `StopController.test.ts` throw `new Error("unexpected")` and then assert that the serialized body does not contain "unexpected". The required details text, "An unexpected error occurred", contains that word. 13-01 hit the same defect and recorded it.
- **Fix:** The tests now throw distinctive messages ("route lookup exploded", "direction table corrupted") and assert that those strings are absent. They still assert the exact generic body.
- **Files modified:** src/server/api/routes/busRoutes.test.ts, src/server/api/controllers/StopController.test.ts
- **Verification:** Both tests pass, and so does the full suite.
- **Committed in:** b7bd1aa, 1d6d163

**2. [Rule 2 - Missing coverage] Added a 500 test for getNearbyStops and for the getRoute generic body**
- **Found during:** Tasks 1 and 2
- **Issue:** The plan said to rewrite a getNearbyStops 500 test "if one exists", and none did. getRoute had a status-only 500 test and no body assertion. Without these tests, nothing checked that those catch sites do not echo the thrown message, which is threat T-13-06.
- **Fix:** Added one generic-body, no-echo test for each handler. Thrown messages: "stop index corrupted" and "route index corrupted".
- **Files modified:** src/server/api/controllers/StopController.test.ts, src/server/api/controllers/BusRouteController.test.ts
- **Verification:** Both tests pass.
- **Committed in:** b7bd1aa, 1d6d163

---

**Total deviations:** 2 auto-fixed (1 Rule 1 test-spec defect, 1 Rule 2 added coverage)
**Impact on plan:** Test-only changes. They make the plan's own verification achievable and cover T-13-06 at every migrated catch site. No change to production behavior beyond the plan.

## Issues Encountered
- `bun run lint` reports 33 warnings and no errors, the same count as after 13-01. All of them are pre-existing, mainly `useFilenamingConvention` on PascalCase test files. The two `useThrowOnlyError` warnings in `BusRouteController.test.ts` are also pre-existing: the `biome-ignore` comment sits one line above the `throw`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 13-04 can migrate the last three controllers (NearbyPrediction, Favorites, Recents) the same way, appending rows to `NOT_READY_ROWS` and using distinctive thrown messages in its no-echo tests.
- Plan 13-03 has no new coupling: these endpoints rely only on the repository guard throwing `DataNotReadyError`.

## Self-Check: PASSED
- FOUND: all 9 modified files
- FOUND commits: b7bd1aa, 1d6d163, 463c33c
- `bun run test`: 40 files and 576 tests passed, no type errors. `bunx tsc --noEmit`: exit 0. `bunx biome check` on all plan files: exit 0 (warnings only, all pre-existing). `bun run lint`: exit 0.
- Acceptance greps: `sendErrorResponse(res, error)` appears 2/2/1 times in BusRoute/Stop/Prediction, with 0 remaining typed-error `instanceof` checks. `"Bad Request"` appears 4 times in StopController. Each new E2E path appears exactly once.

---
*Phase: 13-resilient-route-stop-data-lifecycle*
*Completed: 2026-10-01*
