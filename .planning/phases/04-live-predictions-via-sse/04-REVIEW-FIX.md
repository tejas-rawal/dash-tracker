---
phase: 04-live-predictions-via-sse
fixed_at: 2026-08-27T15:57:00Z
review_path: .planning/phases/04-live-predictions-via-sse/04-REVIEW.md
iteration: 2
findings_in_scope: 2
fixed: 2
skipped: 0
status: max_iterations_reached
final_iteration: 3
residual_findings:
  warning: 1
  info: 1
---

# Phase 04: Code Review Fix Report

**Fixed at:** 2026-08-27T15:57:00Z
**Source review:** .planning/phases/04-live-predictions-via-sse/04-REVIEW.md
**Iteration:** 2

**Summary:**
- Findings in scope: 2 (Warning tier — `fix_scope: warning`)
- Fixed: 2
- Skipped: 0

Note: IN-01 (dead `res.headersSent` guard) was explicitly out of scope for this pass per
instructions (harmless dead code, no action requested) and was not touched.

## Fixed Issues

### WR-03: Initial `send(initialPayload)` call is unguarded, unlike every other write path touching the same callback

**Files modified:** `src/server/api/controllers/PredictionStreamController.ts`
**Commit:** `1fd7e1d`
**Applied fix:** Wrapped the `res.writeHead(...)` + `send(initialPayload)` block in its own
try/catch, mirroring `PredictionStreamService.ts`'s `poll()` per-subscriber delivery-failure
handling. On failure, logs `Failed to write initial SSE frame for stop {stop}: {message}`, calls
`unsubscribe()` to release the loop entry, and returns without attempting to write a JSON error
body (headers may already be sent by that point). Added `import { logger } from "../../config"`
to support the new log call. The second `req.on("close", ...)` registration remains outside the
try, after the guarded block, unchanged from the WR-01 fix's structure.

### WR-04: No new test isolates CR-03's delivery-failure branch

**Files modified:** `src/server/api/services/PredictionStreamService.test.ts`
**Commit:** `5711438`
**Applied fix:** Added a new test, `"isolates a throwing subscriber during poll() fan-out so
other subscribers still receive the update"`, with two subscribers (`onUpdateA` throws,
`onUpdateB` is a plain `vi.fn()`). After advancing the fake timer through one poll tick, asserts
`logger.error` was called with a message containing `"Failed to deliver prediction update"` and
that `onUpdateB` still received the tick's data despite `onUpdateA`'s throw. This closes the
regression-coverage gap identified for the CR-03 fix from iteration 1.

## Skipped Issues

None — both in-scope findings were fixed.

## Verification

Ran in the isolated review-fix worktree
(`.claude/worktrees/rf-04-91476-1787846171`, branch `gsd-reviewfix/04-91476`, fast-forwarded onto
`main` after this run) after both fixes were applied and committed:

- `bun run test` — 217/217 tests passed across 17 test files (17 test files, includes the new
  WR-04 regression test and the existing 6-test `PredictionStreamController.test.ts` suite
  covering the WR-03 code path). No type errors.
- `bun run build` — `tsc` compiled cleanly with no errors.
- `bun run lint` — Biome exited 0. All 19 warnings are pre-existing filename-convention
  (`useFilenamingConvention` — PascalCase test filenames) and one pre-existing
  `useThrowOnlyError` warning in `BusRouteController.test.ts` (an intentional, biome-ignored test
  path), none of which reference the two files modified in this pass beyond the pre-existing
  filename-convention warning on `PredictionStreamController.test.ts`'s name (unrelated to the
  fix content).

No regressions introduced by either fix.

---

## Auto-loop conclusion (iteration 3/3 — max reached)

A third re-review pass (iteration 3) confirmed WR-03 and WR-04 hold and found two new,
lower-severity items surfaced by re-verifying WR-03 against real Node HTTP error semantics:

- **WR-05 (Warning):** `res.writeHead`/`res.write` failures from a mid-write client socket
  error surface asynchronously via an `'error'` event, not a synchronous throw — the WR-03
  try/catch only guards synchronous/programmer-error paths. No `res.on("error", ...)` or
  process-level `unhandledRejection`/`uncaughtException` handler exists anywhere in
  `src/server`. Residual gap, not closed by this pass.
- **IN-01 (Info):** The new WR-03 catch branch itself has no test coverage.

The auto-fix loop reached its 3-iteration cap (`--auto` max) with these two items still open.
Neither is a Critical/functional-correctness defect against LIVE-01..05 — WR-05 describes a
process-crash-on-unhandled-error-event risk under a specific network-failure timing, orthogonal
to the phase's shared-poll-loop and freshness-timestamp requirements. Recommended next step:
`/gsd-code-review 04 --fix` for a manual follow-up pass, or track as phase-04 tech debt.

---

_Fixed: 2026-08-27T15:57:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2 (fix), re-reviewed through iteration 3 (final)_
