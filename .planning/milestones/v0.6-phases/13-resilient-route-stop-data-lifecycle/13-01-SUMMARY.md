---
phase: 13-resilient-route-stop-data-lifecycle
plan: 01
subsystem: api
tags: [express, error-handling, http-503, retry-after, vitest, supertest]

# Dependency graph
requires:
  - phase: 12-bounded-upstream-calls-error-safety-nets
    provides: message-only UpstreamApiError mapping (D-06) and the secret-safe describeReason logging rule (D-12)
provides:
  - DataNotReadyError typed error, thrown by every BusDataRepository getter before the first successful load
  - sendErrorResponse(res, error) shared controller helper (404 / 503 + Retry-After 5 / 502 / generic logged 500)
  - PredictionStreamController and VehicleController migrated to the helper
  - Real-app E2E file src/server/api/routes/dataNotReady.test.ts with a row table for plans 13-02 and 13-04 to extend
affects: [13-02, 13-03, 13-04, 13-05, 14-health-checks-rate-limiting]

actuals:
  tokens: 4685
  tasks: 3
  commits: 3
plan_head_before: b6e3b754b0a3051801652f2c97de386f987e7844

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Controllers hand every caught error to sendErrorResponse(res, error); no per-controller status/label mappers"
    - "A 500 never echoes the thrown text; it logs one string (stack or String(value)), never the error object"
    - "Not-ready is a typed DataNotReadyError from the repository guard, not router middleware"

key-files:
  created:
    - src/server/api/controllers/errorResponse.ts
    - src/server/api/controllers/errorResponse.test.ts
    - src/server/api/routes/dataNotReady.test.ts
  modified:
    - src/server/api/errors/index.ts
    - src/server/api/repositories/BusDataRepository.ts
    - src/server/api/repositories/BusDataRepository.test.ts
    - src/server/api/controllers/PredictionStreamController.ts
    - src/server/api/controllers/VehicleController.ts
    - src/server/api/controllers/VehicleController.test.ts

key-decisions:
  - "503 body uses the existing { error, details } shape: { error: 'Service Unavailable', details: 'Route and stop data is still loading' } plus Retry-After: 5 (RETRY_AFTER_SECONDS constant)"
  - "500 keeps the 'Request Failed' label with fixed details 'An unexpected error occurred'; the thrown stack/message is logged once as a string (closes WR-02/IN-04)"
  - "dataNotReady.test.ts keeps a { label, path } row table but feeds it.each [label, path] tuples with a %s title, because Vitest's $label prints strings quoted"

patterns-established:
  - "sendErrorResponse: single error-to-HTTP mapping for every controller; later plans migrate the remaining six controllers"
  - "dataNotReady.test.ts: append { label, path } rows to NOT_READY_ROWS to prove a route/stop-dependent endpoint answers 503 on the never-loaded singleton"

requirements-completed: [BOOT-03]

coverage:
  - id: D1
    description: "Before the first load, GET /api/v1/predictions/stream?stop=stop-1 answers 503 JSON with Retry-After: 5 and the loading message; the SSE stream never opens"
    requirement: BOOT-03
    verification:
      - kind: e2e
        ref: "src/server/api/routes/dataNotReady.test.ts#GET /api/v1/predictions/stream answers 503 with Retry-After before the first route/stop load"
        status: pass
    human_judgment: false
  - id: D2
    description: "Before the first load, GET /api/v1/vehicles?route=1A answers 503 JSON with Retry-After: 5"
    requirement: BOOT-03
    verification:
      - kind: e2e
        ref: "src/server/api/routes/dataNotReady.test.ts#GET /api/v1/vehicles with a route filter answers 503 with Retry-After before the first route/stop load"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every BusDataRepository getter throws DataNotReadyError before a successful load"
    requirement: BOOT-03
    verification:
      - kind: unit
        ref: "src/server/api/repositories/BusDataRepository.test.ts#throws when called before initialization (x6)"
        status: pass
    human_judgment: false
  - id: D4
    description: "sendErrorResponse maps 404/503/502 with their typed message, sets Retry-After only for 503, and turns anything else into a generic 500 logged once as a single string"
    verification:
      - kind: unit
        ref: "src/server/api/controllers/errorResponse.test.ts#sendErrorResponse (6 cases)"
        status: pass
      - kind: unit
        ref: "src/server/api/controllers/VehicleController.test.ts#responds with 500 and a generic Request Failed body that does not echo the thrown message"
        status: pass
    human_judgment: false
  - id: D5
    description: "Endpoints that never read route/stop data stay ungated: unfiltered /vehicles and /predictions/nearby still reach DASH and answer 502 against the blackholed upstream"
    verification:
      - kind: e2e
        ref: "src/server/api/routes/upstreamTimeout.test.ts#returns 502 for GET /api/v1/vehicles shortly after the deadline, without leaking the API key"
        status: pass
    human_judgment: false

# Metrics
duration: 3min
completed: 2026-10-01
status: complete
---

# Phase 13 Plan 01: Not-Ready 503 via Shared Error Helper Summary

**The repository's not-loaded guard now throws a typed `DataNotReadyError`, and a single `sendErrorResponse` helper turns it into a 503 JSON response with `Retry-After: 5`. That 503 is proven end to end on the SSE stream and on vehicle route filters. The same helper's generic 500 no longer echoes thrown text.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-10-01T14:07:29Z
- **Completed:** 2026-10-01T14:10:39Z
- **Tasks:** 3
- **Files modified:** 9 (3 created, 6 modified)

## Accomplishments
- `DataNotReadyError` joins `NotFoundError`/`UpstreamApiError`. All six repository getters throw it before the first load, with the rider-safe message "Route and stop data is still loading".
- `sendErrorResponse(res, error)` in `src/server/api/controllers/errorResponse.ts` is now the only error mapping for both migrated controllers. It returns 404 / 503 + `Retry-After: 5` / 502. Anything else becomes a generic 500, which makes exactly one `logger.error` call with a single string and never echoes the thrown text.
- Against the real app and the never-loaded singleton, `GET /api/v1/predictions/stream?stop=stop-1` and `GET /api/v1/vehicles?route=1A` both answer 503 JSON. Unfiltered `/vehicles` and `/predictions/nearby` remain ungated (still 502 in `upstreamTimeout.test.ts`, which is unchanged).

## Task Commits

1. **Task 1: End-to-end "not loaded yet is a 503" (tracer)**: `8f82cb6` (feat)
2. **Task 2: Pin sendErrorResponse exhaustively**: `c637b8b` (test)
3. **Task 3: Vehicle route-filter lookups answer 503**: `a288beb` (feat)

**Plan metadata:** committed separately as `docs(13-01): complete ...`

## Files Created/Modified
- `src/server/api/errors/index.ts`: adds `DataNotReadyError`
- `src/server/api/repositories/BusDataRepository.ts`: guard throws `DataNotReadyError` (only the guard and one import changed)
- `src/server/api/repositories/BusDataRepository.test.ts`: six pre-load assertions changed to `toThrow(DataNotReadyError)`
- `src/server/api/controllers/errorResponse.ts`: new shared helper with the `RETRY_AFTER_SECONDS = 5` and `UNEXPECTED_ERROR_DETAILS` constants
- `src/server/api/controllers/errorResponse.test.ts`: six cases covering status, header, no-echo 500, and the single string log line
- `src/server/api/controllers/PredictionStreamController.ts`: catch delegates to the helper; local mappers and the error import removed; disconnect guard kept
- `src/server/api/controllers/VehicleController.ts`: catch delegates to the helper; local mappers and the error import removed
- `src/server/api/controllers/VehicleController.test.ts`: 500 test now asserts the generic body and no echo
- `src/server/api/routes/dataNotReady.test.ts`: real-app E2E with the `NOT_READY_ROWS` table (two rows)

## Decisions Made
- The 503 body uses `details`, not `message`, matching every existing error body (PATTERNS discrepancy 1, resolved in the plan).
- The 500 log line formats inline (stack, falling back to message, or `String(value)`) instead of importing `describeReason`, because controller tests mock the config barrel with only a logger.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] E2E title printed with quotes, so the plan's fails_when substring could never match**
- **Found during:** Task 1
- **Issue:** `it.each` over `{ label, path }` objects with a `$label` title renders as `'GET /api/v1/predictions/stream' answers 503 ...`, because Vitest quotes string values. The verify step requires a line containing `GET /api/v1/predictions/stream answers 503 ...` without quotes.
- **Fix:** Kept the `{ label, path }` row table (`NOT_READY_ROWS`) that plans 13-02 and 13-04 extend, and passed `it.each` the rows mapped to `[label, path]` tuples with a `%s` title, so the label prints unquoted. A comment explains why.
- **Files modified:** src/server/api/routes/dataNotReady.test.ts
- **Verification:** The verbose output shows `✓ ... GET /api/v1/predictions/stream answers 503 with Retry-After before the first route/stop load`, and the same holds for the vehicles row.
- **Committed in:** 8f82cb6

**2. [Rule 1 - Bug] The plan's VehicleController no-echo assertion contradicted the generic 500 text**
- **Found during:** Task 3
- **Issue:** The plan said to throw `new Error("unexpected")` and assert that the serialized body does not contain "unexpected". The required generic details, "An unexpected error occurred", contain that word, so the assertion always failed (confirmed by running it).
- **Fix:** The test now throws the distinctive message `new Error("vehicle cache corrupted")` and asserts the body does not contain it. It still asserts the exact generic body.
- **Files modified:** src/server/api/controllers/VehicleController.test.ts
- **Verification:** The test passes, and the full suite passes (40 files, 569 tests).
- **Committed in:** a288beb

---

**Total deviations:** 2 auto-fixed (both Rule 1, both test-spec defects in the plan)
**Impact on plan:** Neither changed production behavior; both make the plan's own verification achievable. No scope creep.

## TDD Gate Compliance

Task 2 (`tdd="true"`) pins a helper that the plan had Task 1 (tracer) build first, so a true pre-implementation RED was not possible. The first run was an expected "unexpected GREEN".
- **Mutation RED evidence instead:** the helper was temporarily mutated so the 500 echoes `error.message` and `Retry-After` is dropped. `bunx vitest --run --reporter=tap-flat src/server/api/controllers/errorResponse.test.ts` then exited 1 with `not ok 2` (Retry-After), `not ok 4` (the target test "never echoes the thrown message in a 500 and logs it once as a string"), and `not ok 5` (Error subclass). The helper was restored byte-for-byte (`git diff --quiet` confirmed) before committing.
- **`gsd check tdd-red-evidence` returned INVALID_RED (`zero_tests_discovered`).** This is a tooling mismatch, not a missing failure. The checker parses node:test TAP summary lines (`# tests N`), and Vitest's TAP reporter emits none. The checker's own `failing_tests` field listed the target test. The output was not hand-edited to satisfy the parser.
- Commits: `test(13-01)` (c637b8b) for Task 2. Task 2 has no separate `feat` commit because its implementation shipped in Task 1's `feat(13-01)` (8f82cb6), which precedes it.

## Issues Encountered
- `bun run lint` reports 33 warnings, all pre-existing `useFilenamingConvention` warnings on PascalCase test files. There are no errors, and the new files add no warnings.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plans 13-02 and 13-04 can migrate the remaining six controllers (BusRoute, Stop, Prediction, NearbyPrediction, Favorites, Recents) to `sendErrorResponse`. They should rewrite each 500 test to the generic body, using a distinctive thrown message that does not overlap "unexpected", and append rows to `NOT_READY_ROWS`.
- Plan 13-03 can restructure the repository load path. The only coupling is that the not-loaded guard must keep throwing `DataNotReadyError("Route and stop data is still loading")`.

## Self-Check: PASSED
- FOUND: src/server/api/controllers/errorResponse.ts, src/server/api/controllers/errorResponse.test.ts, src/server/api/routes/dataNotReady.test.ts
- FOUND commits: 8f82cb6, c637b8b, a288beb
- `bun run test`: 40 files, 569 tests passed, no type errors. `bunx tsc --noEmit`: exit 0. `bunx biome check` on all plan files: exit 0.

---
*Phase: 13-resilient-route-stop-data-lifecycle*
*Completed: 2026-10-01*
