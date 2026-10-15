---
phase: 12-bounded-upstream-calls-error-safety-nets
plan: 03
subsystem: api
tags: [sse, express, error-handling, vitest, fake-timers]

requires:
  - phase: 04-live-predictions-via-sse (v0.2)
    provides: PredictionStreamController/PredictionStreamService with idempotent unsubscribeFrom and the per-stop 30 s poll
provides:
  - SSE response 'error' listener that logs at warn and runs the disconnect cleanup
  - One shared, idempotent cleanup for req 'close' and res 'error', registered before subscribe is awaited
  - Controller tests for ordering, idempotency and pending-subscribe errors, plus a multi-subscriber integration test against the real PredictionStreamService
affects: [12-04 unhandledRejection handler (ERR-02), phase 14 health/rate limiting]

actuals:
  tokens: 3234
  tasks: 2
  commits: 2
plan_head_before: d9bbd0dd12cb1f150302674f40aea6962dfbe96b

tech-stack:
  added: []
  patterns:
    - "Shared idempotent cleanup closure (finished/cleanedUp flags plus a hoisted unsubscribe) wired to both req close and res error before any await"
    - "emitResponseError(res, error) test helper that fires every res.on('error') listener recorded on the mock"

key-files:
  created:
    - .planning/phases/12-bounded-upstream-calls-error-safety-nets/deferred-items.md
  modified:
    - src/server/api/controllers/PredictionStreamController.ts
    - src/server/api/controllers/PredictionStreamController.test.ts

key-decisions:
  - "SSE res 'error' logs at warn 'SSE response error for stop <stop>: <message>' (message only), then runs the same cleanup as a client disconnect. One guarded closure serves req close and res error, so either order runs unsubscribe + res.end exactly once"
  - "The close/error listeners are attached before subscribe is awaited. A close or error during a pending subscribe only sets `finished`, and the cleanup runs once the subscription exists. The initial-write catch now also routes through cleanup(), so it ends the response too"
  - "The hoisted `let unsubscribe` is initialised to `= undefined` explicitly. Biome's useConst otherwise demands a const, which would put the closure's read in the TDZ"

patterns-established:
  - "SSE teardown: a single idempotent cleanup registered upfront for every termination signal, with no teardown logic duplicated in PredictionStreamService (D-15)"

requirements-completed: [ERR-01]

coverage:
  - id: D1
    description: "An error on an established SSE response is logged at warn with the stop id and message, and runs unsubscribe + res.end exactly once"
    requirement: ERR-01
    verification:
      - kind: unit
        ref: "src/server/api/controllers/PredictionStreamController.test.ts#logs a warning and runs the disconnect cleanup once when the SSE response errors"
        status: pass
    human_judgment: false
  - id: D2
    description: "Cleanup is idempotent across event order (error then close, close then error)"
    requirement: ERR-01
    verification:
      - kind: unit
        ref: "src/server/api/controllers/PredictionStreamController.test.ts#runs the cleanup once when the response errors and the request then closes"
        status: pass
      - kind: unit
        ref: "src/server/api/controllers/PredictionStreamController.test.ts#runs the cleanup once when the request closes and the response then errors"
        status: pass
    human_judgment: false
  - id: D3
    description: "An error that arrives while subscribe is pending unsubscribes once the subscription resolves and writes no SSE headers or frames"
    requirement: ERR-01
    verification:
      - kind: unit
        ref: "src/server/api/controllers/PredictionStreamController.test.ts#unsubscribes without writing headers when the response errors while subscribe is still pending"
        status: pass
    human_judgment: false
  - id: D4
    description: "With the real PredictionStreamService, an errored subscriber is dropped while its neighbour on the same stop keeps receiving ticks, and the per-stop poll stops once the last subscriber leaves (SC4)"
    requirement: ERR-01
    verification:
      - kind: integration
        ref: "src/server/api/controllers/PredictionStreamController.test.ts#keeps streaming to other subscribers on the stop after one subscriber's response errors, and stops polling when the last leaves"
        status: pass
    human_judgment: false
  - id: D5
    description: "Existing SSE behaviour is preserved (400, 404/502 without SSE headers, headers plus initial frame, close cleanup, real-socket route stream)"
    verification:
      - kind: unit
        ref: "src/server/api/controllers/PredictionStreamController.test.ts (6 pre-existing tests, bodies unedited)"
        status: pass
      - kind: integration
        ref: "src/server/api/routes/predictionRoutes.test.ts#streams an immediate event: prediction frame carrying the mocked payload"
        status: pass
    human_judgment: false

duration: 3min
completed: 2026-09-29
status: complete
---

# Phase 12 Plan 03: SSE Response Error Safety Net Summary

**`PredictionStreamController` now handles `res.on("error")`: it logs a warn line with the stop id and message, then runs the disconnect cleanup (unsubscribe, then end) through one idempotent closure. That closure is registered before `subscribe` is awaited. A broken rider socket can no longer crash the process or leak a 30 s DASH poll.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-09-29T15:04:13Z
- **Completed:** 2026-09-29T15:07:30Z
- **Tasks:** 2
- **Files modified:** 2 source/test files (+1 planning file)

## Accomplishments
- Closed the SSE half of v0.2 WR-05 (ERR-01). An `error` on the SSE response now has a listener, so Node no longer throws it as an uncaught exception.
- Built one shared, guarded `cleanup` for client close, response error, a close or error during a pending subscribe, and a failed initial write. Each of these runs `unsubscribe()` + `res.end()` exactly once.
- Proved SC4 against the real `PredictionStreamService`: when one subscriber's socket errors, it stops receiving updates while the other subscriber on the same stop keeps getting ticks, and the per-stop DASH poll stops once the last subscriber leaves.
- Left `PredictionStreamService.ts` byte-identical to plan base `8a91098` (D-15).

## Task Commits

1. **Task 1 (tracer): res error leads to a warn plus the shared idempotent disconnect cleanup, registered before subscribe.** `8d03c87` (fix)
2. **Task 2 (tdd): pin ordering, idempotency, the pending-subscribe case and multi-subscriber isolation against the real service.** `7346769` (test)

**Plan metadata:** see the `docs(12-03)` commit that follows.

## Files Created/Modified
- `src/server/api/controllers/PredictionStreamController.ts`:
  - adds the `finished`/`cleanedUp` flags, a hoisted `unsubscribe` and the `cleanup` closure;
  - registers `req.on("close", cleanup)` and the `res.on("error")` warn plus cleanup before the `subscribe` await;
  - runs any cleanup deferred during a pending subscribe once it resolves;
  - routes the initial-write catch through cleanup;
  - removes the trailing close listener.
- `src/server/api/controllers/PredictionStreamController.test.ts`:
  - adds a logger-only config mock and `beforeEach(vi.clearAllMocks)`;
  - gives `res.on` a capture, adds the `emitResponseError` helper and a multi-callback `triggerClose`;
  - adds 4 new unit tests and 1 real-service integration test with fake timers.
- `.planning/phases/12-bounded-upstream-calls-error-safety-nets/deferred-items.md` logs the pre-existing lint failure found during verification.

## Decisions Made
- I followed the plan's structure as specified. On flagged assumptions 1–4:
  - A second `error` logs a second warn but never re-runs cleanup, because the `cleanedUp` flag guards it.
  - On the 404/502 rejection path `unsubscribe` is never set, so a later close or error only sets `finished`.
  - `res.end()` now also runs on the pre-subscribe-disconnect and failed-initial-write paths. It's a no-op on a destroyed socket.
- `let unsubscribe: (() => void) | undefined = undefined;` has an explicit initializer. Without it, Biome's `useConst` flags the declaration: the variable is assigned once after `await`, and the rule can't see that the `cleanup` closure reads it before then, so a `const` would TDZ-throw. An explicit initializer is cleaner than a `biome-ignore`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Biome `useConst` false positive on the hoisted `unsubscribe`**
- **Found during:** Task 1 (the Biome verify step)
- **Issue:** Biome reported `lint/style/useConst` as an error on `let unsubscribe: (() => void) | undefined;`. It only saw the single assignment after `await subscribe`, and a `const` there would break the closure that reads it earlier.
- **Fix:** Initialised it explicitly with `= undefined`. Runtime behaviour is unchanged.
- **Files modified:** src/server/api/controllers/PredictionStreamController.ts
- **Verification:** `bunx biome check` on both files reports no errors (only the existing `useFilenamingConvention` warning on `*.test.ts`). tsc is clean and the tests pass.
- **Committed in:** 8d03c87

**Process note (no code impact):** during plan-level verification, a stray `git checkout d9bbd0d --` with no pathspec briefly detached HEAD at the plan-base commit. The branch ref was never moved, and the unrelated working-tree changes were carried over untouched. I re-attached HEAD to `feat/backend-reliability-ops` (`7346769`) immediately and verified `src/` matched `7346769` exactly. No commits were made while HEAD was detached.

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** No scope change. The implementation matches the plan's specified structure.

## TDD Gate Compliance

Task 2 is `tdd="true"` inside a `type: execute` plan, and Task 1 (a tracer) had already shipped the behaviour. So Task 2's tests went green on their first run, which is the "unexpected GREEN" case the plan anticipated ("Task 1's controller should already satisfy them"). I investigated instead of accepting it on faith: I ran each new test against deliberate controller mutants and confirmed each one fails on its intended assertion.

| Mutant | Tests killed |
|--------|--------------|
| `cleanedUp` guard removed | both ordering/idempotency tests (`expected "spy" to be called 1 times, but got 2 times`) |
| Pending-subscribe replay (`finished ||`) removed | both pending-subscribe tests (close and error variants) |
| `res.on("error")` listener not registered | all 5 error-path tests, including the real-service integration test |

The controller was restored to the committed state after each mutant (`git diff` empty).

- **RED:** the RED-to-GREEN commit order is inverted by design. The implementation landed as `fix(12-03)` `8d03c87` in the tracer task, and the pinning tests landed as `test(12-03)` `7346769`. No `feat(12-03)` commit exists, so the plan-level RED→GREEN sequence isn't present in git. The mutation evidence above stands in for RED evidence.
- **`gsd_run check tdd-red-evidence`** could not validate the evidence. It parses node:test TAP summary lines (`# tests/# pass/# fail`), which Vitest's TAP reporter doesn't emit, so it returned `INVALID_RED / zero_tests_discovered` even though the TAP output shows `not ok 8 ... runs the cleanup once when the response errors and the request then closes`. That's a tooling mismatch, not a RED failure. I didn't fabricate summary lines.

## Issues Encountered
- `bun run lint` exits 1 on a formatter diff in `.superset/config.json`. That file dates from commit `f386498`, which predates this phase, and this plan doesn't touch it. I logged it in `deferred-items.md` and didn't fix it, since it's out of scope. Biome on both plan files is clean.

## Verification
- `bun run test`: 37 files, 541/541 tests pass, no type errors.
- `bunx tsc --noEmit -p tsconfig.json`: exit 0.
- `git diff --quiet 8a91098 -- src/server/api/services/PredictionStreamService.ts`: exit 0 (D-15).
- Task 1 acceptance criteria:
  - one `res.on("error"`, one `req.on("close"` (and it's `req.on("close", cleanup)`), one `SSE response error for stop`;
  - the `res.on("error"` listener is at line 66, before the `await streamService.subscribe` at line 74;
  - no bodies of pre-existing tests were edited.
- Task 2 acceptance criteria: the integration test title appears once, `createPredictionStreamService(` is used, and all 52 tests in the three verify files pass, including the real-socket SSE route test.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness
- ERR-01 is done. ERR-02 (the process-level `unhandledRejection` handler) is covered by another Phase 12 plan and doesn't depend on this one.
- Open item: the pre-existing `.superset/config.json` lint failure (see `deferred-items.md`).

## Self-Check: PASSED

- FOUND: src/server/api/controllers/PredictionStreamController.ts
- FOUND: src/server/api/controllers/PredictionStreamController.test.ts
- FOUND: .planning/phases/12-bounded-upstream-calls-error-safety-nets/deferred-items.md
- FOUND: 8d03c87
- FOUND: 7346769

---
*Phase: 12-bounded-upstream-calls-error-safety-nets*
*Completed: 2026-09-29*
