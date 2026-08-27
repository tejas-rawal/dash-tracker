---
phase: 04-live-predictions-via-sse
reviewed: 2026-08-27T16:30:00Z
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
  warning: 1
  info: 1
  total: 2
status: issues_found
---

# Phase 04: Code Review Report (Iteration 3 — Final Pass)

**Reviewed:** 2026-08-27T16:30:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

This is a re-review of iteration 2's two Warnings (WR-03, WR-04) after the fix pass documented in
`04-REVIEW-FIX.md` (commits `1fd7e1d`, `5711438`). I re-inspected the current source directly
rather than trusting the fix report's narrative, and traced the new code paths those fixes
introduced for any residual or newly-introduced gaps. `predictionRoutes.ts`,
`predictionRoutes.test.ts`, `Prediction.ts`, `PredictionService.ts`, `PredictionService.test.ts`,
and `PredictionController.test.ts` were untouched by this fix pass (confirmed via `git log`) and
show no new issues since iteration 2.

**WR-04 is genuinely closed.** `PredictionStreamService.test.ts` now contains a test
("isolates a throwing subscriber during poll() fan-out so other subscribers still receive the
update") that sets `onUpdateA` to throw and `onUpdateB` to a plain `vi.fn()`, advances the fake
timer through one poll tick, and asserts both that `logger.error` was called with
`"Failed to deliver prediction update"` and that `onUpdateB` still received `secondPayload`. I
traced this against `PredictionStreamService.ts`'s `poll()` (lines 32-46): the `Set` iteration
order is insertion order (A then B), each `subscriber(result)` call is independently wrapped in
try/catch, so A's throw is caught and logged without preventing B's delivery. The test genuinely
exercises the CR-03 regression path and would fail if a future refactor reintroduced one-bad-
subscriber-blocks-the-fan-out.

**WR-03 is fixed at the letter of the finding, but the fix's actual protective value is narrower
than the finding intended** — see WR-05 below, a residual gap surfaced during this re-verification
that supersedes and refines WR-03 rather than reopening it as unfixed. The literal code change
requested (wrap `writeHead`/`send` in try/catch, log-and-return on failure without a double-fault)
was applied correctly and does prevent the specific double-fault scenario WR-03/WR-01 identified.
No test was added for this new catch branch, and re-tracing the failure mode against Node's actual
I/O semantics shows the guard is unlikely to fire for the network-level scenario it was written to
catch.

No new Critical issues. No regressions in previously-fixed CR-01, CR-02, CR-03, or WR-01/WR-02
were found; all trace correctly against current source as described in iteration 2's report.

## Warnings

### WR-05: The WR-03 guard only catches synchronous throws, but the failure mode it was written for (broken client socket) is asynchronous and unguarded

**File:** `src/server/api/controllers/PredictionStreamController.ts:70-83`
**Issue:** The new try/catch around `res.writeHead(...)` + `send(initialPayload)` correctly
prevents the double-fault path (writing a JSON error body after headers are sent) that WR-01/WR-03
were raised against. However, it only catches **synchronous** exceptions. `res.writeHead()` and
`res.write()` (called via `send`) do not throw synchronously for the scenario the original WR-03
finding described — "the client's socket errors or is destroyed" mid-write. In Node's `http`
module, a write against an already-broken/destroyed socket surfaces asynchronously as an `'error'`
event on the response/socket object, not as a thrown exception from the `write()` call itself.
I confirmed via `grep` that no `res.on("error", ...)`, `req.on("error", ...)`, or process-level
`process.on("uncaughtException"/"unhandledRejection", ...)` handler exists anywhere in
`src/server`. This means the actual network-failure scenario WR-03 set out to guard against is
still effectively unhandled — the new try/catch mostly protects against theoretical programmer
errors (e.g., calling `writeHead` twice), which cannot occur given the `closed`/`req.destroyed`
check immediately preceding it. This is a narrower, harder-to-verify claim than "the process will
crash on every client disconnect" (many Express apps see this exact scenario resolved harmlessly
via `'close'` rather than `'error'`), but the specific write-failure mode named in WR-03 remains
without a listener, and the try/catch added to address it will not fire for it.
**Fix:** Attach an `'error'` listener on `res` (and/or `req`) before writing, to convert any async
socket-level write failure into a logged-and-cleaned-up path rather than an unhandled `EventEmitter`
error:
```ts
res.on("error", (err) => {
    logger.error(`SSE response error for stop ${stop}: ${err.message}`);
    unsubscribe();
});
```
Register this alongside the existing `req.on("close", ...)` handlers so both the request and
response sides of the connection are covered.

## Info

### IN-01: New writeHead/send failure branch has no test coverage

**File:** `src/server/api/controllers/PredictionStreamController.test.ts` (whole file)
**Issue:** `PredictionStreamController.test.ts` has no test that drives `res.writeHead` or the
mocked `res.write` (via `send`) to throw, so the new catch block added for WR-03
(`PredictionStreamController.ts:78-83`) has zero regression coverage. This mirrors the exact gap
WR-04 closed for `poll()`'s fan-out isolation, but for the sibling code path in the controller. A
future refactor that removed or broke this catch (e.g., re-widening the try block, as it was
before WR-01) would not be caught by the current test suite.
**Fix:** Add a test where the mocked `res.writeHead` throws synchronously; assert `logger.error`
is called with a message containing `"Failed to write initial SSE frame"`, `unsubscribe()` fires
exactly once, and no JSON error body is written (`res.status`/`res.json` not called).

---

_Reviewed: 2026-08-27T16:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
