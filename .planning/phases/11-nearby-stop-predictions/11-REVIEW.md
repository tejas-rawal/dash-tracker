---
phase: 11-nearby-stop-predictions
reviewed: 2026-09-24T16:27:56Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - src/server/api/routes/predictionRoutes.test.ts
  - src/server/api/services/NearbyPredictionService.test.ts
  - src/server/api/services/NearbyPredictionService.ts
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-09-24T16:27:56Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

This run covers gap-closure plan 11-03 (diff `8a12d29..HEAD`): per-element validation of nearby prediction
elements in `NearbyPredictionService.ts`, plus new unit and route tests. It replaces the earlier 10-file
report.

**Prior CR-01 is RESOLVED.** `isValidNearbyEntry` (lines 41-60) now requires every element of every
`destination.predictions` array to pass `isValidPrediction` (lines 26-35). That check needs a non-null object
with finite-number `min`/`sec`/`time` and string `tripId`/`vehicleId`. I traced the path through
`predictionMapping.ts:5-29`. With the guard in place, no remaining input shape can throw inside
`mapToDestinations`/`mapToRoutePrediction`/`groupByStop`, so the `null`/scalar element no longer causes a 500.
The new rows in the `malformed entries` table and the route-level `it.each` cover that regression. Both
in-scope test files pass (80 tests, no type errors).

What is still open: the guard checks prediction elements but still does not check the other scalar fields the
mapper copies. So the new comment's promise ("an incomplete element would be served to riders as an arrival
with missing fields") is only half kept (WR-01, carried forward). The nearby call still has no upstream
timeout (WR-02, carried forward). The whole-entry drop policy has a side effect the plan did not weigh: a
stop's locally sourced service alerts can disappear (WR-03).

Prior findings in files outside this run's scope were not re-reviewed: former WR-02 and IN-01 through IN-04,
in `NearbyPredictionController.ts`, `Prediction.ts`, `PredictionService.ts` and `PredictionController.ts`.
The diff touches no source file other than the three listed, so those items are unchanged and still open as
written in the previous report.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Guard still lets entries with missing route, stop or destination fields through, and `agencyKey` is still an unchecked cast (carried forward, prior WR-01)

**File:** `src/server/api/services/NearbyPredictionService.ts:41-60`, `:127`
**Issue:** The new comment (lines 37-40) says the guard stops "an incomplete element [being] served to riders
as an arrival with missing fields". The shared mapper also copies these fields field by field:
`directionId` and `headsign` per destination (`predictionMapping.ts:7-8`), and `routeId`, `routeName`,
`routeShortName`, `stopName` and `stopCode` per entry (`predictionMapping.ts:21-26`, and
`NearbyPredictionService.ts:148-149` for the stop's `name`/`code`). None of them is checked. Take an entry
such as `{ ...valid, routeShortName: undefined }` or a destination `{ directionId: 0, predictions: [...] }`.
It passes, gets served, and after `res.json` the key is removed or has the wrong type in the public payload.
That breaks the `RoutePrediction`/`NearbyStopPredictions` contract and the phase's own "MUST NOT fabricate
... no synthetic stop name" prohibition. The same applies to line 127: `data.agencyKey as string` sends
`undefined` (key dropped) when upstream omits it. The type predicate `entry is DashNearbyPredictionData`
still claims more than the check proves.
**Fix:** Stay within D-18 (typeof checks, no Zod) and extend the guard the same way `isValidPrediction` was
extended:
```ts
function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value !== "";
}

function isValidDestination(destination: unknown): boolean {
    return (
        isRecord(destination) &&
        typeof destination.directionId === "string" &&
        typeof destination.headsign === "string" &&
        Array.isArray(destination.predictions) &&
        destination.predictions.every(isValidPrediction)
    );
}

// in isValidNearbyEntry
isNonEmptyString(stopId) &&
typeof entry.stopName === "string" &&
isFiniteNumber(entry.stopCode) &&
typeof entry.routeId === "string" &&
typeof entry.routeName === "string" &&
typeof entry.routeShortName === "string" &&
isFiniteNumber(distanceToStop) && distanceToStop >= 0 &&
Array.isArray(destinations) && destinations.every(isValidDestination)

// in parseDashResponse
if (!isRecord(data) || typeof data.agencyKey !== "string" || !Array.isArray(data.predictionsData)) {
    throw new UpstreamApiError("DASH API returned a malformed nearby predictions response");
}
return { agencyKey: data.agencyKey, predictionsData: data.predictionsData };
```
Add table rows for a missing `routeShortName`, a numeric `directionId`, a missing `stopName`, and a body
without `agencyKey`.

### WR-02: Nearby upstream call still has no timeout (carried forward, prior WR-03)

**File:** `src/server/api/services/NearbyPredictionService.ts:102` (client config `src/server/config/axios.ts:7`)
**Issue:** `axios.get(url)` runs on the shared instance, which is created with no `timeout` (axios default is
0, meaning no timeout). The `UpstreamApiError` wrapping at lines 104-109 only runs if axios rejects. If DASH
accepts the connection and never answers, the rider's request hangs indefinitely instead of returning 502.
The endpoint is uncached, so every request in flight during an upstream stall piles up.
**Fix:**
```ts
const response = await axios.get(url, { timeout: 10_000 });
```
(or set `timeout` once in `axios.create` in `config/axios.ts`). Add a unit test that an `ECONNABORTED`
rejection surfaces as `UpstreamApiError`.

### WR-03: One bad prediction element can remove a whole stop and its service alerts from the response

**File:** `src/server/api/services/NearbyPredictionService.ts:37-60`, `:130-160`
**Issue:** The whole-entry drop is intentional (plan 11-03, lines 275 and 27). The plan argues only about
arrivals, though. `groupByStop` creates a stop, and runs its
`serviceAlertRepository.getActiveAlertsForStop` lookup (line 152), only from entries that survive
`filterValidEntries`. If a stop has one upstream entry, or all of its entries hold a bad element, the stop
is missing from `data.stops` entirely. Its active service alerts (such as "Stop relocated") go with it,
even though they come from the local repository and have nothing to do with the malformed upstream data.
One bad arrival in destination B also hides the valid arrivals in destination A of the same entry. The plan
itself (line 351) records an unverified assumption: if a live prediction ever omits `vehicleId`, for
example a schedule-based arrival with no vehicle assigned, its whole entry is dropped. The tightened check
turns that assumption into routine silent removal of routes and stops, and the only signal is a generic
per-request `warn`.
**Fix:** Pick one and pin it with a test:
- Keep the entry-level drop, but if the dropped entry's `stopId` and `distanceToStop` are valid, still emit
  the stop with `routes: []` and its alerts, so riders keep safety-relevant stop information. Or
- Record this as an explicit decision in CONTEXT (alerts can be lost when upstream is malformed), and confirm
  against the Swiftly docs or live data that `vehicleId`/`tripId` are always present on nearby predictions,
  including schedule-based ones, before relying on it.

## Info

### IN-01: Duplicate finite-number check next to the new `isFiniteNumber` helper

**File:** `src/server/api/services/NearbyPredictionService.ts:49-50`
**Issue:** `isValidNearbyEntry` still writes out `typeof distanceToStop === "number" && Number.isFinite(distanceToStop)`,
while `isFiniteNumber` (line 20), added in this change, does exactly that. Two copies of the same rule can
drift apart.
**Fix:** `isFiniteNumber(distanceToStop) && distanceToStop >= 0`.

### IN-02: Drop warning does not say why the entry was rejected

**File:** `src/server/api/services/NearbyPredictionService.ts:62-68`, `:134`
**Issue:** Entry-level failures (bad `stopId`, bad distance) and the new element-level failures (missing
`vehicleId`, NaN `time`) all log the same line: `Dropping malformed nearby prediction entry (stop X, route Y)`.
An operator who sees a burst of these after upstream drift, such as the `vehicleId` scenario in WR-03,
cannot tell which field changed without reproducing the payload.
**Fix:** Have the guard return a short reason string (for example `"prediction.vehicleId"`, `"distanceToStop"`)
and add it to the warn. It must stay free of coordinates and the API key.

### IN-03: Test gaps in the malformed-entry table

**File:** `src/server/api/services/NearbyPredictionService.test.ts:499-559`
**Issue:** (a) No test covers a non-object destination element (`destinations: [null]` or `["x"]`). The
`isRecord(destination)` branch at `NearbyPredictionService.ts:55` stops a mapper crash and is exactly the
kind of guard CR-01 showed goes missing, yet nothing pins it. (b) "a prediction without sec" and "a
prediction without vehicleId" (lines 526-541) set the key to `undefined` instead of omitting it. The check
rejects both the same way today, but the labels describe a case the rows do not build. (c) Nothing pins
`Infinity`, which is the case `isFiniteNumber` exists for over a plain `typeof` check.
**Fix:** Add rows `makeDashNearbyPredictionData({ destinations: [null] })` and `{ min: Number.POSITIVE_INFINITY }`,
and build the "without" rows by deleting the key (for example `const { sec: _omit, ...rest } = makeDashPrediction()`).

### IN-04: `as never` on the alert-repository mock turns off DI contract type checking (carried forward, prior IN-05)

**File:** `src/server/api/services/NearbyPredictionService.test.ts:151` (and every `createNearbyPredictionService(... as never)`, including the new test at line 610)
**Issue:** Casting to `never` means that if `ServiceAlertRepository.getActiveAlertsForStop` changes its
signature, the tests still compile under `--typecheck`.
**Fix:** Type the mock as `Pick<ServiceAlertRepository, "getActiveAlertsForStop">` and have the factory accept
that narrower interface, or cast via `as unknown as ServiceAlertRepository`.

---

_Reviewed: 2026-09-24T16:27:56Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
