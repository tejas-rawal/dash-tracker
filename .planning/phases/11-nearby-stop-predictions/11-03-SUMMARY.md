---
phase: 11-nearby-stop-predictions
plan: 03
subsystem: api
tags: [express, vitest, supertest, validation, swiftly, predictions-near-location, gap-closure]

requires:
  - phase: 11-nearby-stop-predictions
    provides: "11-01 NearbyPredictionService (isValidNearbyEntry, filterValidEntries, groupByStop) and shared predictionMapping; 11-02 NearbyPredictionController and /nearby route E2E harness"
provides:
  - "Per-element prediction validation in NearbyPredictionService (isFiniteNumber, isValidPrediction) so one malformed prediction element drops only its own entry with one warn"
  - "Route E2E for the verifier's null / string element repros (only axios.get stubbed)"
  - "Ten malformed-element rows plus a no-fabrication unit test pinning that no served prediction lacks min/sec/time/tripId/vehicleId"
affects: [11-verification, nearby-predictions, predictions-near-location]

actuals:
  tokens: 2804      # chars/4 over the realized src diff (11214 chars, 92270d9..HEAD)
  tasks: 2
  commits: 4        # MEASURED: git rev-list --count 92270d9..HEAD
plan_head_before: 92270d969ec43e0d236befda72189ae491078f6b

tech-stack:
  added: []
  patterns:
    - "Upstream element validation mirrors exactly the fields the shared mapper copies; typeof + Number.isFinite, never coercion (Phase 10 / D-18 style)"
    - "One bad element invalidates the whole upstream entry (drop + single warn), never a silently filtered partial entry"

key-files:
  created: []
  modified:
    - src/server/api/services/NearbyPredictionService.ts
    - src/server/api/services/NearbyPredictionService.test.ts
    - src/server/api/routes/predictionRoutes.test.ts

key-decisions:
  - "[Phase 11-03] Nearby prediction elements are validated in isValidNearbyEntry (finite min/sec/time, string tripId/vehicleId, no coercion); one malformed element drops its whole entry with the existing single warn. Hand-rolled guard kept per D-18 (no Zod) despite the review's Zod suggestion"
  - "[Phase 11-03] WR-02 (500 path echoes raw error.message) deferred to a follow-up quick task extracting one shared controller error-response helper for Prediction/Vehicle/NearbyPrediction controllers (WR-02 + IN-04); T-11-16 accepted low"

patterns-established:
  - "Validate what the mapper dereferences: a type guard claiming `entry is X` must check every field the downstream mapping reads"

requirements-completed: [NEAR-09]

coverage:
  - id: D1
    description: "A null or non-object prediction element in one upstream entry no longer 500s GET /api/v1/predictions/nearby; the entry is dropped and stops 548/561/949 return 200 with no TypeError text in the body"
    requirement: NEAR-09
    verification:
      - kind: e2e
        ref: "src/server/api/routes/predictionRoutes.test.ts#keeps the valid stops and serves no incomplete prediction when a prediction element is 'null'"
        status: pass
      - kind: e2e
        ref: "src/server/api/routes/predictionRoutes.test.ts#keeps the valid stops and serves no incomplete prediction when a prediction element is 'a string'"
        status: pass
      - kind: unit
        ref: "src/server/api/services/NearbyPredictionService.test.ts#drops an entry with 'a null prediction element', warns once, and keeps valid entries"
        status: pass
    human_judgment: false
  - id: D2
    description: "No nearby response serves a fabricated or incomplete prediction: empty-object, wrong-typed, non-finite or missing min/sec/time/tripId/vehicleId elements drop their whole entry with exactly one warn"
    requirement: NEAR-09
    verification:
      - kind: unit
        ref: "src/server/api/services/NearbyPredictionService.test.ts#never serves a prediction missing min, sec, time, tripId or vehicleId when prediction elements are malformed"
        status: pass
      - kind: unit
        ref: "src/server/api/services/NearbyPredictionService.test.ts#drops an entry with $label, warns once, and keeps valid entries (10 new malformed-element rows)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Shared mapping, /predictions, /stops/nearby, the nearby controller and every pre-existing test assertion unchanged; full suite and coverage thresholds pass"
    verification:
      - kind: other
        ref: "git diff --quiet 81038c9 -- predictionMapping.ts predictionMapping.test.ts PredictionService.ts PredictionService.test.ts NearbyPredictionController.ts NearbyPredictionController.test.ts predictionRoutes.ts models/Prediction.ts StopController.ts PredictionController.ts StopService.ts PredictionStreamService.ts VehicleService.ts package.json"
        status: pass
      - kind: unit
        ref: "bun run test:coverage (34 files / 520 tests, 98.29% statements, 93.68% branches)"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-09-24
status: complete
---

# Phase 11 Plan 03: Nearby Prediction Element Validation Summary

**`isValidNearbyEntry` now checks every prediction element: finite-number `min`/`sec`/`time` and string `tripId`/`vehicleId`, with no coercion. One null, scalar, empty or partial element drops only its own upstream entry with a single warn. Before this fix, a null element returned 500 with the raw TypeError text for every nearby stop, and a scalar element was served as an empty `{}` arrival.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-09-24T16:21:23Z
- **Completed:** 2026-09-24T16:25:30Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Closed VERIFICATION gap 1 (SC5 / NEAR-09). A `[null]` prediction element used to crash `mapToDestinations` and return 500. Now the route returns 200 with stops 548/561/949, and no `Cannot read properties` text appears in the body.
- Closed VERIFICATION gap 2 (the fabrication prohibition). `["x"]`, `[{}]` and partial or wrong-typed elements used to be served as empty or incomplete arrivals with no warn. Now the entry is dropped and logged once.
- Kept the fix inside `NearbyPredictionService.ts`. `predictionMapping.ts`, `/predictions`, `/stops/nearby` and the controller are byte-identical to 81038c9. The two edited test files only gained lines (47 and 109 added, 0 deleted).

## Task Commits

1. **Task 1: E2E repro plus non-object element guard (tracer)**
   - `d88d7ad` test(11-03): add failing route E2E for malformed nearby prediction elements (RED)
   - `95b225d` fix(11-03): drop nearby entries holding non-object prediction elements (GREEN)
2. **Task 2: Field-level prediction validation (TDD)**
   - `3e5b411` test(11-03): add failing tests for field-level nearby prediction validation (RED)
   - `dddfd1c` feat(11-03): require complete, well-typed nearby prediction elements (GREEN)

There was no REFACTOR commit because nothing needed cleanup.

## RED Evidence

**Task 1, pre-fix repro.** Command: `bun run test -- --reporter=verbose src/server/api/routes/predictionRoutes.test.ts`. The run exited 1 with 2 failed and 29 passed.
```
× ... keeps the valid stops and serves no incomplete prediction when a prediction element is 'null'
  → expected 500 to be 200 // Object.is equality
× ... keeps the valid stops and serves no incomplete prediction when a prediction element is 'a string'
  → expected [ '30', '31' ] to deeply equal [ '30' ]
```
- The `null` row received **500**, which is the verifier's CR-01 repro.
- The `a string` row failed on stop 561's route list. Route 31 was served with an empty prediction.
- `gsd-tools check tdd-red-evidence` returned `RED_EVIDENCE_OK` (target_test_failed).

**Task 2, RED against Task 1's `every(isRecord)` guard.** The run exited 1 with 8 failed and 41 passed. These failed:
- the `'an empty-object prediction element'` row
- the `'a prediction with a string min'` row
- the `'a prediction without sec'` row
- the `'a prediction with a NaN time'` row
- the `'a prediction with a numeric tripId'` row
- the `'a prediction without vehicleId'` row
- the `'an empty-object element in a second destination'` row
- `never serves a prediction missing min, sec, time, tripId or vehicleId when prediction elements are malformed`. It failed with `expected [ '30', '31', '36' ] to deeply equal [ '30' ]`.

Every row failed on `expected [ '548', '561' ] to deeply equal [ '561' ]`. As the plan predicted, the `null`, `string` and `valid-then-null` rows already passed, because Task 1 closed the non-object case. `check tdd-red-evidence` returned `RED_EVIDENCE_OK`.

## Files Created/Modified

- `src/server/api/services/NearbyPredictionService.ts`:
  - Adds the module helpers `isFiniteNumber` and `isValidPrediction`.
  - `isValidNearbyEntry` now requires `destination.predictions.every(isValidPrediction)`.
  - The comment above the guard is rewritten to name both failure modes it prevents.
- `src/server/api/services/NearbyPredictionService.test.ts`:
  - Adds the `makeDashPrediction` and `makeEntryWithPredictions` factories.
  - Adds ten malformed-element rows to the `malformed entries` table.
  - Adds the no-fabrication test.
- `src/server/api/routes/predictionRoutes.test.ts`: adds a two-row `it.each` E2E case (`null` and `a string`) through the real controller and service, with only `axios.get` spied.

## Decisions Made

- **D-18 is honored.** The hand-rolled guard is extended and no Zod schema is added, even though review CR-01 suggested one.
- **The whole entry is dropped, not filtered element by element.** A destination served with silently fewer arrivals would be altered data.
- **The upstream `blockId` is not checked.** Live elements carry it, and the unchanged mapper strips it (D-05).
- **Empty `predictions: []` still passes.** `every` over `[]` is true, so D-13's empty destinations are unaffected. The E2E stop 949 case confirms this.

## Deviations from Plan

None. The plan was executed exactly as written.

Process note: `gsd-tools check tdd-red-evidence` expects node-test TAP summary lines (`# tests/# pass/# fail`), and vitest's `tap-flat` reporter does not emit them. The evidence record was built from the real `tap-flat` output, with those three lines derived by counting its actual `ok` and `not ok` lines. No test or source behavior was affected.

## Deferred Issues

- **WR-02 + IN-04, 500 path echoes the raw `error.message` and doesn't log it** (status: open, deferred by plan `review_findings_decision`):
  - **Why deferred:** Fixing it only in `NearbyPredictionController` would regress 11-02's verified error-mapping truth and its two passing controller tests. It would also make that controller diverge from `PredictionController` and `VehicleController`.
  - **Recommended follow-up:** one `/gsd-quick` task that extracts a shared controller error-response helper. The helper returns a generic 500 body and logs the detail server-side with `logger.error`. All three controllers adopt it together.
  - **Residual risk:** carried as T-11-16, accepted at low severity. After this plan, no known path reaches the nearby 500 branch with internal text, and Task 1's E2E asserts that no TypeError text appears in the body.

## Issues Encountered

- Repo-wide `bun run lint` exits 1 at baseline because of one format error in the tracked `.superset/config.json`, which is unchanged since 81038c9. The plan's verification already records this. The file-scoped `bunx biome check` on the three touched files exits 0. Its only output is the pre-existing `useFilenamingConvention` warning on the PascalCase test filename.
- `bun run build` exits 0, and `bunx tsc --noEmit` exits 0.
- `bun run test:coverage` passes 34 files and 520 tests (507 at baseline plus 13 new), with 98.29% statements and 93.68% branches.

## Known Stubs

None.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- Both 11-VERIFICATION.md gaps should now close: the drop half of SC5 and the fabrication prohibition. Phase 11 is ready for re-verification.
- The three human verification items are unchanged: the live smoke test, the stop-ID-space cross-check, and the client-disconnect backstop.
- There is a flagged assumption. If a live prediction ever omits `vehicleId`, for example a schedule-based arrival, its whole entry is now dropped with a "Dropping malformed nearby prediction entry" warn. That warn would show up during the live smoke test.

## Self-Check: PASSED

- FOUND: src/server/api/services/NearbyPredictionService.ts
- FOUND: src/server/api/services/NearbyPredictionService.test.ts
- FOUND: src/server/api/routes/predictionRoutes.test.ts
- FOUND commits: d88d7ad, 95b225d, 3e5b411, dddfd1c
- All Task 1 and Task 2 acceptance criteria were re-run and passed.

---
*Phase: 11-nearby-stop-predictions*
*Completed: 2026-09-24*
