---
phase: 05-service-alerts-ingestion
plan: 02
subsystem: api
tags: [dash-api, gtfs-rt, service-alerts, upstream-validation]

# Dependency graph
requires:
  - phase: 05-service-alerts-ingestion (05-01)
    provides: ServiceAlertService, ServiceAlertRepository, ServiceAlertPollService ingestion pipeline (fully tested but 404ing against the live DASH/Swiftly API)
provides:
  - Corrected DASH/Swiftly endpoint path (/real-time/{agency}/gtfs-rt-alerts/v2) closing gap G-05-1's live 404
  - deriveActiveWindow open-ended-window preservation fix (WR-03)
  - Response-shape hardening (WR-01, WR-02) converting unhandled TypeErrors into UpstreamApiError
affects: [06-service-alerts-embedding, or whichever phase next consumes ServiceAlertService/Repository]

# Actuals (#2632)
actuals:
  tokens: 5044
  tasks: 2
  commits: 5

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - src/server/api/services/ServiceAlertService.ts
    - src/server/api/services/ServiceAlertService.test.ts
    - .planning/phases/05-service-alerts-ingestion/05-01-PLAN.md

key-decisions:
  - "Used the user-confirmed endpoint path /real-time/{agency}/gtfs-rt-alerts/v2 verbatim from Swiftly's own API reference docs, per .planning/debug/service-alerts-404.md — no re-diagnosis performed."
  - "isValidDashAlertEntity explicitly checks alert !== null (not just typeof === 'object'), since typeof null === 'object' in JavaScript would otherwise let a null alert field slip past the guard."

patterns-established: []

requirements-completed: [ALRT-01, ALRT-02, ALRT-03, ALRT-04]

coverage:
  - id: D1
    description: "ServiceAlertService.fetchAlerts() targets the confirmed /real-time/{agency}/gtfs-rt-alerts/v2 endpoint instead of the disproven /service-alerts path (closes G-05-1's live 404)"
    requirement: "ALRT-01"
    verification:
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#calls the DASH API with a URL containing the gtfs-rt-alerts/v2 path and agency"
        status: pass
    human_judgment: false
  - id: D2
    description: "deriveActiveWindow preserves an open-ended active window when any contributing active_period lacks an end (WR-03), instead of collapsing to a bounded end from a different period in the same array"
    requirement: "ALRT-02"
    verification:
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#collapses mixed-boundedness active_period entries to an open-ended window (WR-03)"
        status: pass
    human_judgment: false
  - id: D3
    description: "fetchFromDashApi() throws UpstreamApiError (not a raw TypeError) when response.data is null or a non-object value (WR-01)"
    verification:
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#rejects with UpstreamApiError when the response body is null (WR-01)"
        status: pass
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#rejects with UpstreamApiError when the response body is a non-object value (WR-01)"
        status: pass
    human_judgment: false
  - id: D4
    description: "fetchAlerts() throws UpstreamApiError for a null entity item or one missing/nulling the alert property, via isValidDashAlertEntity, before any mapping occurs (WR-02)"
    verification:
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#rejects with UpstreamApiError when an entity item is null (WR-02)"
        status: pass
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#rejects with UpstreamApiError when an entity item is missing the alert property (WR-02)"
        status: pass
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#rejects with UpstreamApiError when an entity item's alert property is explicitly null (WR-02)"
        status: pass
    human_judgment: false
  - id: D5
    description: "05-01-PLAN.md's historical record no longer documents the disproven /service-alerts endpoint path at its five originally flagged locations"
    verification:
      - kind: other
        ref: "grep -n 'service-alerts' .planning/phases/05-service-alerts-ingestion/05-01-PLAN.md (manual review of remaining hits — all generic feature-name mentions, none assert the stale path as current)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The real DASH/Swiftly API no longer returns 404 for the service-alerts poll when the server boots against it (closes the originally-reported gap G-05-1)"
    verification: []
    human_judgment: true
    rationale: "Requires an authenticated request against the live, non-mocked DASH/Swiftly API and human observation of server startup logs — not reproducible by an automated unit test running against a mocked axios client. This is Task 2's <human-check> in 05-02-PLAN.md."

# Metrics
duration: ~10min
completed: 2026-09-02
status: complete
---

# Phase 05 Plan 02: Service Alerts Gap Closure Summary

**Fixed the confirmed `gtfs-rt-alerts/v2` DASH/Swiftly endpoint path (closing G-05-1's live 404), corrected `deriveActiveWindow`'s silent open-ended-window collapse, and hardened `fetchAlerts()` against malformed upstream response shapes.**

## Performance

- **Duration:** ~10 min
- **Tasks:** 2
- **Files modified:** 3
- **Commits:** 5

## Accomplishments

- `ServiceAlertService.buildDashApiUrl()` now targets `/real-time/{agency}/gtfs-rt-alerts/v2` — the endpoint the user confirmed directly from Swiftly's own API reference docs — replacing the disproven `/service-alerts` path that 404'd against the live API (G-05-1)
- `deriveActiveWindow` now preserves an open-ended (never-expiring) active window whenever ANY contributing `active_period` entry lacks an `end`, instead of silently collapsing to a bounded end taken from a different period in the same array (WR-03)
- `fetchFromDashApi()` now throws `UpstreamApiError` when the DASH response body itself is `null` or a non-object value, instead of an unhandled, low-signal `TypeError` from later `.entity` access (WR-01)
- `fetchAlerts()` now validates every entity item via a new `isValidDashAlertEntity` type guard before mapping, rejecting with `UpstreamApiError` when an item is `null`, missing `alert`, or has an explicitly `null` `alert` (WR-02)
- `.planning/phases/05-service-alerts-ingestion/05-01-PLAN.md`'s five stale references to the disproven `/service-alerts` path corrected so the historical planning record no longer contradicts the shipped implementation

## Task Commits

Each task followed RED → GREEN TDD cycles, one commit per phase:

1. **Task 1 RED: add failing test for gtfs-rt-alerts/v2 path and WR-03 open-ended collapse** - `bf90c0a` (test)
2. **Task 1 GREEN: fix confirmed gtfs-rt-alerts/v2 endpoint and open-ended window collapse (WR-03)** - `8cda063` (feat)
3. **Task 2 RED: add failing tests for malformed response body and entity guards (WR-01, WR-02)** - `64c4435` (test)
4. **Task 2 GREEN: harden fetchAlerts() against malformed upstream responses (WR-01, WR-02)** - `2f68347` (feat)
5. **Task 2 acceptance-criteria gap closure: prove isValidDashAlertEntity rejects an explicit null alert (WR-02)** - `095b3f6` (test)

## Files Created/Modified

- `src/server/api/services/ServiceAlertService.ts` - Corrected endpoint path, WR-03 open-ended-window fix, WR-01/WR-02 defensive response-shape guards
- `src/server/api/services/ServiceAlertService.test.ts` - Renamed/updated URL-assertion test, added WR-03 mixed-boundedness test and five WR-01/WR-02 malformed-response tests (18 tests total, up from 13)
- `.planning/phases/05-service-alerts-ingestion/05-01-PLAN.md` - Corrected all five stale `/service-alerts` path references (frontmatter `key_links`, flagged assumption 7, Task 1 `<behavior>`, `<action>`, and `<acceptance_criteria>`)

## Decisions Made

- Used the user-confirmed endpoint path verbatim (`/real-time/{agency}/gtfs-rt-alerts/v2`) from Swiftly's own API reference docs per `.planning/debug/service-alerts-404.md` — root cause was already CONFIRMED, no re-diagnosis performed.
- `isValidDashAlertEntity` explicitly checks `alert !== null` in addition to `typeof alert === "object"`, since `typeof null === "object"` in JavaScript would otherwise let a `null` `alert` field slip past the guard and crash inside `mapToServiceAlert`'s destructuring.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a Biome formatting violation (line-width) introduced by the WR-02 guard**
- **Found during:** Task 2 (harden fetchAlerts against malformed responses)
- **Issue:** The new `entity item is malformed` `UpstreamApiError` throw statement exceeded Biome's 120-char line width as a single-line statement.
- **Fix:** Ran `bunx biome check --write` on the modified file, which reformatted the throw statement onto multiple lines per the project's Biome config.
- **Files modified:** `src/server/api/services/ServiceAlertService.ts`
- **Verification:** `bunx biome check src/server/api/services/ServiceAlertService.ts` reports zero errors/warnings after the fix.
- **Committed in:** `2f68347` (Task 2 GREEN commit)

**2. [Rule 1 - Bug] Added a test proving `isValidDashAlertEntity` rejects an explicit `null` `alert`, closing a gap in Task 2's acceptance criteria**
- **Found during:** Task 2 acceptance-criteria verification gate
- **Issue:** Task 2's acceptance criteria explicitly required proof that `isValidDashAlertEntity` "rejects an entity whose `alert` field is `null`, not just `undefined` or a missing key" — but the four tests specified in the task's `<action>` only covered a *missing* `alert` key, not an explicitly `null` one. The guard code itself already handled this case correctly (implemented in the same commit), but no test asserted it.
- **Fix:** Added a fifth test (`rejects with UpstreamApiError when an entity item's alert property is explicitly null (WR-02)`) asserting `{ data: { entity: [{ id: "x", alert: null }] } }` rejects with `UpstreamApiError`. Test passed immediately (guard was already correct), confirming this was a coverage gap, not an implementation bug.
- **Files modified:** `src/server/api/services/ServiceAlertService.test.ts`
- **Verification:** `bun run test -- src/server/api/services/ServiceAlertService.test.ts` — 18/18 pass.
- **Committed in:** `095b3f6`

---

**Total deviations:** 2 auto-fixed (1 formatting, 1 acceptance-criteria test-coverage gap)
**Impact on plan:** Both auto-fixes are within the plan's declared scope (Task 2's own acceptance criteria and this codebase's Biome formatting requirement). No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `ServiceAlertService`/`ServiceAlertRepository`/`ServiceAlertPollService` now target the confirmed, correct DASH/Swiftly endpoint and are hardened against malformed upstream responses — ready for a live boot verification.
- **Remaining human verification (Task 2's `<human-check>`, not runnable by this executor):** Boot the real server (`bun run dev-server` or `bun run start-server`) against the live DASH/Swiftly API and confirm no `Failed to poll service alerts` error is logged, closing gap G-05-1 end-to-end. This is the sole outstanding item before this gap-closure plan can be considered fully verified in production conditions — all automated verification (250/250 unit tests, full build, coverage above threshold) already passes.
- Phase 6 (or whichever phase embeds alerts into route/stop/prediction responses) can proceed on the now-corrected `ServiceAlertService`/`ServiceAlertRepository` contract with no further changes expected.

---
*Phase: 05-service-alerts-ingestion*
*Completed: 2026-09-02*

## Self-Check: PASSED

- FOUND: `.planning/phases/05-service-alerts-ingestion/05-02-SUMMARY.md`
- FOUND: `src/server/api/services/ServiceAlertService.ts`
- FOUND: `src/server/api/services/ServiceAlertService.test.ts`
- FOUND commits: `bf90c0a`, `8cda063`, `64c4435`, `2f68347`, `095b3f6`, `4278527`
- Re-ran plan-level `<verification>`: `bun run test` (250/250 pass), `bun run build` (clean), `bun run test:coverage` (98.08% stmts / 94.18% branch / 97.77% funcs / 98.08% lines, above 80% threshold)
