---
phase: 15-alert-nearby-data-hygiene
reviewed: 2026-10-07T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/server/api/models/ServiceAlert.ts
  - src/server/api/routes/alertHygiene.test.ts
  - src/server/api/services/ServiceAlertService.test.ts
  - src/server/api/services/ServiceAlertService.ts
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 15: Code Review Report

**Reviewed:** 2026-10-07T00:00:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

This is an incremental review after gap-closure plan 15-03 (D-16). It covers the changes since `fdbc349` to the alert model, `ServiceAlertService`, and their unit and end-to-end tests.

**CR-01 is resolved.** `activePeriods` and `informedEntities` are now typed `unknown` on `DashAlertEntity` (`ServiceAlert.ts:43-44`). `readRecordList` (`ServiceAlertService.ts:76-84`) accepts only `null`, `undefined`, or an array whose every element is a non-array, non-null object. `parseAlert` (`ServiceAlertService.ts:156-170`) checks list structure before dates, in the D-16 order (activePeriods list, then informedEntities list, then bounds), and returns a discriminated result, so a malformed alert is dropped with one warn and never throws. I traced every shape listed in the original CR-01 through the new code:
- `activePeriods`: `[null]`, `{}`, `5`, `"abc"`, a lone object, a nested array.
- `informedEntities`: `[null]`, `{}`, `"route-1"`.

Each now returns `undefined` from `readRecordList` and drops only that alert. The `null`-in-`string[]` leak is also fixed: the filter at `ServiceAlertService.ts:134-139` now uses `typeof id === "string"`. Unit tests cover every listed shape plus the ordering and D-10 cases. The new end-to-end test (`alertHygiene.test.ts:255-296`) runs the real poll and proves that a soft-delete arriving in the same poll as broken alerts still takes effect. I ran both test files (67 tests pass), Biome (clean apart from the repo-wide PascalCase test-filename warning) and `tsc --noEmit` (clean).

One residual throw path remains (WR-04). The "one bad alert cannot fail the poll" guarantee relies on every helper being total, and `Math.min(...)`/`Math.max(...)` are not. WR-01 to WR-03 and IN-01 to IN-04 from the previous review still apply and are carried forward. IN-03 and IN-04 are in `NearbyPredictionService.ts`, which is outside this incremental scope; I confirmed it has not changed since `fdbc349`.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: An open start in one period is ignored, so a currently active alert is hidden until another period's start (carried forward)

**File:** `src/server/api/services/ServiceAlertService.ts:110-123`
**Issue:** Unchanged by 15-03. The end bound is handled symmetrically: `anyOpenEnded` forces `end: null` when any period is open-ended. The start bound has no matching check. `starts` filters out null starts, so `[{ start: null, end: null }, { start: "2030-01-01T00:00:00Z", end: "2030-02-01T00:00:00Z" }]` collapses to `{ start: "2030-01-01T00:00:00.000Z", end: null }`. `ServiceAlertRepository.isAlertActive` then hides the alert until 2030, even though its first period is always active. This contradicts D-02 ("earliest start"), because an unbounded start is the earliest possible start. The test "treats null and omitted bounds as unbounded, not malformed" (`ServiceAlertService.test.ts:515-530`) only passes because none of its periods has a start.
**Fix:**
```ts
const anyOpenStarted = periods.some((p) => p.start == null);
const starts = periods.map((p) => p.start).filter(isParseableDate);
// ...
start: !anyOpenStarted && starts.length > 0
    ? new Date(Math.min(...starts.map((s) => new Date(s).getTime()))).toISOString()
    : null,
```
Add a test with one open-start period and one bounded future period.

### WR-02: `isParseableDate` accepts timezone-less and near-arbitrary strings, so the alert window depends on the server's timezone (carried forward)

**File:** `src/server/api/services/ServiceAlertService.ts:63-65`
**Issue:** Unchanged by 15-03. `new Date(string)` uses V8's lenient legacy parser. I re-checked in Node on this host: `new Date("1")` gives `2001-01-01T06:00:00.000Z`, and `"2025-03-09 13:00:00"` gives `2025-03-09T18:00:00.000Z`. Both are read as local time. The same DASH payload therefore produces different `activePeriod` instants, and different active/inactive decisions, depending on the host's `TZ`. Junk-but-numeric strings also count as valid dates instead of being dropped as malformed under D-03/ALRT-13.
**Fix:** Require an explicit zone and treat anything else as malformed:
```ts
const ZONED = /(Z|[+-]\d{2}:?\d{2}|GMT|UTC)$/i;
function isParseableDate(value: unknown): value is string {
    return typeof value === "string" && ZONED.test(value.trim()) && !Number.isNaN(Date.parse(value));
}
```

### WR-03: Alert display fields are passed to riders without type checks, unlike informed ids and nearby display fields (carried forward)

**File:** `src/server/api/services/ServiceAlertService.ts:143-147` (types at `src/server/api/models/ServiceAlert.ts:36-40`)
**Issue:** Still open, and 15-03 made the inconsistency wider. Informed ids are now runtime-checked (`typeof id === "string"`), and nearby entries require non-empty string display fields. Alert `cause`, `effect`, `headerText`, `descriptionText` and `url`, however, are still copied as-is under a compile-time `string` type with no runtime check. An upstream `headerText: { translation: [...] }` (the GTFS-RT shape the model comment says was originally assumed) or `cause: 42` reaches every route, stop and nearby response through `mapToServiceAlertSummary`. `?? undefined` only strips `null`.
**Fix:** Type these fields as `unknown` on `DashAlertEntity` and map them with a guard:
```ts
function optionalString(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}
// ...
headerText: optionalString(entity.headerText),
```
Alternatively, drop and warn on the alert when a present field has the wrong type, matching the D-16 list rule.

### WR-04: An alert with very many active periods still throws out of `fetchAlerts` and fails the whole poll (residual CR-01 class)

**File:** `src/server/api/services/ServiceAlertService.ts:117, 121` (loop at `202-212`)
**Issue:** `deriveActiveWindow` passes every bound as a separate argument (`Math.min(...starts.map(...))` / `Math.max(...ends.map(...))`). I checked in Node: spreading 100,000 arguments works, but 130,000 throws `RangeError: Maximum call stack size exceeded`. One alert with about 125k well-formed periods passes `readRecordList` and `findMalformedBound`, then throws inside `mapToServiceAlert`. The per-entity loop has no try/catch, so the exception escapes `fetchAlerts`. `pollAlerts` logs an error and skips `applyAlerts`, and the previous snapshot keeps serving, including alerts DASH has since soft-deleted. That is exactly the failure D-16 set out to remove. The payload is large (about 9 MB for 200k periods), so this is unlikely from DASH. Still, the invariant is currently "every helper happens to be total", not something the code enforces.
**Fix:** Compute the window with a loop instead of argument spreading. Optionally, add a per-entity backstop so any unforeseen throw drops only that alert:
```ts
const earliest = starts.reduce((min, s) => Math.min(min, new Date(s).getTime()), Number.POSITIVE_INFINITY);
const latest = ends.reduce((max, e) => Math.max(max, new Date(e).getTime()), Number.NEGATIVE_INFINITY);
```
```ts
// in fetchAlerts, around parseAlert:
let parsed: ReturnType<typeof parseAlert>;
try {
    parsed = parseAlert(entity);
} catch {
    parsed = { malformed: "record" };
}
```

## Info

### IN-01: Upstream strings are written to log lines unescaped (carried forward)

**File:** `src/server/api/services/ServiceAlertService.ts:208`; `src/server/api/services/NearbyPredictionService.ts:143` (outside this incremental scope, unchanged)
**Issue:** `entity.id` is an upstream-controlled string interpolated verbatim into the warn line. 15-03 added a second message path through the same line (`malformed ... list`). An id containing CR/LF, or a very long id, can forge or flood log lines. The risk is low because the source is DASH and not end users.
**Fix:** Put the id in Winston metadata (`logger.warn("Dropping malformed service alert", { id: entity.id, part: parsed.malformed })`), or sanitize it with `JSON.stringify(entity.id).slice(0, 64)`.

### IN-02: Soft-deleted alerts are dropped with no aggregate signal (carried forward)

**File:** `src/server/api/services/ServiceAlertService.ts:59-61, 203-205`
**Issue:** Any non-null `deletedAt` counts as deleted, including `""`, `0` and `false`, and these drops are not logged (D-08/D-09). If DASH ever writes `""` for "not deleted", every alert disappears and nothing shows in the logs.
**Fix:** Keep per-alert drops silent, but log one info line per poll with the count of deleted alerts dropped. The poll runs every 5 minutes, so this is not per-call noise.

### IN-03: Prediction `tripId`/`vehicleId` accept empty strings, unlike the new display-field rule (carried forward)

**File:** `src/server/api/services/NearbyPredictionService.ts:36-37` (outside this incremental scope, unchanged)
**Issue:** `isValidPrediction` still uses `typeof === "string"`, so an empty `vehicleId` or `tripId` is still served.
**Fix:** Use `isNonEmptyString`, or add a comment explaining why empty values are allowed.

### IN-04: The `distanceToStop` check repeats `isFiniteNumber` inline (carried forward)

**File:** `src/server/api/services/NearbyPredictionService.ts:58-60` (outside this incremental scope, unchanged)
**Issue:** `typeof distanceToStop === "number" && Number.isFinite(distanceToStop)` repeats the `isFiniteNumber` helper.
**Fix:** `isFiniteNumber(distanceToStop) && distanceToStop >= 0`.

### IN-05: An alert whose informed ids are all skipped is kept but attaches nowhere, with no log

**File:** `src/server/api/services/ServiceAlertService.ts:134-139`
**Issue:** D-16 deliberately skips non-string `routeId`/`stopId` values silently. When every id of an alert is skipped, the alert stays in the store with `informedRouteIds: []` and `informedStopIds: []`. `ServiceAlertRepository.getActiveAlertsForRoute/ForStop` never match empty lists, so the alert is invisible to riders, and nothing is logged. If DASH switched to numeric route or stop ids, every alert would vanish without any signal. This is the same blind spot as IN-02, created this time by the new string filter. Skipping can only narrow where an alert attaches, never widen it, so this is not a correctness bug.
**Fix:** Keep the per-id skip silent (D-16), but warn once when an alert had a non-empty `informedEntities` list and ended up with no ids at all, e.g. `Service alert <id> has no usable route or stop ids`. Alternatively, fold it into the per-poll summary suggested in IN-02.

---

_Reviewed: 2026-10-07T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
