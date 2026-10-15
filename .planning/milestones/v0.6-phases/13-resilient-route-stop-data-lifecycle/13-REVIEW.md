---
phase: 13-resilient-route-stop-data-lifecycle
reviewed: 2026-10-01T19:04:35Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - .claude/CLAUDE.md
  - AGENTS.md
  - src/server/api/controllers/PredictionStreamController.test.ts
  - src/server/api/controllers/PredictionStreamController.ts
  - src/server/api/repositories/BusDataRepository.test.ts
  - src/server/api/repositories/BusDataRepository.ts
  - src/server/api/routes/dataReload.test.ts
  - src/server/api/routes/dataReloadStream.test.ts
  - src/server/api/services/PredictionStreamService.test.ts
  - src/server/api/services/PredictionStreamService.ts
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 13: Code Review Report (incremental, gap-closure plans 13-06 and 13-07)

**Reviewed:** 2026-10-01T19:04:35Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

This is an incremental review of the diff `f9d1d12..HEAD`. It covers the two gap-closure plans:
- **13-06:** validation of malformed upstream fields in `BusDataRepository`, via `parseDashNumber`, `requireId` and finiteness checks.
- **13-07:** ending SSE streams whose stop a reload drops. This adds `StreamSubscriber { onUpdate, onEnd }`, `endLoop` in `PredictionStreamService`, and wires the controller's `cleanup` as `onEnd`.

It also covers the matching updates to `CLAUDE.md` and `AGENTS.md`. The five affected test files pass (118 tests, no type errors).

**Stream teardown (13-07) is correct.** I traced the races:
- **Stale tick from a replaced loop:** `endLoop` uses an identity guard (`loops.get(stopId) !== entry`), so the stale tick cannot tear down the newer loop.
- **Unsubscribe during teardown:** the loop is deleted before any `onEnd` runs, so the controller's `unsubscribe()` inside `cleanup` is a no-op.
- **Overlapping ticks:** these are possible when `DASH_API_TIMEOUT_MS` is above 30 s. They cannot write after the response ends, because `endLoop` clears `entry.subscribers` before calling `onEnd`.
- **Error source:** `NotFoundError` comes only from `getValidatedStop`. Upstream failures are mapped to `UpstreamApiError` by the axios interceptor, so a transient DASH failure cannot end a stream.
- **Double close:** the socket `close` after `res.end()` is absorbed by the `cleanedUp` guard.

**Field validation (13-06) closes the original gap.** Absent, `null`, boolean and non-string ids now fail the whole load. The remaining weaknesses are:
- Numeric parsing still accepts strings it should reject, such as `"12abc"` or `"101.7"` for a code, and out-of-range coordinates.
- The string fields (`name`, `title`, `type`, `shortName`) are still unvalidated and typed as if they were trusted.

## Status of prior findings

| Prior ID | Status | Notes |
|----------|--------|-------|
| WR-01 (SSE streams stranded when a refresh drops a stop) | **Resolved** | `PredictionStreamService.ts:30-54,77-80` ends every subscriber once, clears the interval, and logs a single warn instead of an error every 30 s. The controller ends the response through its single cleanup path (`PredictionStreamController.ts:54`). Coverage is at service, controller and end-to-end level (`dataReloadStream.test.ts`), including the stale-tick and leave-while-in-flight races. |
| WR-02 (missing or null code/lat/lon and missing ids slip through) | **Resolved as scoped** | `BusDataRepository.ts:33-50,219-233` rejects absent, null, non-numeric and non-finite code/lat/lon, and missing, empty, whitespace-only or non-string route/direction/stop ids. The residual leniency is tracked as new WR-01 and WR-02 below. |
| IN-05 (CLAUDE.md contradicts code) | **Resolved** | The Architecture section in both `CLAUDE.md` and `AGENTS.md` now matches `app.ts` and the repository lifecycle. Residual staleness is in IN-04 below. |
| WR-03, WR-04, IN-01, IN-02, IN-04 | **Still open (not in this diff)** | Readiness signal, warn-only permanent load failure, favorites/recents 200-vs-503 inconsistency, non-idempotent `ServiceAlertPollService.start()`, and unclamped `computeRetryDelayMs`. None of these files changed. They are not re-counted here. |
| IN-03 (no in-flight guard on `load()`) | **Still open** | `BusDataRepository.ts:87-100` was modified but still has no in-flight dedupe or a "callers must serialize" note. Not re-counted. |

## Warnings

### WR-01: Numeric validation still accepts partially parsed strings, non-integer codes and out-of-range coordinates

**File:** `src/server/api/repositories/BusDataRepository.ts:33-41, 220-231`
**Issue:** `parseDashNumber` passes strings to `Number.parseInt`/`Number.parseFloat`. Both parse only a leading prefix, and the result then needs only to be finite. As a result:
- `code: "12abc"` loads as `12` (confirmed: `parseInt("12abc", 10) === 12`).
- `code: "101.7"` loads silently as `101`, while the numeric `101.7` loads unchanged as `101.7`. The same logical value gives different results depending on its JSON type, and `BusStop.code` is no longer reliably an integer.
- `lat: "38.8xyz"` loads as `38.8`.
- `lat: 999` or `lon: -500` load unchanged. These are not real coordinates, and they feed straight into the nearby-stop distance maths in `services/distance.ts`.

The 13-06 contract is that a malformed upstream field fails the whole load, so the last good copy keeps serving. These inputs are malformed but still commit. The code also hand-rolls a validator, even though the project already ships Zod for exactly this purpose. CLAUDE.md says to "Lean on the dependencies already in the project", and the prior review's fix suggested Zod.
**Fix:** Parse the whole string, and check that the value is an integer and within range:
```ts
function parseDashNumber(value: unknown): number {
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim() !== "") return Number(value); // whole-string parse: "12abc" -> NaN
    return Number.NaN;
}
// in createStop
if (!Number.isInteger(code)) throw new Error(`Invalid stop code for stop '${id}': '${String(stopData.code)}'`);
if (!(Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180)) {
    throw new Error(/* existing coordinates message */);
}
```
An alternative is a Zod schema for `StopData`, for example `z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number().int())` for `code` and `.finite().min(-90).max(90)` for `lat`. Add table rows for `"12abc"`, `"101.7"`, `"38.8xyz"` and `lat: 91`.

### WR-02: String fields stay unvalidated while their interfaces still claim `string`, so a bad shortName is listed but cannot be looked up

**File:** `src/server/api/repositories/BusDataRepository.ts:7-29, 154-156, 203-209, 233, 248-252`
**Issue:** 13-06 widened only `id`, `code`, `lat` and `lon` to `unknown`. `RouteData.shortName`, `longName`, `name`, `type`, `DirectionData.title` and `StopData.name` still claim to be trusted strings, and they are copied unchecked into models typed `string`. Concrete failures:
- **Numeric `shortName`, for example `42`:** `routeData.shortName || ""` keeps the number. `if (route.shortName)` is truthy, so the route is stored in `routesByShortName` under the **number** key `42`. `getRouteByShortName("42")` (`:278-281`) uses a string key, so `GET /api/v1/routes/42` returns 404 while `GET /api/v1/routes/all` lists the route. Prediction recents resolution (`resolveRouteIdForRecent`) silently misses it too.
- **`StopData.name` absent or `null`:** the stop commits with `name: undefined`/`null`. The `stop.name` field in `StopPredictionsResponse` is then dropped or nulled in every prediction and stream frame, which breaks the response contract without any error.
- **`type`:** stored as whatever DASH sent, with no check against `RouteType`.

This is the same "fails open for absent or wrong-typed values" pattern that the prior WR-02 flagged, now confined to the string fields.
**Fix:** Type every upstream field as `unknown` (or parse the payload with a Zod schema), and normalise explicitly:
```ts
const optionalText = (value: unknown): string => (typeof value === "string" ? value : "");
const requireText = (value: unknown, what: string): string => {
    if (typeof value === "string") return value;
    throw new Error(`Invalid ${what}: '${String(value)}'`);
};
// createRoute: shortName: optionalText(routeData.shortName), ...
// createStop:  name: requireText(stopData.name, `stop name for stop '${id}'`)
```
Validate `type` against the `RouteType` union. Add test rows for a numeric `shortName` and a missing stop `name`.

## Info

### IN-01: Structural malformations surface as raw TypeError messages in `lastError`

**File:** `src/server/api/repositories/BusDataRepository.ts:148-151, 172-174`
**Issue:** A `null` route or stop entry, or a non-array `directions`/`stops`, fails closed. That is correct, and the `structuralRows` tests cover it. However, the stored and logged message is the engine's text, for example `Cannot read properties of null (reading 'id')` or `(routeData.directions || []).map is not a function`. `getLoadState().lastError` is the field that the planned Phase 14 readiness endpoint serializes, and operators will see these messages instead of a domain message that names the bad item. The tests deliberately assert only `typeof lastError === "string"`, so this behaviour is unpinned.
**Fix:** Before reading fields or calling `.map`, check `typeof x === "object" && x !== null` and `Array.isArray(...)` (or use a Zod schema), and throw `Invalid route entry at index N` or `Invalid stops for direction '<id>'`.

### IN-02: Stream teardown sends no terminal frame, so clients cannot tell a removed stop from a dropped connection

**File:** `src/server/api/controllers/PredictionStreamController.ts:32-40, 54`
**Issue:** `onEnd` maps to `cleanup`, which calls `res.end()` without writing a final event. An `EventSource` client sees an ordinary disconnect. It waits for its reconnect delay, then reconnects, gets the 404, and closes with a generic `error` event. That works, as the comment at `PredictionStreamService.ts:74-76` intends. However, it costs an extra round trip per rider, and the client has no reason it can show to the user. The prior review suggested an explicit `event: gone`.
**Fix (optional):** In the controller's `onEnd`, write `event: end\ndata: {"reason":"stop_removed"}\n\n` before `cleanup()`. Pin the frame in the controller test and in `dataReloadStream.test.ts`.

### IN-03: The `dataReloadStream.test.ts` watchdog timer is never cleared, and its rejection can go unhandled

**File:** `src/server/api/routes/dataReloadStream.test.ts:147-153`
**Issue:**
- The real 2000 ms `setTimeout` inside the `Promise.race` is never cleared, so it outlives a passing test.
- `endedInTime` gets no rejection handler until line 173. If steps 2 to 4 take more than 2 s (for example on a loaded CI runner doing real HTTP plus `repository.load()`), the race rejects before anyone awaits it. Vitest then reports an "Unhandled Rejection" in addition to, or instead of, the assertion failure. This makes failures noisy and hard to read.

**Fix:** Keep the timer handle and `clearTimeout` it in a `finally`, or attach a no-op `endedInTime.catch(() => {})` right after creating it, so the later `await expect(endedInTime)` still asserts.

### IN-04: Project docs still miss the stream lifecycle, list only three endpoints, and pin the wrong Vitest version

**File:** `.claude/CLAUDE.md:30, 72-74`; `AGENTS.md:19, 47-50`
**Issue:**
- The updated Architecture bullets describe the reload lifecycle, but not its new consequence: live prediction streams end when a reload drops their stop.
- The Endpoints line still lists only `/routes/all`, `/routes/:shortName` and `/predictions`. It omits `/predictions/stream` and the other phase-era endpoints.
- The Tech Stack section says "Vitest 2.1.5", but `package.json` pins `vitest` at `3.2.6`. `@vitest/coverage-v8` is still at `2.1.5`.

Agents treat these files as ground truth.
**Fix:**
- Add a clause to the repository bullet: "a reload that drops a stop ends that stop's SSE streams; reconnects get 404".
- Complete the Endpoints list.
- Correct the Vitest version.

---

_Reviewed: 2026-10-01T19:04:35Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
