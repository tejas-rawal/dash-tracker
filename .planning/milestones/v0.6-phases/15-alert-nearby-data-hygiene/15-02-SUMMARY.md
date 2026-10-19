---
phase: 15-alert-nearby-data-hygiene
plan: 02
subsystem: api
tags: [nearby-predictions, data-hygiene, dash, validation, vitest, e2e]

requires:
  - phase: 11-nearby-predictions
    provides: NearbyPredictionService, isValidNearbyEntry, filterValidEntries/describeEntry drop-and-warn, live alexandria-dash nearby sample
provides:
  - isNonEmptyString(value: unknown): value is string helper next to isRecord/isFiniteNumber
  - isValidNearbyEntry guards routeId, routeName, routeShortName, stopId, stopName (non-empty strings), stopCode (finite number) and each destination's directionId and headsign (non-empty strings)
  - Route-level proof that GET /api/v1/predictions/nearby never serves a nameless or mistyped entry while valid stops are still returned
affects: [nearby-predictions, v0.5 WR-01, v0.5 WR-03]

actuals:
  tokens: 2846
  tasks: 2
  commits: 3
plan_head_before: 9c191a12bcdb3b8cbdb86319de6c25b48671f08e

tech-stack:
  added: []
  patterns:
    - "Guard every field a response copies before mapping; one bad field drops the whole upstream entry, never coerced or defaulted"

key-files:
  created: []
  modified:
    - src/server/api/services/NearbyPredictionService.ts
    - src/server/api/services/NearbyPredictionService.test.ts
    - src/server/api/routes/predictionRoutes.test.ts

key-decisions:
  - "isNonEmptyString (typeof string && !== '', no trim, no Unicode normalization) is shared by all five entry string fields, stopId included (Phase 15 D-11)"
  - "stopCode only needs to be a finite number; 0, negatives and non-integers are kept (Phase 15 D-12)"
  - "Every destination needs non-empty directionId and headsign; one bad destination drops the whole entry, empty headsign included (Phase 15 D-13, assumption A3 unverified against live DASH)"
  - "Drop warn, describeEntry, filterValidEntries, parseDashResponse and groupByStop left byte-identical to f3b96d4; agencyKey coverage confirmed by existing unit rows (Phase 15 D-14, D-15)"

patterns-established:
  - "Display-field guard rows generated with flatMap over field names (missing / empty / numeric / null) in the existing malformed-entries it.each table"

requirements-completed: [NEAR-12]

coverage:
  - id: D1
    description: "A nearby entry with a missing, empty or mistyped stopName, routeName, routeId or routeShortName is never served through GET /api/v1/predictions/nearby, and the three valid live stops are still returned"
    requirement: NEAR-12
    verification:
      - kind: integration
        ref: "src/server/api/routes/predictionRoutes.test.ts#never serves a nearby stop built from an entry with $label and still returns the valid stops"
        status: pass
      - kind: unit
        ref: "src/server/api/services/NearbyPredictionService.test.ts#drops an entry with $label, warns once, and keeps valid entries (16 display-field rows)"
        status: pass
    human_judgment: false
  - id: D2
    description: "stopCode must be a finite number (string, null, NaN, Infinity or missing drops the entry); 0, -1 and 4000858.5 are kept"
    requirement: NEAR-12
    verification:
      - kind: unit
        ref: "src/server/api/services/NearbyPredictionService.test.ts#drops an entry with $label, warns once, and keeps valid entries (5 stopCode rows)"
        status: pass
      - kind: unit
        ref: "src/server/api/services/NearbyPredictionService.test.ts#keeps an entry whose stopCode is $label (no integer or sign rule)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every destination needs a non-empty directionId and headsign; a bad destination, including a bad second destination after a valid first one, drops the whole entry"
    requirement: NEAR-12
    verification:
      - kind: unit
        ref: "src/server/api/services/NearbyPredictionService.test.ts#drops an entry with $label, warns once, and keeps valid entries (7 destination rows)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Each drop logs exactly one unchanged warn 'Dropping malformed nearby prediction entry (stop X, route Y)' with no rider coordinates; agencyKey still rejected with UpstreamApiError (502)"
    requirement: NEAR-12
    verification:
      - kind: unit
        ref: "src/server/api/services/NearbyPredictionService.test.ts#logs the unchanged single warn naming stop and route for a dropped display-field entry"
        status: pass
      - kind: unit
        ref: "src/server/api/services/NearbyPredictionService.test.ts#names the route as unknown in the warn when routeShortName is missing"
        status: pass
      - kind: unit
        ref: "src/server/api/services/NearbyPredictionService.test.ts#rejects with UpstreamApiError for $label (a body without data.agencyKey, a non-string agencyKey)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The live alexandria-dash sample (stops 548, 561, 949, including 949's empty predictions list) is served exactly as before; every pre-existing nearby test passes unchanged"
    requirement: NEAR-12
    verification:
      - kind: integration
        ref: "src/server/api/routes/predictionRoutes.test.ts#returns nearest-first stops with miles distance, routes and alerts from one upstream call"
        status: pass
      - kind: unit
        ref: "src/server/api/services/NearbyPredictionService.test.ts#groups the live sample into stops 548, 561, 949 with routes 30 then 31 at 548"
        status: pass
      - kind: other
        ref: "bun run test:coverage (51 files, 807 tests, 98.73/96.48/97.79/98.73)"
        status: pass
    human_judgment: false

duration: 3min
completed: 2026-10-07
status: complete
---

# Phase 15 Plan 02: Nearby Entry Display-Field Guard Summary

**`isValidNearbyEntry` now drops any DASH nearby entry with a missing, empty or mistyped route/stop name or ID, a non-finite stopCode, or a destination without a non-empty directionId and headsign. The single drop warn is unchanged, so no rider is shown a nameless stop, a route with no short name, or a destination with no headsign.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-10-07T19:06:45Z
- **Completed:** 2026-10-07T19:09:42Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Shared `isNonEmptyString` helper. `isValidNearbyEntry` checks all five string fields (routeId, routeName, routeShortName, stopId, stopName) with the rule stopId already used (D-11).
- `isFiniteNumber(stopCode)` with no integer or sign rule (D-12). Every destination needs a non-empty `directionId` and `headsign`, and one bad destination drops the whole entry (D-13).
- Through the real app router, a nameless or mistyped entry placed at 12 m (so it would be nearest) is never served. Stops 548, 561 and 949 are returned as before, each with a non-empty name.
- The warn text is pinned exactly ("stop 548, route 30" / "route unknown") and contains neither rider coordinate (D-14). `describeEntry`, `filterValidEntries`, `parseDashResponse` and `groupByStop` are byte-identical to f3b96d4. The agencyKey rows still reject with UpstreamApiError (D-15).

## Task Commits

1. **Task 1 (tracer): end-to-end "no nearby stop served without its name"**: `fcd2faa` (feat). The route-level test was written first and failed (`['999','548','561','949']`), then passed after the D-11 guard change.
2. **Task 2 RED: display-field, stopCode and destination unit rows**: `39bbef8` (test). The 12 D-12/D-13 rows failed; `check tdd-red-evidence` returned RED_EVIDENCE_OK.
3. **Task 2 GREEN: finite stopCode and named destinations**: `79c6912` (feat)

No REFACTOR commit was needed.

## Files Created/Modified
- `src/server/api/services/NearbyPredictionService.ts`: `isNonEmptyString` helper, the extended `isValidNearbyEntry` conjunction, and a rewritten guard comment.
- `src/server/api/services/NearbyPredictionService.test.ts`: 28 new malformed-entry rows (16 display-field rows from a `flatMap`, 5 stopCode, 7 destination), 3 stopCode positives, and 2 warn-text tests.
- `src/server/api/routes/predictionRoutes.test.ts`: a 5-row route-level `it.each` "never serves a nearby stop built from an entry with $label and still returns the valid stops".

## Decisions Made
- I used the shared `isNonEmptyString` for stopId as well (CONTEXT left this to Claude's discretion), so all five string fields read the same way.
- The plain `typeof distanceToStop === "number" && Number.isFinite(...)` check was left as written, because the plan said to leave the distanceToStop check unchanged.

## Deviations from Plan

None. The plan was executed exactly as written.

## Issues Encountered
- `gsd-tools check tdd-red-evidence` parses node-test TAP summary lines (`# tests/# pass/# fail`). Vitest's `tap-flat` reporter emits the per-test `ok`/`not ok` lines but no summary footer, so I appended one counted from the real `ok`/`not ok` lines (84 tests, 72 pass, 12 fail) before running the check. No test results were invented. A future improvement would be to teach the checker Vitest's TAP output.
- `bun run lint` reports the existing `useFilenamingConvention` warning on `NearbyPredictionService.test.ts`. It is a warning, not an error, it predates this plan, and it is out of scope.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness
- NEAR-12 / SC3 / SC4 are met. Phase 15 plans 01 and 02 are both complete, so the phase is ready for verification.
- Flagged assumptions carried forward from the plan, all unresolved and needing a user decision if they matter:
  - A1: a whitespace-only display string (e.g. stopName `" "`) still passes, because D-11 has no trim rule.
  - A2: an entry with an empty destinations array still passes (behavior unchanged).
  - A3: rejecting an empty `headsign` has not been checked against live DASH. If production shows "Dropping malformed nearby prediction entry" warns traced to headsigns, bring it back to the user rather than loosening the rule.
- v0.5 WR-03 (a stop's alerts disappear when all its entries are dropped) is slightly more likely now. It was already noted as out of scope in 15-CONTEXT.

---
*Phase: 15-alert-nearby-data-hygiene*
*Completed: 2026-10-07*

## Self-Check: PASSED
- FOUND: src/server/api/services/NearbyPredictionService.ts, src/server/api/services/NearbyPredictionService.test.ts, src/server/api/routes/predictionRoutes.test.ts
- FOUND commits: fcd2faa, 39bbef8, 79c6912 (`git rev-list --count 9c191a1..HEAD` = 3 before this docs commit)
- TDD gates: `test(15-02)` 39bbef8 precedes `feat(15-02)` 79c6912
- All Task 1 and Task 2 acceptance criteria re-run: PASS. Plan verification: targeted tests 121/121, `test:coverage` exit 0, `lint` exit 0, `tsc --noEmit` exit 0
