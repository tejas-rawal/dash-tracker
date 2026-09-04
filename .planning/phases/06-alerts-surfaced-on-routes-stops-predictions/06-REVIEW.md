---
phase: 06-alerts-surfaced-on-routes-stops-predictions
reviewed: 2026-09-04T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - src/server/api/models/ServiceAlertSummary.ts
  - src/server/api/models/index.ts
  - src/server/api/repositories/ServiceAlertRepository.test.ts
  - src/server/api/repositories/ServiceAlertRepository.ts
  - src/server/api/routes/busRoutes.test.ts
  - src/server/api/routes/busRoutes.ts
  - src/server/api/routes/stopRoutes.test.ts
  - src/server/api/routes/stopRoutes.ts
  - src/server/api/services/BusRouteService.test.ts
  - src/server/api/services/BusRouteService.ts
  - src/server/api/services/serviceAlertMapping.test.ts
  - src/server/api/services/serviceAlertMapping.ts
  - src/server/api/services/StopService.test.ts
  - src/server/api/services/StopService.ts
  - src/server/api/models/StopDiscovery.ts
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-09-04T00:00:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Reviewed the alert-embedding feature that attaches `ServiceAlertSummary[]` to route (`GET /api/v1/routes/all`, `GET /api/v1/routes/:shortName`) and stop (`GET /api/v1/routes/:shortName/stops`, `GET /api/v1/stops/nearby`) responses. The implementation is a straightforward read-and-map pass over an existing repository; DI wiring, ID-based matching (D-03), agency-wide-alert exclusion (D-04), and the always-present-`alerts`-array contract (D-02) are all implemented as documented in `06-CONTEXT.md` and both plan files, and are backed by matching tests. I traced the D-03/D-04/D-05 decisions against `06-CONTEXT.md` before evaluating route-vs-stop alert scoping — the "a route-wide alert never appears on that route's own stops" behavior is an intentional, documented scope boundary, not a bug.

No critical/blocker-level defects found — no injection, no auth bypass, no data loss risk. Two warning-level issues are worth fixing: a type-soundness gap that lets a `RouteWithAlerts` value lie about having `BusRoute`'s prototype methods, and an unguarded `Invalid Date` path in the alert-active-window filter that fails open (treats malformed bounds as always-active) instead of failing safe. Three info-level maintainability notes round out the findings.

## Warnings

### WR-01: `RouteWithAlerts` cast lies about having `BusRoute`'s prototype methods

**File:** `src/server/api/services/BusRouteService.ts:19-24`
**Issue:** `attachAlerts` does `return { ...route, alerts } as RouteWithAlerts;` where `RouteWithAlerts = BusRoute & { alerts: ServiceAlertSummary[] }` (`src/server/api/models/ServiceAlertSummary.ts:16`). A JS object spread only copies a source's *own* enumerable properties — `BusRoute.getAllStops()` and `BusRoute.getDirectionById()` live on `BusRoute.prototype`, so the spread result is a plain object without either method. TypeScript's structural typing for spread expressions doesn't distinguish own vs. inherited members, so the compiler is satisfied and the `as RouteWithAlerts` cast type-checks cleanly (confirmed via `bun run build`, no error) — but at runtime, any caller that receives a `RouteWithAlerts` and (trusting its static type) invokes `.getAllStops()` or `.getDirectionById(...)` will get `TypeError: ... is not a function`. Today nothing downstream calls those methods on the returned value (`res.json()` is the only consumer), so there's no live incident, but the type is a footgun for the next person who extends `BusRouteController`/`BusRouteService` and trusts the return type's shape.
**Fix:** Stop intersecting with the class type. Define `RouteWithAlerts` as its own plain-data interface listing only the fields actually present (mirroring the `StopWithAlerts` pattern already used two lines below it in the same file):
```typescript
export interface RouteWithAlerts {
    id: string;
    longName: string;
    shortName: string;
    name: string;
    type: RouteType;
    directions: RouteDirection[];
    alerts: ServiceAlertSummary[];
}
```
This makes the type honest about the runtime shape and removes the need for the `as RouteWithAlerts` cast entirely (a plain object literal built from the picked fields would satisfy the interface structurally).

### WR-02: Malformed `activePeriod` bounds fail open instead of failing safe in `isAlertActive`

**File:** `src/server/api/repositories/ServiceAlertRepository.ts:5-16`
**Issue:** 
```typescript
if (start !== null && referenceTime < new Date(start)) {
    return false;
}
if (end !== null && referenceTime > new Date(end)) {
    return false;
}
```
If `start` or `end` is a non-`null`, non-parseable string, `new Date(start)` / `new Date(end)` produces `Invalid Date` (`NaN` internally). Every relational comparison against `NaN` (`<`, `>`) evaluates to `false` in JS, so both guard clauses become unconditional no-ops for that alert — the function falls through to `return true`. In other words, a corrupted or unexpected `activePeriod` boundary makes an alert look *permanently active* rather than being excluded (fail-open) or logged as a data-quality problem. Given the DASH/Swiftly payload shape has already surprised this codebase once (see the `G-05-5` comment in `models/ServiceAlert.ts`), this is a plausible failure mode, not a purely theoretical one, and there's no validation anywhere on this path that would catch it before it reaches riders' route/stop responses.
**Fix:** Validate parsed dates explicitly and treat invalid bounds as unbounded-but-logged (or exclude, per product preference) rather than silently passing:
```typescript
function parseBound(value: string | null): Date | null {
    if (value === null) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        logger.warn(`ServiceAlertRepository: invalid activePeriod bound "${value}", treating as unbounded`);
        return null;
    }
    return parsed;
}
```
and use `parseBound(start)`/`parseBound(end)` in place of the raw `new Date(...)` calls.

## Info

### IN-01: Stop-shape fields duplicated across three independent declarations

**File:** `src/server/api/models/ServiceAlertSummary.ts:19-26` (`StopWithAlerts`), `src/server/api/models/StopDiscovery.ts:14-22` (`NearbyStop`), `src/server/api/models/BusStop.ts:1-6` (`BusStop`)
**Issue:** `id: string; name: string; code: number; lat: number; lon: number;` is hand-written three separate times (once as the `BusStop` class, once in `StopWithAlerts`, once in `NearbyStop`), with no shared base type. Any future field addition/rename to the public stop shape (already common in this codebase — `BusStop` grew a `getLocation()` helper) requires manually keeping all three in sync, and nothing enforces it structurally beyond `toEqual` assertions in tests.
**Fix:** Extract a shared `BusStopSummary` (or reuse `Pick<BusStop, "id" | "name" | "code" | "lat" | "lon">`) that both `StopWithAlerts` and `NearbyStop` extend/intersect with their own extra fields (`alerts`, and `distance` + `alerts` respectively).

### IN-02: Inconsistent lat/lon extraction style between two adjacent `StopService` functions

**File:** `src/server/api/services/StopService.ts:22-25` vs. `src/server/api/services/StopService.ts:40-61`
**Issue:** `attachStopAlerts` reads `stop.lat`/`stop.lon` directly, while `getNearbyStops`'s map callback calls `stop.getLocation()` to get the same two values (`const location = stop.getLocation(); ... lat: location.lat, lon: location.lon`). Both are correct, but the inconsistency (one direct-field-access, one via-accessor) in the same file for the same underlying data is a minor readability/maintainability smell — a future refactor of `BusStop`'s internal field names would only be caught by the compiler in one of the two call sites if `getLocation()`'s signature stayed stable while the raw fields changed visibility.
**Fix:** Pick one style and use it consistently — likely `stop.getLocation()` everywhere, since it's the class's own accessor rather than reaching into its internals.

### IN-03: `mapToServiceAlertSummary` assigns `undefined` values as explicit object keys

**File:** `src/server/api/services/serviceAlertMapping.ts:6-15`
**Issue:** `cause: alert.cause` (and `effect`/`headerText`/`descriptionText`) always creates the key on the returned object, even when `alert.cause` is `undefined`. This is harmless for the actual HTTP responses (`res.json()`/`JSON.stringify` drop `undefined`-valued keys) and for `toEqual`-based tests (which treat an `undefined` property as equivalent to an absent one), so there's no observable behavior difference today — flagging only because a future consumer that does `Object.keys(summary)` or a strict/exact-shape check (e.g. `toStrictEqual`, `JSON.stringify(Object.keys(...))`) would see a different result than a route/stop that never had that key at all.
**Fix:** No action required unless a future caller needs `Object.keys` parity with a full omission; if so, conditionally spread the optional fields instead of always assigning them.

---

_Reviewed: 2026-09-04T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
