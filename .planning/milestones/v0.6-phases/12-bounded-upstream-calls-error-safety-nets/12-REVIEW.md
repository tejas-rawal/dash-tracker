---
phase: 12-bounded-upstream-calls-error-safety-nets
reviewed: 2026-09-29T00:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - .env.example
  - src/server/api/controllers/PredictionStreamController.test.ts
  - src/server/api/controllers/PredictionStreamController.ts
  - src/server/api/routes/predictionRoutes.test.ts
  - src/server/api/routes/upstreamTimeout.test.ts
  - src/server/api/services/NearbyPredictionService.test.ts
  - src/server/api/services/NearbyPredictionService.ts
  - src/server/app.ts
  - src/server/config/axios.test.ts
  - src/server/config/axios.ts
  - src/server/config/environment.test.ts
  - src/server/config/environment.ts
  - src/server/config/index.ts
  - src/server/config/processHandlers.test.ts
  - src/server/config/processHandlers.ts
  - src/server/test/setup.ts
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-09-29T00:00:00Z
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

Phase 12 adds four things:
- a per-request total deadline (`AbortSignal.timeout`) on the shared DASH axios client, plus a response interceptor that turns every failure into a key-free `UpstreamApiError`;
- a new `DASH_API_TIMEOUT_MS` env var;
- process-level `unhandledRejection` / `uncaughtException` handlers;
- a single guarded cleanup path for SSE response errors.

The core deadline and key-scrubbing mechanics are sound. No caller passes its own `signal`. No caller inspects `error.response`, so collapsing every error to `UpstreamApiError` breaks nothing. The API key does not reach messages or logs.

The defects are in the edges of the safety nets. Each of these was reproduced on Node v20.20.2 against the project's own `node_modules`:

- The timeout env var has no upper bound. Values of 2^31 ms or more make every DASH call abort after 1 ms, or throw inside the interceptor.
- The `uncaughtException` handler exits before Winston flushes, so the crash line it exists to record is lost under stdout backpressure (lost in 3 of 3 runs).
- The new non-exiting `unhandledRejection` handler turns a shutdown failure into a hang instead of a crash.
- SSE disconnect is still detected on `req` `close`. That event fires at 0 ms when `express.json()` consumes a GET body, and the new cleanup now answers with `res.end()`.

## Warnings

### WR-01: `DASH_API_TIMEOUT_MS` has no upper bound, so large values abort every DASH call instantly or throw inside the interceptor

**File:** `src/server/config/environment.ts:16`, `src/server/config/axios.ts:15`
**Issue:** The schema is `z.coerce.number().int().positive().default(10000)` with no `.max()`. `AbortSignal.timeout` is backed by a 32-bit timer, which gives two failure modes:
- **2147483648 to 4294967295:** Node emits `TimeoutOverflowWarning`, sets the timer to 1 ms, and every request aborts almost at once (measured: aborted after 3 ms).
- **4294967296 and above:** `AbortSignal.timeout` throws `ERR_OUT_OF_RANGE` inside the request interceptor. The response interceptor then maps it to `DASH API request failed: The value of "delay" is out of range...`.

In both cases `BusDataRepository.initialize()` fails and the process exits. The logged reason is a misleading upstream error, such as `DASH API request timed out after 3000000000ms`, instead of the Zod `Invalid environment configuration` error. That breaks the project convention that env vars are "Zod-validated at startup, crash on missing/invalid".

`z.coerce.number()` also silently accepts `"1e4"` and `"0x10"` (verified: `"0x10"` parses to `16`).
**Fix:**
```ts
// Upper bound is Node's max timer delay; anything above it overflows AbortSignal.timeout.
DASH_API_TIMEOUT_MS: z.coerce.number().int().positive().max(2_147_483_647).default(10000),
```
A tighter operational ceiling (for example 120000) is also reasonable. Add a `"2147483648"` case to the `environment.test.ts` table of values that must fail startup.

### WR-02: `uncaughtException` handler calls `process.exit(1)` before Winston has flushed, so the crash log can be lost

**File:** `src/server/config/processHandlers.ts:23-26`
**Issue:** `logger.error(...)` goes through Winston's stream pipeline into the Console transport, and neither is guaranteed synchronous. `process.exit(1)` straight after it drops anything still queued. Reproduced with the project's `winston`: after a large preceding log line creates stdout pipe backpressure, the `Uncaught exception: ... kaboom` line was missing in 3 of 3 runs. Logging the crash through Winston is the whole purpose of D-11, and this is the well-known Winston flush-on-exit problem.

`processHandlers.test.ts:57-75` mocks the logger and only checks that the log call happens before the exit call, so it cannot catch this.
**Fix:** Exit after the logger finishes, with a hard fallback so a stuck transport cannot keep a corrupted process alive:
```ts
process.on("uncaughtException", (error: unknown): void => {
    logger.error(`Uncaught exception: ${describeReason(error)}`);
    // Not unref'd: it must fire even if nothing else keeps the loop alive.
    setTimeout(() => process.exit(1), 1000);
    logger.once("finish", () => process.exit(1));
    logger.end();
});
```

### WR-03: The non-exiting `unhandledRejection` handler turns a failed graceful shutdown into a hung process

**File:** `src/server/app.ts:43-49` (together with `src/server/config/processHandlers.ts:17-19`)
**Issue:** The `shutdown` callback is `server.close(async () => { await favoritesRecentsRepository.close(); ...; process.exit(0); })`. `FavoritesRecentsRepository.close()` rejects when `db.close()` throws, because `handleError` returns `never`. Nothing awaits that async callback, so the rejection is unhandled.
- **Before this phase:** Node 20's default crashed the process with exit code 1.
- **Now:** the new handler only logs it and deliberately does not exit (D-10). `process.exit(0)` never runs, and the service-alert poll `setInterval` (`ServiceAlertPollService.ts:30`, not unref'd) keeps the event loop alive. On SIGTERM the process hangs until the orchestrator sends SIGKILL.
**Fix:** Handle the failure inside `shutdown` instead of relying on the global net:
```ts
const shutdown = (): void => {
    server.close(() => {
        favoritesRecentsRepository
            .close()
            .then(() => {
                logger.info("Server is gracefully shutting down");
                process.exit(0);
            })
            .catch((error: unknown) => {
                const message = error instanceof Error ? error.message : "Unknown error";
                logger.error(`Shutdown failed: ${message}`);
                process.exit(1);
            });
    });
};
```

### WR-04: SSE disconnect is detected on `req` `close`, which fires immediately once `express.json()` consumes a GET body, and cleanup now ends the stream

**File:** `src/server/api/controllers/PredictionStreamController.ts:65`, `:86-89`
**Issue:** `IncomingMessage` auto-destroys once its body has been read, and then emits `close` whether or not the client is still connected. `app.ts:15` mounts `express.json()` globally. A GET to `/api/v1/predictions/stream` with `Content-Type: application/json` and a body is therefore parsed first. In an Express reproduction with the project's `express`, `req` emitted `close` at 0 ms with `req.destroyed === true` while the client was still connected. Only `res` `close` fired on the real disconnect (at about 493 ms).

In the controller this means `cleanup()` sets `finished`, and after `subscribe` resolves, `finished || req.destroyed` runs `cleanup()` again. That unsubscribes and calls `res.end()`, which the phase-12 change added. The client gets an empty 200 instead of an event stream. `EventSource` never sends a body, so real-world impact is limited. Still, `req` `close` is the wrong lifecycle signal for a long-lived response, and the mock-based controller tests (`makeMockReq`) encode that assumption.
**Fix:** Listen on the response, which closes exactly when the underlying connection does:
```ts
res.on("close", cleanup);
res.on("error", onResponseError);
// ...
if (finished || res.writableEnded || res.destroyed) {
    cleanup();
    return;
}
```
Update `makeMockRes` / `makeMockReq` so the disconnect trigger fires `res` `close`.

### WR-05: Graceful shutdown never completes while any SSE stream is open (pre-existing, same file)

**File:** `src/server/app.ts:43-50`
**Issue:** `server.close()` stops accepting connections and, on Node 19 and later, closes only idle keep-alive sockets. The callback does not run until every active connection ends. SSE responses from `PredictionStreamController` never end on their own, and the per-stop poll intervals keep running. With one rider connected, SIGTERM never reaches `favoritesRecentsRepository.close()` or `process.exit(0)`, and the process is SIGKILLed with the SQLite handle still open. This predates phase 12, but it undermines the reliability goal of this milestone and sits in a reviewed file.
**Fix:** After `server.close(...)`, end the long-lived responses explicitly. Either call `server.closeAllConnections()` after a short grace timeout, or track open SSE responses and call `res.end()` on each during shutdown.

## Info

### IN-01: Request interceptor silently discards any caller-supplied `signal`, and every cancel is reported as a timeout

**File:** `src/server/config/axios.ts:14-17`, `:23-25`
**Issue:** `config.signal = AbortSignal.timeout(...)` overwrites the caller's signal, and `axios.isCancel(error)` maps every cancellation to `timed out after Nms`. No caller passes a signal today, so nothing breaks now. A future caller that tries to cancel an in-flight DASH fetch, for example when an SSE subscriber leaves, would be silently ignored. The comment at lines 21-22 depends on that invariant, which is not enforced anywhere.
**Fix:** Compose the signals instead of replacing them: `config.signal = config.signal ? AbortSignal.any([config.signal as AbortSignal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms)`. This is available on Node 20.3 and later. To label timeouts, check the abort reason's `name === "TimeoutError"` rather than every `isCancel`.

### IN-02: Listener parameter types misstate what can arrive

**File:** `src/server/api/controllers/PredictionStreamController.ts:66-67`, `src/server/config/processHandlers.ts:23`
**Issue:** The `res` `error` listener declares `error: Error` and then checks `error instanceof Error`, which is redundant by its own type. The `uncaughtException` listener declares `error: Error`, but JavaScript code can `throw` any value, such as `throw "x"`. `describeReason` already accepts `unknown`, so the declared type is simply wrong.
**Fix:** Type both parameters as `unknown` and keep the narrowing, or drop the redundant check in the `res` listener.

### IN-03: `agencyKey` is cast without validation in a parser that otherwise rejects malformed fields

**File:** `src/server/api/services/NearbyPredictionService.ts:120`
**Issue:** `data.agencyKey as string` passes through `undefined` or a non-string value unchecked. The rest of `parseDashResponse` and `isValidNearbyEntry` reject wrong-typed fields on principle. This line predates phase 12 (commit 2bff6d0b).
**Fix:** `if (typeof data.agencyKey !== "string") throw new UpstreamApiError("DASH API returned a malformed nearby predictions response (agencyKey is not a string)");`

### IN-04: If `subscribe` fails after the client has already disconnected, the handler still writes an error response

**File:** `src/server/api/controllers/PredictionStreamController.ts:75-80`
**Issue:** The catch block only checks `res.headersSent`. When `finished` is already true because the client has gone, it still calls `res.status(...).json(...)` on a dead connection. The new `res` `error` listener then logs a spurious `SSE response error` warning for a stream that never started.
**Fix:** `if (finished || res.headersSent) { return; }`

---

_Reviewed: 2026-09-29T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
