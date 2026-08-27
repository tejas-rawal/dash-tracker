---
phase: 03-stop-discovery
reviewed: 2026-08-26T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - src/server/api/controllers/StopController.test.ts
  - src/server/api/controllers/StopController.ts
  - src/server/api/models/StopDiscovery.ts
  - src/server/api/models/index.ts
  - src/server/api/routes/busRoutes.test.ts
  - src/server/api/routes/busRoutes.ts
  - src/server/api/routes/index.ts
  - src/server/api/routes/stopRoutes.test.ts
  - src/server/api/routes/stopRoutes.ts
  - src/server/api/services/StopService.test.ts
  - src/server/api/services/StopService.ts
  - src/server/api/services/distance.test.ts
  - src/server/api/services/distance.ts
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-08-26
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Reviewed the stop-discovery feature: `GET /api/v1/routes/:shortName/stops` (grouped-by-direction stops) and `GET /api/v1/stops/nearby` (proximity search), plus the supporting `StopService`, `haversineDistanceMiles` utility, and `StopDiscovery` models. The implementation follows the project's layered architecture correctly (routes → controllers → services → repository, DI via factory functions, `NotFoundError` propagation), and the test suites are thorough on the happy paths and the documented boundary cases (count cap at 50, radius defaults, sort order, NotFoundError mapping).

No security vulnerabilities, crashes, or data-loss risks were found. Two real correctness/robustness gaps were found in query-parameter and service-input handling that are not covered by the existing tests (both are genuine, reachable behaviors rather than style nits), plus two lower-priority quality notes.

## Warnings

### WR-01: Empty-string `lat`/`lng` query params silently coerce to 0 instead of failing validation

**File:** `src/server/api/controllers/StopController.ts:10-16` (also affects call sites at `:60` and `:70`)
**Issue:** `parseCoordinateParam` converts the raw query value with `Number(raw)` and only treats the result as "missing" when `raw === undefined`. For an empty string (`GET /api/v1/stops/nearby?lat=&lng=-77.1`), Express/`qs` sets `req.query.lat` to `""`, and `Number("")` coerces to `0`. Since `0` is within the `[-90, 90]` range, `parsed` is a valid number and the function returns `0` rather than `undefined`. The request is silently treated as `lat=0` (a real, meaningful coordinate — the equator) instead of triggering the "lat parameter is required and must be a valid latitude" 400 response that the docstring/tests establish as the contract for a missing value. This is untested — `StopController.test.ts` only covers the case where the key is entirely absent from `query`, not present-but-empty.

The same coercion does not affect `radius`/`count` because those use a strict `> 0` check (`Number("") = 0` fails `> 0`), but it does affect both `lat` and `lng` since `0` is a valid boundary value for both ranges.

**Fix:**
```typescript
function parseCoordinateParam(raw: unknown, min: number, max: number): number | undefined {
    if (raw === undefined || raw === "") {
        return undefined;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}
```

### WR-02: `StopService.getNearbyStops` does not guard against non-positive `count`, producing confusing results if called with an unvalidated value

**File:** `src/server/api/services/StopService.ts:29-31, 48`
**Issue:** `getNearbyStops` clamps only the upper bound (`Math.min(options?.count ?? DEFAULT_COUNT, MAX_COUNT)`); it never validates that `count` is positive. Today the only caller is `StopController`, which does reject non-positive counts before calling the service — but `StopService` is exported as a standalone module and its `getNearbyStops` signature accepts a plain `NearbySearchOptions` object with no documented lower-bound contract enforced internally. If invoked directly with `count: -5` (e.g., from a future caller, a script, or a test), `Math.min(-5, 50)` evaluates to `-5`, and `Array.prototype.slice(0, -5)` does **not** return an empty array — it strips the last 5 elements from the end of the sorted list, silently returning the wrong (and non-empty) result set instead of failing loudly or returning `[]`. This defensive gap is not exercised by `StopService.test.ts`.

**Fix:**
```typescript
function getNearbyStops(lat: number, lng: number, options?: NearbySearchOptions): NearbyStop[] {
    const radius = options?.radius ?? DEFAULT_RADIUS_MILES;
    const count = Math.min(Math.max(options?.count ?? DEFAULT_COUNT, 1), MAX_COUNT);
    // ...
}
```

## Info

### IN-01: `haversineDistanceMiles` does not clamp the `asin` argument, a known formula robustness gap

**File:** `src/server/api/services/distance.ts:25-26`
**Issue:** `Math.asin(Math.sqrt(haversine))` can receive an argument slightly greater than `1` for near-antipodal points due to floating-point rounding in the intermediate `haversine` calculation, which makes `Math.asin` return `NaN`. Given this app's actual domain (DASH bus stops within a single small metro area), this is not practically reachable, but it's a standard hardening step for a general-purpose haversine implementation and there's no test covering it.
**Fix:** Clamp before the `asin` call: `Math.asin(Math.min(1, Math.sqrt(haversine)))`.

### IN-02: Error-to-HTTP-status mapping is duplicated instead of shared between controllers

**File:** `src/server/api/controllers/StopController.ts:34-45` vs. `src/server/api/controllers/BusRouteController.ts:16-19, 29-32`
**Issue:** `StopController.ts` extracts the `NotFoundError → 404 / else → 500` mapping into named helpers (`resolveErrorStatus`, `resolveErrorBody`), which is cleaner than the pre-existing inline ternaries duplicated twice in `BusRouteController.ts`. The two controllers now implement the same error-mapping contract with two different (and now diverging) code shapes, risking drift if one is updated without the other.
**Fix:** Move `resolveErrorStatus`/`resolveErrorBody` into a shared module (e.g., `src/server/api/errors/httpMapping.ts`) and have both controllers import it.

---

_Reviewed: 2026-08-26_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
