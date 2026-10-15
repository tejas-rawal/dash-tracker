---
phase: 15-alert-nearby-data-hygiene
plan: 03
subsystem: api
tags: [service-alerts, ingestion, data-hygiene, dash, gap-closure, vitest, e2e]

requires:
  - phase: 15-alert-nearby-data-hygiene
    provides: "15-01 per-alert ingestion loop (isDeleted, findMalformedBound, one-warn drop) and the alertHygiene.test.ts fake-DASH real-poll harness"
provides:
  - "isPlainRecord / readRecordList / parseAlert in ServiceAlertService: per-alert structural check of activePeriods and informedEntities before the date check"
  - "DashAlertEntity.activePeriods and informedEntities typed unknown; DashInformedEntity routeId/stopId typed unknown"
  - "informedRouteIds / informedStopIds only ever hold strings"
  - "Real-poll E2E proving a poll with structurally malformed alerts is applied, so a just-deleted alert disappears"
affects: [service-alerts, 15-VERIFICATION, 15-UAT]

actuals:
  tokens: 3867
  tasks: 2
  commits: 3
plan_head_before: 10cc17d30f125ec4cd39d0adde2bad28becd706d

tech-stack:
  added: []
  patterns:
    - "Upstream containers typed unknown and read only through one checking helper (readRecordList), so the compiler forbids unchecked reads"
    - "parseAlert returns { alert } or { malformed } so fetchAlerts has a single warn site for every drop reason"

key-files:
  created: []
  modified:
    - src/server/api/models/ServiceAlert.ts
    - src/server/api/services/ServiceAlertService.ts
    - src/server/api/services/ServiceAlertService.test.ts
    - src/server/api/routes/alertHygiene.test.ts

key-decisions:
  - "A structurally malformed alert (activePeriods or informedEntities present but not an array of non-null, non-array objects) drops only that alert with one message-only warn naming the list; the poll applies every other alert (Phase 15 D-16, closes review CR-01)"
  - "Malformed lists are never repaired: a lone object is not wrapped, a bad element is not skipped, a present non-list is not treated as absent; null/undefined lists keep their old meaning"
  - "Check order is activePeriods list, informedEntities list, then start/end dates; the date warn text is byte-identical to 15-01"
  - "Non-string routeId/stopId inside a well-formed informed entity is skipped silently; an empty-string id is still kept (assumption A2)"

patterns-established:
  - "Structural check before value check: a list's shape is validated before anything reads values inside it"

requirements-completed: [ALRT-12, ALRT-13]

coverage:
  - id: D1
    description: "Through the real ServiceAlertPollService over a fake DASH, a poll holding a soft-deleted alert-old, a good alert-new, alert-bad-periods (activePeriods [null]) and alert-bad-informed (informedEntities {}) is applied: the repository holds exactly ['alert-new'], GET /api/v1/routes/1A shows only alert-new, and no poll error is logged"
    requirement: ALRT-12
    verification:
      - kind: e2e
        ref: "src/server/api/routes/alertHygiene.test.ts#keeps applying alert updates through the real poll when an alert is structurally malformed (D-16)"
        status: pass
    human_judgment: false
  - id: D2
    description: "An undeleted alert whose activePeriods or informedEntities is present but not an array of plain objects is dropped on its own with exactly one warn 'Dropping service alert <id> with a malformed <list> list'; the sibling alert is returned (12 structural rows plus 2 ordering rows)"
    requirement: ALRT-13
    verification:
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#drops only the alert with $label, keeps the others, and warns once naming the alert id and malformed list"
        status: pass
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#never puts the raw list value or other alert fields in the warn line"
        status: pass
    human_judgment: false
  - id: D3
    description: "Null lists keep their old meaning (always active, no targets, no warn); non-string informed ids are skipped so the id lists hold only strings; a deleted alert with malformed lists drops silently (D-10)"
    requirement: ALRT-13
    verification:
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#keeps an alert whose activePeriods and informedEntities are null, as always active with no targets"
        status: pass
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#skips informed route and stop ids that are not strings and keeps the alert for its other targets"
        status: pass
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#drops a deleted alert with a malformed list without warning (D-10)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Unchanged behavior: every pre-existing ServiceAlertService, ServiceAlertRepository and alertHygiene test passes with an unchanged body (both D-07 UpstreamApiError rows and all seven malformed-date rows); the repository and poll service are byte-identical to f3b96d4"
    verification:
      - kind: other
        ref: "bun run test:coverage (51 files, 826 tests; 98.75/96.56/97.84/98.75; ServiceAlertService.ts 100%)"
        status: pass
      - kind: other
        ref: "git diff --quiet f3b96d4 -- src/server/api/repositories/ServiceAlertRepository.ts src/server/api/services/ServiceAlertPollService.ts"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-10-07
status: complete
---

# Phase 15 Plan 03: Structurally Malformed Alert Gap Closure (CR-01) Summary

**`fetchAlerts()` now checks each undeleted alert's `activePeriods` and `informedEntities` lists before anything reads them. An alert whose list is not an array of plain objects is dropped on its own, with one id-and-list warn, and is never repaired. Before this change, one broken alert threw a TypeError, the whole poll failed, and the previous snapshot stayed on screen, including alerts DASH had just soft-deleted.**

## Performance

- **Duration:** about 4 min
- **Started:** 2026-10-07T19:55:27Z
- **Completed:** 2026-10-07T19:59:24Z
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments

- **CR-01 closed (ALRT-12, D-16).** Through the real poll, a feed holding `activePeriods: [null]` and `informedEntities: {}` alerts is applied. An alert DASH soft-deleted in that same poll disappears from `GET /api/v1/routes/1A`, and `Failed to poll service alerts` is never logged.
- **Compiler-enforced boundary.** `DashAlertEntity.activePeriods` and `informedEntities` are typed `unknown`. The only reads are the two `readRecordList` calls in `parseAlert`. `findMalformedBound`, `deriveActiveWindow` and `mapToServiceAlert` take only the checked lists.
- **Never repaired (ALRT-13 prohibition).** `isPlainRecord` rejects null, primitives and arrays. A lone period object, a nested array, a string element and a present non-list all condemn the alert instead of reading as "always active".
- **String-only ids.** `informedRouteIds` and `informedStopIds` keep only `typeof === "string"` ids, so `null` no longer leaks into `string[]`.
- **Unchanged behavior (SC4).** The date warn text is byte-identical. D-07 (missing id fails the poll) and D-10 (deleted first, silent) still hold. Every pre-existing test passes with an unchanged body.

## Task Commits

1. **Task 1 (tracer): a structurally malformed `activePeriods` no longer freezes alert updates.** `fedd79d` (feat). The E2E was written first and failed: the step-2 wait saw `['alert-old']`. It passed after the model and service change.
2. **Task 2 RED: the D-16 unit table plus the `alert-bad-informed` E2E row.** `e3891d8` (test)
3. **Task 2 GREEN: the `informedEntities` structural drop and string-only ids.** `e7e3251` (feat)

No REFACTOR commit was needed.

## TDD Gate Compliance

- **RED (Task 2):** `e3891d8`. 7 of 67 tests failed:
  - the `informedEntities` `[null]`, `{}` and `"route-1"` rows threw TypeErrors;
  - the number-element row kept alert-1;
  - the ordering row named the start date instead of the list;
  - the non-string-id row returned `[null, "route-1", {}]`;
  - the E2E wait timed out.

  `check tdd-red-evidence` returned `RED_EVIDENCE_OK` / `target_test_failed`, with target "skips informed route and stop ids that are not strings and keeps the alert for its other targets". As in 15-01 and 15-02, Vitest's `tap-flat` output has no `# tests/# pass/# fail` footer, so I added one counted from the real `ok`/`not ok` lines (67/60/7).
- **GREEN (Task 2):** `e7e3251`. The 3 targeted files pass, 90/90.
- **Task 1** is a tracer, and its test-first failure is recorded above.

## Files Created/Modified

- `src/server/api/models/ServiceAlert.ts`:
  - `activePeriods?: unknown` and `informedEntities?: unknown`, with a shared why comment;
  - `DashInformedEntity.routeId/stopId` changed to `unknown`;
  - reworded `DashActivePeriod` comment.
  - `ServiceAlert` is unchanged (D-05).
- `src/server/api/services/ServiceAlertService.ts`:
  - new `isPlainRecord`, `readRecordList` and `parseAlert`;
  - `findMalformedBound`, `deriveActiveWindow` and `mapToServiceAlert` take only checked lists;
  - `fetchAlerts` has one warn site, `Dropping service alert ${entity.id} with a malformed ${parsed.malformed}`.
- `src/server/api/services/ServiceAlertService.test.ts`: new describe `structurally malformed alerts (D-16)` with:
  - 14 `it.each` rows (12 structural, 2 ordering);
  - the null-lists, non-string-ids, D-10 and message-only tests.
- `src/server/api/routes/alertHygiene.test.ts`: the new real-poll test `keeps applying alert updates through the real poll when an alert is structurally malformed (D-16)`.

## Decisions Made

The plan was followed as written. Its assumptions still stand:
- **A1:** a non-object entity still fails the whole poll under D-07.
- **A2:** an empty-string `routeId`/`stopId` is kept.
- **A3:** very large period arrays still go through the `Math.min/max` spreads.

This plan replaces 15-01's key link `findMalformedBound(entity.activePeriods)` with `parseAlert(entity)`, which calls `findMalformedBound(periods)`.

## Deviations from Plan

None. The plan was executed exactly as written.

## Issues Encountered

- **First `bun run test:coverage` run:**
  - **What failed:** one unrelated test, `upstreamRateLimit.test.ts > allows the 59th and 60th requests and rejects the 61st and 62nd`, hit the 5000 ms timeout.
  - **Why it is unrelated:** this plan changes no middleware file. Run alone, the file passes 10/10 with 472 ms of test time.
  - **Cause:** 62 sequential supertest requests under coverage instrumentation, with 51 files running in parallel.
  - **Result:** a single re-run of the gate exited 0, with 826/826 tests and every threshold met.
  - **Next step:** the timeout is load-dependent, so this test may flake again on a loaded machine. Raising its per-test timeout could be a follow-up.
- `bun run lint` reports the same 36 warnings as before, for example `useFilenamingConvention` on `ServiceAlertService.test.ts`. They are warnings, not errors, and out of scope.

## Verification

- `bun run test -- --reporter=verbose` over the 3 alert test files passes 90/90. That includes every "warns once naming the alert id and malformed list" row, "skips informed route and stop ids that are not strings", both D-07 rows and all seven malformed-date rows.
- `bun run test:coverage` exits 0: 51 files, 826 tests, coverage 98.75 / 96.56 / 97.84 / 98.75, and `ServiceAlertService.ts` at 100% on all four.
- `bun run lint` exits 0, `bunx tsc --noEmit -p tsconfig.json` exits 0, and `bun run build` exits 0.
- `git diff --quiet f3b96d4 -- src/server/api/repositories/ServiceAlertRepository.ts src/server/api/services/ServiceAlertPollService.ts` exits 0 (D-06).
- Every CR-01 reproduction shape now has a passing row that keeps the sibling alert and logs one warn: `activePeriods` `[null]`, `{}`, `5`, `"abc"`, and `informedEntities` `[null]`, `{}`.
- Acceptance criteria re-run for both tasks: all PASS. The `id !== undefined` and `?? []` counts in non-comment lines are 0, and the raw lists are read only on lines 157 and 161 (`readRecordList`).

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

CR-01 / 15-UAT test 1 is resolved as "reject" (D-16). Phase 15 now has all 3 plans summarized and is ready for re-verification. Out of scope here and still open from the review: WR-01 (an open start is ignored when another period has a start), WR-02 (timezone-dependent lenient date parsing), WR-03 (alert text fields are not type-checked) and IN-01 to IN-04.

---
*Phase: 15-alert-nearby-data-hygiene*
*Completed: 2026-10-07*

## Self-Check: PASSED

- FOUND: src/server/api/models/ServiceAlert.ts, src/server/api/services/ServiceAlertService.ts, src/server/api/services/ServiceAlertService.test.ts, src/server/api/routes/alertHygiene.test.ts
- FOUND commits: fedd79d, e3891d8, e7e3251 (`git rev-list --count 10cc17d..HEAD` = 3 before this docs commit)
- TDD gates: `test(15-03)` e3891d8 precedes `feat(15-03)` e7e3251
