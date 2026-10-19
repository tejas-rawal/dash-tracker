# Phase 12: Bounded Upstream Calls & Error Safety Nets - Context

**Gathered:** 2026-09-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Every DASH call made through the shared axios client (`src/server/config/axios.ts`) is bounded by a hard, env-configurable deadline. A timed-out (or otherwise failed) upstream call reaches the live endpoints (`/predictions`, `/predictions/nearby`, `/vehicles`) as `UpstreamApiError` and returns 502. The startup route/stop load and the 5-minute alert poll use the same bounded client, so a timeout there shows up as a logged error. Separately, SSE response errors are logged and clean up their subscriber just like a disconnect does, and process-level `unhandledRejection` / `uncaughtException` handlers log through Winston.

Out of this phase: boot retry/backoff, readiness gating, and refresh loops (Phase 13); health endpoints and rate limiting (Phase 14); caching/coalescing (UPST-03, future).

Requirements: UPST-01, UPST-02, ERR-01, ERR-02.

</domain>

<decisions>
## Implementation Decisions

### Timeout budget
- **D-01:** One timeout for **every** DASH call, including the bulk `/info/{agency}/routes?verbose=true` load. There is no separate or longer budget for the startup load (Phase 13's retry covers a slow boot).
- **D-02:** New env var `DASH_API_TIMEOUT_MS`: milliseconds, Zod-validated in `src/server/config/environment.ts` as `z.coerce.number().int().positive().default(10000)`. It's exposed as `environment.dashApi.timeoutMs`. An invalid value fails startup the same way the other env vars do.
- **D-03:** Default is **10 seconds** (10000 ms).
- **D-04:** The limit is a **hard total deadline**, not only axios's socket-idle `timeout`. A slow trickle of data must not run past `DASH_API_TIMEOUT_MS`. Likely approach: a fresh `AbortSignal.timeout(ms)` per request (e.g. set by a request interceptor), possibly alongside axios `timeout`. **Pitfall:** the signal must be created per request. A single signal set on instance defaults would expire once and then cancel every later call. The researcher should confirm how axios 1.7.9 handles `signal` + `timeout` in the Node http adapter.

### Timeout → 502 mapping
- **D-05:** Raw axios failures are turned into `UpstreamApiError` in **one central response-error interceptor** on the shared axios instance. That covers timeouts, aborts, connection errors, and non-2xx responses. `PredictionService` and `VehicleService` currently let raw `AxiosError`s through, which turns them into 500s. The interceptor fixes that, and it also covers `ServiceAlertService` and `BusDataRepository`.
- **D-06:** The interceptor builds `UpstreamApiError` from a **message string only**. It never attaches the axios error object (no `cause`, no spreading config), because `config.headers.Authorization` carries `DASH_API_KEY` (same rule as T-11-01).
- **D-07:** Remove the now-redundant per-service try/catch wrapping in `NearbyPredictionService.fetchFromDashApi` (project principle: no redundant or compat layers). Nearby's `UpstreamApiError`s for bad response shapes (success: false, malformed body) stay, since they're about response content, not transport. Update its tests to match.
- **D-08:** Timeouts get a **distinct message**, e.g. `DASH API request timed out after 10000ms`, so logs and 502 bodies tell a hang apart from a DASH 5xx or connection refusal. Other transport failures keep a generic `DASH API request failed: <message>`-style message.
- **D-09:** The status stays **502** (per UPST-02). Don't add a 504 or a new error class, and leave the existing controller mappings alone.

### Rejection policy
- **D-10:** `process.on("unhandledRejection")` logs at error level and **keeps the process running**. It does not exit. This fits the milestone goal ("the server stays up") and overrides Node 20's default of crashing.
- **D-11:** Also add `process.on("uncaughtException")`: log through Winston, then `process.exit(1)`. A synchronous throw that escapes leaves unknown state, so exiting is correct. The only change is that the crash now goes through Winston instead of the raw stderr dump. **Reversibility:** reversible.
- **D-12:** Log only the **message + stack** of the rejection/exception reason (`String(reason)` for non-Error values). Never serialize the full reason object, because an axios error would leak `DASH_API_KEY`.
- Register the handlers early in `src/server/app.ts`, before repository init and the alert poll start, so rejections during boot are caught too.

### SSE error cleanup
- **D-13:** On `res.on("error")` in `PredictionStreamController`, log at **warn** with the stop id and error message. Client-abort `EPIPE`/`ECONNRESET` errors are routine on mobile, so they aren't error-level.
- **D-14:** The error path runs **exactly the disconnect cleanup** (`unsubscribe()` + `res.end()`) through one shared, idempotent cleanup function used by both `req.on("close")` and `res.on("error")`. When error is followed by close, cleanup must not run twice (`unsubscribeFrom` is already idempotent, but the shared function should guard anyway). Other subscribers on the same stop keep receiving updates, and the per-stop poll stops only when the last subscriber leaves (existing `unsubscribeFrom` behavior).
- **D-15:** Don't add a second cleanup path in `PredictionStreamService`. A failed `res.write` on a broken socket emits `error` on the response, and the new handler covers it. The existing per-subscriber try/catch-and-log in `poll()` stays as is.
- The `error` listener must be attached so that an error before or around the `writeHead` step is also handled (the planner decides the exact placement relative to the existing `closed`/`req.destroyed` checks).

### Claude's Discretion
- Exact interceptor structure (request interceptor for the signal vs. setting `signal` another way) and how timeouts are detected (`ECONNABORTED`/`ETIMEDOUT` vs. `ERR_CANCELED` with a `TimeoutError` reason). Either is fine as long as D-04/D-08 hold.
- Layering: the interceptor lives in `src/server/config/axios.ts` but needs `UpstreamApiError` from `src/server/api/errors`. Importing it there is acceptable. Moving the errors module is not required.
- Where the process handlers live (inline in `app.ts` vs. a small `config`/bootstrap helper), as long as they're registered first and are testable.
- Whether `BusDataRepository.fetchAndProcessData`'s own catch/rethrow needs any change once errors arrive pre-wrapped (it already rethrows message-only).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & scope
- `.planning/REQUIREMENTS.md` — UPST-01, UPST-02, ERR-01, ERR-02 (Phase 12), plus Out of Scope (no caching/coalescing)
- `.planning/ROADMAP.md` §"Phase 12: Bounded Upstream Calls & Error Safety Nets" — the 5 success criteria (blackholed DASH → 502, Zod env var, startup + alert poll bounded, SSE error cleanup, unhandledRejection logged)
- `.planning/PROJECT.md` Key Decisions — "Upstream errors are wrapped as `UpstreamApiError` from `error.message` only" (T-11-01), which D-06/D-12 extend

No external specs. Requirements are fully captured in the decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/server/config/axios.ts`: the shared `axiosInstance` (exported as `axios` from `src/server/config/index.ts`). This is where the timeout, signal, and error interceptor go. All DASH calls already use it.
- `src/server/config/environment.ts`: Zod schema plus the `environment.dashApi` object. Add `DASH_API_TIMEOUT_MS` following the `PORT` pattern (`z.coerce.number().int().positive().default(...)`, with the `biome-ignore useNamingConvention` comment).
- `src/server/api/errors/index.ts`: `UpstreamApiError` (message-only constructor).
- `NearbyPredictionService.fetchFromDashApi` (lines ~95-110): the existing message-only wrap pattern that the interceptor generalizes (D-07 removes it).

### Established Patterns
- Controllers (`PredictionController`, `VehicleController`, `NearbyPredictionController`, `PredictionStreamController`) already map `UpstreamApiError` → 502 and unknown → 500. No controller changes are needed for UPST-02 once services throw `UpstreamApiError`.
- Upstream call sites: `PredictionService.ts:57`, `VehicleService.ts:32`, `NearbyPredictionService.ts:102`, `ServiceAlertService.ts:27`, `BusDataRepository.ts:112`.
- `PredictionStreamService.unsubscribeFrom` already deletes the subscriber and clears the per-stop interval when the set empties. It's idempotent.
- `src/server/test/setup.ts` sets the env for tests. `DASH_API_TIMEOUT_MS` has a default, so setup needs no change unless a test wants a short timeout.

### Integration Points
- `src/server/app.ts`: register the process handlers at the top. The existing `.catch` → `process.exit(1)` for the init failure stays as is (Phase 13 replaces it).
- `PredictionStreamController.getPredictionsStream`: add the `res.on("error")` + shared cleanup next to the existing `req.on("close")`.

</code_context>

<specifics>
## Specific Ideas

- Timeout message format: `DASH API request timed out after {timeoutMs}ms`.
- Success criterion #1 is tested with a "blackholed" DASH (connection accepted, no response). Tests should cover that the deadline fires and maps to 502 without the API key appearing in the body or logs.

</specifics>

<deferred>
## Deferred Ideas

None. The discussion stayed within phase scope (uncaughtException handling was folded in as part of the same safety-net concern).

</deferred>

---

*Phase: 12-bounded-upstream-calls-error-safety-nets*
*Context gathered: 2026-09-28*
