---
phase: 12-bounded-upstream-calls-error-safety-nets
plan: 04
subsystem: infra
tags: [node, process, unhandledRejection, uncaughtException, winston, vitest]

requires:
  - phase: 12-bounded-upstream-calls-error-safety-nets
    provides: "12-01 message-only UpstreamApiError mapping on the DASH client (T-11-01 secret-safety idiom this plan extends)"
provides:
  - "registerProcessErrorHandlers(): void in src/server/config/processHandlers.ts, re-exported from the config barrel"
  - "unhandledRejection listener: logs 'Unhandled promise rejection: <stack|String(reason)>' and keeps the process running (D-10)"
  - "uncaughtException listener: logs 'Uncaught exception: <stack>' then process.exit(1) (D-11)"
  - "Handlers registered first in app.ts, before the alert poll and repository init"
affects: [13-resilient-route-stop-data-lifecycle, 14-health-rate-limiting]

actuals:
  tokens: 2019
  tasks: 2
  commits: 3
plan_head_before: 35a8b8362302b58e5e3038714c7f8a56857eb815

tech-stack:
  added: []
  patterns:
    - "captureProcessListeners(): spy on process.on only while registering, then restore, so handlers never attach to the vitest worker"
    - "describeReason(reason): stack ?? message for Error, String(reason) otherwise; always one string argument to logger.error"

key-files:
  created:
    - src/server/config/processHandlers.ts
    - src/server/config/processHandlers.test.ts
  modified:
    - src/server/config/index.ts
    - src/server/app.ts

key-decisions:
  - "[Phase 12-04] Process error handlers live in src/server/config/processHandlers.ts (registerProcessErrorHandlers) and are called as the first statement after imports in app.ts; unhandledRejection logs and keeps running, uncaughtException logs then exits 1"
  - "[Phase 12-04] Both listeners share one formatter, describeReason: stack ?? message for Error, String(reason) otherwise, passed as the single argument to logger.error, so no reason object (and no DASH_API_KEY) is ever serialized"

patterns-established:
  - "Process-level listeners are tested by capturing them with a transient vi.spyOn(process, 'on') and invoking them directly, with process.exit mocked"

requirements-completed: [ERR-02]

coverage:
  - id: D1
    description: "An unhandled promise rejection is logged through Winston and the process keeps running"
    requirement: ERR-02
    verification:
      - kind: unit
        ref: "src/server/config/processHandlers.test.ts#logs an unhandled rejection through Winston and keeps the process running"
        status: pass
      - kind: integration
        ref: "bunx tsx -e '...registerProcessErrorHandlers(); void Promise.reject(new Error(\"tracer-boom\")); setTimeout(... 'still-alive' ...)' -> logs 'Unhandled promise rejection: Error: tracer-boom', prints still-alive, exit 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "An uncaught exception is logged through Winston before the process exits with code 1"
    requirement: ERR-02
    verification:
      - kind: unit
        ref: "src/server/config/processHandlers.test.ts#logs an uncaught exception through Winston before exiting with code 1"
        status: pass
      - kind: integration
        ref: "bunx tsx -e '...setTimeout(() => { throw new Error(\"tracer-crash\") }, 10)...' -> logs 'Uncaught exception: Error: tracer-crash', no should-not-print, exit 1"
        status: pass
    human_judgment: false
  - id: D3
    description: "Logged reasons are the stack/message or String(reason) only, as one string; a secret on the reason object never reaches the log"
    requirement: ERR-02
    verification:
      - kind: unit
        ref: "src/server/config/processHandlers.test.ts#logs only the message and stack for $label, never the reason object (4 rows)"
        status: pass
    human_judgment: false
  - id: D4
    description: "registerProcessErrorHandlers is re-exported from the config barrel and called in app.ts before the alert poll and repository init"
    requirement: ERR-02
    verification:
      - kind: unit
        ref: "src/server/config/processHandlers.test.ts#registers both process error listeners"
        status: pass
      - kind: other
        ref: "grep -n 'registerProcessErrorHandlers();' src/server/app.ts -> line 9, before serviceAlertPollService.start() (34) and repository.initialize() (36)"
        status: pass
    human_judgment: false

duration: 3min
completed: 2026-09-29
status: complete
---

# Phase 12 Plan 04: Process Error Safety Nets Summary

**`registerProcessErrorHandlers()` logs unhandled rejections through Winston and keeps the server running. It logs uncaught exceptions and then exits 1. Only the stack or message (or `String(reason)`) is logged, so an axios error's `DASH_API_KEY` never reaches the log.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-09-29T15:08:54Z
- **Completed:** 2026-09-29T15:11:53Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- A stray promise rejection no longer crashes the server. Registering the listener overrides Node 20's default crash-on-unhandled-rejection. A real child process logs `Unhandled promise rejection: Error: tracer-boom` with its stack, prints a later `still-alive` marker, and exits 0 (ERR-02, ROADMAP Phase 12 SC5).
- An escaping synchronous throw is logged as `Uncaught exception: Error: ...` through Winston before `process.exit(1)`. A child process confirms exit code 1, and the later marker never prints.
- `describeReason` is the single formatter for both listeners. A unit test with a `super-secret-key` fixture confirms that `logger.error` gets exactly one string argument and that the secret never appears.
- `app.ts` calls `registerProcessErrorHandlers()` first, at line 9, before the alert poll and the repository init chain. The init-failure `.catch` is unchanged.

## Task Commits

1. **Task 1: unhandledRejection handler, barrel export, early app.ts registration (tracer)** - `35a88b9` (feat)
2. **Task 2: uncaughtException log-then-exit, secret-safe reasons (TDD)**
   - RED: `4bfe4cc` (test)
   - GREEN: `86b6dbe` (feat)
   - REFACTOR: none needed

## Files Created/Modified
- `src/server/config/processHandlers.ts` - `registerProcessErrorHandlers()` with both process listeners and the module-private `describeReason` formatter
- `src/server/config/processHandlers.test.ts` - 7 tests using the `captureProcessListeners()` harness, a mocked logger and a mocked `process.exit`
- `src/server/config/index.ts` - `export * from "./processHandlers";`
- `src/server/app.ts` - imports `registerProcessErrorHandlers` from `./config` and calls it before any boot work

## Decisions Made
- Followed the plan's discretionary placement: a small module under `config/` instead of inlining in `app.ts`, which is excluded from coverage and has import-time side effects.
- Tracer feedback gate: auto mode was active (`workflow._auto_chain_active: true`). All four of Task 1's `<verify>` commands were re-run and passed before expanding to Task 2.

## TDD Gate Compliance
- RED `4bfe4cc` precedes GREEN `86b6dbe`. The target test "registers both process error listeners" failed on an assertion: `expected [ 'unhandledRejection' ] to deeply equal [ 'uncaughtException', …(1) ]`. The run was 7 tests, 2 failed and 5 passed. `gsd-tools check tdd-red-evidence` returned `RED_EVIDENCE_OK` (`target_test_failed`).
- The second target test, "logs an uncaught exception...", failed in RED with `TypeError: onUncaughtException is not a function`, because the listener did not exist yet. That is a behavior gap, not a load or syntax failure.
- The four D-12 `it.each` rows already passed in RED. That was expected: Task 1's `describeReason` already implemented D-12, and the plan only required the uncaught-exception and registration cases to fail.

## Deviations from Plan

None - plan executed exactly as written.

One tooling adaptation, with no code impact. `check tdd-red-evidence` parses node-test TAP summary lines (`# tests/# pass/# fail`), which Vitest's `tap-flat` reporter does not emit. The RED run was captured with `--reporter=tap-flat`, and the summary lines were appended using the counts from that same run (7/5/2, matching Vitest's own `Tests 2 failed | 5 passed (7)`).

## Issues Encountered
- Two acceptance-criteria greps (`${message}` and `$label`) returned 0 under BSD grep because `$` is treated as an anchor. Re-running them as fixed-string (`grep -F`) matches returned 1 for both. The criteria are met.
- Biome reformatted the `captureProcessListeners` spy signature onto one line during Task 1, before the commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- ERR-02 is closed. v0.2 WR-05 is fully closed together with 12-03 (SSE `res.on("error")`).
- The app.ts init `.catch` (log, then `process.exit(1)`) is intentionally untouched. Phase 13 replaces it with background retry.
- Plan 12-02 is the only Phase 12 plan still incomplete.

## Self-Check: PASSED
- FOUND: src/server/config/processHandlers.ts
- FOUND: src/server/config/processHandlers.test.ts
- FOUND: 35a88b9, 4bfe4cc, 86b6dbe
- Full suite: 38 files, 548/548 tests pass, no type errors. `tsc --noEmit` exits 0. Coverage: 98.43% statements, 93.58% branches.

---
*Phase: 12-bounded-upstream-calls-error-safety-nets*
*Completed: 2026-09-29*
