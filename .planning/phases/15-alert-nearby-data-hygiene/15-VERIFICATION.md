---
phase: 15-alert-nearby-data-hygiene
verified: 2026-10-07T19:15:45Z
status: human_needed
score: 20/20 must-haves verified
covered_files:
  - .planning/REQUIREMENTS.md
  - .planning/phases/15-alert-nearby-data-hygiene/15-01-PLAN.md
  - .planning/phases/15-alert-nearby-data-hygiene/15-01-SUMMARY.md
  - .planning/phases/15-alert-nearby-data-hygiene/15-02-PLAN.md
  - .planning/phases/15-alert-nearby-data-hygiene/15-02-SUMMARY.md
  - src/server/api/models/ServiceAlert.ts
  - src/server/api/routes/alertHygiene.test.ts
  - src/server/api/routes/predictionRoutes.test.ts
  - src/server/api/services/NearbyPredictionService.test.ts
  - src/server/api/services/NearbyPredictionService.ts
  - src/server/api/services/ServiceAlertService.test.ts
  - src/server/api/services/ServiceAlertService.ts
covered_digest: "v1:sha256:aca9950f8aba49563c630fb7b8ce3ba1900382615a430508e0cd8eba68c31c34"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Developer decision on CR-01 / plan assumption 15-01 A1: a structurally malformed alert (activePeriods [null], {}, 5 or \"abc\"; informedEntities [null] or {}) still makes fetchAlerts() reject with a TypeError, so the poll fails and the previous alert snapshot keeps serving. That snapshot can include an alert DASH has since soft-deleted."
    expected: "Pick one. (a) Accept: record that structural breaks fail the whole poll, as D-07 already does for an id-less entity, by adding an override for the 'structural alert malformation' item, or by adding a D-16 to 15-CONTEXT.md. (b) Reject: schedule gap closure with /gsd-plan-phase 15 --gaps so a structurally malformed entity is dropped and warned per alert, like a bad date."
    why_human: "No locked decision covers this. D-03 defines 'malformed' only for start/end values, D-07 covers only a missing id, and the plan raised it as an unconfirmed assumption (A1, 'Confirm, or schedule per-alert dropping'). The behavior is not a regression: f3b96d4 throws on the same inputs. Whether it falls inside 'never shown alerts DASH has deleted' is a scope call for the product owner."
---

# Phase 15: Alert & Nearby Data Hygiene Verification Report

**Phase Goal:** Riders are never shown alerts that DASH has deleted or whose dates can't be trusted, and never shown nearby-prediction stops with missing or garbled names.
**Verified:** 2026-10-07T19:15:45Z
**Status:** human_needed (all must-haves verified; one escalated scope decision)
**Re-verification:** No (initial verification)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1 / ALRT-12: an alert with any non-null `deletedAt` never appears on route, stop, nearby-stop or nearby-prediction responses, even while its window is active | ✓ VERIFIED | `ServiceAlertService.ts:58-60` `isDeleted`, loop at `:155-158`. All alert consumers (`BusRouteService:20`, `StopService:23,55`, `NearbyPredictionService:161`) read only `ServiceAlertRepository.getActiveAlertsFor*`, whose only writer is `ServiceAlertPollService:23-24` -> `fetchAlerts()`, so there is one choke point. E2E `alertHygiene.test.ts:163` checks all five endpoints over a fake DASH and passed in this run. See the CR-01 caveat below. |
| 2 | SC2 / ALRT-13: an alert with a malformed `activePeriod` date is excluded from every response and logged with its id | ✓ VERIFIED | `findMalformedBound` (`:69-79`) plus warn and `continue` (`:159-165`). Unit table `ServiceAlertService.test.ts:448+` (7 rows). The E2E asserts exactly one warn, "Dropping service alert alert-bad-start ...", and that the alert is absent from all five endpoints. |
| 3 | SC3 / NEAR-12: a nearby entry with missing or mistyped route/stop/destination names or IDs (or `agencyKey`) is dropped with the existing single warn; valid entries are still returned | ✓ VERIFIED | `NearbyPredictionService.ts` `isValidNearbyEntry`: `isNonEmptyString` on routeId, routeName, routeShortName, stopId, stopName; `isFiniteNumber(stopCode)`; non-empty directionId and headsign on every destination. `agencyKey` is still rejected by `parseDashResponse`. 28 new unit rows plus a 5-row route-level `it.each`, where the leaked stop would sort first at 12 m. |
| 4 | SC4: well-formed alerts and nearby entries are served exactly as before | ✓ VERIFIED | `git diff f3b96d4` on the three edited test files removes only one import line, so every pre-existing test body is unchanged and all pass. The E2E pins the alert summary `{id,cause,effect,headerText,descriptionText,activePeriod}`. The live sample 548/561/949 is unchanged. |
| 5 | D-01: a malformed-date alert drops only itself; the real poll keeps applying the rest | ✓ VERIFIED | The real-poll E2E `alertHygiene.test.ts:216` (old -> new set while `alert-bad-end` is present, `errorSpy` not called) passed |
| 6 | D-02: one bad period drops the whole alert | ✓ VERIFIED | "one bad start/end among good periods" rows |
| 7 | D-03: malformed = present and (non-string or NaN-parse); null/undefined = unbounded; non-ISO parseable kept and normalized | ✓ VERIFIED | `isParseableDate` `:62-64`; numeric/object/empty rows; RFC 2822 normalization test; null/omitted test |
| 8 | D-04: one stateless, message-only warn naming the id and bound | ✓ VERIFIED | "warns again on every fetch", "never puts the raw date value ..." tests |
| 9 | D-05: filtering only at ingestion; `ServiceAlert` gains no deletion field | ✓ VERIFIED | `ServiceAlert.ts:6-16` unchanged; only `DashAlertEntity.deletedAt?: unknown` was added |
| 10 | D-06: repository byte-identical; only null or round-trippable ISO bounds emitted | ✓ VERIFIED | `git diff --stat f3b96d4 -- ServiceAlertRepository.ts ServiceAlertPollService.ts` is empty; D-06 invariant test at `:566` |
| 11 | D-07: an id-less or null entity still rejects with UpstreamApiError | ✓ VERIFIED | `:141-145` kept; pre-existing rows pass |
| 12 | D-08: any non-null `deletedAt` deletes; the value is never parsed; `deletedBy` ignored | ✓ VERIFIED | 7-row table (past, future, garbled, "", 0, {}, true); null and omitted kept; `deletedBy` not modeled |
| 13 | D-09: soft-deleted drops are silent | ✓ VERIFIED | `mockLoggerWarn` not called in the ALRT-12 rows; E2E `warnSpy` not called |
| 14 | D-10: the deleted check runs before date validation | ✓ VERIFIED | Loop order `:156` before `:159`; "drops a deleted alert with a malformed date without warning (D-10)" |
| 15 | D-11: four new string fields use stopId's rule via `isNonEmptyString` | ✓ VERIFIED | Source plus a 16-row flatMap table |
| 16 | D-12: stopCode must be finite; 0, -1 and 4000858.5 are kept | ✓ VERIFIED | 5 drop rows and 3 keep rows |
| 17 | D-13: destination directionId and headsign must be non-empty; one bad destination drops the entry | ✓ VERIFIED | 7 destination rows, including the bad-second-destination row |
| 18 | D-14: warn, `describeEntry` and `filterValidEntries` unchanged; boolean predicate | ✓ VERIFIED | Region diffs against f3b96d4 are SAME for describeEntry, filterValidEntries, parseDashResponse and groupByStop; exact warn strings pinned, with no LAT/LNG |
| 19 | D-15: agencyKey guard unchanged, coverage present | ✓ VERIFIED | `parseDashResponse` identical; rows at `NearbyPredictionService.test.ts:473,477` |
| 20 | NEAR-12 edges: empty string drops; no trim or normalization | ✓ VERIFIED | `isNonEmptyString` is `typeof === "string" && !== ""` |

**Score:** 20/20 truths verified (0 present, behavior-unverified)

### Escalated item: CR-01 (structurally malformed alert still fails the whole poll)

**Reproduced against the real code.** I ran a temporary probe test, since deleted, through the real `fetchAlerts()` with one good alert and one bad alert:

| Bad alert shape | Result |
|---|---|
| `activePeriods: [null]` | REJECTED `TypeError: Cannot read properties of null (reading 'start')` |
| `activePeriods: {}` / `5` | REJECTED `TypeError: (periods ?? []) is not iterable` |
| `activePeriods: "abc"` | REJECTED `TypeError: periods.map is not a function` (passes `findMalformedBound`) |
| `informedEntities: [null]` | REJECTED `TypeError: Cannot read properties of null (reading 'routeId')` |
| `informedEntities: {}` | REJECTED `TypeError: ... .map is not a function` |
| `deletedAt: "x", activePeriods: [null]` | resolved `["good"]` (the deleted check runs first) |

**Classification: WARNING, escalated for a developer decision. Not a BLOCKER.** My reasoning:
- **Outside the locked decisions as written.** D-03 defines "malformed date" over `start`/`end` *values*, and the implementation matches that definition exactly. D-07 sets the precedent that a structural entity break fails the whole poll. Plan 15-01 surfaced this exact class as flagged assumption A1 ("Confirm, or schedule per-alert dropping for it too"), and the summary carries it forward unresolved. No roadmap SC or plan truth asserts that structurally broken entities are dropped per alert.
- **Not a regression.** f3b96d4 throws on the same inputs.
- **It does touch the goal's spirit.** D-01's rationale ("one bad record must not freeze every update") applies just as well here. While the poll is frozen, an alert DASH has since soft-deleted keeps serving from the previous snapshot, which is the failure SC1 is meant to prevent. The same staleness also happens on any DASH timeout or id-less entity, so SC1 cannot be absolute against poll failures under the accepted architecture.
- **Wrong comment.** The model comment `ServiceAlert.ts:18` ("Upstream values are validated in ServiceAlertService before use") overstates what is validated: only bound values are.

If accepted, record it with an override:

```yaml
overrides:
  - must_have: "structurally malformed alert entity (activePeriods/informedEntities not an array of objects) fails the whole poll"
    reason: "Structural break, same class as D-07; not a regression from f3b96d4; plan assumption A1 confirmed"
    accepted_by: "{name}"
    accepted_at: "{ISO timestamp}"
```

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/server/api/models/ServiceAlert.ts` | `deletedAt?: unknown`; bounds `unknown` | ✓ VERIFIED | Present; `ServiceAlert` unchanged |
| `src/server/api/services/ServiceAlertService.ts` | isDeleted / isParseableDate / findMalformedBound and the ingestion loop | ✓ VERIFIED | Wired into `fetchAlerts`, which `app.ts:37-38` wires via the poll |
| `src/server/api/services/ServiceAlertService.test.ts` | ALRT-12 and ALRT-13 tables, D-06 invariant | ✓ VERIFIED | Passing |
| `src/server/api/routes/alertHygiene.test.ts` | Fake-DASH E2E over 5 endpoints plus real poll | ✓ VERIFIED | 3 tests, passing |
| `src/server/api/services/NearbyPredictionService.ts` | `isNonEmptyString` and the extended guard | ✓ VERIFIED | Used in `filterValidEntries` before `groupByStop` |
| `src/server/api/services/NearbyPredictionService.test.ts` | Display-field, stopCode and warn tests | ✓ VERIFIED | Passing |
| `src/server/api/routes/predictionRoutes.test.ts` | Route-level "never serves a nearby stop built from ..." | ✓ VERIFIED | 5 rows, passing |

`gsd-tools verify.artifacts`: 4/4 for 15-01 and 3/3 for 15-02, all passed.

### Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| ServiceAlertService | ServiceAlert model | `entity.deletedAt` read unparsed | ✓ WIRED |
| fetchAlerts | findMalformedBound | `findMalformedBound(entity.activePeriods)` before `mapToServiceAlert` | ✓ WIRED |
| ServiceAlertPollService | ServiceAlertService | `service.fetchAlerts()` -> `repository.applyAlerts` | ✓ WIRED |
| alertHygiene.test.ts | test/app.ts | `request(app)` over the fake DASH | ✓ WIRED |
| filterValidEntries | isValidNearbyEntry | `const valid = isValidNearbyEntry(entry);` | ✓ WIRED |
| groupByStop / mapToRoutePrediction | guarded fields | `name: entry.stopName` after the guard | ✓ WIRED |

`gsd-tools verify.key-links` reports all links verified.

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|---|---|---|---|---|
| Route, stop and nearby alert lists | `alerts` | `ServiceAlertRepository.getActiveAlertsFor*` <- `applyAlerts(fetchAlerts())` <- DASH `gtfs-rt-alerts/v2` | Yes | ✓ FLOWING |
| Nearby stops | `name`, `code`, routes | DASH `predictions-near-location` -> `parseDashResponse` -> `filterValidEntries` -> `groupByStop` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Phase test files (ALRT-12/13 units, 5-endpoint E2E, real-poll E2E, NEAR-12 units and route rows) | `bun run test -- ServiceAlertService.test.ts alertHygiene.test.ts NearbyPredictionService.test.ts predictionRoutes.test.ts` | 4 files, 169 tests passed, no type errors | ✓ PASS |
| CR-01 structural shapes | Temporary probe test through the real `fetchAlerts()` (deleted afterwards; `git status` clean) | 6 shapes reject with TypeError | ⚠ escalated |
| Repository and poll untouched (D-06) | `git diff --stat f3b96d4 -- ServiceAlertRepository.ts ServiceAlertPollService.ts` | empty | ✓ PASS |
| D-14/D-15 regions byte-identical | sed region compare against `git show f3b96d4:` | 4/4 SAME | ✓ PASS |

The orchestrator's post-execution gate reported `bun run build` exit 0 and `bun run test` 51 files / 807 tests passed. I did not re-run the full suite.

### Probe Execution

No probes declared, and no `scripts/*/tests/probe-*.sh` exists. SKIPPED.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| ALRT-12 | 15-01 | Alerts carrying `deletedAt` never surfaced on route, stop or nearby-prediction responses | ✓ SATISFIED | Truths 1, 9, 12-14 |
| ALRT-13 | 15-01 | Malformed `activePeriod` date excluded and logged, not treated as active | ✓ SATISFIED | Truths 2, 5-8, 10 |
| NEAR-12 | 15-02 | Nearby guard drops entries with missing or mistyped display fields (incl. `agencyKey`) | ✓ SATISFIED | Truths 3, 15-20 |

REQUIREMENTS.md maps exactly these three IDs to Phase 15 (lines 86-88). No requirement is orphaned.

### Prohibitions (test-tier)

| Prohibition | Enforcement evidence | Disposition |
|---|---|---|
| ALRT-12: no deletion metadata in summaries or logs | E2E asserts no "deletedAt", "deletedBy" or "dash-admin" in any of the 5 bodies; ALRT-12 rows assert no warn; `ServiceAlert` has no deletion field | verified (wired test) |
| ALRT-13: no guessed or repaired window (no numeric-epoch coercion, no skipping bad periods, no widening) | Numeric/object bound rows dropped; "one bad X among good periods" rows dropped | verified (wired test) |
| NEAR-12: no placeholder, coerced or fabricated display field | Numeric, null and empty rows drop the entry; route rows assert every served `name` is a non-empty string | verified (wired test) |
| NEAR-12: no rider coordinates or raw entry in the drop warn | Exact warn string asserted, with no LAT/LNG text | verified (wired test) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `ServiceAlertService.ts` | 69-79, 90, 106-112 | Container and elements of `activePeriods`/`informedEntities` trusted (CR-01) | ⚠️ Warning (escalated) | A structural break fails the whole poll; see above |
| `models/ServiceAlert.ts` | 18 | Comment claims upstream values are validated before use; only bound values are | ℹ️ Info | Misleading for maintainers |
| `ServiceAlertService.ts` | 90-98 | Open `start` ignored when another period has a start (review WR-01) | ℹ️ Info | Pre-existing at f3b96d4; SC4 requires unchanged behavior; narrows the window, never widens it |
| `ServiceAlertService.ts` | 62-64 | `new Date(s)` lenient and TZ-dependent for zone-less strings (review WR-02) | ℹ️ Info | Explicitly allowed by locked D-03 ("strict ISO not required") |
| `ServiceAlertService.ts` | 114-120 | Alert text fields not type-checked (review WR-03) | ℹ️ Info | Out of scope for ALRT-12/13 and NEAR-12 |
| `NearbyPredictionService.ts` | guard | A whitespace-only name (" ") passes (15-02 A1) | ℹ️ Info | Locked by D-11 (stopId rule, no trim) |

There are no TBD/FIXME/XXX/TODO/HACK markers in the modified files.

### Human Verification Required

### 1. Decide the scope of CR-01 (plan assumption 15-01 A1)

**Test:** Review the reproduction table above. Decide whether a structurally malformed alert entity should keep failing the whole poll (same as D-07) or be dropped per alert with a warn (same as D-01).
**Expected:** Either an override or D-16 recording acceptance, or `/gsd-plan-phase 15 --gaps` to add per-alert structural validation. The review's suggested fix types `activePeriods`/`informedEntities` as `unknown` and validates array-of-records per entity, with test rows for `[null]`, `{}`, `"abc"` and `informedEntities: [null]`.
**Why human:** No locked decision covers it, and the plan raised it as an open assumption. It is not a regression, but it bears on whether since-deleted alerts can keep serving.

### Gaps Summary

No must-have truth failed. ALRT-12, ALRT-13 and NEAR-12 are implemented at the single ingestion and guard choke points, wired into the live app, and proven by passing unit and fake-DASH end-to-end tests across all five alert-bearing endpoints and the real poll. Repository, poll and nearby helper regions are verifiably untouched.

The one open item is CR-01. I confirmed it against the real code: a structurally malformed alert (not a malformed date value) still fails the whole poll and leaves the previous snapshot serving. It falls outside D-03's definition and mirrors the D-07 precedent, and the plan explicitly flagged it as an assumption needing confirmation. So it is escalated for a developer decision rather than counted as a failed truth. If the developer decides it belongs in this phase's goal, it becomes a gap-closure plan for ServiceAlertService structural validation.

---

_Verified: 2026-10-07T19:15:45Z_
_Verifier: Claude (gsd-verifier)_
