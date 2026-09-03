---
phase: 05-service-alerts-ingestion
plan: 05
subsystem: api
tags: [dash-api, service-alerts, axios, gtfs-rt, bugfix]

# Dependency graph
requires:
  - phase: 05-service-alerts-ingestion (05-04)
    provides: WR-01 array-root body guard and prior JSON.parse string-body fallback in ServiceAlertService
provides:
  - ServiceAlertService.buildDashApiUrl() requests format=json from the DASH/Swiftly gtfs-rt-alerts/v2 endpoint, fixing the true root cause of the "malformed body"/"string body failed JSON.parse" failures seen in G-05-2 and G-05-4
  - Removed a stray console.log debug artifact from fetchFromDashApi()'s string-body branch
  - Documented (via inline comment) why the JSON.parse string-body fallback is still needed even with format=json requested
  - Regression test proving headerText, descriptionText, and url all map correctly together from a fully-populated alert fixture
affects: [06-alert-embedding, service-alerts-uat-reverify]

# Actuals (#2632)
actuals:
  tokens: 908
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns: ["URLSearchParams for DASH API query strings, mirroring PredictionService.buildDashApiUrl()"]

key-files:
  created: []
  modified:
    - src/server/api/services/ServiceAlertService.ts
    - src/server/api/services/ServiceAlertService.test.ts

key-decisions:
  - "Requested format=json explicitly via URLSearchParams rather than assuming JSON is the default encoding — Swiftly's gtfs-rt-alerts/v2 endpoint defaults to protobuf binary, which was the true root cause of every prior 'malformed body' failure."
  - "Kept the JSON.parse string-body fallback from 05-03 instead of removing it now that format=json is requested — it still guards a real case (JSON text served under a non-application/json Content-Type, which skips axios's default JSON transform) and is now documented inline instead of looking like dead code."

patterns-established:
  - "DASH API query-string construction always goes through URLSearchParams (PredictionService and now ServiceAlertService both follow this)."

requirements-completed: [ALRT-01]

coverage:
  - id: D1
    description: "buildDashApiUrl() requests format=json from the DASH/Swiftly gtfs-rt-alerts/v2 endpoint"
    requirement: "ALRT-01"
    verification:
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#calls the DASH API with a URL containing format=json"
        status: pass
    human_judgment: false
  - id: D2
    description: "Stray console.log debug statement removed from fetchFromDashApi()'s string-body branch"
    verification:
      - kind: other
        ref: "grep -c \"console.log\" src/server/api/services/ServiceAlertService.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "JSON.parse string-body fallback retained with explanatory comment"
    verification:
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#parses a JSON-encoded string response body and maps the alert correctly"
        status: pass
    human_judgment: false
  - id: D4
    description: "headerText, descriptionText, and url all map correctly together from a fully-populated alert fixture"
    requirement: "ALRT-01"
    verification:
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#maps headerText, descriptionText, and url all together from a fully-populated, realistic alert payload"
        status: pass
    human_judgment: false
  - id: D5
    description: "Live-boot re-verification against the real DASH/Swiftly API confirms the poll no longer fails and real alert fields populate"
    verification: []
    human_judgment: true
    rationale: "Requires an authenticated request against the live, non-mocked DASH/Swiftly API and human observation of server startup logs and in-memory repository state while a real alert happens to be active — not reproducible by an automated unit test running against a mocked axios client."

# Metrics
duration: 12min
completed: 2026-09-03
status: complete
---

# Phase 05 Plan 05: Request format=json from DASH Service Alerts Endpoint Summary

**Fixed the true root cause of G-05-2/G-05-4 by requesting `format=json` from Swiftly's gtfs-rt-alerts/v2 endpoint (which defaults to protobuf binary), removed a leftover debug `console.log`, and added a regression test proving headerText/descriptionText/url all map correctly together.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-09-03T15:46:00Z
- **Completed:** 2026-09-03T15:58:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `buildDashApiUrl()` now appends `format=json` via `URLSearchParams`, mirroring `PredictionService.buildDashApiUrl()`'s existing convention, so the DASH/Swiftly API returns a JSON body instead of defaulting to protobuf binary — this is the actual root cause behind every "malformed body"/"string body failed JSON.parse" failure seen across G-05-2 and G-05-4.
- The stray `console.log(body)` debug artifact in `fetchFromDashApi()`'s string-body branch is gone; the branch is clean, with an inline comment explaining why the retained `JSON.parse` fallback is still a real guard (non-`application/json` `Content-Type` responses skip axios's JSON transform) rather than dead code.
- Added a new regression test proving `headerText`, `descriptionText`, and `url` all map correctly together from one fully-populated, realistic alert fixture — closing UAT Test 2's field-shape check at the code level, which could not run previously because every poll failed before reaching the mapping code.
- Added a regression test asserting the `format=json` query parameter is present on every outgoing request.
- Zero regressions: full workspace suite (255 tests) and `bun run build` both pass; coverage remains at 98.1% overall (well above the 80% threshold).

## Task Commits

Each task was committed atomically:

1. **Task 1: Request format=json from the DASH gtfs-rt-alerts/v2 endpoint and remove the debug console.log** - `5b06404` (fix)
2. **Task 2: Regression test for full headerText/descriptionText/url field-shape mapping** - `0334f50` (test)

**Plan metadata:** (this SUMMARY commit)

## Files Created/Modified

- `src/server/api/services/ServiceAlertService.ts` - `buildDashApiUrl()` now requests `format=json`; stray debug `console.log` removed; JSON.parse fallback documented with a comment
- `src/server/api/services/ServiceAlertService.test.ts` - two new tests: format=json URL assertion, and full headerText/descriptionText/url field-shape mapping from a realistic fixture

## Decisions Made

- Requested `format=json` explicitly via `URLSearchParams` (matching `PredictionService`'s existing pattern) rather than assuming JSON was ever the default encoding — per Swiftly's own API docs, `gtfs-rt-alerts/v2` defaults to protobuf binary, and this was the true root cause missed by 05-02/05-03/05-04's JSON-shape-only fixes.
- Kept the `JSON.parse` string-body fallback from 05-03 unchanged rather than removing it now that JSON is explicitly requested — documented inline why it's still a real guard, not dead code, per the plan's threat register (T-05-11, disposition: accept).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The stray uncommitted debug `console.log` mentioned in the orchestrator's context note was already absent from this worktree's `ServiceAlertService.ts` at start (confirmed via `git diff`), consistent with the note that it had been discarded before dispatch.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- ALRT-01's fetch pipeline now requests the correct encoding from the live DASH/Swiftly API; the human live-boot re-check (UAT Tests 1 and 2, documented in Task 2's `<human-check>`) is ready to run to confirm no more "Failed to poll service alerts" errors and that real alert fields populate with actual feed text.
- No blockers. Phase 05 gap closure (G-05-4) is code-complete pending the human live-boot re-verification pass.

---
*Phase: 05-service-alerts-ingestion*
*Completed: 2026-09-03*

## Self-Check: PASSED

- FOUND: `.planning/phases/05-service-alerts-ingestion/05-05-SUMMARY.md`
- FOUND: commit `5b06404` (Task 1)
- FOUND: commit `0334f50` (Task 2)
- FOUND: commit `cf593f3` (SUMMARY)
