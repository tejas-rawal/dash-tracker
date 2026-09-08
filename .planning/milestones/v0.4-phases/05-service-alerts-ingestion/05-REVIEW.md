---
phase: 05-service-alerts-ingestion
reviewed: 2026-09-02T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - src/server/api/models/ServiceAlert.ts
  - src/server/api/models/index.ts
  - src/server/api/repositories/ServiceAlertRepository.test.ts
  - src/server/api/repositories/ServiceAlertRepository.ts
  - src/server/api/repositories/index.ts
  - src/server/api/services/ServiceAlertPollService.test.ts
  - src/server/api/services/ServiceAlertPollService.ts
  - src/server/api/services/ServiceAlertService.test.ts
  - src/server/api/services/ServiceAlertService.ts
  - src/server/app.ts
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-09-02T00:00:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

This is a full fresh re-review of phase 05's current state (models, repository, poll service, service, and app.ts wiring), not a diff against the prior 05-REVIEW.md. The previously-tracked findings (WR-01 array-rooted body guard, WR-02 duplicated error message, IN-01 stale test titles, IN-02 optional `entities` typing) are all confirmed fixed in the current code: `fetchFromDashApi()` now guards with `Array.isArray(body)`, the malformed-body message is factored into `MALFORMED_BODY_MESSAGE` with a distinguishing suffix for the JSON-parse-failure branch, test titles reference `entities`, and `DashAlertsApiResponse.entities` is optional.

Two new issues were found during this pass, both in `deriveActiveWindow()`/entity-validation in `ServiceAlertService.ts`, plus three minor robustness/quality items. No critical/blocker-level defects: nothing found causes a crash outside of the poll service's existing try/catch, and nothing found is a security issue. `ServiceAlertPollService` correctly wraps `fetchAlerts()` in try/catch, so both warnings below degrade to "poll tick silently skipped, logged with a low-signal message" rather than an unhandled exception — but that is itself the class of failure this phase's prior gap-closure rounds (WR-01/WR-02/WR-03) were specifically trying to eliminate for other cases, so the same standard is applied here.

## Warnings

### WR-01: `deriveActiveWindow` has no `anyOpenStarted` check symmetric to `anyOpenEnded`, so a period without a `start` field can be silently overridden by another period's bounded `start`

**File:** `src/server/api/services/ServiceAlertService.ts:55-68`
**Issue:** The prior gap-closure round (05-02, "WR-03") fixed exactly this class of bug on the *end* side: `anyOpenEnded = periods.some((p) => p.end === undefined)` ensures that if any contributing `active_period` entry has no `end` (per GTFS-RT semantics, "active period is unbounded into the future"), the collapsed window's `end` stays `null` even if another period in the same array has a defined `end`. No equivalent `anyOpenStarted` check exists for `start`:

```ts
const starts = periods.map((p) => p.start).filter((s): s is number => s !== undefined);
const anyOpenEnded = periods.some((p) => p.end === undefined);
const ends = periods.map((p) => p.end).filter((e): e is number => e !== undefined);

return {
    start: starts.length > 0 ? new Date(Math.min(...starts) * 1000).toISOString() : null,
    end: !anyOpenEnded && ends.length > 0 ? new Date(Math.max(...ends) * 1000).toISOString() : null,
};
```

Concretely: `active_period: [{ end: 7000 }, { start: 5000, end: 6000 }]` — the first period has no `start`, meaning (per GTFS-RT `TimeRange` semantics, the same spec this code cites for D-02/D-03) that period is already active from the indefinite past. The union of the two periods should therefore have an unbounded (`null`) start. Instead, `starts = [5000]` (the `undefined` start from period 1 is filtered out of the array, and there is no check for its presence), so the code derives `start: <2000s-epoch of 5000>`, incorrectly treating the alert as *not yet active* before that time — the opposite of the correct "already active" signal. This is the same bug class as WR-03, just on the mirror-image field, and none of the mixed-boundedness tests (`ServiceAlertService.test.ts:156-171`) exercise a missing-`start` period; only the missing-`end` case is covered.
**Fix:**
```ts
const anyOpenStarted = periods.some((p) => p.start === undefined);
// ...
return {
    start: !anyOpenStarted && starts.length > 0 ? new Date(Math.min(...starts) * 1000).toISOString() : null,
    end: !anyOpenEnded && ends.length > 0 ? new Date(Math.max(...ends) * 1000).toISOString() : null,
};
```
Add a regression test mirroring the existing WR-03 one but for the `start` side: two periods, one `{ end: X }` (no `start`) and one `{ start: Y, end: X }`, asserting `activePeriod.start` is `null`.

### WR-02: `isValidDashAlertEntity` only checks that `alert` is a non-null object, not that its nested array-typed fields (`informed_entity`, `active_period`) are actually arrays — a malformed nested field crashes `mapToServiceAlert` with an unhandled `TypeError` instead of the `UpstreamApiError` the entity-validation gate exists to produce

**File:** `src/server/api/services/ServiceAlertService.ts:43-51`, `55-68`, `73-78`
**Issue:** `isValidDashAlertEntity` is the exact gate WR-02 (prior round) introduced to turn a malformed upstream entity into a descriptive `UpstreamApiError` instead of a low-signal crash. It validates `entity.id` is a string and `entity.alert` is a non-null object, but goes no further:
```ts
function isValidDashAlertEntity(entity: unknown): entity is DashAlertEntity {
    return (
        typeof entity === "object" &&
        entity !== null &&
        typeof (entity as DashAlertEntity).id === "string" &&
        typeof (entity as DashAlertEntity).alert === "object" &&
        (entity as DashAlertEntity).alert !== null
    );
}
```
If `alert.informed_entity` or `alert.active_period` is present but not an array (e.g. the upstream feed sends an object or a string in that position — a realistic malformed-JSON scenario for exactly the kind of live-API surprise this phase's debug log (`.planning/debug/service-alerts-malformed-body.md`) already documents once), the entity passes this guard. Downstream, `mapToServiceAlert` does `(alert.informed_entity ?? []).map(...)` and `deriveActiveWindow(alert.active_period)` does `periods.map(...)` — both throw a raw, unguarded `TypeError` (e.g. `"bad".map is not a function`) rather than the intended `UpstreamApiError("... entity item is malformed")`. In production this is caught by `ServiceAlertPollService`'s try/catch (so it doesn't crash the process), but it produces a generic JS runtime error message in the logs instead of the diagnosable message the validation layer exists to guarantee, and it fails the *entire* poll tick's batch rather than the plan's evident intent of rejecting only malformed items.

Related, lower-severity gap in the same guard: `typeof (entity as DashAlertEntity).alert === "object"` is also true when `alert` is an array (`typeof [] === "object"`), so `{ id: "x", alert: [] }` passes validation; `mapToServiceAlert` then reads `alert.informed_entity`/`alert.active_period`/etc. as `undefined` off an array and silently produces an almost-empty `ServiceAlert` rather than rejecting the item.
**Fix:** Extend the guard to check array-ness of the nested fields when present:
```ts
function isValidDashAlertEntity(entity: unknown): entity is DashAlertEntity {
    if (typeof entity !== "object" || entity === null) return false;
    const { id, alert } = entity as DashAlertEntity;
    if (typeof id !== "string" || typeof alert !== "object" || alert === null || Array.isArray(alert)) {
        return false;
    }
    if (alert.informed_entity !== undefined && !Array.isArray(alert.informed_entity)) return false;
    if (alert.active_period !== undefined && !Array.isArray(alert.active_period)) return false;
    return true;
}
```
Add regression tests for `informed_entity`/`active_period` being a non-array value, and for `alert` being an array.

## Info

### IN-01: `ServiceAlertPollService.start()` has no re-entrancy guard — calling it twice creates two independent `setInterval` loops polling DASH concurrently

**File:** `src/server/api/services/ServiceAlertPollService.ts:28-33`
**Issue:** `start()` unconditionally fires an immediate poll and registers a new `setInterval`. There is no idempotency flag, so a second `start()` call (e.g. a future refactor that re-wires this at request time, or a test helper that calls it twice) would double the DASH API call rate and run two overlapping poll loops indefinitely. `applyAlerts()`'s atomic-swap design means this wouldn't corrupt data, but it's an unguarded footgun in an otherwise carefully-documented module (see the D-06/D-07 comments already present). Not exercised today since `app.ts` calls `start()` exactly once.
**Fix:** Track a started flag and no-op (or throw) on a second call:
```ts
let started = false;
function start(): void {
    if (started) return;
    started = true;
    void pollAlerts();
    setInterval(() => { void pollAlerts(); }, POLL_INTERVAL_MS);
}
```

### IN-02: No `stop()` — `ServiceAlertPollService`'s interval is never cleared, including during app.ts's graceful shutdown path

**File:** `src/server/api/services/ServiceAlertPollService.ts:7-9`, `src/server/app.ts:39-48`
**Issue:** `app.ts`'s `shutdown()` closes the HTTP server and calls `process.exit(0)`, but never references `serviceAlertPollService`, and the service's public interface (`{ start(): void }`) exposes no way to cancel the outstanding `setInterval`. In practice `process.exit(0)` forcibly terminates the process regardless, so this doesn't currently cause a hang or resource leak, but it means a poll tick can fire (and log an outbound DASH API call) after the "gracefully shutting down" log line, and the module offers no clean-teardown hook for tests or future callers that don't `process.exit`.
**Fix:** Return a `stop()` alongside `start()` and call it from `shutdown()`:
```ts
export interface ServiceAlertPollService {
    start(): void;
    stop(): void;
}
// ...
let timer: NodeJS.Timeout | undefined;
function start(): void {
    void pollAlerts();
    timer = setInterval(() => { void pollAlerts(); }, POLL_INTERVAL_MS);
}
function stop(): void {
    if (timer) clearInterval(timer);
}
return { start, stop };
```

### IN-03: `isAlertActive` re-parses `activePeriod.start`/`end` into `new Date(...)` on every call, for every alert, on every `getActiveAlerts()` invocation

**File:** `src/server/api/repositories/ServiceAlertRepository.ts:5-16`
**Issue:** Not a correctness bug (performance is out of scope per review policy), but worth noting as a quality item: since `ServiceAlert.activePeriod.start`/`end` are stored as ISO strings and re-parsed on every filter call rather than once at `applyAlerts()` time, a malformed/unparseable ISO string (which shouldn't occur given the controlled `deriveActiveWindow` producer, but there is no runtime guarantee tying the two together) would silently produce `Invalid Date`, and comparisons against `Invalid Date` are always `false` on both sides of the `if` — meaning such an alert would be treated as always-active rather than rejected. This is defense-in-depth territory, not an active bug given the current single producer of `ServiceAlert` objects.
**Fix:** No action required unless a future producer of `ServiceAlert` (e.g. a second data source) is added; if so, validate `start`/`end` are parseable at construction time rather than at query time.

---

_Reviewed: 2026-09-02T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
