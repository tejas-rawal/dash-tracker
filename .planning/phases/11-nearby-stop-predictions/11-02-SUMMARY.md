---
phase: 11-nearby-stop-predictions
plan: 02
subsystem: api
tags: [express, vitest, supertest, query-validation, predictions-near-location]

requires:
  - phase: 11-nearby-stop-predictions
    provides: "Plan 11-01: NearbyPredictionService honoring NearbyPredictionOptions { radius, number } and the controller's parseStrictNumber/parseCoordinateParam"
provides:
  - "GET /api/v1/predictions/nearby accepts radius (miles, 0 < r <= 1, default 0.5) and number (integer 1..10, omitted upstream when absent)"
  - "Out-of-range, blank, non-numeric, repeated or nested lat/lng/radius/number return 400 before any upstream call, validated in the order lat, lng, radius, number"
  - "NearbyPredictionController.test.ts: the full NEAR-08 matrix plus 502/500 error mapping"
affects: [future Expo client nearby screen, NEAR-10 SSE nearby stream, NEAR-11 route filter]

actuals:
  tokens: 4750
  tasks: 2
  commits: 2
plan_head_before: 355af077ba9cc9a467559f3244ae8fcb8d3fbebd

tech-stack:
  added: []
  patterns:
    - "Capped optional query params: parse strictly, and when the param is provided but invalid or out of range, return 400. Never clamp."
    - "Controller unit matrices use it.each tables with a Record<string, unknown> query so qs arrays and objects can be injected"

key-files:
  created:
    - src/server/api/controllers/NearbyPredictionController.test.ts
  modified:
    - src/server/api/controllers/NearbyPredictionController.ts
    - src/server/api/routes/predictionRoutes.test.ts

key-decisions:
  - "Nearby radius/number caps live as controller module constants (MAX_RADIUS_MILES = 1, MAX_PREDICTIONS_PER_DESTINATION = 10). Out-of-range values return 400 and are never clamped."
  - "An empty radius= or number= is a provided-but-invalid value (400), not a fallback to the default"

patterns-established:
  - "Pattern: parseRadiusParam/parseNumberParam compose on parseStrictNumber, so blank, array and object values are rejected once, in one place"

requirements-completed: [NEAR-02, NEAR-03, NEAR-08]

coverage:
  - id: D1
    description: "radius and number flow from the query string to upstream meters/number (0.25 -> meters=403, 1 -> meters=1610, number 3/10 forwarded, 5.0 -> 5)"
    requirement: NEAR-02
    verification:
      - kind: e2e
        ref: "src/server/api/routes/predictionRoutes.test.ts#GET /api/v1/predictions/nearby > forwards radius=0.25 as meters=403 and number=3 upstream"
        status: pass
      - kind: e2e
        ref: "src/server/api/routes/predictionRoutes.test.ts#GET /api/v1/predictions/nearby > accepts the radius=1 and number=10 caps and forwards meters=1610 and number=10"
        status: pass
      - kind: e2e
        ref: "src/server/api/routes/predictionRoutes.test.ts#GET /api/v1/predictions/nearby > forwards number=5.0 upstream as the integer number=5"
        status: pass
    human_judgment: false
  - id: D2
    description: "radius above 1 mile and number above 10 are rejected with 400 before any upstream call; defaults still apply when both are omitted"
    requirement: NEAR-03
    verification:
      - kind: e2e
        ref: "src/server/api/routes/predictionRoutes.test.ts#GET /api/v1/predictions/nearby > responds with 400 without calling upstream when radius is above 1 mile"
        status: pass
      - kind: e2e
        ref: "src/server/api/routes/predictionRoutes.test.ts#GET /api/v1/predictions/nearby > responds with 400 without calling upstream when number is above 10"
        status: pass
      - kind: e2e
        ref: "src/server/api/routes/predictionRoutes.test.ts#GET /api/v1/predictions/nearby > returns nearest-first stops with miles distance, routes and alerts from one upstream call"
        status: pass
    human_judgment: false
  - id: D3
    description: "Full NEAR-08 matrix: boundaries, blank/whitespace, non-numeric (NaN, Infinity, 1e999), repeated and nested params, validation order, and the service uncalled on every 400"
    requirement: NEAR-08
    verification:
      - kind: unit
        ref: "src/server/api/controllers/NearbyPredictionController.test.ts (49 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Controller error mapping: UpstreamApiError -> 502 Bad Gateway, Error -> 500 Request Failed, non-Error throw -> 500 'Unknown error'"
    requirement: NEAR-08
    verification:
      - kind: unit
        ref: "src/server/api/controllers/NearbyPredictionController.test.ts#error mapping"
        status: pass
    human_judgment: false
  - id: D5
    description: "Live smoke test against real DASH (nearest-first stops within 0.25 mi, alerts on every stop, 400 on lat= and radius=5)"
    verification: []
    human_judgment: true
    rationale: "Needs a real DASH_API_KEY and live upstream data; this is the plan's end-of-phase <human-check>, which the executor environment cannot run"

duration: 4min
completed: 2026-09-24
status: complete
---

# Phase 11 Plan 02: Nearby Radius/Number Params and NEAR-08 Validation Summary

**`GET /api/v1/predictions/nearby` now accepts `radius` (miles, capped at 1, reaching upstream as `meters = ceil(r * 1609.344)`) and `number` (integer 1..10, left off the upstream URL when absent). Every bad `lat`/`lng`/`radius`/`number` (blank, non-numeric, out of range, repeated or nested) returns 400 before any upstream call. A 49-case controller matrix pins this behavior.**

## Performance

- **Duration:** about 4 min
- **Started:** 2026-09-24T15:03:04Z
- **Completed:** 2026-09-24T15:07:30Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- `parseRadiusParam` (0 < r <= `MAX_RADIUS_MILES = 1`) and `parseNumberParam` (integer, 1..`MAX_PREDICTIONS_PER_DESTINATION = 10`) are built on 11-01's `parseStrictNumber`. The handler validates in the order lat, lng, radius, number, then calls `getNearbyPredictions(lat, lng, { radius, number })`.
- Five new route E2E cases run through the real controller and service, with only `axios.get` stubbed: meters=403/number=3, meters=1610/number=10, 400 on radius=1.5 and number=11 with no upstream call, and number=5.0 forwarded as 5.
- New `NearbyPredictionController.test.ts` (49 tests) covering:
  - accepted boundaries
  - per-parameter 400 tables, including qs arrays and objects
  - validation-order cases
  - 502/500 error mapping
- `/stops/nearby` is byte-identical: StopController, StopController.test and stopRoutes.test are unchanged since b33dc28.

## Task Commits

1. **Task 1: rider-tuned search, tracer** (radius/number parsing, caps, forwarding and route E2E): `aa1307c` (feat)
2. **Task 2: NEAR-08 matrix and error mapping suite**: `9b7ed82` (test)

No GREEN `feat` or REFACTOR commit was needed for Task 2 (see TDD Gate Compliance).

## Files Created/Modified
- `src/server/api/controllers/NearbyPredictionController.ts`: adds the cap constants and `parseRadiusParam`/`parseNumberParam`, the radius and number 400 branches, and forwards `{ radius, number }` to the service.
- `src/server/api/controllers/NearbyPredictionController.test.ts`: new controller unit suite with `makeMockRes`, `makeMockReq` (query typed `Record<string, unknown>`), `makeMockService`, `makeNearbyPredictionsResponse` and `runHandler`.
- `src/server/api/routes/predictionRoutes.test.ts`: E2E cases (a) to (e) in the `GET /api/v1/predictions/nearby` describe block.

## Decisions Made
- Caps are rejected, never clamped (D-10/D-11). The constants live in the controller because it is the only place the HTTP limits are enforced. The service keeps only the 0.5-mile default.
- `number=5.0` is accepted, because `Number.isInteger(5)` holds, and reaches upstream as `number=5`. The parsed number is what gets forwarded, not the raw string.

## Deviations from Plan

None under Rules 1-4. The plan was executed as written.

**TDD ordering note (Task 2):** Task 2 is `tdd="true"`, but Task 1 (the tracer) had already implemented every behavior the matrix encodes. See TDD Gate Compliance below.

**Biome:** `biome format --write` reflowed four long `it.each` boundary rows in the new test file. The only remaining Biome warning is `useFilenamingConvention` on `NearbyPredictionController.test.ts`. The plan mandates that filename, and it matches the repo's `PascalCase.test.ts` convention, the same accepted warning recorded in 11-01.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** none.

## TDD Gate Compliance
- **RED at HEAD:** `check tdd-red-evidence` returned `INVALID_RED`, reason `unexpected_green`. All 49 cases passed on the first run, because Task 1 had already shipped `parseRadiusParam`/`parseNumberParam` and the `{ radius, number }` forwarding.
- **Fail-fast investigation (the tests are not vacuous):**
  - Against the pre-Task-1 controller (`355af07`), 26 of 49 cases fail on radius/number assertions. `check tdd-red-evidence` returned `RED_EVIDENCE_OK`, reason `target_test_failed`, for the target `radius validation > responds with 400 when radius is above 1`. The evidence came from vitest `tap-flat` output with a node:test-style count footer derived from its `ok`/`not ok` lines.
  - Removing the blank-string guard fails exactly the 4 empty/whitespace lat/lng cases.
  - Clamping radius and dropping `Number.isInteger` fails exactly the 4 cap/fractional/order cases.
- **GREEN:** there is no `feat(11-02)` commit for Task 2, because no production change was required. Task 1's `feat(11-02)` commit `aa1307c` precedes the `test(11-02)` commit `9b7ed82`, so strict test-before-feat ordering is not met for Task 2. This follows from the plan's structure (the tracer implements first, and the matrix pins the behavior afterwards), not from skipped discipline.
- **REFACTOR:** not needed.

## Issues Encountered
- Repo-wide `bun run lint` still exits 1 on the pre-existing, out-of-scope `.superset/config.json` formatting error. File-scoped `biome check` on every touched file exits 0.

## Verification
- `bun run test`: 34 files and 507 tests pass, with no type errors (11-01 ended at 33 files and 453 tests).
- `bun run test:coverage`: exits 0. All files are at 98.27% statements, 93.57% branches, 97.67% functions and 98.27% lines.
- `bunx tsc --noEmit -p tsconfig.json` and `bun run build` exit 0.
- `git diff --quiet b33dc28` holds for StopController.ts, StopController.test.ts, stopRoutes.test.ts, PredictionController.ts and StopService.ts.
- End-of-phase human check (not run; it needs a live `DASH_API_KEY`): the smoke test in Task 2's `<human-check>`, recorded as coverage D5.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness
- Phase 11 is complete: all NEAR-01..NEAR-09 behavior is implemented and covered by automated tests. Ready for `/gsd-verify-work 11`, including the live smoke test.
- The open Phase 8 concern still applies: soft-deleted (`deletedAt`) alerts are not filtered, and `/predictions/nearby` now exposes alerts on one more endpoint.

---
*Phase: 11-nearby-stop-predictions*
*Completed: 2026-09-24*

## Self-Check: PASSED
- The created and modified files exist on disk: NearbyPredictionController.test.ts, NearbyPredictionController.ts and predictionRoutes.test.ts.
- Commits aa1307c and 9b7ed82 are present in git log. `rev-list --count 355af07..HEAD` = 2.
