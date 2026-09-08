---
phase: 05-service-alerts-ingestion
plan: 06
subsystem: api
tags: [gtfs-rt, dash-api, axios, service-alerts]

requires:
  - phase: 05-service-alerts-ingestion
    provides: ServiceAlertService, ServiceAlertRepository, ServiceAlertPollService (05-01 through 05-05)
provides:
  - "fetchFromDashApi() accepts the real live top-level shape (bare array) and the pre-existing object-envelope shape"
  - "DashAlertEntity/DashActivePeriod/DashInformedEntity rewritten to match the confirmed flat, camelCase, ISO-8601 live payload"
  - "mapToServiceAlert() and deriveActiveWindow() updated for the flat shape (no alert sub-object, ISO strings instead of unix seconds)"
affects: [phase-06-service-alerts-http-surface]

actuals:
  tokens: 9000
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Confirm unverified upstream shapes via a temporary diagnostic log gated behind a blocking human-action checkpoint, rather than guessing from unreliable API-reference examples"

key-files:
  created: []
  modified:
    - src/server/api/services/ServiceAlertService.ts
    - src/server/api/models/ServiceAlert.ts
    - src/server/api/services/ServiceAlertService.test.ts
    - src/server/api/repositories/ServiceAlertRepository.test.ts

key-decisions:
  - "The live gtfs-rt-alerts/v2?format=json response is a flat, custom Swiftly/Alexandria alerts format, not GTFS-RT-protobuf-derived JSON: no `alert` sub-object, no `translation` wrapper, camelCase field names, and activePeriods as ISO-8601 strings rather than unix-epoch seconds."
  - "fetchFromDashApi()'s guard now rejects only null and non-object primitives (arrays pass); it normalizes any accepted shape into the same {entities} contract fetchAlerts() already consumed, so fetchAlerts() itself needed no changes."
  - "ServiceAlertRepository.test.ts's end-to-end fixtures (outside this plan's declared files) were updated too — they used the old nested shape and were silently masking this same defect (both a 'currently active' and an 'expired' fixture alert both fell back to always-active once fetchFromDashApi() stopped reading anything from a now-nonexistent alert.* path)."

patterns-established: []

requirements-completed: [ALRT-01, ALRT-03]

coverage:
  - id: D1
    description: "fetchFromDashApi() accepts a bare top-level array body (or JSON-string form) as the entities list, still rejecting null/non-object primitives"
    requirement: ALRT-01
    verification:
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#resolves to an empty array when the response body is a bare, empty array-rooted value (G-05-5)"
        status: pass
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#maps a non-empty bare array-rooted body (no envelope) end-to-end (G-05-5)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The real live top-level shape and entity field shape were confirmed via a human-reported live-boot diagnostic capture, not re-guessed"
    verification: []
    human_judgment: true
    rationale: "Confirmation source is a human-pasted console log from a live boot against the real DASH/Swiftly API — not something a unit test can itself prove."
  - id: D3
    description: "fetchAlerts() resolves end-to-end against the confirmed live shape with headerText/descriptionText/url populated from real feed text, not undefined"
    requirement: ALRT-03
    verification:
      - kind: unit
        ref: "src/server/api/services/ServiceAlertService.test.ts#maps headerText, descriptionText, and url all together from a fully-populated, realistic alert payload matching the confirmed live shape"
        status: pass
      - kind: manual_procedural
        ref: "Live boot re-verification: user confirmed no 'Failed to poll service alerts' error and the diagnostic line is gone; no alert was currently active to visually confirm field text at that moment"
        status: pass
    human_judgment: true
    rationale: "No alert was active on the live feed at re-verification time, so the field-population claim rests on the unit test built from the actual captured live entity plus the user's confirmation that the poll itself now succeeds without error."

duration: 25min
completed: 2026-09-04
status: complete
---

# Phase 05-06: Close G-05-5 (confirmed live body-shape fix) Summary

**Rewrote ServiceAlertService's DASH response parsing against a confirmed live payload capture — the real feed is a flat, custom Swiftly format, not GTFS-RT-protobuf JSON as previously assumed.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-09-03
- **Completed:** 2026-09-04
- **Tasks:** 3 (1 auto, 1 human-action checkpoint, 1 auto/TDD)
- **Files modified:** 4

## Accomplishments
- Added a temporary `SERVICE-ALERTS-SHAPE-DIAG` diagnostic log, gated behind a blocking human-action checkpoint, to capture the real live response instead of guessing again (the mistake behind G-05-2 through G-05-4).
- Confirmed the live shape via the user's own boot capture: a bare top-level array of flat entities — no `alert` sub-object, no `translation` wrappers, camelCase `informedEntities[].routeId/stopId`, ISO-8601 `activePeriods[].start/end`.
- Rewrote `DashAlertEntity`/`DashActivePeriod`/`DashInformedEntity` in `ServiceAlert.ts` and `mapToServiceAlert()`/`deriveActiveWindow()` in `ServiceAlertService.ts` to match.
- Widened `fetchFromDashApi()`'s guard to accept array-rooted bodies (still rejecting `null` and non-object primitives), normalizing into the same `{entities}` contract `fetchAlerts()` already consumed.
- Removed the temporary diagnostic log now that the shape is permanently handled in code.
- Corrected `ServiceAlertService.test.ts`'s WR-01 array-rejection tests to assert success instead, and added a test built from the exact live-captured entity proving `headerText`/`descriptionText`/`url`/`informedRouteIds`/`informedStopIds` all populate correctly.
- Fixed `ServiceAlertRepository.test.ts`'s end-to-end fixtures (old nested shape) that were silently masking this same defect.

## Task Commits

1. **Task 1: Add a temporary diagnostic capture of the real response shape** - `3c48d44` (diag)
2. **Task 2: Capture the real live response shape via a human-run boot** - human-action checkpoint, no commit (user pasted the live console capture)
3. **Task 3: Implement the confirmed-shape fix, remove the diagnostic, correct the tests** - `4a25edd` (fix)

## Files Created/Modified
- `src/server/api/services/ServiceAlertService.ts` - guard widened to accept arrays; normalizes confirmed shape into `{entities}`; diagnostic log added then removed
- `src/server/api/models/ServiceAlert.ts` - `DashAlertEntity`/`DashActivePeriod`/`DashInformedEntity` rewritten flat/camelCase to match confirmed live shape
- `src/server/api/services/ServiceAlertService.test.ts` - WR-01 array tests corrected to assert success; new no-envelope and live-shape-derived tests added
- `src/server/api/repositories/ServiceAlertRepository.test.ts` - end-to-end fixtures updated to the confirmed flat shape

## Decisions Made
- The live payload is not GTFS-RT-protobuf-derived JSON at all — it's Swiftly/Alexandria's own flat REST-style alert format. This is a materially different (and larger) fix than the plan's task text anticipated ("adjust key name" / "array vs single translation object"), but the plan's evidence-first design (temporary diagnostic + blocking human checkpoint) meant the actual shape was coded against directly rather than guessed, so no further deviation checkpoint was needed.
- Extended the fix into `ServiceAlertRepository.test.ts`, outside this plan's declared `files_modified`, because its fixtures used the old nested shape and were silently producing a false-positive pass (both its "active" and "expired" fixture alerts fell back to always-active once the real code stopped reading anything from `entity.alert.*`). Leaving it broken would have violated the plan's own `bun run test` full-suite acceptance criterion.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule: correctness] Confirmed live shape required a full flat-model rewrite, not the incremental "adjust key/array-of-translation" tweak the plan anticipated**
- **Found during:** Task 3 (implementing the confirmed-shape fix)
- **Issue:** The plan's Task 3 instructions anticipated the nested `alert.header_text.translation[0].text` GTFS-RT paradigm would persist with minor variation. The confirmed live capture showed a completely flat, camelCase, no-`alert`-object, ISO-string-dates shape instead.
- **Fix:** Rewrote `DashAlertEntity`/`DashActivePeriod`/`DashInformedEntity` and their consumers (`mapToServiceAlert()`, `deriveActiveWindow()`) against the exact confirmed shape.
- **Files modified:** `src/server/api/services/ServiceAlertService.ts`, `src/server/api/models/ServiceAlert.ts`, `src/server/api/services/ServiceAlertService.test.ts`
- **Verification:** All 23 `ServiceAlertService.test.ts` tests pass; `bun run build` succeeds.
- **Committed in:** `4a25edd`

**2. [Rule: test-coverage] Fixed a hidden double bug in ServiceAlertRepository.test.ts's end-to-end test**
- **Found during:** Task 3 verification (`bun run test` full suite)
- **Issue:** `ServiceAlertRepository.test.ts`'s end-to-end test used the old nested `alert.active_period`/`alert.informed_entity` shape. Once `mapToServiceAlert()` stopped reading `entity.alert`, both its "active" and "expired" fixture entities silently normalized to `activePeriod: {start: null, end: null}` (always-active), so the test failed with 2 alerts surfaced instead of 1 — a genuine regression, not a pre-existing failure.
- **Fix:** Updated both fixture entities to the confirmed flat shape (`activePeriods`/`informedEntities` at top level, ISO-8601 date strings).
- **Files modified:** `src/server/api/repositories/ServiceAlertRepository.test.ts`
- **Verification:** Full `bun run test` suite passes (255/255).
- **Committed in:** `4a25edd`

---

**Total deviations:** 2 auto-fixed (1 correctness/shape rewrite, 1 test-coverage regression fix)
**Impact on plan:** Both were necessary consequences of coding against the real confirmed shape rather than the plan's anticipated guess. No scope creep beyond the plan's own acceptance criteria (full test suite + build must pass).

## Issues Encountered
- The live payload includes `deletedAt`/`deletedBy` fields that the current model ignores entirely. If the DASH admin tool soft-deletes alerts rather than removing them from the feed, a deleted-but-still-time-active alert could still surface via `getActiveAlerts()`. Out of scope for G-05-5 (which is about response-shape parsing, not soft-delete semantics) — flagged here for a possible follow-up gap/requirement.
- At final human-check re-verification, no alert was currently active on the live feed, so field-population (`headerText`/`descriptionText`/`url`) could not be visually re-confirmed against a live boot at that moment. Confidence rests on: (a) the user's earlier diagnostic capture, which included full real entities with these fields populated, and (b) the unit test built directly from that captured entity data.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ALRT-01 and ALRT-03 are now unblocked: the poll succeeds end-to-end against the live API with no malformed-body error, and alert text fields map correctly from confirmed real data.
- Phase 9 (client-facing HTTP surface, per 05-01's objective) can proceed against `ServiceAlertRepository.getActiveAlerts()` with confidence in the live shape.
- Suggested follow-up: confirm whether `deletedAt`/`deletedBy` need to be respected in `getActiveAlerts()` filtering before Phase 9 exposes alerts publicly.

---
*Phase: 05-service-alerts-ingestion*
*Completed: 2026-09-04*
