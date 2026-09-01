---
phase: 05-service-alerts-ingestion
reviewed: 2026-09-01T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - src/server/api/models/ServiceAlert.ts
  - src/server/api/services/ServiceAlertService.ts
  - src/server/api/services/ServiceAlertService.test.ts
  - src/server/api/repositories/ServiceAlertRepository.ts
  - src/server/api/repositories/ServiceAlertRepository.test.ts
  - src/server/api/services/ServiceAlertPollService.ts
  - src/server/api/services/ServiceAlertPollService.test.ts
  - src/server/app.ts
  - src/server/api/models/index.ts
  - src/server/api/repositories/index.ts
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-09-01T00:00:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Reviewed the service-alerts ingestion pipeline: `ServiceAlert` model, `ServiceAlertService` (fetch + Dash-to-domain mapping), `ServiceAlertRepository` (singleton in-memory store + active-window query), `ServiceAlertPollService` (boot-triggered 5-minute poll driver), and the `app.ts` wiring. Full test suite for these files passes (27/27), typecheck is clean, and Biome reports no new lint errors attributable to this phase (the only filename-convention warning on `ServiceAlertRepository.test.ts` mirrors an identical pre-existing warning already present on `BusDataRepository.test.ts`/`BusRouteService.test.ts`, so it is not a regression).

No critical/blocker-level defects were found — error handling around the poll loop is sound (`pollAlerts()`'s try/catch prevents any upstream failure from crashing the process or clearing the store), the singleton/atomic-swap pattern in the repository avoids torn state under concurrent poll ticks, and the active-window boundary logic matches its documented (and tested) inclusive-both-ends semantics. The issues below are robustness/defensive-coding gaps and minor code-quality nits that should be addressed but do not block shipping this ingestion-only slice.

## Warnings

### WR-01: `fetchAlerts()` will throw an unhandled generic `TypeError` if the DASH response body itself is not an object

**File:** `src/server/api/services/ServiceAlertService.ts:70`
**Issue:** `fetchFromDashApi()` blindly casts `response.data as DashAlertsApiResponse` with no runtime shape check on `response.data` itself (only `response.data.entity` is checked, and only for "is it defined" / "is it an array"). If the DASH API ever returns `null`, a bare string, or no body (e.g. a 204, or a proxy/error page returned with a 200 status), `response.entity` on line 70 throws `TypeError: Cannot read properties of null (reading 'entity')` instead of the intended `UpstreamApiError`. The error is still caught by `ServiceAlertPollService.pollAlerts()`'s try/catch (so the process never crashes), but the logged message becomes a generic, low-signal `TypeError` rather than the descriptive `UpstreamApiError` this code path was clearly designed to produce for malformed upstream payloads (see the sibling check at line 76 for the `entity`-not-an-array case, and the STRIDE T-05-01 mitigation notes in the phase plan, which only account for the `entity` field, not the response body itself).
**Fix:**
```ts
async function fetchFromDashApi(): Promise<DashAlertsApiResponse> {
    const url = buildDashApiUrl();
    logger.info(`Fetching service alerts from DASH API: ${url}`);
    const response = await axios.get(url);
    if (response.data === null || typeof response.data !== "object") {
        throw new UpstreamApiError("DASH API returned a malformed service alerts response (body is not an object)");
    }
    return response.data as DashAlertsApiResponse;
}
```

### WR-02: `mapToServiceAlert()` will throw if any entity in `response.entity` is not a well-formed object

**File:** `src/server/api/services/ServiceAlertService.ts:44-65`, `81`
**Issue:** `fetchAlerts()` validates that `response.entity` is an array (line 75), but never validates the individual elements. `response.entity.map(mapToServiceAlert)` destructures `entity.alert` on line 45 with no guard — a malformed/malicious upstream payload such as `{ entity: [null] }` or `{ entity: [{ id: "x" }] }` (missing `alert`) causes a `TypeError` inside the `.map()` callback instead of the deliberate `UpstreamApiError` the sibling array-shape check was designed to produce. Same downstream effect as WR-01 (swallowed by the poll loop's try/catch, but with a less actionable error message), and the same gap exists for any future direct caller of `ServiceAlertService.fetchAlerts()` (e.g. a Phase 6 controller) that does not wrap the call in its own try/catch.
**Fix:** Add a lightweight per-entity guard before mapping, e.g.:
```ts
function isValidDashAlertEntity(entity: unknown): entity is DashAlertEntity {
    return (
        typeof entity === "object" &&
        entity !== null &&
        typeof (entity as DashAlertEntity).id === "string" &&
        typeof (entity as DashAlertEntity).alert === "object"
    );
}
// ...
if (!response.entity.every(isValidDashAlertEntity)) {
    throw new UpstreamApiError("DASH API returned a malformed service alerts response (entity item is malformed)");
}
return response.entity.map(mapToServiceAlert);
```

### WR-03: `deriveActiveWindow`'s min/max collapse silently loses "open-ended" semantics when only some periods lack an end

**File:** `src/server/api/services/ServiceAlertService.ts:30-42`
**Issue:** When `periods` contains more than one entry and only some of them omit `end` (a real-world GTFS-RT pattern meaning "this window continues indefinitely"), the current logic computes `end` from only the entries that *do* have a defined `end`, silently discarding the open-ended signal from the entry that has none. For example `periods = [{start: 100, end: 200}, {start: 300}]` (the second period has no end, i.e. active forever from t=300 onward) collapses to `{start: 100, end: 200}` — telling `ServiceAlertRepository.getActiveAlerts()` the alert expired at t=200, even though the feed says it is still active indefinitely from t=300. This is a correctness gap in the min/max-collapse strategy (D-02), not just a missing test case: `starts`/`ends` are computed independently by filtering out `undefined` per-array rather than tracking whether *any* period lacked an `end` (which should force the collapsed `end` to `null`).
**Fix:**
```ts
function deriveActiveWindow(periods: DashActivePeriod[] | undefined): ServiceAlertActivePeriod {
    if (!periods || periods.length === 0) {
        return { start: null, end: null };
    }

    const starts = periods.map((p) => p.start).filter((s): s is number => s !== undefined);
    const anyOpenEnded = periods.some((p) => p.end === undefined);
    const ends = periods.map((p) => p.end).filter((e): e is number => e !== undefined);

    return {
        start: starts.length > 0 ? new Date(Math.min(...starts) * 1000).toISOString() : null,
        end: !anyOpenEnded && ends.length > 0 ? new Date(Math.max(...ends) * 1000).toISOString() : null,
    };
}
```

## Info

### IN-01: `ServiceAlertPollService`'s `setInterval` handle is discarded, with no way to stop the poll loop

**File:** `src/server/api/services/ServiceAlertPollService.ts:30-33`
**Issue:** `start()` calls `setInterval(...)` but never captures or exposes the returned timer handle, and the `ServiceAlertPollService` interface exposes only `start()`, no `stop()`. This is consistent with the fact the loop is meant to run for the life of the process, and `app.ts`'s `process.exit(0)` on shutdown terminates it regardless — so this is not a functional bug today. It does, however, make the poll loop untestable/unstoppable in isolation (e.g. impossible to unit-test "the loop stops polling after some external signal", and impossible to reuse `ServiceAlertPollService` in an integration test harness that spins the app up/down repeatedly within one process, which would otherwise leak `setInterval` timers across test runs).
**Fix:** Consider returning `{ start, stop }` where `stop()` calls `clearInterval` on the captured handle, mirroring the cleanup pattern already used in `PredictionStreamService.unsubscribeFrom()`.

### IN-02: `informedRouteIds`/`informedStopIds` lose the per-entity route↔stop association from `informed_entity`

**File:** `src/server/api/services/ServiceAlertService.ts:47-52`
**Issue:** GTFS-RT `informed_entity` items can specify `route_id` and `stop_id` together on the same entry (meaning "this specific stop on this specific route"). The current mapping flattens all `route_id`s into one array and all `stop_id`s into a separate array independently, so the pairing information is lost — e.g. an alert with `informed_entity: [{route_id: "1", stop_id: "A"}, {route_id: "2", stop_id: "B"}]` becomes indistinguishable from one with `informed_entity: [{route_id: "1", stop_id: "B"}, {route_id: "2", stop_id: "A"}]`. This is very likely an intentional simplification per the flagged assumptions in `05-01-PLAN.md` (Phase 6 is explicitly tasked with route/stop matching logic), so it is not classified as a Warning, but flagging it here since it constrains what Phase 6 can correctly do with this data without re-deriving the association from the raw `DashAlert.informed_entity` array instead of the flattened `ServiceAlert` fields.
**Fix:** No action required in this phase; ensure Phase 6's matching logic is aware of this limitation, or preserve the raw `informed_entity` pairing on `ServiceAlert` if precise per-route/per-stop targeting is needed later.

### IN-03: Sloppy internal comment text left in from planning/authoring process

**File:** `src/server/api/repositories/ServiceAlertRepository.ts:3`
**Issue:** The comment `// Inclusive boundary on both ends (D-Claude's-discretion / flagged assumption 2):` mixes a project decision-log shorthand ("D-Claude's-discretion") into a permanent source comment. It reads as an artifact of the planning/authoring process rather than an intentional, durable code comment, and will be confusing to a future reader with no access to `05-CONTEXT.md`.
**Fix:**
```ts
// Inclusive boundary on both ends: an alert is active when start <= referenceTime <= end.
// A null bound is unbounded on that side. (See 05-CONTEXT.md flagged assumption 2.)
```

---

_Reviewed: 2026-09-01T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
