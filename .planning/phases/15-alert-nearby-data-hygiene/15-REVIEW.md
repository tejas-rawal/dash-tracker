---
phase: 15-alert-nearby-data-hygiene
reviewed: 2026-10-07T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - src/server/api/models/ServiceAlert.ts
  - src/server/api/routes/alertHygiene.test.ts
  - src/server/api/routes/predictionRoutes.test.ts
  - src/server/api/services/NearbyPredictionService.test.ts
  - src/server/api/services/NearbyPredictionService.ts
  - src/server/api/services/ServiceAlertService.test.ts
  - src/server/api/services/ServiceAlertService.ts
findings:
  critical: 1
  warning: 3
  info: 4
  total: 8
status: issues_found
---

# Phase 15: Code Review Report

**Reviewed:** 2026-10-07T00:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

I reviewed the alert ingestion filter in `ServiceAlertService`, which drops soft-deleted alerts and alerts with malformed dates, and the tightened nearby-entry guard in `NearbyPredictionService`. The happy paths and the covered edge cases (bad bound strings, garbled `deletedAt`, mistyped display fields) are correct, and the tests are thorough for the cases they list.

The alert validation boundary is drawn too narrowly, though. Only the `start`/`end` *values* became `unknown`. The `activePeriods` container, its elements, and `informedEntities` are still trusted. Any structural malformation there throws inside `fetchAlerts`, which fails the whole poll and freezes the store. That is the D-01 failure this phase set out to prevent, and it can keep a soft-deleted alert visible to riders. The collapse logic also has a start/end asymmetry, so a valid alert can be hidden. Date parsing depends on the server's timezone for non-ISO strings.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: A structurally malformed `activePeriods` or `informedEntities` throws and freezes the whole alert store (defeats D-01 / ALRT-12)

**File:** `src/server/api/services/ServiceAlertService.ts:69-79, 83-92, 106-112, 154-168` (types at `src/server/api/models/ServiceAlert.ts:19-27, 39-40`)
**Issue:** `findMalformedBound` and `deriveActiveWindow` assume `activePeriods` is an array of objects. `mapToServiceAlert` assumes the same of `informedEntities`. I checked each of these in Node:
- `activePeriods: [null]` gives `TypeError: Cannot read properties of null (reading 'start')` at line 71.
- `activePeriods: {}` or `activePeriods: 5` gives `TypeError: (periods ?? []) is not iterable` at line 70.
- `activePeriods: "abc"` passes `findMalformedBound`, because a string iterates as characters with `.start === undefined`. It then throws `periods.map is not a function` at line 90.
- `informedEntities: [null]` throws at lines 108/111. `informedEntities: {}` throws `.map is not a function`.

`isValidDashAlertEntity` (line 53) checks only `id`, so all of these reach the per-entity loop. The loop has no try/catch, so the exception escapes `fetchAlerts`. `ServiceAlertPollService.pollAlerts` catches it, logs an error and skips `applyAlerts`. The repository then keeps serving the previous snapshot until the feed is clean again. That snapshot can include alerts DASH has since soft-deleted (ALRT-12) or whose content has changed. D-01 says one bad alert "must not freeze every update", and the model comment says "Upstream values are validated in ServiceAlertService before use". Neither holds for these shapes. A related problem: `informedEntities: [{ routeId: null }]` passes the `!== undefined` filter at line 109, so `null` ends up in an array typed `string[]`.
**Fix:** Validate the whole alert structure per entity, and drop and warn on failure the same way bad dates are handled. Type the upstream containers as `unknown` so the compiler enforces this:
```ts
// ServiceAlert.ts
export interface DashAlertEntity {
    id: string;
    // ...
    activePeriods?: unknown;
    informedEntities?: unknown;
    deletedAt?: unknown;
}

// ServiceAlertService.ts
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function findMalformedPeriods(periods: unknown): string | undefined {
    if (periods === undefined || periods === null) return undefined;
    if (!Array.isArray(periods)) return "activePeriods";
    for (const period of periods) {
        if (!isRecord(period)) return "activePeriods";
        if (period.start != null && !isParseableDate(period.start)) return "activePeriods start date";
        if (period.end != null && !isParseableDate(period.end)) return "activePeriods end date";
    }
    return undefined;
}

// in mapToServiceAlert, after validating informedEntities is an array of records:
.filter((id): id is string => typeof id === "string" && id !== "")
```
Add test rows for `activePeriods: [null]`, `{}`, `"abc"`, and `informedEntities: [null]`. Each should drop only that alert and keep the others.

## Warnings

### WR-01: An open start in one period is ignored, so a currently active alert is hidden until another period's start

**File:** `src/server/api/services/ServiceAlertService.ts:90-98`
**Issue:** The end bound is handled symmetrically: `anyOpenEnded` forces `end: null` when any period is open-ended. The start bound has no matching check. `starts` simply filters out null starts, so for `[{ start: null, end: null }, { start: "2030-01-01T00:00:00Z", end: "2030-02-01T00:00:00Z" }]` the collapsed window is `{ start: "2030-01-01T00:00:00.000Z", end: null }`. I confirmed in Node that `starts` comes out as `["2030-01-01T00:00:00Z"]`. `ServiceAlertRepository.isAlertActive` then hides the alert until 2030, even though its first period is always active. This contradicts the D-02 "earliest start" intent, because an unbounded start is the earliest possible start. These lines were rewritten in this phase but the asymmetry was kept. The test "treats null and omitted bounds as unbounded" only passes because none of its periods has a start.
**Fix:**
```ts
const anyOpenStarted = periods.some((p) => p.start == null);
const starts = periods.map((p) => p.start).filter(isParseableDate);
// ...
start: !anyOpenStarted && starts.length > 0 ? new Date(Math.min(...)).toISOString() : null,
```
Add a test with one open-start period and one bounded future period.

### WR-02: `isParseableDate` accepts timezone-less and near-arbitrary strings, so the alert window depends on the server's timezone

**File:** `src/server/api/services/ServiceAlertService.ts:62-64`
**Issue:** `new Date(string)` is V8's lenient legacy parser. `new Date("1")` returns `2001-01-01` in local time, which I checked in Node. Strings without an offset, such as `"2025-03-09 13:00:00"` or `"03/09/2025"`, are read as local time. The same DASH payload therefore produces different `activePeriod` instants, and different active/inactive decisions, depending on the host's `TZ`. Junk-but-numeric values also count as valid dates instead of being dropped as malformed. D-03 relaxed strict ISO-8601, but this host-dependence is a side effect it does not mention.
**Fix:** Require an explicit zone: an ISO-8601 string with `Z` or a `±hh:mm` offset, or an RFC 2822 string with `GMT` or an offset. Treat anything else as malformed:
```ts
const ZONED = /(Z|[+-]\d{2}:?\d{2}|GMT|UTC)$/i;
function isParseableDate(value: unknown): value is string {
    return typeof value === "string" && ZONED.test(value.trim()) && !Number.isNaN(Date.parse(value));
}
```

### WR-03: Alert display fields are passed to riders without type checks, unlike the new nearby display-field guard

**File:** `src/server/api/services/ServiceAlertService.ts:114-120` (types at `src/server/api/models/ServiceAlert.ts:34-38`)
**Issue:** This phase made nearby entries require non-empty string display fields so that "garbled" values never reach riders. Alert `cause`, `effect`, `headerText` and `descriptionText` are still copied as-is, typed `string` with no runtime check. An upstream `headerText: { translation: [...] }`, which is the GTFS-RT shape the model comment says was originally assumed, or `cause: 42`, is passed through `mapToServiceAlertSummary` into every route, stop and nearby response. One phase now applies two different hygiene rules to the same kind of data.
**Fix:** Type these fields as `unknown` on `DashAlertEntity` and map them with a guard, e.g. `headerText: typeof entity.headerText === "string" ? entity.headerText : undefined`. Alternatively, drop and warn on the alert if a present field has the wrong type, matching the date rule.

## Info

### IN-01: Upstream strings are written to log lines unescaped

**File:** `src/server/api/services/ServiceAlertService.ts:162`; `src/server/api/services/NearbyPredictionService.ts:73-79, 143`
**Issue:** `entity.id`, `stopId` and `routeShortName` are upstream-controlled strings that go into warn messages verbatim. A value containing CR/LF or very long content can forge or flood log lines. The risk is low because the source is DASH and not end users.
**Fix:** Sanitize before logging, e.g. `JSON.stringify(id).slice(0, 64)`, or put the value in Winston metadata (`logger.warn("Dropping service alert", { id })`).

### IN-02: Soft-deleted alerts are dropped with no aggregate signal

**File:** `src/server/api/services/ServiceAlertService.ts:57-60, 156-158`
**Issue:** Any non-null `deletedAt` counts as deleted, including `""`, `0` and `false`, and these drops are not logged (D-08/D-09). If DASH ever writes `""` for "not deleted", every alert disappears and nothing shows in the logs.
**Fix:** Keep per-alert drops silent, but log one info line per poll with the count of deleted alerts dropped. That is not per-call noise, since the poll runs every 5 minutes.

### IN-03: Prediction `tripId`/`vehicleId` accept empty strings, unlike the new display-field rule

**File:** `src/server/api/services/NearbyPredictionService.ts:36-37`
**Issue:** The guard now rejects empty strings for route, stop and destination fields, but `isValidPrediction` still uses `typeof === "string"`. An empty `vehicleId` or `tripId` is still served.
**Fix:** Use `isNonEmptyString` for `tripId` and `vehicleId` if empty identifiers are not meaningful, or add a comment explaining why empty values are allowed there.

### IN-04: The `distanceToStop` check repeats `isFiniteNumber` inline

**File:** `src/server/api/services/NearbyPredictionService.ts:58-60`
**Issue:** `typeof distanceToStop === "number" && Number.isFinite(distanceToStop)` repeats the `isFiniteNumber` helper that the next lines use for `stopCode`.
**Fix:** `isFiniteNumber(distanceToStop) && distanceToStop >= 0`.

---

_Reviewed: 2026-10-07T00:00:00Z_
_Reviewer: Claude (gsd-code-review)_
_Depth: standard_
