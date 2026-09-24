---
phase: 11-nearby-stop-predictions
reviewed: 2026-09-24T15:10:41Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - src/server/api/controllers/NearbyPredictionController.test.ts
  - src/server/api/controllers/NearbyPredictionController.ts
  - src/server/api/models/Prediction.ts
  - src/server/api/routes/predictionRoutes.test.ts
  - src/server/api/routes/predictionRoutes.ts
  - src/server/api/services/NearbyPredictionService.test.ts
  - src/server/api/services/NearbyPredictionService.ts
  - src/server/api/services/PredictionService.ts
  - src/server/api/services/predictionMapping.test.ts
  - src/server/api/services/predictionMapping.ts
findings:
  critical: 1
  warning: 3
  info: 5
  total: 9
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-09-24T15:10:41Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

This phase adds `GET /api/v1/predictions/nearby`. The work spans a new controller, a new service, new
`Dash*`/response model types, and a `predictionMapping` module pulled out of `PredictionService` so both
services share it. Query parsing in the controller is careful: it rejects blanks, arrays, objects, NaN and
Infinity, and applies range caps. The service keeps the API key and the rider's coordinates out of logs and
error messages.

The main defect is in the service's malformed-entry validator. The code says a bad upstream entry should
be dropped rather than turn the request into a 500, but the validator stops one level too early. A single
`null` (or non-object) element inside a `predictions` array still crashes the shared mapper. The whole
request then fails with a 500, and the raw `TypeError` text goes back to the client. Other scalar fields
the response contract relies on (`stopName`, `stopCode`, route fields, `agencyKey`) are cast instead of
checked, so upstream drift silently removes keys from the public payload. The nearby call also has no
upstream timeout.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Malformed prediction element still crashes the whole nearby request (validator does not reach `predictions[]` items)

**File:** `src/server/api/services/NearbyPredictionService.ts:20-35` (crash site `src/server/api/services/predictionMapping.ts:9-15`)
**Issue:** The comment on `isValidNearbyEntry` says it exists to stop malformed destinations from throwing
inside the shared mapping and "turn[ing] the whole request into a 500". It only checks that
`destination.predictions` is an array. It never checks the array's elements. `mapToDestinations` then runs
`dest.predictions.map((pred) => ({ min: pred.min, ... }))`, so an upstream payload such as
`predictions: [null]` or `predictions: ["x"]` gets through validation. It then throws
`TypeError: Cannot read properties of null (reading 'min')` inside `groupByStop`. That error is not an
`UpstreamApiError`, so the controller (`NearbyPredictionController.ts:90-91`) returns **500 Request Failed**
with the raw TypeError message as `details`. One bad element from one route at one stop takes down the
whole response for every nearby stop. That breaks the NEAR-08 "drop malformed entry, keep valid ones"
behaviour the phase set out to guarantee. `NearbyPredictionService.test.ts:480-514` has no case for a
non-object prediction element, so the gap is not tested.
**Fix:** Check each prediction element as well (and ideally the fields the mapper copies):
```ts
function isValidPrediction(prediction: unknown): boolean {
    return (
        isRecord(prediction) &&
        typeof prediction.min === "number" &&
        typeof prediction.sec === "number" &&
        typeof prediction.time === "number" &&
        typeof prediction.tripId === "string" &&
        typeof prediction.vehicleId === "string"
    );
}

// in isValidNearbyEntry
destinations.every(
    (destination) =>
        isRecord(destination) &&
        Array.isArray(destination.predictions) &&
        destination.predictions.every(isValidPrediction),
)
```
Add test rows such as `{ label: "a null prediction element", entry: makeDashNearbyPredictionData({ destinations: [{ directionId: "0", headsign: "x", predictions: [null] }] }) }` to the `malformed entries` table.
A cleaner long-term fix is a Zod schema for `DashNearbyPredictionData`, since Zod is already a
dependency (CLAUDE.md: "Lean on the dependencies already in the project"). It would replace the
hand-rolled partial guard, which is how this gap got in.

## Warnings

### WR-01: Unchecked casts let upstream drift silently drop public response fields

**File:** `src/server/api/services/NearbyPredictionService.ts:103`, `:22-35`, `:122-126`
**Issue:** `parseDashResponse` returns `agencyKey: data.agencyKey as string` without checking it. If
upstream omits or renames `agencyKey`, the value is `undefined`, and `res.json` removes the key from
`data`. The response then no longer matches `NearbyPredictionsResponse`, with no warning. The same
applies to fields `isValidNearbyEntry` never looks at: `stopName`, `stopCode`, `routeId`, `routeName`,
`routeShortName`, `directionId`, `headsign`. These feed `NearbyStopPredictions.name` and `code` (lines
124-125) and each `RoutePrediction`. A missing value becomes `undefined` and the key disappears from the
JSON. The type guard `entry is DashNearbyPredictionData` claims more than the check proves.
**Fix:** Either check these fields in the guard (or the Zod schema from CR-01) and drop or warn on
failure, or throw `UpstreamApiError` when `typeof data.agencyKey !== "string"`:
```ts
if (!isRecord(data) || typeof data.agencyKey !== "string" || !Array.isArray(data.predictionsData)) {
    throw new UpstreamApiError("DASH API returned a malformed nearby predictions response");
}
return { agencyKey: data.agencyKey, predictionsData: data.predictionsData };
```

### WR-02: 500 responses echo raw internal error messages to clients

**File:** `src/server/api/controllers/NearbyPredictionController.ts:44-48`, `:90-91`
**Issue:** `resolveErrorBody` puts `error.message` into `details` for every error, including unexpected
ones that map to 500. The only way this service produces a non-`UpstreamApiError` is an internal bug such
as the TypeError in CR-01. So in practice the 500 path sends internal messages straight to the client
(for example `Cannot read properties of null (reading 'min')`). Upstream messages are wrapped on purpose
(`NearbyPredictionService.ts:81-84`), but unknown errors are not handled with the same care. They are
also not logged, so operators cannot see a 500 happen.
**Fix:** Return a generic message for the unknown-error branch and log the detail on the server:
```ts
function resolveErrorBody(error: unknown): { error: string; details: string } {
    if (error instanceof UpstreamApiError) {
        return { error: "Bad Gateway", details: error.message };
    }
    return { error: "Request Failed", details: "Unexpected error while building nearby predictions" };
}
// in catch: if (!(error instanceof UpstreamApiError)) logger.error(`Nearby predictions failed: ${message}`);
```
(Update the `"x"` / `"Unknown error"` assertions in `NearbyPredictionController.test.ts:262-290` to match.)

### WR-03: Nearby upstream call has no timeout, so a stalled DASH API hangs the request forever

**File:** `src/server/api/services/NearbyPredictionService.ts:77-85` (client config `src/server/config/axios.ts:7`)
**Issue:** `fetchFromDashApi` relies on the shared axios instance, and that instance is created with no
`timeout` (the default of 0 means no timeout). The `UpstreamApiError` wrapping and the 502 mapping only
run if axios rejects. If upstream accepts the connection and never answers, the nearby request stays open
indefinitely instead of returning 502. This endpoint sits on the rider's critical path and is uncached,
so a slow upstream leads to piled-up hung requests.
**Fix:** Pass a per-request timeout (the smallest change within the phase's scope), or set a default on the
instance in `config/axios.ts`:
```ts
const response = await axios.get(url, { timeout: 10_000 });
```
Add a test that a rejected `ECONNABORTED` error maps to `UpstreamApiError`.

## Info

### IN-01: `parseStrictNumber` accepts hex/binary/octal and exponent literals despite its "strict" contract

**File:** `src/server/api/controllers/NearbyPredictionController.ts:13-21`
**Issue:** `Number()` accepts `"0x1A"` (26), `"0b1"` (1), `"0o7"` and `"1e-1"`, so `lat=0x1A` and
`radius=0b1` are accepted. The range caps still apply, so this is not exploitable. But the function
accepts more than its name and comment suggest.
**Fix:** Pre-check against a decimal pattern, e.g. `/^\s*-?\d+(\.\d+)?\s*$/`, before calling `Number()`,
or document the leniency.

### IN-02: `DashNearbyApiResponse` is a dead exported type

**File:** `src/server/api/models/Prediction.ts:85-92`
**Issue:** Nothing references `DashNearbyApiResponse`. The service parses the body as `unknown` and narrows
it by hand. The unused interface can drift away from the real parsing logic.
**Fix:** Remove it, or use it as the target type of the (Zod) parser.

### IN-03: `/predictions` still maps network failures to 500, not 502, and skips shape validation

**File:** `src/server/api/services/PredictionService.ts:54-59`, `:83`
**Issue:** This file was edited in this phase. The nearby service wraps axios failures as
`UpstreamApiError` (502) and checks the body shape. `fetchFromDashApi` here still lets raw axios errors
through (so the controller returns 500) and reads `dashResponse.data.predictionsData` unchecked. That goes
against the documented `UpstreamApiError → 502` mapping, and the two sibling endpoints now behave
differently for the same upstream failure. The behaviour predates this phase.
**Fix:** Apply the same try/catch wrapping and body validation as `NearbyPredictionService.fetchFromDashApi`/`parseDashResponse`, as a follow-up.

### IN-04: Duplicated error-mapping helpers across prediction controllers

**File:** `src/server/api/controllers/NearbyPredictionController.ts:40-48` vs `src/server/api/controllers/PredictionController.ts:23-44`
**Issue:** `resolveErrorStatus`/`resolveErrorBody` are copied with slight differences (the nearby version
drops `NotFoundError`). A fix to one, such as WR-02, will easily be missed in the other.
**Fix:** Extract a shared `mapErrorToResponse` helper under `controllers/`.

### IN-05: `as never` on the alert-repository mock turns off type checking of the DI contract

**File:** `src/server/api/services/NearbyPredictionService.test.ts:135` (and every `createNearbyPredictionService(... as never)` call)
**Issue:** Casting to `never` means that if `ServiceAlertRepository.getActiveAlertsForStop` changes its
signature, the tests still compile under `--typecheck`, which reduces test reliability.
**Fix:** Type the mock as `Pick<ServiceAlertRepository, "getActiveAlertsForStop">` and have the factory
accept that narrower interface, or cast via `as unknown as ServiceAlertRepository`.

---

_Reviewed: 2026-09-24T15:10:41Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
