---
phase: 05-service-alerts-ingestion
plan: 03
subsystem: api
tags: [axios, gtfs-rt, service-alerts, json-parsing]

# Dependency graph
requires:
  - phase: 05-service-alerts-ingestion (05-02)
    provides: Corrected gtfs-rt-alerts/v2 endpoint path and WR-01/WR-02 malformed-response guards
provides:
  - Defensive JSON.parse fallback in fetchFromDashApi() for a string-encoded response.data
  - DashAlertsApiResponse.entities (renamed from entity) matching the live DASH/Swiftly payload shape
  - ServiceAlertService.fetchAlerts() now actually ingests real alerts from the live API instead of silently discarding them
affects: [06-service-alerts-embedding]

# Actuals (#2632)
actuals:
  tokens: 1844
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Defensive string-body JSON.parse fallback ahead of an existing non-null/typeof-object shape guard, using a local `body: unknown` variable rather than reassigning the axios response object"

key-files:
  created: []
  modified:
    - src/server/api/services/ServiceAlertService.ts
    - src/server/api/models/ServiceAlert.ts
    - src/server/api/services/ServiceAlertService.test.ts
    - src/server/api/repositories/ServiceAlertRepository.test.ts

key-decisions:
  - "Introduced a local `body: unknown` variable in fetchFromDashApi() instead of reassigning response.data, since response is a third-party axios object"
  - "Followed the plan's explicit RED->GREEN sequencing for the entity->entities rename: renamed test fixtures first, confirmed 13 tests failed against unmodified production code, then implemented the rename"

patterns-established:
  - "String-encoded upstream JSON bodies are parsed defensively (try/catch, never letting SyntaxError escape) before any object-shape validation runs"

requirements-completed: [ALRT-01, ALRT-02, ALRT-03, ALRT-04]

coverage:
  - id: D1
    description: "fetchFromDashApi() parses a JSON-encoded string response.data and fetchAlerts() maps it to ServiceAlert[] correctly, while a string that fails JSON.parse or the pre-existing null-body case still reject with UpstreamApiError"
    requirement: "ALRT-01"
    verification:
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#parses a JSON-encoded string response body and maps the alert correctly"
        status: pass
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#rejects with UpstreamApiError when the response body is a non-object value (WR-01)"
        status: pass
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#rejects with UpstreamApiError when the response body is null (WR-01)"
        status: pass
    human_judgment: false
  - id: D2
    description: "DashAlertsApiResponse and every fetchAlerts() read site use the live API's entities (plural) field instead of entity (singular), so real alerts are actually mapped instead of silently resolving to an empty list forever"
    requirement: "ALRT-01"
    verification:
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#maps a Dash alert entity with one active_period, one informed_entity, cause/effect, and translations"
        status: pass
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#rejects with UpstreamApiError when entities is present but not an array"
        status: pass
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#rejects with UpstreamApiError when an entity item is null (WR-02)"
        status: pass
      - kind: unit
        ref: "src/server/api/repositories/ServiceAlertRepository.test.ts#surfaces exactly the alerts active at fixedNow and nothing else"
        status: pass
    human_judgment: false
  - id: D3
    description: "A live server boot against the real DASH/Swiftly API no longer logs 'Failed to poll service alerts: DASH API returned a malformed service alerts response (body is not an object)', and any currently-active real alerts are actually ingested"
    verification: []
    human_judgment: true
    rationale: "Requires an authenticated request against the live, non-mocked DASH/Swiftly API and human observation of server startup logs and in-memory repository state — not reproducible by an automated unit test running against a mocked axios client (plan's own Task 2 human-check)."

# Metrics
duration: ~15min
completed: 2026-09-02
status: complete
---

# Phase 8 Plan 3: G-05-2 Service Alerts Malformed Body Gap Closure Summary

**Fixed two independent live-breaking bugs in ServiceAlertService: a defensive JSON.parse fallback for a string-encoded response body, and an `entity` -> `entities` field rename matching the live DASH/Swiftly payload shape**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-09-02
- **Completed:** 2026-09-02T14:09:30Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- `fetchFromDashApi()` now transparently parses a JSON-encoded string `response.data` (what axios produces when the upstream `Content-Type` isn't recognized as JSON) before the existing non-null/object-shape guard, closing the proximate cause of G-05-2's "body is not an object" error, without weakening either pre-existing WR-01 guard test.
- `DashAlertsApiResponse` and every `fetchAlerts()` read site renamed from `entity` (singular, GTFS-RT protobuf-JSON convention) to `entities` (plural, the confirmed live DASH/Swiftly shape) — previously real alerts silently and permanently resolved to an empty array via the "no alerts found" fallback, independent of the string-body bug.
- Both fixes proven by new/updated tests (string-body parsing test, `entities`-keyed mapping) while all pre-existing WR-01/WR-02 guard tests from 05-02 continue to pass, renamed only for the field.
- Full test suite (251 tests across 20 files) and `tsc` build both pass clean after the change.

## Task Commits

Each task was committed atomically:

1. **Task 1: JSON.parse fallback for a string-encoded response body in fetchFromDashApi()** - `3a5368a` (fix)
2. **Task 2: Rename entity -> entities to match the live API's top-level field** - `b812445` (fix)

**Plan metadata:** (this commit, docs: complete plan)

_Note: Both tasks were `tdd="true"`; the plan's action text specified an inline RED->GREEN sequence within each task rather than separate test/feat commits, so each task landed as a single fix commit containing both the test and the production fix, consistent with the plan's own commit guidance._

## Files Created/Modified
- `src/server/api/services/ServiceAlertService.ts` - `fetchFromDashApi()` string-body JSON.parse fallback via a local `body: unknown`; `fetchAlerts()` reads renamed from `response.entity` to `response.entities`
- `src/server/api/models/ServiceAlert.ts` - `DashAlertsApiResponse.entity` renamed to `entities`
- `src/server/api/services/ServiceAlertService.test.ts` - new string-body-parses test; `makeDashAlertsApiResponse` factory and four inline fixtures renamed to `entities`
- `src/server/api/repositories/ServiceAlertRepository.test.ts` - one inline `DashAlertsApiResponse` fixture renamed to `entities` (regression fix, outside plan's declared files)

## Decisions Made
- Used a local `body: unknown` variable in `fetchFromDashApi()` rather than reassigning `response.data`, since `response` is a third-party axios object — matches the plan's explicit guidance.
- Followed the plan's RED-first sequencing for Task 2: renamed test fixtures first, ran the suite to confirm 13 tests failed against the still-`entity`-reading production code, then applied the rename to `ServiceAlert.ts`/`ServiceAlertService.ts` and confirmed GREEN.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Renamed a fifth `entity`-keyed fixture in ServiceAlertRepository.test.ts, outside the plan's declared `files_modified`**
- **Found during:** Task 2, post-rename full-suite verification
- **Issue:** The plan's `files_modified` and Task 2's `<action>` only named four inline fixtures in `ServiceAlertService.test.ts` to rename. A fifth `DashAlertsApiResponse` literal (`{ entity: [activeEntity, expiredEntity] }`) in `ServiceAlertRepository.test.ts`'s end-to-end test was not covered by the plan text but broke immediately as a direct consequence of the same `entity` -> `entities` production rename — the same root cause, not a new/unrelated issue.
- **Fix:** Renamed the literal's key to `entities`, matching the exact same pattern applied elsewhere.
- **Files modified:** `src/server/api/repositories/ServiceAlertRepository.test.ts`
- **Verification:** `bun run test -- src/server/api/repositories/ServiceAlertRepository.test.ts src/server/api/services/ServiceAlertPollService.test.ts` passes (15/15), matching the plan's own `<verification>` regression-check requirement for these two files.
- **Committed in:** `b812445` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 - bug caused directly by this plan's own rename)
**Impact on plan:** Necessary to satisfy the plan's own stated regression-check verification step (`ServiceAlertRepository.test.ts`/`ServiceAlertPollService.test.ts` "passes with zero failures"). No scope creep — same rename, same root cause.

## Issues Encountered
None beyond the deviation above.

## Live Boot Human-Check (deferred, not automatable)

Task 2's `<verify>` includes a `<human-check>`: boot the real server against the live DASH/Swiftly API and confirm (a) no "Failed to poll service alerts" error is logged, and (b) any currently-active real alerts are actually ingested. This requires an authenticated request against the live, non-mocked upstream API and human observation of server logs/in-memory state — not reproducible in this automated execution context. All automated verification (unit tests, full suite, `tsc` build) passed; the live-boot check is recorded here as `human_judgment: true` (coverage D3) for the next UAT pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Both confirmed root causes of G-05-2 are closed with passing regression coverage; `ServiceAlertService`'s fetch -> normalize -> filter pipeline is code-complete against the live API's actual response shape.
- Recommend re-running UAT (live boot check) to close gap G-05-2 before considering Phase 05 fully verified — this SUMMARY records the automated side as done and flags the human-observation step as outstanding (coverage D3).

---
*Phase: 05-service-alerts-ingestion*
*Completed: 2026-09-02*

## Self-Check: PASSED
- FOUND: .planning/phases/08-service-alerts-ingestion/08-03-SUMMARY.md
- FOUND: src/server/api/services/ServiceAlertService.ts
- FOUND: src/server/api/models/ServiceAlert.ts
- FOUND commit: 3a5368a
- FOUND commit: b812445
