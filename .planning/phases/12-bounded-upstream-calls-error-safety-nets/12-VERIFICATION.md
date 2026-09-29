---
phase: 12-bounded-upstream-calls-error-safety-nets
verified: 2026-09-29T00:00:00Z
status: passed
score: 5/5 roadmap success criteria verified (30/30 merged must-haves incl. plan truths and 3 prohibitions)
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
covered_digest: "v1:sha256:e6693d04890287e0bf15a2357600e0f4c34ea0791963956a533d90a86652bcb3"
behavior_unverified: 0
overrides_applied: 0
coincidental_reliance_items:
  - truth: "An uncaught exception is logged through Winston as 'Uncaught exception: ...' and then the process exits with code 1 (12-04 truth 2, D-11)"
    reason: undeclared-precondition
    harden: "The log line survives only if stdout drains before process.exit(1). Reproduced: with ~300 KB of earlier log output still queued on a slow pipe, the crash line was lost (5/5 runs). Node's default handler lost it too in the same setup, so this is not a regression. Exit only after the Winston transport finishes (logger.on('finish') / transport flush), with a short hard-exit fallback timer (review WR-02)."
---

# Phase 12: Bounded Upstream Calls & Error Safety Nets Verification Report

**Phase Goal:** No DASH call can hang the server or a rider's request, and asynchronous errors that currently escape (SSE socket errors, unhandled promise rejections) are logged and cleaned up.
**Verified:** 2026-09-29
**Status:** passed (4 non-blocking warnings recorded below for a developer decision)
**Re-verification:** No. This is the initial verification.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | With DASH blackholed, `/predictions`, `/predictions/nearby` and `/vehicles` each return 502 shortly after the timeout. The body and logs never include the key. | ✓ VERIFIED | `upstreamTimeout.test.ts` runs through real routers, controllers, services and the bounded client with no axios mock, against a real `http` server that never answers. Each endpoint returns 502 `{error:"Bad Gateway", details:"DASH API request timed out after 200ms"}` in 150–2000 ms (observed 212–237 ms). The concurrent test passes. Assertions check the body and all logger.info/warn/error calls for `test-api-key`, and the nearby test also checks the rider's coordinates. |
| 2 | The timeout comes from a Zod-validated env var with a sensible default. An invalid value fails startup like the other env vars. | ✓ VERIFIED (see WR-01) | `environment.ts:15` has `DASH_API_TIMEOUT_MS: z.coerce.number().int().positive().default(10000)` and exposes `dashApi.timeoutMs`. `environment.test.ts` passes: unset gives 10000, "2500" gives 2500, and "abc", "0", "-1", "1.5" and "" each throw `Invalid environment configuration … DASH_API_TIMEOUT_MS`. `.env.example:5` documents it. |
| 3 | The startup route/stop load and the 5-minute alert poll use the same bounded client. A blackholed DASH produces a logged timeout, not a hung boot or poll. | ✓ VERIFIED | Both call sites use the shared barrel `axios`: `BusDataRepository.ts:112` and `ServiceAlertService.ts:27`. The two E2E tests pass. **I also booted the real `src/server/app.ts`** against a blackholed DASH with `DASH_API_TIMEOUT_MS=500`. The process exited 1 in about 2 s, logging `Failed to poll service alerts: DASH API request timed out after 500ms` and `Failed to initialize application data: … timed out after 500ms`. The key appeared 0 times. |
| 4 | An SSE response error mid-stream is logged, and the subscriber is removed exactly as on disconnect. The per-stop poll stops if it was the last subscriber, and other subscribers keep receiving updates. | ✓ VERIFIED | `PredictionStreamController.ts:55-70` has one guarded `cleanup` (unsubscribe + end) wired to both `req.on("close")` and `res.on("error")`. It is registered before `await subscribe` (line 65/66 vs 74), and the warn line is `SSE response error for stop …`. The behavioral tests pass: error then close and close then error each run once, and the pending-subscribe error case passes. The integration test with the **real** `PredictionStreamService` shows B still receives the tick after A errors (write ×2 vs ×1), and fetches stay at 2 after the last subscriber leaves. `PredictionStreamService.ts` is unchanged since 8a91098 (D-15). |
| 5 | An unhandled promise rejection anywhere is logged through Winston with its reason. | ✓ VERIFIED | `processHandlers.ts:17-19` logs `Unhandled promise rejection: ${stack ?? String(reason)}` and does not exit. It is registered first in `app.ts:9`, before the poll (line 34) and the init chain (line 36). A child-process probe I ran myself prints `error: Unhandled promise rejection: Error: tracer-boom`, then `still-alive`, and exits 0. The secret-safety `it.each` passes. |

**Score:** 5/5 roadmap truths verified (0 present-but-behavior-unverified).

### Plan must-haves (merged)

All plan truths from 12-01 (8), 12-02 (7), 12-03 (6) and 12-04 (5) were checked against code and named passing tests. Highlights:
- **Hard total deadline:** the trickle test sends one byte every 50 ms and is still cut off at 203 ms.
- **Fresh signal per request:** confirmed by the consecutive-call test.
- **Single central wrap:** the `request failed for nearby` prefix is gone, and `NearbyPredictionService.ts:101` now uses a bare `await axios.get(url)`.
- **Message-only UpstreamApiError:** it has no config, request, response or cause property, and neither the key nor the URL appears in `util.inspect`.
- **Key still sent upstream.**
- **Log before exit(1):** checked in the unit test and in the child-process probe (exit=1, `should-not-print` absent).

**Prohibitions:**
- *No 2xx fallback on failure:* the response interceptor always rejects, and the E2E tests assert 502.
- *No URL or coordinates in the error message:* covered by `axios.test.ts` "wraps a $label failure…".
- *unhandledRejection must not exit:* the unit test's `exitSpy` is not called, and the child process exits 0.

All three have wired test enforcement, so none is flagged.

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/server/config/axios.ts` | ✓ VERIFIED | Request interceptor `AbortSignal.timeout(dashApi.timeoutMs)`; response interceptor → `toUpstreamApiError` (message-only) |
| `src/server/config/environment.ts` | ✓ VERIFIED | Schema entry + `dashApi.timeoutMs` |
| `src/server/config/processHandlers.ts` | ✓ VERIFIED | Exports `registerProcessErrorHandlers`; both listeners; `describeReason` |
| `src/server/config/index.ts` | ✓ VERIFIED | `export * from "./processHandlers";` |
| `src/server/app.ts` | ✓ VERIFIED | `registerProcessErrorHandlers();` at line 9; init `.catch` unchanged |
| `src/server/api/controllers/PredictionStreamController.ts` | ✓ VERIFIED | Shared idempotent cleanup, listeners before await |
| `src/server/api/services/NearbyPredictionService.ts` | ✓ VERIFIED | Transport try/catch removed; content-level `UpstreamApiError`s kept |
| `src/server/test/setup.ts`, `.env.example` | ✓ VERIFIED | `"200"` test deadline; `DASH_API_TIMEOUT_MS=10000` documented |
| 4 new test files plus 3 updated ones | ✓ VERIFIED | All pass (88/88 across the 6 phase files) |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| axios.ts | environment.ts | `AbortSignal.timeout(dashApi.timeoutMs)` per request | WIRED |
| axios.ts | api/errors | `new UpstreamApiError(` in response-error interceptor | WIRED |
| VehicleService / PredictionService / NearbyPredictionService / ServiceAlertService / BusDataRepository | axios.ts | `import { axios } from "../../config"` → `axios.get(...)` (the only 5 HTTP call sites in `src/server`; no bare `axios` import or `fetch` elsewhere) | WIRED |
| Vehicle/Prediction/NearbyPrediction controllers | api/errors | `instanceof UpstreamApiError` → 502 (unchanged since 8a91098) | WIRED |
| PredictionStreamController | PredictionStreamService | `unsubscribe = subscription.unsubscribe` → idempotent `unsubscribeFrom` | WIRED |
| app.ts | processHandlers.ts | barrel import, called before poll/init | WIRED |
| processHandlers.ts | logger.ts | `logger.error(\`Unhandled promise rejection: …\`)` / `Uncaught exception: …` | WIRED |

### Data-Flow Trace (Level 4)

N/A. There is no rendered dynamic data. The error message flows `toUpstreamApiError` → service (unwrapped) → controller `resolveErrorBody` → 502 `details`, and this is confirmed end to end by the exact body equality in the E2E tests.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase test files | `bun run test -- --reporter=verbose <6 phase files>` | 6 files, 88/88 passed | ✓ PASS |
| Rejection survives (ERR-02) | `bunx tsx -e '…Promise.reject(new Error("tracer-boom"))…'` | logs `Unhandled promise rejection: Error: tracer-boom`, `still-alive`, exit 0 | ✓ PASS |
| Uncaught exception logs, exits 1 (D-11) | `bunx tsx -e '…throw new Error("tracer-crash")…'` | logs `Uncaught exception: Error: tracer-crash`, exit 1, no `should-not-print` | ✓ PASS |
| Real boot against a blackholed DASH (SC3) | `ts-node src/server/app.ts` with `DASH_API_TIMEOUT_MS=500`, DB in scratchpad | exit 1 after ~2 s with logged timeouts for the poll and the init; 0 key occurrences | ✓ PASS |
| Typecheck | `bunx tsc --noEmit -p tsconfig.json` | exit 0 | ✓ PASS |
| Biome on phase-changed `.ts` files | `bunx biome check <15 files>` | 0 errors, 3 warnings, all older than this phase (`baseURL` naming on an unchanged line, test filename convention) | ✓ PASS |
| WR-01 reproduction | shared client with `DASH_API_TIMEOUT_MS` = 3000000000 / 5000000000 / 0x10 | 3e9: `TimeoutOverflowWarning` → 1 ms deadline; 5e9: `DASH API request failed: The value of "delay" is out of range…`; `0x10` accepted as 16 ms | ⚠ WARNING |
| WR-02 reproduction | crash after ~300 KB of logs queued on a slow pipe | crash line lost 5/5 (lost with Node's default handler too) | ⚠ WARNING (advisory) |

Context from the orchestrator: the post-merge full suite (553/553) and `bun run build` passed. I did not rerun the full suite.

### Probe Execution

No `scripts/*/tests/probe-*.sh` exist and no plan declares one. The plan's inline child-process checks were run above.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| UPST-01 | 12-01, 12-02 | Every DASH call via the shared client fails with a timeout after a bounded, env-configurable duration | ✓ SATISFIED | SC1/SC2/SC3 evidence; all 5 call sites go through the interceptors |
| UPST-02 | 12-01, 12-02 | A timed-out live request returns 502 through the `UpstreamApiError` mapping | ✓ SATISFIED | E2E 502 for all 3 endpoints, alone and concurrently |
| ERR-01 | 12-03 | An SSE response error is logged and removes the subscriber with the disconnect cleanup | ✓ SATISFIED | SC4 evidence |
| ERR-02 | 12-04 | A process-level `unhandledRejection` handler logs the rejection | ✓ SATISFIED | SC5 evidence |

No requirements are orphaned. REQUIREMENTS.md maps exactly these 4 IDs to Phase 12, and every one is claimed by a plan.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (all 16 phase-changed files) | – | TBD/FIXME/XXX/TODO/HACK | none found | – |
| `src/server/config/environment.ts` | 15 | WR-01: no `.max()`. Values ≥ 2^31 pass Zod but break at runtime (1 ms deadline or an out-of-range throw inside the interceptor), and boot then fails with a misleading "timed out" error instead of `Invalid environment configuration`. `0x10`/`1e4` are also accepted. | ⚠️ Warning | This edge weakens SC2's "fails startup the same way" guarantee. The default and every realistic value work, and PORT has the same missing upper bound, so the "like other env vars" wording is still literally met. One-line fix: `.max(2_147_483_647)` (or an operational cap such as 120000) plus a test row. |
| `src/server/config/processHandlers.ts` | 23-26 | WR-02: `process.exit(1)` immediately after `logger.error` | ⚠️ Warning (advisory) | Affects only the uncaught-exception path (D-11), not SC5. Reproduced under pipe backpressure, where Node's default loses the line as well. See coincidental_reliance_items. |
| `src/server/app.ts` + `processHandlers.ts` | 43-49 / 17-19 | WR-03: the non-exiting `unhandledRejection` handler turns a rejected `favoritesRecentsRepository.close()` inside the un-awaited `server.close(async …)` callback into a hang on SIGTERM, where Node's default used to exit 1 | ⚠️ Warning | This regression comes from the phase's own design choice (D-10). It only triggers when `db.close()` throws during shutdown. Phase 13 reworks the boot/shutdown chain in `app.ts`, but none of its success criteria explicitly name this, so it is not deferred. |
| `src/server/api/controllers/PredictionStreamController.ts` | 65, 86 | WR-04: disconnect is detected on `req` `close`, which can fire early for a GET that carries a JSON body | ℹ️ Info | This detection predates the phase, which only adds `res.end()` on that path. `EventSource` never sends a body. It does not affect SC4. |

WR-05 (graceful shutdown blocked by open SSE streams) predates this phase and is out of scope.

### Human Verification Required

None. Every success criterion has passing behavioral evidence: real-socket E2E tests, a real-service integration test, child-process probes and a real boot.

### Gaps Summary

There are no blocking gaps. The phase goal is achieved:
- Every DASH call in the codebase (5 call sites, one shared client) has a hard per-request total deadline.
- Every transport failure becomes a key-free `UpstreamApiError`, which maps to 502 on all three live endpoints.
- Boot and the alert poll fail fast with logged timeouts. This was proven on the real `app.ts` process, not just in tests.
- SSE response errors are logged and cleaned up through the same idempotent path as a disconnect, and neighbouring subscribers keep receiving updates.
- Unhandled rejections are logged through Winston and the process stays up.

**For the developer to decide (non-blocking):**
- WR-01: add an upper bound to `DASH_API_TIMEOUT_MS`. A real misconfiguration fails in a confusing way.
- WR-03: handle the `close()` failure inside `shutdown`. This is a small regression in shutdown behavior caused by D-10.
- WR-02: make the uncaught-exception exit wait for the logger to flush.

None of these blocks advancing to Phase 13. Each is a one- or few-line change suitable for `/gsd-quick`.

---

_Verified: 2026-09-29_
_Verifier: Claude (gsd-verifier)_
