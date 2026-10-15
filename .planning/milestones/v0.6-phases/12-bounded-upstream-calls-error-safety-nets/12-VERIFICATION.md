---
phase: 12-bounded-upstream-calls-error-safety-nets
verified: 2026-09-30T16:28:35Z
status: passed
score: 31/31 must-haves verified (5/5 roadmap success criteria, 26/26 plan truths; 3/3 prohibitions test-enforced)
covered_files:
  - ".env.example"
  - ".planning/REQUIREMENTS.md"
  - ".planning/phases/12-bounded-upstream-calls-error-safety-nets/12-01-PLAN.md"
  - ".planning/phases/12-bounded-upstream-calls-error-safety-nets/12-01-SUMMARY.md"
  - ".planning/phases/12-bounded-upstream-calls-error-safety-nets/12-02-PLAN.md"
  - ".planning/phases/12-bounded-upstream-calls-error-safety-nets/12-02-SUMMARY.md"
  - ".planning/phases/12-bounded-upstream-calls-error-safety-nets/12-03-PLAN.md"
  - ".planning/phases/12-bounded-upstream-calls-error-safety-nets/12-03-SUMMARY.md"
  - ".planning/phases/12-bounded-upstream-calls-error-safety-nets/12-04-PLAN.md"
  - ".planning/phases/12-bounded-upstream-calls-error-safety-nets/12-04-SUMMARY.md"
  - "src/server/api/controllers/PredictionStreamController.test.ts"
  - "src/server/api/controllers/PredictionStreamController.ts"
  - "src/server/api/routes/predictionRoutes.test.ts"
  - "src/server/api/routes/upstreamTimeout.test.ts"
  - "src/server/api/services/NearbyPredictionService.test.ts"
  - "src/server/api/services/NearbyPredictionService.ts"
  - "src/server/app.ts"
  - "src/server/config/axios.test.ts"
  - "src/server/config/axios.ts"
  - "src/server/config/environment.test.ts"
  - "src/server/config/environment.ts"
  - "src/server/config/index.ts"
  - "src/server/config/processHandlers.test.ts"
  - "src/server/config/processHandlers.ts"
  - "src/server/test/setup.ts"
covered_digest: "v1:sha256:6d5704d2650da35bd151a248f8991a77139895f6a0b107ca39a13aba9b779fc6"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 5/5 roadmap success criteria (30/30 merged must-haves)
  gaps_closed: []
  warnings_closed:
    - "WR-01: DASH_API_TIMEOUT_MS now capped at 2_147_483_647. '2147483648' fails startup with 'Invalid environment configuration' (test passes)."
    - "WR-02: the uncaughtException exit now waits for Winston 'finish' and a stdout drain. Under stdout backpressure that drains within the 1 s fallback, the crash line survived 5/5 runs (it was lost 5/5 in the prior verification)."
    - "WR-03: a failed repository close during shutdown logs 'Shutdown failed: ...' and exits 1 (code read; UAT test 3 passed)."
  gaps_remaining: []
  regressions: []
coincidental_reliance_items:
  - truth: "An uncaught exception is logged through Winston as 'Uncaught exception: ...' and then the process exits with code 1 (12-04 truth 2, D-11)"
    reason: undeclared-precondition
    harden: "The truth holds only if nothing writes to the logger between logger.end() and exit. exitAfterLogFlush ends the logger and then keeps the process running until Winston's 'finish' and a stdout drain, or the 1 s fallback. Any logger call in that window, whether from live traffic or a second uncaught exception/unhandled rejection, makes Winston emit 'write after end' on the logger, which has no 'error' listener. The uncaughtException handler then throws inside itself and Node exits with code 7. Reproduced: two same-tick throws exit 7 in 3/3 runs. Under stdout backpressure with concurrent logging, the process exits 7 in 5/5 runs and the crash reason appears nowhere in stdout or stderr. Harden by making post-end log calls harmless (for example, attach an 'error' listener to the logger before end(), or stop routing to the logger once exit has started) and add a unit test for the second-exception case."
---

# Phase 12: Bounded Upstream Calls & Error Safety Nets Verification Report

**Phase Goal:** No DASH call can hang the server or a rider's request, and asynchronous errors that currently escape (SSE socket errors, unhandled promise rejections) are logged and cleaned up.
**Verified:** 2026-09-30T16:28:35Z
**Status:** passed (1 new non-blocking warning, introduced by the WR-02 fix, recorded for a developer decision)
**Re-verification:** Yes. The prior report (2026-09-29, passed) was stale: review fixes WR-01..WR-05 and IN-01..IN-04 (3a7034a, 567a886, 6fce4ae, ac39945, d8cd126, 84d545f, 320ee09, 88b12ee, efa8c3c) changed 12 files afterwards. Everything below was checked against the current code at HEAD 6f08e92.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria, the contract)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | With DASH blackholed, `/predictions`, `/predictions/nearby` and `/vehicles` each return 502 shortly after the timeout, and the body and logs never include the key | ✓ VERIFIED | `upstreamTimeout.test.ts` uses a real `http` server that never answers and goes through the real routers, controllers, services and bounded client (no axios mock; only `getStopById` is stubbed). All pass in this run: vehicles 218 ms, nearby 211 ms, predictions 213 ms, concurrent batch 225 ms. Each asserts the exact body `{error:"Bad Gateway", details:"DASH API request timed out after 200ms"}`, elapsed in [150, 2000) ms, and no `test-api-key` in the body or any info/warn/error call. Nearby also asserts no `38.8048`/`-77.0469`. |
| 2 | The timeout comes from a Zod-validated env var with a sensible default, and an invalid value fails startup like the other env vars | ✓ VERIFIED | `environment.ts:17`: `z.coerce.number().int().positive().max(2_147_483_647).default(10000)`, exposed as `dashApi.timeoutMs` (line 38). `environment.test.ts` passes 8/8: unset gives 10000, "2500" gives 2500, and non-numeric, zero, negative, fractional, empty and **above the max timer delay** (new with WR-01) all throw `Invalid environment configuration`. `.env.example:5` documents the value. |
| 3 | The startup load and the 5-minute alert poll use the same bounded client, so a blackholed DASH produces a logged timeout, not a hung boot or poll | ✓ VERIFIED | Call sites `BusDataRepository.ts:112` and `ServiceAlertService.ts:27` both use the barrel `axios`. Both E2E tests pass. **Real boot re-run on the current `app.ts`** against a blackholed DASH with `DASH_API_TIMEOUT_MS=500`: exit 1 after 1.75 s, logging `Failed to poll service alerts: DASH API request timed out after 500ms` and `Failed to initialize application data: … timed out after 500ms`. The key appeared 0 times. |
| 4 | An SSE response error mid-stream is logged, and the subscriber is removed exactly as on disconnect. The per-stop poll stops if it was the last subscriber, and others keep receiving updates | ✓ VERIFIED | `PredictionStreamController.ts:55-72`: a single guarded `cleanup` (sets `finished`, `cleanedUp` guard, then `unsubscribe()` and `res.end()`) is wired to `res.on("close")` (moved from `req` by WR-04) and to `res.on("error")`, which logs `SSE response error for stop …` at warn. Both are registered before `await subscribe` (line 76). The real-`PredictionStreamService` integration test passes: after A errors, B still gets the tick, and polling stops when the last subscriber leaves. `PredictionStreamService.ts` was last changed at 7d38f4d (phase 04), so it is untouched here (D-15). |
| 5 | An unhandled promise rejection anywhere is logged through Winston with its reason | ✓ VERIFIED | `processHandlers.ts:17-19` logs `Unhandled promise rejection: ${describeReason(reason)}` and never exits. It is registered at `app.ts:9`, before the poll (`:36`) and init (`:38`). **Child-process probe re-run:** it prints `error: Unhandled promise rejection: Error: tracer-boom` with the stack, then `still-alive`, and exits 0. |

**Score:** 5/5 roadmap truths verified, 0 present-but-behavior-unverified.

### Plan must-haves (merged, 26 truths)

All plan truths were checked against the current code and a named passing test or probe. Test names renamed by the review fixes are resolved to their current names below.

| Plan | Truth (short) | Status | Current evidence |
|------|---------------|--------|------------------|
| 12-01 T1 | vehicles 502 in 150–2000 ms, no key | ✓ | `upstreamTimeout.test.ts#returns 502 for GET /api/v1/vehicles shortly after the deadline, without leaking the API key` |
| 12-01 T2 | fresh per-request total deadline; trickle cut off | ✓ | `axios.ts:15-19` creates `AbortSignal.timeout(dashApi.timeoutMs)` inside the request interceptor. Since IN-01 it is combined with any caller signal via `AbortSignal.any`. `axios.test.ts#cuts off an upstream that trickles bytes without finishing at the same deadline` (202 ms) |
| 12-01 T3 | consecutive calls never inherit a deadline | ✓ | `axios.test.ts#gives every request its own deadline, so a call after an earlier deadline window still succeeds` |
| 12-01 T4 | central interceptor; exact timeout, ECONNREFUSED and 503 messages | ✓ | `toUpstreamApiError` (`axios.ts:30-41`); refused, non-2xx and blackholed tests pass. IN-01 adds `DASH API request was canceled` for non-deadline aborts (`#honours a caller's own signal and reports its abort as a cancel, not a timeout`) and keeps the timeout label when a caller signal never fires (`#still applies the deadline when the caller passes a signal that never aborts`) |
| 12-01 T5 | message-only error: no config, request, response or cause; no key, path or query | ✓ | `axios.test.ts#wraps a $label failure without the API key, the request path or the axios error` (2 rows) |
| 12-01 T6 | key still reaches DASH | ✓ | `axios.test.ts#still sends the API key upstream as the Authorization header` |
| 12-01 T7 | Zod env schema and `dashApi.timeoutMs`; invalid values throw | ✓ (as amended by WR-01) | The schema now has an extra `.max(2_147_483_647)`, which is stricter than planned. Every planned row still passes. `verify.artifacts` flags the literal `contains` string as missing for this reason only; this is literal drift, not a stub. |
| 12-01 T8 | unset gives 10000; empty string fails | ✓ | `environment.test.ts#defaults dashApi.timeoutMs to 10000…`, `#fails startup when DASH_API_TIMEOUT_MS is 'empty'` |
| 12-02 T1 | nearby 502, no key or coordinates | ✓ | `upstreamTimeout.test.ts#returns 502 for GET /api/v1/predictions/nearby with only the shared client's timeout message, without leaking the API key or the rider's coordinates` |
| 12-02 T2 | predictions 502 in 150–2000 ms | ✓ | `upstreamTimeout.test.ts#returns 502 for GET /api/v1/predictions shortly after the deadline, without leaking the API key` |
| 12-02 T3 | transport errors wrapped exactly once | ✓ | `NearbyPredictionService.ts:101` is a bare `await axios.get(url)`, and `grep 'request failed for nearby' src/server` finds nothing. `#propagates the shared DASH client's rejection unchanged` |
| 12-02 T4 | concurrent live requests time out independently | ✓ | `upstreamTimeout.test.ts#times out concurrent live requests independently` (225 ms) |
| 12-02 T5 | startup load fails with the logged timeout | ✓ | `#fails the startup route/stop load with a logged timeout error instead of hanging`, plus the real-boot probe above |
| 12-02 T6 | alert poll logs the timeout | ✓ | `#logs a timeout error from the service-alert poll instead of hanging` |
| 12-02 T7 | content-level UpstreamApiErrors unchanged | ✓ | `NearbyPredictionService.test.ts` success:false and malformed rows pass. IN-03 adds 2 `agencyKey` rows, and `parseDashResponse` now rejects a non-string `agencyKey` |
| 12-03 T1 | res error: warn `SSE response error for stop <stop>: <msg>`, cleanup once | ✓ | `#logs a warning and runs the disconnect cleanup once when the SSE response errors` |
| 12-03 T2 | one shared idempotent cleanup for disconnect and res error, both orders | ✓ (as amended by WR-04) | The plan named `req.on('close')`. WR-04 deliberately moved disconnect detection to `res.on('close')`, because `req` closes as soon as express.json() consumes a GET body. The invariant (one guarded function, each side effect exactly once in either order) is proven by the renamed tests `#runs the cleanup once when the response errors and then closes` and `#runs the cleanup once when the response closes and then errors`, and the fix is proven on a real socket by `predictionRoutes.test.ts#keeps the stream open when express.json() consumed a request body, which closes the request early` |
| 12-03 T3 | error listener registered before await; pending-subscribe error handled | ✓ | `#unsubscribes without writing headers when the response errors while subscribe is still pending`. IN-04 adds `#writes no error response when subscribe rejects after the client has already disconnected` (guard `finished \|\| res.headersSent`, line 79) |
| 12-03 T4 | real-service multi-subscriber integration | ✓ | `#keeps streaming to other subscribers on the stop after one subscriber's response errors, and stops polling when the last leaves` |
| 12-03 T5 | PredictionStreamService unchanged | ✓ | `git log` shows the last change at 7d38f4d (phase 04) |
| 12-03 T6 | existing SSE behaviour preserved | ✓ | The 400, 404/502-without-headers, headers plus initial frame and close-cleanup tests pass, as do the real-socket route stream, REST-alongside-stream and disconnect-teardown tests. The SUMMARY claim "bodies unedited" is no longer true: WR-04 switched the disconnect trigger to `emitResponseClose(res)` and renamed one test to `#invokes unsubscribe and ends the response when the connection closes`. The behaviour is unchanged. |
| 12-04 T1 | rejection logged, process keeps running, exit 0 | ✓ | Unit test `#logs an unhandled rejection through Winston and keeps the process running` and the child-process probe (see SC5) |
| 12-04 T2 | uncaught exception logged, then exit 1 | ✓ VERIFIED (coincidental-reliance) | Unit tests renamed and extended: `#logs an uncaught exception, then exits with code 1 only after Winston and stdout have flushed` and `#exits with code 1 after the fallback delay when the logger never finishes flushing`. **Plan probe re-run:** it logs `error: Uncaught exception: Error: tracer-crash`, exits 1 about 2 ms after the throw, and never prints `should-not-print`. It holds only while nothing else logs during the flush window (see coincidental_reliance_items and Anti-Patterns). |
| 12-04 T3 | only stack/message or String(reason), as one string; no secret | ✓ | `#logs only the message and stack for $label, never the reason object` (4 rows, `super-secret-key` asserted absent) |
| 12-04 T4 | registered in app.ts before poll and init; init `.catch` unchanged | ✓ | `app.ts:9` is before `:36` and `:38`, and `app.ts:68-72` still logs `Failed to initialize application data` and exits 1. The SUMMARY's cited line numbers (34/36) moved to 36/38 when WR-05 added `SHUTDOWN_GRACE_MS`; the order is unchanged. |
| 12-04 T5 | one exported function, re-exported from the barrel | ✓ | `export function registerProcessErrorHandlers(): void`; `index.ts:3` has `export * from "./processHandlers";`; `#registers both process error listeners` |

**Prohibitions (all three `verification: test`, all have wired enforcement, so none are flagged):**
- *No 2xx fallback on a failed DASH call:* the response interceptor always rejects (`axios.ts:45`), and all E2E tests assert 502.
- *No URL or coordinates in the error message:* `toUpstreamApiError` uses only `error.message` or fixed text, and `axios.test.ts#wraps a $label failure…` plus the nearby E2E assert this.
- *unhandledRejection must not exit:* the unit test's `exitSpy` is never called, and the child-process probe exits 0 after `still-alive`.

### Review-fix changes re-verified

| Fix | Where | Result |
|-----|-------|--------|
| WR-01 env max | `environment.ts:17` | ✓ `.max(2_147_483_647)`; the above-max row passes. `0x10`/`1e4` are still accepted (documented; harmless) |
| WR-02 flush then exit | `processHandlers.ts:29-39` | ✓ for the targeted scenario: with 300 KB queued on a pipe whose reader drains within 1 s, the crash line survived 5/5 runs and all 300 filler lines arrived. If the reader stalls for more than 1 s, the fallback exits first (by design). ⚠ One new edge regression (see Anti-Patterns). |
| WR-03 failed shutdown exits 1 | `app.ts:46-58` | ✓ try/catch logs `Shutdown failed:` then exits 1. `app.ts` has no automated test; UAT test 3 passed (human) |
| WR-04 SSE disconnect on `res` | `PredictionStreamController.ts:65-67, 89` | ✓ `res.on("close")` with the post-subscribe guard `finished \|\| res.destroyed`; the real-socket regression test passes |
| WR-05 shutdown grace | `app.ts:24, 62` | ✓ `setTimeout(() => server.closeAllConnections(), 10_000)` after `server.close`. UAT test 2 passed (human): SIGTERM with an open SSE stream exits within about 10 s |
| IN-01 caller signal and timeout labelling | `axios.ts:15-28` | ✓ `AbortSignal.any` composition; `isDeadlineAbort` checks the reason for `DOMException` `TimeoutError`; 2 new tests pass |
| IN-02 `unknown` listener params | `PredictionStreamController.ts:68`, `processHandlers.ts:23` | ✓ |
| IN-03 `agencyKey` validation | `NearbyPredictionService.ts:119-123` | ✓ plus 2 table rows |
| IN-04 no error body after disconnect | `PredictionStreamController.ts:79` | ✓ plus a new test |

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/server/config/axios.ts` | ✓ VERIFIED | Per-request deadline interceptor (composed with any caller signal) and a message-only `UpstreamApiError` response interceptor |
| `src/server/config/environment.ts` | ✓ VERIFIED | Schema entry with a max bound, plus `dashApi.timeoutMs`. The gsd `contains` literal predates WR-01 |
| `src/server/config/processHandlers.ts` | ✓ VERIFIED | `registerProcessErrorHandlers`, `describeReason`, `exitAfterLogFlush` |
| `src/server/config/index.ts` | ✓ VERIFIED | Barrel re-export |
| `src/server/app.ts` | ✓ VERIFIED | Handlers first; shutdown try/catch; 10 s grace |
| `src/server/api/controllers/PredictionStreamController.ts` | ✓ VERIFIED | Shared idempotent cleanup on `res` close and error, registered before the await |
| `src/server/api/services/NearbyPredictionService.ts` | ✓ VERIFIED | No transport wrap; content-level errors kept |
| `src/server/test/setup.ts`, `.env.example` | ✓ VERIFIED | `"200"` test deadline; `DASH_API_TIMEOUT_MS=10000` |
| 7 phase test files | ✓ VERIFIED | 127/127 pass in this run |

`gsd verify.artifacts`: 12-01 6/7 (the literal-drift item above), 12-02 4/4, 12-03 2/2, 12-04 4/4.

### Key Link Verification

`gsd verify.key-links`: 12-01 4/4, 12-02 4/4, 12-03 2/2, 12-04 2/2, all WIRED.

| From | To | Via | Status |
|------|----|-----|--------|
| axios.ts | environment.ts | `AbortSignal.timeout(dashApi.timeoutMs)` per request | WIRED |
| axios.ts | api/errors | `new UpstreamApiError(` in the response-error interceptor | WIRED |
| Vehicle / Prediction / NearbyPrediction / ServiceAlert services and BusDataRepository | axios.ts | `import { axios } from "../../config"` then `axios.get(...)`. These are the only 5 HTTP call sites in `src/server`; the only raw `axios` import is in `config/axios.ts`, and there is no `fetch` or `http` client | WIRED |
| PredictionStreamService (SSE poll) | PredictionService | `predictionService.getPredictionsForStop`, so SSE polls inherit the deadline | WIRED |
| Vehicle / Prediction / Nearby / Stream controllers | api/errors | `instanceof UpstreamApiError` → 502 | WIRED |
| PredictionStreamController | PredictionStreamService | `unsubscribe = subscription.unsubscribe` → idempotent `unsubscribeFrom` | WIRED |
| app.ts | processHandlers.ts | barrel import, called at line 9 | WIRED |
| processHandlers.ts | logger.ts | `logger.error(\`Unhandled promise rejection: …\`)` / `Uncaught exception: …`, `logger.once("finish")`, `logger.end()` | WIRED |

### Data-Flow Trace (Level 4)

N/A: no rendered dynamic data. The error text flows `toUpstreamApiError` → service (unwrapped) → controller `resolveErrorBody` → 502 `details`. Exact body equality in the E2E tests proves this end to end.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase test files | `bunx vitest --run --typecheck --reporter=verbose <7 phase files>` (single run) | 7 files, 127/127 passed | ✓ PASS |
| Rejection survives (SC5 / 12-04 T1) | plan probe `bunx tsx -e '…Promise.reject(new Error("tracer-boom"))…'` | logs the line, prints `still-alive`, exit 0 | ✓ PASS |
| Uncaught exception logs, exits 1 (12-04 T2) | plan probe `bunx tsx -e '…throw new Error("tracer-crash")…'` | logs the line, exit 1 about 2 ms after the throw, no `should-not-print` | ✓ PASS |
| WR-02: crash line under stdout backpressure | 300 × 1 KB logs, then throw; stdout piped to a reader that stalls 0.3 s | crash line present 5/5, all 300 fillers present, exit 1 | ✓ PASS |
| WR-02 edge: other logging during the flush window | same, plus `setInterval(() => logger.info(...), 5)` | exit **7** 5/5; crash reason in neither stdout nor stderr; stderr shows `NodeError: write after end` from `processHandlers.ts:24` | ⚠ WARNING |
| WR-02 edge: two uncaught exceptions in the same tick | two `setTimeout(throw, 10)` | first crash logged, second lost, exit **7** 3/3 | ⚠ WARNING |
| Same, without backpressure | 1 ms interval logging, stdout to a file | exit 1, crash line present 5/5 (window too short to hit) | ✓ PASS |
| Real boot against a blackholed DASH (SC3) | `ts-node src/server/app.ts`, `DASH_API_TIMEOUT_MS=500`, DB in scratchpad | exit 1 after 1.75 s; poll and init timeouts logged; key found 0 times | ✓ PASS |
| Typecheck | `bunx tsc --noEmit -p tsconfig.json` | exit 0 | ✓ PASS |
| Biome on 15 phase files | `bunx biome check <files>` | 0 errors, 3 warnings, all pre-existing (`useFilenamingConvention` ×2 on test files, `baseURL` naming at `axios.ts:8`) | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` exist, and no plan declares one. The plans' inline child-process checks (12-04 tasks 1 and 2) were re-run above in this verifier's own process.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| UPST-01 | 12-01, 12-02 | Every DASH call through the shared client fails with a timeout after a bounded, env-configurable duration | ✓ SATISFIED | SC1, SC2 and SC3; all 5 call sites go through the interceptors |
| UPST-02 | 12-01, 12-02 | A timed-out live request returns 502 via `UpstreamApiError` | ✓ SATISFIED | E2E 502 on all 3 endpoints, alone and concurrently |
| ERR-01 | 12-03 | An SSE response error is logged and removes the subscriber with the disconnect cleanup | ✓ SATISFIED | SC4 |
| ERR-02 | 12-04 | A process-level `unhandledRejection` handler logs the rejection | ✓ SATISFIED | SC5 |

No requirements are orphaned. REQUIREMENTS.md maps exactly these 4 IDs to Phase 12 (lines 72-81), and every one is claimed by a plan.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (all 15 phase `.ts` files and `.env.example`) | – | TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER | none found | – |
| `src/server/config/processHandlers.ts` | 33-38 (with 18, 24) | **Write-after-end race in `exitAfterLogFlush` (new, introduced by the WR-02 fix 567a886).** `logger.end()` runs while the process keeps running until flush completes (about 2 ms normally, up to 1 s under backpressure). Any `logger.*` call in that window, such as request/poll logging or a second uncaught exception or unhandled rejection, triggers Winston's `write after end` `error` event, which has no listener and so is thrown. When this happens inside the handler, Node exits with **code 7** ("exception handler failure") instead of 1. Under backpressure the original crash reason is lost entirely. Reproduced deterministically (see Behavioral Spot-Checks). | ⚠️ Warning | Does not affect any roadmap SC: the uncaughtException path is the D-11 scope extension, not ERR-02. The process still exits non-zero, so supervisors restart it. The regressions are the exit code 7 and a misleading stderr stack, and the crash line can still be lost in the busy-server-under-backpressure case the fix was meant to cover. Suggested fix (a few lines, suitable for `/gsd-quick`): make post-end logging harmless, for example `logger.on("error", () => {})` before `logger.end()`, or skip `logger.end()` and flush stdout only. Add a unit test that invokes the uncaughtException listener twice. |
| `src/server/config/processHandlers.ts` | 34 | For up to 1 s after an uncaught exception, the process keeps running other callbacks while in an unknown state | ℹ️ Info | A deliberate WR-02 trade-off; measured at about 2 ms when stdout is not backpressured |
| `src/server/config/axios.ts` | 26-27 | A caller that passes its own `AbortSignal.timeout` would be labelled with the DASH deadline value | ℹ️ Info | Documented in 12-REVIEW-FIX.md; no caller passes a signal today |
| `src/server/app.ts` | 24, 62 | Shutdown takes the full 10 s whenever an SSE client is connected | ℹ️ Info | Documented WR-05 trade-off; UAT test 2 accepted it |

### Human Verification Required

None outstanding. The items that need a human, because `app.ts` has no automated coverage, were already checked in 12-UAT.md (22/22 passed, completed 2026-09-30):
- **Cold start** (UAT 1): boots, loads routes and stops, and `/api/v1/routes/all` returns live data. This passed.
- **SIGTERM with an open SSE stream** (UAT 2, WR-05): logs `Server is gracefully shutting down`, exits within about 10 s, and the stream is closed. This passed.
- **Failed shutdown exits 1** (UAT 3, WR-03): logs `Shutdown failed: …` and exits 1. This passed.

12-SECURITY.md is `verified` with `threats_open: 0` (18/18 closed, checked after the review fixes).

### Gaps Summary

There are no blocking gaps. The phase goal is achieved in the current code:
- Every DASH call (5 call sites, one shared client, plus SSE polls through `PredictionService`) has a hard per-request total deadline that caps at the Node timer maximum and composes with any caller signal.
- Every transport failure becomes a key-free, URL-free `UpstreamApiError` that maps to 502 on all three live endpoints.
- Boot and the alert poll fail fast with logged timeouts, re-proven on the real `app.ts` process.
- SSE response errors and disconnects, now detected on the response, share one idempotent cleanup, and neighbouring subscribers keep streaming.
- Unhandled rejections are logged through Winston, and the process stays up.

Regarding the prior coincidental-reliance item (crash line lost before exit): WR-02 closes it for its stated scenario. A slow pipe that drains within 1 s now keeps the line in 5/5 runs, where it was lost 5/5 before. A narrower undeclared precondition remains: nothing else may log during the flush window. Breaking it produces exit 7 and, under backpressure, a lost crash line.

**For the developer to decide (non-blocking):** fix the write-after-end race in `exitAfterLogFlush`, a few lines plus one test, or accept it on the grounds that the process still crashes non-zero. Nothing blocks advancing to Phase 13.

---

_Verified: 2026-09-30T16:28:35Z_
_Verifier: Claude (gsd-verifier)_
