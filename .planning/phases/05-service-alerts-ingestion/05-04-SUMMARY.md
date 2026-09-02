---
phase: 05-service-alerts-ingestion
plan: 04
subsystem: api
tags: [typescript, vitest, gtfs-rt, error-handling, tdd]

# Dependency graph
requires:
  - phase: 05-service-alerts-ingestion
    provides: "ServiceAlertService.fetchFromDashApi()'s body-shape guard and JSON.parse string-body fallback (05-01/05-02/05-03)"
provides:
  - "fetchFromDashApi()'s body-shape guard now rejects an array-rooted response body (raw or JSON-string-encoded) with UpstreamApiError instead of silently resolving to zero alerts"
  - "Shared MALFORMED_BODY_MESSAGE constant with a distinguishable JSON.parse-failure suffix, closing WR-02's diagnosability gap"
  - "DashAlertsApiResponse.entities typed as optional, matching fetchAlerts()'s existing runtime contract"
affects: [06-service-alerts-consumption]

# Actuals (#2632)
actuals:
  tokens: 1100
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns: ["Shared error-message constant reused across multiple UpstreamApiError throw sites in the same function, with a distinguishing suffix per failure mode"]

key-files:
  created: []
  modified:
    - src/server/api/services/ServiceAlertService.ts
    - src/server/api/services/ServiceAlertService.test.ts
    - src/server/api/models/ServiceAlert.ts

key-decisions:
  - "Added Array.isArray(body) as a third OR condition on the existing null/typeof guard rather than a separate check, keeping the array-root case inline with the pre-existing malformed-body detection it conceptually belongs to"
  - "Kept the array/non-object guard's thrown message identical to the pre-existing MALFORMED_BODY_MESSAGE constant (no new/different text for this case), only differentiating the JSON.parse-failure catch site with an appended suffix, per the plan's explicit instruction"

patterns-established:
  - "TDD RED/GREEN split for a single-condition bug fix: failing regression tests committed first (test(05-04)), fix committed second (fix(05-04)), non-behavioral cleanup committed third (refactor(05-04))"

requirements-completed: [ALRT-01]

coverage:
  - id: D1
    description: "fetchFromDashApi() rejects an array-rooted response.data (raw array or JSON-string-encoded array) with UpstreamApiError instead of silently resolving to an empty alert list"
    requirement: ALRT-01
    verification:
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#rejects with UpstreamApiError when the response body is an array-rooted value (WR-01)"
        status: pass
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#rejects with UpstreamApiError when the response body is a JSON-encoded string that parses to an array-rooted value (WR-01)"
        status: pass
    human_judgment: false
  - id: D2
    description: "All pre-existing 05-01/05-02/05-03 guard and mapping behavior is unchanged (null body, invalid-JSON string, non-object primitive, valid single-object body, JSON-string-encoded valid object) — zero regression"
    requirement: ALRT-01
    verification:
      - kind: unit
        ref: "bun run test -- src/server/api/services/ServiceAlertService.test.ts (21/21 pass)"
        status: pass
      - kind: unit
        ref: "bun run test -- src/server/api/services/ServiceAlertService.test.ts src/server/api/repositories/ServiceAlertRepository.test.ts src/server/api/services/ServiceAlertPollService.test.ts (36/36 pass)"
        status: pass
      - kind: unit
        ref: "bun run test (full suite, 253/253 pass, 98.1% stmt / 94.25% branch / 97.77% func / 98.1% line coverage)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Carried-forward review findings WR-02 (duplicated malformed-body message), IN-01 (stale 'entity' test titles), IN-02 (entities typed as required but treated as optional) all closed"
    verification:
      - kind: unit
        ref: "bun run build (tsc strict, exits 0 after entities?: DashAlertEntity[] widening)"
        status: pass
      - kind: other
        ref: "grep -c 'MALFORMED_BODY_MESSAGE' src/server/api/services/ServiceAlertService.ts (single constant, two throw sites reference it)"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-09-02
status: complete
---

# Phase 05 Plan 04: Array-Root Body-Shape Guard Fix (WR-01) Summary

**Fixed `fetchFromDashApi()`'s body-shape guard to reject array-rooted upstream response bodies (`typeof [] === "object"` was letting them silently pass), closing 05-VERIFICATION.md's last confirmed blocking gap (G-05-3) with two TDD regression tests, plus closed three carried-forward code-review findings (WR-02, IN-01, IN-02) on the same file.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-09-02
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `ServiceAlertService.ts`'s body-shape guard now also rejects `Array.isArray(body)`, in addition to the pre-existing `null` and `typeof !== "object"` checks — catching both a raw array `response.data` and a JSON string that parses to one, since the check runs after the existing string `JSON.parse` fallback
- Two new regression tests (array literal `{ data: [] }` and JSON-string `{ data: "[]" }`) prove the fix; all 19 pre-existing tests in the file continue to pass unmodified
- Extracted the previously-duplicated malformed-body error string into a single `MALFORMED_BODY_MESSAGE` constant, and gave the `JSON.parse`-failure throw site a distinguishing suffix so a production log line can now tell "invalid JSON" apart from "valid JSON but wrong shape" (WR-02)
- Renamed two stale test titles from singular "entity" to plural "entities" to match the field they actually exercise, without touching their assertions (IN-01)
- Widened `DashAlertsApiResponse.entities` to optional (`entities?: DashAlertEntity[]`), matching the runtime contract `fetchAlerts()` already implements via its explicit `=== undefined` check (IN-02)

## Task Commits

Each task was committed atomically (Task 1 followed the TDD RED → GREEN cycle):

1. **Task 1 (RED): Add failing regression tests for array-root body-shape guard** - `0453743` (test)
2. **Task 1 (GREEN): Fix the array-root body-shape guard defect** - `5cbaaaf` (fix)
3. **Task 2: Close carried-forward review findings WR-02/IN-01/IN-02** - `f7f17a0` (refactor)

**Plan metadata:** committed separately by the orchestrator after worktree merge (this worktree does not write STATE.md/ROADMAP.md).

## TDD Gate Compliance

Task 1 carried `tdd="true"`. Gate sequence verified in git log:
1. RED gate — `0453743 test(05-04): add failing regression tests for array-root body-shape guard (WR-01)` — confirmed both new tests failed before the fix (`promise resolved "[]" instead of rejecting`).
2. GREEN gate — `5cbaaaf fix(05-04): reject array-rooted response body in body-shape guard (WR-01)` — confirmed all 21 tests passed after adding `Array.isArray(body)` to the guard.
3. REFACTOR (Task 2, separate task, not part of the TDD gate itself) — `f7f17a0 refactor(05-04): close carried-forward review findings WR-02/IN-01/IN-02`.

No fail-fast violation: the RED-phase tests failed as expected (did not pass unexpectedly) before implementation.

## Files Created/Modified
- `src/server/api/services/ServiceAlertService.ts` - Added `Array.isArray(body)` to the body-shape guard; extracted `MALFORMED_BODY_MESSAGE` constant and gave the JSON.parse-failure throw site a distinguishing suffix
- `src/server/api/services/ServiceAlertService.test.ts` - Added two array-root regression tests (raw array, JSON-string array); renamed two stale "entity" test titles to "entities"
- `src/server/api/models/ServiceAlert.ts` - Widened `DashAlertsApiResponse.entities` from required to optional

## Decisions Made
- Added the array check as a third `||` condition on the existing guard rather than a separate `if`/early-return, keeping all "malformed body shape" detection in one place as the plan specified
- Did not change the array/non-object guard's thrown message text — only the JSON.parse-failure catch site gained a distinguishing suffix, per the plan's explicit instruction not to introduce a new message for the array case

## Deviations from Plan

None - plan executed exactly as written. Both tasks' acceptance criteria were met without requiring any auto-fix, architectural change, or scope expansion.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- WR-01 (the last confirmed blocking code defect from 05-VERIFICATION.md's `gaps[0]`/Truth 5) is closed with passing automated regression tests; full 253/253 workspace suite and `bun run build` both pass with zero regressions
- 05-VERIFICATION.md's `behavior_unverified_items` entry (the `headerText`/`descriptionText`/`url` live-payload field-shape question) is explicitly out of scope for this plan and remains a separately-routed human live-boot check — not addressed here
- Phase 5 re-verification should now find zero remaining blocking gaps from the code-defect track; the human-verification track (live field-shape check) is still pending and unaffected by this plan

---
*Phase: 05-service-alerts-ingestion*
*Completed: 2026-09-02*
