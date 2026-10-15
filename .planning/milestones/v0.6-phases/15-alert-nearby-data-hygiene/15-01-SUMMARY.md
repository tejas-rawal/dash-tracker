---
phase: 15-alert-nearby-data-hygiene
plan: 01
subsystem: api
tags: [service-alerts, ingestion, data-hygiene, dash, vitest, e2e]

requires:
  - phase: 08-service-alerts-ingestion
    provides: ServiceAlertService.fetchAlerts, deriveActiveWindow, confirmed live alert shape
  - phase: 09-alerts-surfaced-on-routes-stops-predictions
    provides: ServiceAlertRepository and the five alert-bearing endpoints
provides:
  - Per-alert ingestion filter in fetchAlerts() (soft-deleted dropped silently, malformed-date dropped with one warn)
  - DashAlertEntity.deletedAt?: unknown and DashActivePeriod bounds typed unknown
  - Fake-DASH E2E (alertHygiene.test.ts) covering route, route list, route stops, nearby stops, nearby predictions and the real poll
affects: [15-02, service-alerts, nearby-predictions]

actuals:
  tokens: 7507
  tasks: 3
  commits: 4
plan_head_before: ed7ddc849775da2b4071438828903d3a06aba554

tech-stack:
  added: []
  patterns:
    - "Ingestion-time per-item filter loop: structural envelope errors still throw, per-item data errors drop the item"
    - "Upstream-shaped fields typed unknown and narrowed by a type-predicate validator (isParseableDate)"

key-files:
  created:
    - src/server/api/routes/alertHygiene.test.ts
  modified:
    - src/server/api/models/ServiceAlert.ts
    - src/server/api/services/ServiceAlertService.ts
    - src/server/api/services/ServiceAlertService.test.ts

key-decisions:
  - "Alert hygiene lives only in ServiceAlertService.fetchAlerts(); ServiceAlertRepository stays byte-identical and ServiceAlert gains no deletion field (Phase 15 D-05, D-06)"
  - "Any non-null deletedAt drops the alert silently, checked before date validation (Phase 15 D-08, D-09, D-10)"
  - "A malformed activePeriods bound (present and not a parseable date string) drops the whole alert with one message-only warn naming id and bound; other alerts in the poll still apply (Phase 15 D-01 to D-04)"

patterns-established:
  - "Phase-qualified decision references in new comments ('Phase 15 D-xx') to avoid clashing with older bare D-xx comments"

requirements-completed: [ALRT-12, ALRT-13]

coverage:
  - id: D1
    description: "A soft-deleted DASH alert (any non-null deletedAt) is dropped at ingestion, silently, and never reaches any alert-bearing response"
    requirement: ALRT-12
    verification:
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#soft-deleted alerts (ALRT-12)"
        status: pass
      - kind: integration
        ref: "src/server/api/routes/alertHygiene.test.ts#shows only the well-formed, undeleted alert on route, route-list, route-stop, nearby-stop and nearby-prediction responses"
        status: pass
    human_judgment: false
  - id: D2
    description: "A malformed activePeriods date drops only its alert with one message-only warn naming id and bound; the poll keeps applying every other alert"
    requirement: ALRT-13
    verification:
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#malformed activePeriods dates (ALRT-13)"
        status: pass
      - kind: integration
        ref: "src/server/api/routes/alertHygiene.test.ts#keeps applying alert updates through the real poll when one alert has a malformed date (D-01)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every activePeriod bound fetchAlerts() emits is null or a round-trippable ISO string, so the WR-02 fail-open input cannot reach the unchanged repository"
    requirement: ALRT-13
    verification:
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#never returns an activePeriod bound that is not null or a round-trippable ISO string (D-06)"
        status: pass
      - kind: other
        ref: "git diff --quiet f3b96d4 -- src/server/api/repositories/ServiceAlertRepository.ts src/server/api/services/ServiceAlertPollService.ts"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-10-07
status: complete
---

# Phase 15 Plan 01: Alert Ingestion Hygiene Summary

**`ServiceAlertService.fetchAlerts()` now drops soft-deleted alerts silently and drops malformed-date alerts one at a time with a single id-and-bound warn. One bad date no longer throws `RangeError` and blocks every alert update.**

## Performance

- **Duration:** about 5 min
- **Started:** 2026-10-07T18:59:57Z
- **Completed:** 2026-10-07T19:05:00Z
- **Tasks:** 3/3
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- **ALRT-12:** an alert whose `deletedAt` holds anything other than null or undefined is dropped at ingestion with no log line. This covers past, future and garbled timestamps, an empty string, `0`, `{}` and `true`. Such an alert is absent from all five alert-bearing endpoints.
- **ALRT-13:** a present `activePeriods` bound that is not a parseable date string drops the whole alert. Each drop logs exactly one warn per poll: `Dropping service alert <id> with a malformed activePeriods <start|end> date`. The warn never contains the raw value or other entity fields. All sibling alerts are still applied, and the real poll no longer logs `Failed to poll service alerts` because of a bad date.
- **D-06:** `deriveActiveWindow` only ever sees validated bounds, so `toISOString` cannot throw. Every bound it emits is null or round-trippable ISO, and `ServiceAlertRepository` / `ServiceAlertPollService` are byte-identical to f3b96d4.
- **SC4:** well-formed alerts are served as before. All 23 pre-existing `ServiceAlertService` tests pass with unchanged bodies, and the route summary equals `{ id, cause, effect, headerText, descriptionText, activePeriod }` with its original values.

## Task Commits

1. **Task 1 (tracer): soft-deleted alert never reaches riders.** `64fbf56` (feat)
2. **Task 2: malformed-date per-alert drop plus unit tables.** RED `8a8d077` (test), GREEN `7c6c1f4` (feat). No refactor was needed.
3. **Task 3: five-endpoint and real-poll E2E.** `aa902c8` (test)

## TDD Gate Compliance

- **RED (Task 2):** `8a8d077`. Ten malformed-date cases failed because `fetchAlerts` rejected with `RangeError: Invalid time value`. The numeric-bound case failed on its assertion because the alert was kept. The RED evidence record was validated by `check tdd-red-evidence` with verdict `RED_EVIDENCE_OK`, reason `target_test_failed`, 45 tests, 10 failing. Vitest's TAP output has no node-test `# tests/# pass/# fail` footer, so that footer was computed from the actual ok/not-ok line counts.
- **GREEN (Task 2):** `7c6c1f4`. All 45 `ServiceAlertService` tests pass.
- **Task 3:** test-only, so the behavior-adding gate does not apply. Its tests passed on first run because Tasks 1 and 2 already implement the behavior. To show they are not vacuous, they were run against the f3b96d4 `ServiceAlertService.ts`, where all 3 fail. The file was then restored.

## Files Created/Modified

- `src/server/api/models/ServiceAlert.ts`: `DashAlertEntity.deletedAt?: unknown`; `DashActivePeriod.start/end` changed to `unknown`. `ServiceAlert` is unchanged.
- `src/server/api/services/ServiceAlertService.ts`: adds `isDeleted`, `isParseableDate` and `findMalformedBound`. `fetchAlerts` now runs a per-alert loop: skip if deleted, else warn and skip if malformed, else map. `deriveActiveWindow` filters bounds with `isParseableDate`.
- `src/server/api/services/ServiceAlertService.test.ts`: adds `mockLoggerWarn`, a file-wide `vi.clearAllMocks()`, and two describe blocks: ALRT-12 (7 dropped rows, 2 kept rows, D-10) and ALRT-13 (7 malformed rows, a non-ISO string, null/omitted bounds, stateless warns, message-only warn, D-06 invariant).
- `src/server/api/routes/alertHygiene.test.ts`: new fake-DASH E2E covering routes, alerts and nearby predictions through the real service, repository, router and poll.

## Decisions Made

All Phase 15 decisions D-01 to D-10 were followed as planned. Flagged assumptions A1 to A3 are unchanged:
- A1: a non-array `activePeriods` or a non-object period still throws.
- A2: an inverted window is kept.
- A3: the first bad bound found is the one named in the warn.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Renamed the poll-service local in alertHygiene.test.ts from `pollService` to `poller`**
- **Found during:** Task 3
- **Issue:** Biome's 120-character width wrapped `const pollService = createServiceAlertPollService(createServiceAlertService(), ServiceAlertRepository.getInstance());` (124 chars) across lines. The acceptance grep for the single-line call then printed 0.
- **Fix:** Renamed the variable so the exact call fits on one line. Behavior is unchanged.
- **Files modified:** src/server/api/routes/alertHygiene.test.ts
- **Commit:** aa902c8

**2. [Note] Numeric and object bound RED rows failed at runtime, not at typecheck**
- **Found during:** Task 2 RED
- **Issue:** The plan expected these rows to fail typecheck until the model was widened. `tsconfig.json` excludes `src/**/*.test.ts`, and `vitest --typecheck` only checks `*.test-d.ts`, so neither flags them.
- **Fix:** None was needed. The rows still went RED on their assertions. After GREEN, a temporary tsconfig that includes both test files typechecks cleanly.
- **Files modified:** none

**Additional assertion:** Task 1's E2E also asserts that `logger.error` is not called. This puts `errorSpy` to use in the test.

**Total deviations:** 1 auto-fixed (blocking: acceptance grep vs. formatter) and 1 note. **Impact:** none on behavior or scope.

## Issues Encountered

None.

## Verification

- `bun run test -- --reporter=verbose src/server/api/services/ServiceAlertService.test.ts src/server/api/routes/alertHygiene.test.ts`: 48 tests pass.
- `bun run test:coverage`: exit 0. 51 files and 769 tests pass. All-files coverage is 98.72% statements, 96.44% branches, 97.77% functions and 98.72% lines.
- `bun run lint`: exit 0. The 36 warnings are pre-existing, for example `useFilenamingConvention` on PascalCase test files.
- `bunx tsc --noEmit -p tsconfig.json`: exit 0.
- `git diff --quiet f3b96d4 -- src/server/api/repositories/ServiceAlertRepository.ts src/server/api/services/ServiceAlertPollService.ts`: exit 0.
- All acceptance criteria for Tasks 1, 2 and 3 pass.

## Next Phase Readiness

Ready for 15-02 (NEAR-12 nearby display-field guard). The nearby entry in `alertHygiene.test.ts` already satisfies the tightened guard: every display field is a non-empty string, `stopCode` is a finite number, and `directionId`/`headsign` are non-empty.

## Self-Check: PASSED

- FOUND: src/server/api/routes/alertHygiene.test.ts, src/server/api/models/ServiceAlert.ts, src/server/api/services/ServiceAlertService.ts, src/server/api/services/ServiceAlertService.test.ts
- FOUND commits: 64fbf56, 8a8d077, 7c6c1f4, aa902c8
