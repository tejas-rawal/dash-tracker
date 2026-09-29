---
phase: 12-bounded-upstream-calls-error-safety-nets
fixed_at: 2026-09-29T19:11:32Z
review_path: /Users/trawal/.superset/worktrees/dash-tracker/feat/hushed-chord/.planning/phases/12-bounded-upstream-calls-error-safety-nets/12-REVIEW.md
iteration: 2
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
---

# Phase 12: Code Review Fix Report

**Fixed at:** 2026-09-29T19:11:32Z
**Source review:** /Users/trawal/.superset/worktrees/dash-tracker/feat/hushed-chord/.planning/phases/12-bounded-upstream-calls-error-safety-nets/12-REVIEW.md
**Iteration:** 2

**Summary:**
- Findings in scope: 9 (fix_scope `all`: WR-01 to WR-05 and IN-01 to IN-04)
- Fixed: 9. WR-01 to WR-05 were fixed in iteration 1 and are carried forward unchanged. IN-01 to IN-04 were fixed in this iteration.
- Skipped: 0

## Fixed Issues

### WR-01: `DASH_API_TIMEOUT_MS` has no upper bound

**Files modified:** `src/server/config/environment.ts`, `src/server/config/environment.test.ts`
**Commit:** 3a7034a (iteration 1)
**Applied fix:** Added `.max(2_147_483_647)` (Node's maximum timer delay) to the Zod schema, with a comment explaining why. A too-large value now fails at startup with `Invalid environment configuration` instead of a misleading upstream error. Added a `"2147483648"` case to the table of values that must fail startup. Hex and exponent inputs (`"0x10"`, `"1e4"`) are still accepted, which matches the review's own suggested fix.

### WR-02: `uncaughtException` handler exits before Winston has flushed

**Files modified:** `src/server/config/processHandlers.ts`, `src/server/config/processHandlers.test.ts`
**Commit:** 567a886 (iteration 1)
**Applied fix:** Added `exitAfterLogFlush(code)`. It calls `logger.end()`, waits for Winston's `finish` event, then does an empty `process.stdout.write("", cb)` and exits from that callback. A 1000 ms fallback timer, deliberately not unref'd, forces the exit if a transport gets stuck.

This differs from the review's suggestion on purpose. With the project's `winston`, the crash line was lost in 3 of 3 runs both with the old code and with the review's `logger.once("finish") + logger.end()` fix. Adding the stdout-drain step kept the line in 5 of 5 runs.

### WR-03: A failed graceful shutdown hangs the process

**Files modified:** `src/server/app.ts`
**Commit:** 6fce4ae (iteration 1)
**Status:** fixed: requires human verification (`app.ts` has no automated test coverage)
**Applied fix:** The `server.close` callback now wraps `favoritesRecentsRepository.close()` in try/catch. On failure it logs `Shutdown failed: <message>` and calls `process.exit(1)`, so shutdown no longer depends on the non-exiting `unhandledRejection` handler.

### WR-04: SSE disconnect was detected on `req` `close`

**Files modified:** `src/server/api/controllers/PredictionStreamController.ts`, `src/server/api/controllers/PredictionStreamController.test.ts`, `src/server/api/routes/predictionRoutes.test.ts`
**Commit:** ac39945 (iteration 1)
**Applied fix:** The controller listens for `res.on("close", cleanup)`, and the post-subscribe guard is `finished || res.destroyed`. An integration test sends a GET with a JSON body to `/api/v1/predictions/stream`; it failed before the fix and passes after it. Unit tests simulate disconnects on the response with `emitResponseClose(res)`.

### WR-05: Graceful shutdown never completes while any SSE stream is open

**Files modified:** `src/server/app.ts`
**Commit:** d8cd126 (iteration 1)
**Status:** fixed: requires human verification (`app.ts` has no automated test coverage)
**Applied fix:** After `server.close(...)`, `shutdown` schedules `server.closeAllConnections()` after `SHUTDOWN_GRACE_MS = 10_000`. The trade-off is that shutdown takes the full 10 s whenever an SSE client is connected. A developer should confirm SIGTERM behaviour on the real server with a stream open.

### IN-01: Request interceptor discarded any caller-supplied `signal`, and every cancel was reported as a timeout

**Files modified:** `src/server/config/axios.ts`, `src/server/config/axios.test.ts`
**Commit:** 84d545f
**Applied fix:**
- The request interceptor now creates the deadline with `AbortSignal.timeout(...)`. If the caller passed a signal, it combines the two with `AbortSignal.any([config.signal as AbortSignal, deadline])`; otherwise it uses the deadline alone.
- A new `isDeadlineAbort(error)` reads the abort reason from `error.config.signal`. Only a reason that is a `DOMException` named `TimeoutError` is reported as `DASH API request timed out after Nms`. Any other cancel becomes `DASH API request was canceled`, which is still a key-free `UpstreamApiError`.

Support check before using it:
- `tsconfig.json` sets no `lib`, so the ES2020 default (which includes DOM) applies. `@types/node` 20.17.6 declares `AbortSignal.any`, and `tsc --noEmit` passes.
- At runtime, Node v20.20.2 returned a combined signal whose reason is a `DOMException` with name `TimeoutError` when the deadline fired.

Two tests were added:
- A caller's `AbortController` aborting after 20 ms rejects in under 150 ms with the cancel message. Against the old `axios.ts` this test failed: the request ran to the 200 ms deadline and was labelled a timeout.
- A caller signal that never aborts still gets the 200 ms deadline and the timeout message.

A caller that passes its own `AbortSignal.timeout` signal would also be labelled with the DASH deadline value. No caller does this today, and handling it would need per-request state, so I left it out.

### IN-02: Listener parameter types misstate what can arrive

**Files modified:** `src/server/api/controllers/PredictionStreamController.ts`, `src/server/config/processHandlers.ts`
**Commit:** 320ee09
**Applied fix:** I re-checked this against the current code after WR-04. It still applied, now at `PredictionStreamController.ts:68` and `processHandlers.ts:23`. Both the `res` `error` listener and the `uncaughtException` listener now type their parameter as `unknown`. The existing `instanceof Error` narrowing and `describeReason(unknown)` stay as they were.

### IN-03: `agencyKey` is cast without validation

**Files modified:** `src/server/api/services/NearbyPredictionService.ts`, `src/server/api/services/NearbyPredictionService.test.ts`
**Commit:** 88b12ee
**Applied fix:** `parseDashResponse` now throws `UpstreamApiError("DASH API returned a malformed nearby predictions response (agencyKey is not a string)")` when `data.agencyKey` is not a string, and the `as string` cast is gone. Two cases were added to the malformed-response table: a missing `agencyKey` and a numeric `agencyKey`.

### IN-04: Error response written after the client already disconnected

**Files modified:** `src/server/api/controllers/PredictionStreamController.ts`, `src/server/api/controllers/PredictionStreamController.test.ts`
**Commit:** efa8c3c
**Applied fix:** I re-checked this against the current code after WR-04. It still applied: the catch block, now at lines 77-83, checked only `res.headersSent`. After WR-04, `finished` is set by `res` `close` or `res` `error`. The guard is now `if (finished || res.headersSent) return;`, with a short why-comment. A new unit test disconnects while `subscribe` is pending and then rejects it. It asserts that `res.status`, `res.json` and `res.writeHead` are never called.

## Verification

All work ran in the main checkout, `/Users/trawal/.superset/worktrees/dash-tracker/feat/hushed-chord`, on branch `feat/backend-reliability-ops`. The orchestrator told this run to work in that directory and not create a separate review-fix worktree. Commits are directly on `feat/backend-reliability-ops`, so there was no temporary branch, sentinel or cleanup step.

After each fix I re-read the change and ran:
- `biome check` on the touched files
- `tsc --noEmit -p .`
- the affected test files with `vitest --run --typecheck`

Final gates after IN-01 to IN-04:
- **`bun run build`:** passed (exit 0).
- **`bun run test`:** 561/561 passed across 38 files, no type errors (exit 0). The known flaky nearby-predictions 502 test in `upstreamTimeout.test.ts` passed in this run.
- **`bun run lint`:** exit 1, with 1 error and 33 warnings.
  - The error is the known format error in `.superset/config.json`, which is untouched and pre-existing.
  - The files changed in this iteration add no new lint findings. Their only warnings are existing ones: `useFilenamingConvention` on the PascalCase test files, and `useNamingConvention` on axios's `baseURL` option in `axios.ts:8`.

---

_Fixed: 2026-09-29T19:11:32Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
