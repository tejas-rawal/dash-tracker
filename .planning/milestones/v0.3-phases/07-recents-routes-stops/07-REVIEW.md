---
phase: 07-recents-routes-stops
reviewed: 2026-09-01T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - src/server/api/services/RecentsService.ts
  - src/server/api/controllers/RecentsController.ts
  - src/server/api/routes/recentRoutes.ts
  - src/server/api/models/Prediction.ts
  - src/server/api/models/PersistedEntity.ts
  - src/server/api/services/PredictionService.ts
  - src/server/api/controllers/PredictionController.ts
  - src/server/api/routes/predictionRoutes.ts
  - src/server/api/repositories/FavoritesRecentsRepository.ts
  - src/server/api/routes/index.ts
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-09-01T00:00:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Reviewed the recents feature (`RecentsService`, `RecentsController`, `recentRoutes`) and its integration point in `PredictionService`/`PredictionController`, plus the shared `FavoritesRecentsRepository` and models. The layered architecture, DI, and SQL parameterization are all sound — no injection risk, no hardcoded secrets, no dangerous functions. However, tracing the write path (`PredictionService.recordRecentView`) against the read path (`RecentsService.resolveEntity`) surfaces a data-flow bug: route recents are written keyed by the client-supplied route filter value (route short name, e.g. `"1A"`), but read back via `BusDataRepository.getRouteById`, which is keyed by internal route id (e.g. `"route-1"`). Because every layer is unit-tested against mocks in isolation, no test exercises the real write→read round trip, so this silently breaks route recents end-to-end (they are always dropped by the `resolveEntity` filter). This is a BLOCKER. A few smaller robustness/duplication issues are also noted below.

## Critical Issues

### CR-01: Route recents are written with the wrong key and can never be hydrated

**File:** `src/server/api/services/PredictionService.ts:23-29, 112-118`
**File:** `src/server/api/services/RecentsService.ts:13-17`

**Issue:** `PredictionService.recordRecentView` stores the raw `route` query-string value the client sent (`options.route`) as the `entityId` for an `entityType: "route"` recents row:

```ts
async function recordRecentView(deviceId: string, stopId: string, routeId?: string): Promise<void> {
    const writes = [recentsRepository.upsertRecent(deviceId, "stop", stopId)];
    if (routeId !== undefined) {
        writes.push(recentsRepository.upsertRecent(deviceId, "route", routeId));
    }
    ...
}
...
recordRecentView(deviceId, stopId, options.route)
```

Per the codebase's own conventions and this phase's tests (`PredictionService.test.ts:435-446`, `predictionRoutes.test.ts:128-138`), `options.route` is a route **short name** (e.g. `"1A"`) — the same identifier used throughout the client-facing API (`GET /routes/:shortName`), and distinct from the internal `routeId` field returned in `RoutePrediction`/`DashPredictionData` (e.g. `"route-1"`).

`RecentsService.resolveEntity`, however, hydrates route recents via `busDataRepository.getRouteById(entityId)`, which looks up `BusDataRepository`'s `routes` map — keyed by internal `id`, not `shortName` (see `BusDataRepository.getRouteById` / `routesByShortName` being a *separate* map). `RecentsService.test.ts` confirms this contract explicitly: it stubs `getRouteById` to resolve entities keyed by ids like `"route-1"`, not short names.

The net effect: any recent recorded via `GET /predictions?stop=...&route=<shortName>` writes an entityId that `getRouteById` will never find (unless a route's `id` happens to equal its `shortName`, which is not guaranteed and contradicted by this codebase's own fixtures). `resolveEntity` returns `undefined`, and `listRecents`' `.filter((entry) => entry !== undefined)` silently drops the row on every request — the "recently viewed route" feature never surfaces a route to the client, even though rows accumulate (and get evicted) in the `recents` table.

This was not caught by tests because `RecentsService.test.ts` and `PredictionService.test.ts` each mock the collaborating layer, so the id/shortName mismatch across the write and read boundary is never exercised together.

**Fix:** Pick one canonical identifier for "route" entities and use it consistently on both sides. Either:
1. Resolve the short name to the internal route id before persisting the recent (mirrors what `PredictionService` already does for validated stops):
```ts
// PredictionService.ts
function resolveRouteIdForRecent(routeShortNameOrId?: string): string | undefined {
    if (routeShortNameOrId === undefined) return undefined;
    return repository.getRouteByShortName(routeShortNameOrId)?.id;
}
...
recordRecentView(deviceId, stopId, resolveRouteIdForRecent(options.route))
```
2. Or change `RecentsService.resolveEntity` to look routes up via `getRouteByShortName` instead of `getRouteById`, if short name is meant to be the canonical stored identifier for route recents (note this would also require reconciling with `FavoritesService`/`FavoritesController`, which use the same `resolveEntity` pattern against `getRouteById` for favorites, keyed by whatever `entityId` favorites callers pass).

Either way, add a test that exercises the write (`upsertRecent` via `PredictionService`) and the read (`RecentsService.resolveEntity`) against a shared `BusDataRepository` fixture (not two independently-mocked repositories) to catch this class of contract mismatch.

## Warnings

### WR-01: `route` query param is stored as a recent with no validation, allowing empty-string entityIds

**File:** `src/server/api/controllers/PredictionController.ts:48, 63-67`
**Issue:** `stop` is validated for truthiness (`if (!stop) { ... 400 ... }`) and `number` is validated via `parseNumberParam`, but `route` is passed straight through unvalidated: `const { stop, route } = req.query as Record<string, string | undefined>;`. If a client sends `GET /predictions?stop=s1&route=` (empty value), `route` is `""`, which is `!== undefined`, so `PredictionService.recordRecentView` will call `recentsRepository.upsertRecent(deviceId, "route", "")`, persisting a junk row with an empty `entityId` that will always fail to hydrate and just consumes one of the 5 capped recent slots.
**Fix:** Treat an empty/whitespace `route` the same as absent, e.g. in `PredictionController` or in `PredictionService.recordRecentView`:
```ts
const routeParam = route?.trim() ? route.trim() : undefined;
```

### WR-02: `RecentsController.resolveDeviceId` unsafely casts to `string`, relying on routing order to hold

**File:** `src/server/api/controllers/RecentsController.ts:22-25`
**Issue:**
```ts
function resolveDeviceId(req: Request): string {
    const raw = req.headers["x-device-id"];
    return (Array.isArray(raw) ? raw[0] : raw) as string;
}
```
This is only safe because `recentRoutes.ts` mounts `requireDeviceId` ahead of the controller (`router.use(requireDeviceId)`). The cast masks that invariant — if the middleware is ever removed, reordered, or the route is exposed another way (e.g. mounted elsewhere without the guard), `resolveDeviceId` will silently return `undefined` typed as `string`, and `recentsRepository.listRecents(undefined)` will be called with a non-string device id, producing a device-scoped query with no matching rows (or a runtime SQL binding error) instead of a clear 400. There's no runtime check inside the controller itself.
**Fix:** Either have `resolveDeviceId` throw/short-circuit if the header is missing (defense in depth, independent of the middleware), or make the coupling explicit via a shared helper (see IN-01) with the same guarantee documented once instead of re-implemented per controller.

### WR-03: Dead/unreachable `NotFoundError` branch in `RecentsController`'s error mapping

**File:** `src/server/api/controllers/RecentsController.ts:9-20`
**Issue:** `resolveErrorStatus`/`resolveErrorBody` special-case `NotFoundError` → 404, mirroring `FavoritesController`'s pattern, but `RecentsService.listRecents` (the only thing `RecentsController` calls) never throws `NotFoundError` — it silently filters unresolved entities instead (by design, per `RecentsService.ts:22-26`). As written, this branch can never execute with the current service contract, which risks masking future regressions (e.g., if `listRecents` starts throwing something unexpected, the generic 500 path is silently exercised without anyone noticing the "dead" branch never lit up).
**Fix:** Either remove the unreachable branch to reflect the actual contract, or add a comment noting it exists for forward-compatibility/consistency with the other controllers in this package.

## Info

### IN-01: `resolveDeviceId`/`resolveOptionalDeviceId` header-parsing logic duplicated across three files

**File:** `src/server/api/controllers/RecentsController.ts:22-25`, `src/server/api/controllers/PredictionController.ts:17-21`, `src/server/api/middleware/requireDeviceId.ts:3-11` (and `FavoritesController.ts`, out of this review's scope but same pattern)
**Issue:** The `x-device-id` header array-normalization logic (`Array.isArray(raw) ? raw[0] : raw`) is implemented independently four times across the codebase, with slightly different trim/undefined semantics in each. Any future change to header handling (e.g. supporting a different header name, or additional validation) has to be applied in every copy.
**Fix:** Extract a single shared helper, e.g. `resolveDeviceIdHeader(req): string | undefined`, in a shared module (or in `middleware/requireDeviceId.ts`) and have `requireDeviceId`, `RecentsController`, `PredictionController`, and `FavoritesController` all import it.

### IN-02: Magic number `5` for the recents cap is not a named constant

**File:** `src/server/api/repositories/FavoritesRecentsRepository.ts:101-105`
**Issue:** The recents-eviction query hardcodes `LIMIT 5` inline, unlike `BUSY_TIMEOUT_MS`, which is a named constant at the top of the file. If the retention cap needs to change, it's easy to miss this occurrence since it's embedded in a SQL string literal.
**Fix:**
```ts
const MAX_RECENTS_PER_DEVICE = 5;
...
`DELETE FROM recents WHERE device_id = @deviceId AND id NOT IN (SELECT id FROM recents WHERE device_id = @deviceId ORDER BY viewed_at DESC, id DESC LIMIT ${MAX_RECENTS_PER_DEVICE})`
```

### IN-03: `resolveEntity` helper duplicated verbatim between `RecentsService` and `FavoritesService`

**File:** `src/server/api/services/RecentsService.ts:13-17`
**Issue:** The private `resolveEntity(entityType, entityId)` helper is byte-for-byte identical to the one in `FavoritesService.ts` (both call `getRouteById`/`getStopById` on `entityType`). This is duplicated business logic that will drift if one copy is fixed (e.g., per CR-01) without the other being updated in lockstep.
**Fix:** Extract a shared `resolveFavoritableEntity(entityType, entityId, busDataRepository)` helper (e.g. in `models/` or a small `EntityResolver.ts` service util) that both `RecentsService` and `FavoritesService` depend on via DI.

---

## Resolution

**CR-01 (BLOCKER):** Fixed in `6934ed4` — `PredictionService.recordRecentView` now resolves the client-supplied route short name to the route's internal id via `repository.getRouteByShortName(...)?.id` before persisting the recent, matching the id-keyed lookup `RecentsService.resolveEntity` already performs via `getRouteById`. An unresolvable or empty/whitespace route short name is skipped rather than persisted (also closes WR-01). Added regression coverage in `PredictionService.test.ts` exercising the write with a resolved id, an unresolvable short name, and an empty/whitespace route param. Full suite (313 tests), lint, and build verified green after the fix.

WR-02, WR-03, IN-01, IN-02, IN-03 left open — non-blocking robustness/duplication notes, not required for phase completion.

_Reviewed: 2026-09-01T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
