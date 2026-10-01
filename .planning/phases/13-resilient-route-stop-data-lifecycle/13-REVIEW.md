---
phase: 13-resilient-route-stop-data-lifecycle
reviewed: 2026-10-01T14:37:21Z
depth: standard
files_reviewed: 33
files_reviewed_list:
  - src/server/api/controllers/BusRouteController.test.ts
  - src/server/api/controllers/BusRouteController.ts
  - src/server/api/controllers/FavoritesController.test.ts
  - src/server/api/controllers/FavoritesController.ts
  - src/server/api/controllers/NearbyPredictionController.test.ts
  - src/server/api/controllers/NearbyPredictionController.ts
  - src/server/api/controllers/PredictionController.test.ts
  - src/server/api/controllers/PredictionController.ts
  - src/server/api/controllers/PredictionStreamController.ts
  - src/server/api/controllers/RecentsController.test.ts
  - src/server/api/controllers/RecentsController.ts
  - src/server/api/controllers/StopController.test.ts
  - src/server/api/controllers/StopController.ts
  - src/server/api/controllers/VehicleController.test.ts
  - src/server/api/controllers/VehicleController.ts
  - src/server/api/controllers/errorResponse.test.ts
  - src/server/api/controllers/errorResponse.ts
  - src/server/api/errors/index.ts
  - src/server/api/repositories/BusDataRepository.test.ts
  - src/server/api/repositories/BusDataRepository.ts
  - src/server/api/routes/busRoutes.test.ts
  - src/server/api/routes/dataBootRetry.test.ts
  - src/server/api/routes/dataNotReady.test.ts
  - src/server/api/routes/dataReload.test.ts
  - src/server/api/routes/predictionRoutes.test.ts
  - src/server/api/routes/upstreamTimeout.test.ts
  - src/server/api/services/BusDataRefreshService.test.ts
  - src/server/api/services/BusDataRefreshService.ts
  - src/server/api/services/FavoritesService.test.ts
  - src/server/api/services/RecentsService.test.ts
  - src/server/api/services/ServiceAlertPollService.test.ts
  - src/server/api/services/ServiceAlertPollService.ts
  - src/server/app.ts
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-10-01T14:37:21Z
**Depth:** standard
**Files Reviewed:** 33
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

I reviewed the phase-13 diff (`b6e3b75..HEAD`): the shared `sendErrorResponse` helper and `DataNotReadyError`, the atomic `BusDataRepository.load()` with load-state tracking, the `BusDataRefreshService` boot-retry/hourly-refresh loop, `ServiceAlertPollService.stop()`, and the listen-first boot and shutdown order in `app.ts`. I also traced the callers the change affects (`PredictionService`, `PredictionStreamService`, `FavoritesService`, `RecentsService`, `VehicleService`, `config/axios.ts`, `config/processHandlers.ts`). The full suite passes (43 files, 630 tests, no type errors).

The core mechanics are sound:
- The three maps swap in one synchronous step.
- A failed or empty load never replaces live data.
- Error objects carrying the API key are reduced to a message before they are stored or logged.
- The loader chains attempts, so they never overlap, and `stop()` reliably prevents re-arming.
- A second shutdown signal is harmless because `close()` is idempotent.

The remaining problems come from what the new hourly refresh now exposes, plus gaps in visibility and validation:
- SSE loops for stops removed by a refresh keep polling forever.
- Malformed stops with missing fields still get past `createStop` validation.
- The server now reports itself up with no readiness signal and no error-level log while it 503s every data endpoint.

I found no critical issues.

## Warnings

### WR-01: Hourly refresh strands SSE streams for stops that the new dataset drops

**File:** `src/server/api/services/BusDataRefreshService.ts:57` (trigger); `src/server/api/services/PredictionStreamService.ts:32-46` (effect)
**Issue:** Before this phase, route/stop data never changed after boot. Now `runAttempt()` swaps in a fresh dataset every hour. If DASH removes or renumbers a stop, every open `/predictions/stream?stop=X` loop for that stop keeps its `setInterval`. Each 30 s tick calls `getPredictionsForStop`, which throws `NotFoundError` from `getValidatedStop` (`PredictionService.ts:33-35`). `poll()` catches it and logs at **error** level, and subscribers stay connected but never get another frame. This repeats every 30 s per stranded stop for as long as any client stays connected. Riders silently see predictions that stop updating, and the logs fill with error lines for a condition the system created itself. No test covers a refresh removing a stop that has live subscribers.
**Fix:** Treat `NotFoundError` in the poll loop as terminal for that stop: notify subscribers and tear down the loop.
```ts
} catch (error) {
    if (error instanceof NotFoundError) {
        clearInterval(entry.timer);
        loops.delete(stopId);
        for (const subscriber of entry.subscribers) onGone(subscriber); // e.g. send `event: gone` and end the response
        return;
    }
    ...
}
```
Alternatively, have the stream controller close the response when the service signals that the stop is gone. Either way, add a test that drives a reload which drops a subscribed stop.

### WR-02: `createStop` validation lets missing or null code/lat/lon through, and the refresh now re-applies bad stops every hour

**File:** `src/server/api/repositories/BusDataRepository.ts:190-204`
**Issue:** The checks rely on `Number.isNaN`, which is `true` only for an actual `NaN`:
- If `code`, `lat` or `lon` is missing, `typeof` is `"undefined"`, so the value is used as-is (`undefined`), and `Number.isNaN(undefined) === false`.
- If a value is `null`, `typeof null === "object"`, so `null` passes the same way.

So a DASH stop with no `code` or no coordinates is committed as a `BusStop` with `code: undefined` or `lat: null`, even though the model declares `number`. In nearby-stop distance maths, `null` coerces to `0`, which puts the stop at (0, 0). `routeData.id` and `directionData.id` are not validated at all, so a route without an id is stored under the key `undefined`. This predates the phase, but phase 13 made `load()` the single all-or-nothing gate and pinned "one malformed stop fails the whole load". The gate therefore fails closed only for *unparseable strings* and fails open for *absent* values. The hourly refresh also now re-applies such data on its own, with no restart.
**Fix:** Validate finiteness rather than "not NaN". Better, parse the payload with the Zod dependency the project already has:
```ts
const toFinite = (value: unknown): number =>
    typeof value === "string" ? Number.parseFloat(value) : typeof value === "number" ? value : Number.NaN;
const code = typeof stopData.code === "string" ? Number.parseInt(stopData.code, 10) : toFinite(stopData.code);
if (!Number.isFinite(code)) throw new Error(`Invalid stop code for stop '${stopData.id}': '${stopData.code}'`);
if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error(/* ... */);
```
Also reject routes and directions whose `id` is not a non-empty string.

### WR-03: The server now listens before it can serve, with no readiness signal, and `getLoadState()` has no production consumer

**File:** `src/server/app.ts:39-46`; `src/server/api/repositories/BusDataRepository.ts:81-88`
**Issue:** Before this phase, the process only bound the port after route/stop data loaded, so a TCP or `GET /` health check implied the server could serve data. Now `app.listen()` runs as soon as SQLite opens, `GET /` returns 200, and every data endpoint (routes, stops, predictions, the stream, vehicles with a route filter, favorites, recents) answers 503 until DASH responds. If DASH is down or the API key is wrong, this can last indefinitely. During a rolling deploy, an orchestrator using the existing liveness signal will move traffic onto instances that cannot serve. Nothing in this phase exposes `getLoadState()`: its only callers are tests, and the comment defers readiness to "Phase 14". This trades a working deployment signal for unfinished work, which goes against the project's "never trade a working product for unfinished complexity" principle.
**Fix:** Ship a minimal readiness endpoint in this phase (for example `GET /ready`, returning 200 when `getLoadState().lastLoadedAt` is set and 503 otherwise). Alternatively, keep `getLoadState()` out until Phase 14 needs it, and document in the deploy notes that health checks must not target `/` or the TCP port.

### WR-04: A permanent load failure (for example a bad `DASH_API_KEY`, which gets a 401) is logged only at warn, forever

**File:** `src/server/api/services/BusDataRefreshService.ts:58-65`
**Issue:** The loader deliberately never logs above warn (D-08) and never gives up (D-06). The axios interceptor maps every failure, including a 401 or 403 auth rejection, to an `UpstreamApiError` that the loader treats like a transient blip. With a misconfigured key, the process:
- stays up and reports itself running,
- answers 503 on every data endpoint indefinitely,
- emits only a warn line about once a minute.

Combined with WR-03, operators who alert on error level get no signal at all. The project convention lists "error conditions" as a logging category, and a startup config failure was previously fatal and loud.
**Fix:** Escalate once the failure is clearly not transient. For example, log at error on the first failure whose upstream status is 401 or 403, or once `consecutiveFailures` crosses a threshold (such as 10 attempts, roughly 5 minutes at the cap). Keep warn for ordinary retries. Update the "nothing is logged at error level" test assertions to match.

## Info

### IN-01: `listFavorites` / `listRecents` answer 200 `[]` before the first load for devices with no records, and 503 for everyone else

**File:** `src/server/api/services/FavoritesService.ts:34-41`; `src/server/api/services/RecentsService.ts:19-27`
**Issue:** The repository is only touched while hydrating records. A device with no rows gets `200 []` during the not-ready window, while a device with rows gets `503 Retry-After: 5`. Clients cannot rely on 503 meaning "data not ready" for these endpoints. This is harmless today, but the endpoint contract is inconsistent and the tests don't pin it.
**Fix:** Either accept and document it, or add an explicit readiness check (for example `busDataRepository.getLoadState()` or a dedicated `assertReady()`) before reading the SQLite rows.

### IN-02: `ServiceAlertPollService.start()` is not idempotent, unlike the new loader

**File:** `src/server/api/services/ServiceAlertPollService.ts:31-36`
**Issue:** A second `start()` overwrites `interval` and leaks the first timer, which `stop()` can then never clear. `stop()` followed by `start()` also restarts polling. `BusDataRefreshService` guards both cases with `started`/`stopped` flags, so the two loops that `app.ts` stops "together" have different lifecycle semantics.
**Fix:** Add the same `started`/`stopped` guards: `if (interval !== undefined || stopped) return;`.

### IN-03: `BusDataRepository.load()` has no in-flight guard

**File:** `src/server/api/repositories/BusDataRepository.ts:66-79`
**Issue:** The old `initializationPromise` dedupe was removed. Two concurrent `load()` calls can finish out of order, so an older dataset can overwrite a newer one. A slower failing call can also set `lastFailedAt`/`lastError` after a newer success. Today the chained loader is the only production caller, so this cannot happen, but a planned admin reload or a Phase 14 trigger would reintroduce it silently.
**Fix:** Either share the in-flight promise (`this.inFlight ??= this.doLoad().finally(() => (this.inFlight = undefined))`), or document on `load()` that callers must serialize.

### IN-04: `computeRetryDelayMs` is exported but accepts invalid attempt numbers

**File:** `src/server/api/services/BusDataRefreshService.ts:14-17`
**Issue:** `attempt <= 0` gives sub-second ceilings, and `NaN` gives `NaN`, which `setTimeout` coerces to 1 ms, creating a hot retry loop. The only internal caller always passes a value of 1 or more, but the function is part of the module's public surface.
**Fix:** Clamp the input (`const n = Math.max(1, Math.floor(attempt) || 1)`), or stop exporting the function and test it through the service.

### IN-05: Project guidance in `CLAUDE.md` now contradicts the code

**File:** `.claude/CLAUDE.md:70-73`
**Issue:** The file still says the repository is "populated once via `initialize()` before `app.ts` starts accepting requests; in-memory maps are read-only afterward (no cache invalidation)". It also lists error mapping without 503 and gives the entry-point order as "init repository → start Express". After this phase, all of these statements are false. Agents and contributors read this file as ground truth.
**Fix:** Update the Architecture section to describe the listen-first boot, the `load()`/`BusDataRefreshService` lifecycle (backoff, then hourly), `DataNotReadyError` → 503 with `Retry-After`, and the generic 500 body.

---

_Reviewed: 2026-10-01T14:37:21Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
