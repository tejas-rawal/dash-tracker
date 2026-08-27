---
phase: 04-live-predictions-via-sse
reviewed: 2026-08-27T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - src/server/api/services/PredictionStreamService.ts
  - src/server/api/services/PredictionStreamService.test.ts
  - src/server/api/controllers/PredictionStreamController.ts
  - src/server/api/controllers/PredictionStreamController.test.ts
  - src/server/api/routes/predictionRoutes.ts
  - src/server/api/routes/predictionRoutes.test.ts
  - src/server/api/models/Prediction.ts
  - src/server/api/services/PredictionService.ts
  - src/server/api/services/PredictionService.test.ts
  - src/server/api/controllers/PredictionController.test.ts
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 04: Code Review Report (Iteration 2)

**Reviewed:** 2026-08-27T00:00:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

This is a re-review of iteration 1's five findings (CR-01, CR-02, CR-03, WR-01, WR-02) after the
fix pass in commits `b4a2479` and `3931d58`. I re-traced each fix directly against the current
source (not the fix report's narrative) and additionally hand-traced the microtask-level
interleaving for 2-way and 3-way concurrent-subscriber scenarios that go beyond what the new
tests exercise, to check whether the fixes hold under orderings the test suite doesn't cover.

**All three Critical findings and both Warnings from iteration 1 are genuinely closed:**

- **CR-01** (duplicate/leaked loops for concurrent first-subscribers): The `pendingFirstFetch`
  map correctly serializes concurrent first-subscribers behind one shared fetch, and the
  post-await `raced = loops.get(stopId)` re-check correctly hands late arrivals off to whichever
  caller won the race to create the loop. I hand-traced the 3-way case where the *loop-creating*
  subscriber disconnects and calls `unsubscribe()` before the other concurrent joiners have
  merged into the loop's `subscribers` set — this does **not** produce a premature `size === 0`
  teardown, because in V8/Node's microtask ordering, all N subscribers' internal `subscribe()`
  continuations (which create-or-join the loop) are queued and drain strictly before any of
  their outer controller-level continuations (which can call `unsubscribe()`) get scheduled.
  The fix holds even for this untested edge case.
- **CR-02** (late disconnect-listener registration): `req.on("close", () => { closed = true })`
  is now registered before `await streamService.subscribe(...)`, and the post-await
  `if (closed || req.destroyed)` branch correctly calls `unsubscribe()` without ever writing
  headers. Because everything between the await's resolution and the second `req.on("close", ...)`
  registration is synchronous JS with no further `await`, there's no window in which a
  disconnect can land between the check and the header write — closed the gap correctly.
- **CR-03** (fan-out loop aborted by one subscriber's failing delivery): Each `subscriber(result)`
  call in `poll()`'s fan-out loop is now individually wrapped in its own try/catch with a
  distinct `Failed to deliver prediction update for stop {id}` log message, correctly isolating
  one bad connection from the rest of the fan-out and from the upstream-fetch error path.
- **WR-01** (post-`writeHead` catch-all double-fault): `send(initialPayload)` and the second
  `req.on("close", ...)` registration were moved outside the `try` that wraps only
  `streamService.subscribe(...)`, and the catch block guards with `res.headersSent` before
  writing a JSON error body. Verified this eliminates the original `ERR_HTTP_HEADERS_SENT`
  double-fault path.
- **WR-02** (missing race coverage): New tests genuinely exercise both races —
  `PredictionStreamService.test.ts` fires two `subscribe()` calls without awaiting the first
  (using a manually-resolved fetch promise) and asserts exactly one fetch/one loop, and
  `PredictionStreamController.test.ts` triggers `close` while a manually-controlled `subscribe`
  promise is still pending and asserts `unsubscribe()` fires with no header/body writes. I ran
  both test files directly (`bun run test`) — 14/14 pass, no type errors.

No zombie loops, no duplicate timers, and no premature teardown were reproducible against the
current source for any interleaving I traced.

**Two new/residual issues surfaced during this pass** (both introduced or exposed by the
restructuring in the WR-01 fix, not present as findings in iteration 1) — see Warnings below.
Neither blocks the phase; both are worth a follow-up pass.

## Warnings

### WR-03: Initial `send(initialPayload)` call is unguarded, unlike every other write path touching the same callback

**File:** `src/server/api/controllers/PredictionStreamController.ts:69-75`
**Issue:** The WR-01 fix correctly moved `send(initialPayload)` outside the `try` block that
wraps `streamService.subscribe(...)`, which fixes the double-fault (writing a JSON error body
after headers are already sent). But this also means the initial `send(initialPayload)` call at
line 75 is now the *only* invocation of the `send` callback in the whole feature that isn't
guarded against a write failure — `poll()`'s fan-out loop (`PredictionStreamService.ts:36-41`)
wraps every `subscriber(result)` call in its own try/catch specifically because a write to an
in-flight-but-broken connection can fail. The exact same failure mode applies to line 75: if the
client's socket errors or is destroyed in the small window between the `closed`/`req.destroyed`
check and this line (e.g., an abrupt `ECONNRESET` that hasn't yet surfaced as `req.destroyed`
or fired `close`), `res.writeHead`/`send` here has no try/catch, no `catch` block below it (WR-01
narrowed the try to only cover `subscribe()`), and no route-level error handler — since Express 4
does not await async handlers, a throw here becomes an unhandled promise rejection with no
handler in `app.ts` (no `process.on("unhandledRejection", ...)` is registered anywhere in the
codebase).
**Fix:** Wrap the header/initial-send block in its own try/catch that mirrors `poll()`'s
delivery-failure handling (log and return; don't attempt to write a JSON error body since headers
may already be sent), rather than leaving it fully unguarded:
```ts
try {
    res.writeHead(200, { ... });
    send(initialPayload);
} catch (writeError) {
    const message = writeError instanceof Error ? writeError.message : "Unknown error";
    logger.error(`Failed to write initial SSE frame for stop ${stop}: ${message}`);
    unsubscribe();
    return;
}
req.on("close", () => { unsubscribe(); res.end(); });
```

### WR-04: No new test isolates CR-03's delivery-failure branch

**File:** `src/server/api/services/PredictionStreamService.test.ts` (whole file)
**Issue:** The WR-02 fix added tests for the CR-01 (interleaved subscribe) and CR-02
(disconnect-during-pending-subscribe) races, but no test exercises the CR-03 fix itself: a
subscriber callback throwing during `poll()`'s fan-out loop. There is no test asserting that (a)
a throwing subscriber's exception is caught and logged with the new
`Failed to deliver prediction update for stop {id}` message, and (b) the *other* subscribers in
the same tick still receive their update despite the first subscriber's failure. This is exactly
the scenario CR-03 was raised to fix in iteration 1, and it currently has zero regression
coverage — a future refactor of `poll()` could silently reintroduce the original bug (one bad
subscriber blocking the whole fan-out) without any test catching it.
**Fix:** Add a test with two subscribers where `onUpdateA` throws and `onUpdateB` is a plain
`vi.fn()`; after a tick, assert `onUpdateB` was still called with the tick's data and
`logger.error` was called with a message containing `"Failed to deliver prediction update"`.

## Info

### IN-01: `res.headersSent` guard in the catch block is now unreachable dead code

**File:** `src/server/api/controllers/PredictionStreamController.ts:54-59`
**Issue:** The `if (res.headersSent) { return; }` check inside the `catch` block for
`streamService.subscribe(...)` was a meaningful guard under the *pre-fix* control flow (where
`send`/`writeHead` were inside the same try block as `subscribe`). After the WR-01 fix narrowed
the try block to wrap only `streamService.subscribe(...)`, headers are only ever written *after*
this try/catch has already exited successfully — there is no code path in the current function
where `subscribe()` throws (entering this catch) and `res.headersSent` is already `true`. The
check is dead code given the current structure, though harmless.
**Fix:** No action required; either remove the now-unreachable guard for clarity, or leave a
short comment noting it's retained as defense-in-depth against future refactors that might move
code back inside the try.

### IN-02 (carried over from iteration 1, unchanged): Duplicate `resolveErrorStatus`/`resolveErrorBody` helpers between `PredictionController.ts` and `PredictionStreamController.ts`

**File:** `src/server/api/controllers/PredictionStreamController.ts:10-31`
**Issue:** Unchanged from iteration 1 — still an explicit, deliberate duplication per the plan,
not a regression. Noted again only for continuity; no new action needed this iteration.
**Fix:** No action required this iteration; revisit if any of the copies needs to change.

---

_Reviewed: 2026-08-27T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
