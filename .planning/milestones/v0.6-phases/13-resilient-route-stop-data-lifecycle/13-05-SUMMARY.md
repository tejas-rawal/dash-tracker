---
phase: 13-resilient-route-stop-data-lifecycle
plan: 05
subsystem: api
tags: [scheduler, backoff, jitter, settimeout, fake-timers, graceful-shutdown, vitest, supertest, e2e]

# Dependency graph
requires:
  - phase: 13-02
    provides: 503 + Retry-After 5 from data-dependent endpoints before the first load
  - phase: 13-03
    provides: BusDataRepository.load() resolving { routeCount, stopCount }, getLoadState(), and no repository logging
  - phase: 12-bounded-upstream-calls-error-safety-nets
    provides: bounded DASH client with message-only UpstreamApiError transport messages
provides:
  - BusDataRefreshService (start/stop) with createBusDataRefreshService(repository) and pure computeRetryDelayMs(attempt, random?)
  - Capped exponential equal-jitter boot backoff (1 s base, 60 s cap) until the first success, then hourly refresh
  - One warn/info log line per load attempt (D-08)
  - D-18 boot order in app.ts (SQLite gates listen, DASH never does) and shutdown that stops both background loops
  - ServiceAlertPollService.stop() (D-17)
  - Real-app E2E dataBootRetry.test.ts (503 -> 200 without a restart)
affects: [14-health-checks-rate-limiting]

actuals:
  tokens: 6625
  tasks: 3
  commits: 4
plan_head_before: 044ade3451e0cda32b52213f50bfa7c84746dbe6

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Chained setTimeout loop: the next attempt is armed only after the current one settles, so attempts never overlap (D-10)"
    - "Equal jitter: round(c/2 + random() * c/2), c = min(cap, base * 2^(n-1))"
    - "Background loops built at module scope, started after listen, stopped first in shutdown"
    - "stop() sets a stopped flag that schedule() checks, so an in-flight attempt cannot re-arm a timer"

key-files:
  created:
    - src/server/api/services/BusDataRefreshService.ts
    - src/server/api/services/BusDataRefreshService.test.ts
    - src/server/api/routes/dataBootRetry.test.ts
  modified:
    - src/server/app.ts
    - src/server/api/services/ServiceAlertPollService.ts
    - src/server/api/services/ServiceAlertPollService.test.ts
    - src/server/api/routes/upstreamTimeout.test.ts

key-decisions:
  - "Equal jitter (not full jitter): delays never shrink below the cap so SC1's increasing delays are visible in logs; once capped, each delay is independently 30-60 s"
  - "stop() also blocks rescheduling from an in-flight attempt (stopped flag checked in schedule()); start() after stop() is a no-op"
  - "A failed refresh after the first success keeps the hourly cadence, never falls back to boot backoff"
  - "Real-process signal smokes invoke ./node_modules/.bin/tsx directly: Bun 1.0.31 bunx does not forward SIGTERM/SIGINT to its child"

patterns-established:
  - "Fake-timer schedule tests: advance (delay - 1) then 1 ms to pin that each attempt starts exactly when its delay elapses"
  - "expectOneLinePerSettledAttempt(n): info + warn call count equals settled attempts, error never called"

requirements-completed: [BOOT-01, BOOT-02, DATA-01, DATA-02]

coverage:
  - id: D1
    description: "The real server listens with DASH unreachable, answers /routes/all with 503, logs >= 2 load attempts with growing delays, exits 0 on SIGTERM and SIGINT, and never logs the API key"
    requirement: BOOT-01
    verification:
      - kind: e2e
        ref: "SIGTERM smoke: PORT=39113 ... ./node_modules/.bin/tsx src/server/app.ts -> code=503 exit=0 listening=1 attempts=4 shutdown=1 keyleaks=0"
        status: pass
      - kind: e2e
        ref: "SIGINT smoke: PORT=39114 ... ./node_modules/.bin/tsx src/server/app.ts -> code=503 exit=0 shutdown=1 keyleaks=0"
        status: pass
    human_judgment: false
  - id: D2
    description: "Through the real app, /routes/all answers 503 while the first DASH call fails, then 200 once the background retry lands, with no restart and exactly two DASH routes requests"
    requirement: BOOT-02
    verification:
      - kind: e2e
        ref: "src/server/api/routes/dataBootRetry.test.ts#answers 503 until the background loader's first successful load, then 200 without a restart"
        status: pass
    human_judgment: false
  - id: D3
    description: "Boot backoff is 500, 1000, 2000, 4000, 8000, 16000, 30000, 30000 ms at random() = 0, never above 60 s, finite at attempt 10000, and never stops retrying"
    requirement: BOOT-02
    verification:
      - kind: unit
        ref: "src/server/api/services/BusDataRefreshService.test.ts#computeRetryDelayMs (13 cases) and backs off 500 ... 30000 ms"
        status: pass
    human_judgment: false
  - id: D4
    description: "After the first success the next attempt runs exactly 3_600_000 ms after the previous one settles (none at 3_599_999), whether it succeeded or failed; a failed refresh keeps hourly cadence"
    requirement: DATA-01
    verification:
      - kind: unit
        ref: "src/server/api/services/BusDataRefreshService.test.ts#starts no refresh 3_599_999 ms after a success and exactly one at 3_600_000 ms"
        status: pass
      - kind: unit
        ref: "src/server/api/services/BusDataRefreshService.test.ts#keeps the hourly cadence after a failed refresh instead of switching back to backoff"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every failed load or refresh leaves exactly one warn line with attempt number, message-only error and next delay; successes log one info; nothing logs at error level"
    requirement: DATA-02
    verification:
      - kind: unit
        ref: "src/server/api/services/BusDataRefreshService.test.ts#expectOneLinePerSettledAttempt across all createBusDataRefreshService cases"
        status: pass
      - kind: e2e
        ref: "src/server/api/routes/upstreamTimeout.test.ts#logs exactly one warn per timed-out background load attempt, with the attempt number and next delay"
        status: pass
    human_judgment: false
  - id: D6
    description: "No overlapping attempts; stop() cancels pending backoff, pending hourly, and rescheduling from an in-flight attempt; start() is idempotent and a no-op after stop()"
    verification:
      - kind: unit
        ref: "src/server/api/services/BusDataRefreshService.test.ts#never overlaps attempts while a load is still pending + 5 stop/start cases"
        status: pass
    human_judgment: false
  - id: D7
    description: "ServiceAlertPollService.stop() clears its interval and app.ts shutdown stops both loops before server.close; a broken SQLite path still exits 1 before listen with no DASH attempt"
    verification:
      - kind: unit
        ref: "src/server/api/services/ServiceAlertPollService.test.ts#stop() cancels the 5-minute poll so no further fetch happens"
        status: pass
      - kind: e2e
        ref: "SQLite smoke: DB_PATH=/dev/null/smoke/db.sqlite bunx tsx src/server/app.ts -> exit=1 listening=0 dbfail=1 attempts=0"
        status: pass
    human_judgment: false

# Metrics
duration: 6min
completed: 2026-10-01
status: complete
---

# Phase 13 Plan 05: Background Route/Stop Loader and Clean Shutdown Summary

**The server now listens as soon as SQLite opens. Route/stop data loads in the background through a chained-`setTimeout` loader: capped exponential equal-jitter backoff (500 ms up to 60 s) until the first success, then an hourly refresh, with exactly one warn or info line per attempt. Both background loops stop at the top of SIGTERM/SIGINT shutdown. A real server started with DASH refused answers 503, retries with growing delays, and exits 0.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-01T14:25:46Z
- **Completed:** 2026-10-01T14:31:59Z
- **Tasks:** 3
- **Files modified:** 7 (3 created, 4 modified)

## Accomplishments
- New `BusDataRefreshService.ts`:
  - `createBusDataRefreshService(repository)` gets the repository by DI and never calls `getInstance()`.
  - `computeRetryDelayMs(attempt, random?)` is exported as a pure helper.
  - Named constants: `INITIAL_RETRY_DELAY_MS = 1_000`, `MAX_RETRY_DELAY_MS = 60_000`, `REFRESH_INTERVAL_MS = 60 * 60_000`.
  - The next attempt is armed only after the current one settles, so attempts never overlap and the loop never uses `setInterval`.
- Log contract (D-08):
  - failure: `Route/stop data <load|refresh> attempt <N> failed: <message>; next attempt in <ms>ms`
  - first success: `Route/stop data loaded on attempt <N>: <R> routes, <S> stops`
  - later successes: `Route/stop data refreshed: <R> routes, <S> stops`
  - Nothing logs at error level, and non-Error rejections read `Unknown error`.
- `app.ts` boot order (D-18):
  1. `registerProcessErrorHandlers()`
  2. `favoritesRecentsRepository.initialize()`, which is fatal with `Failed to initialize the favorites/recents database: <message>`
  3. `app.listen`
  4. `refreshService.start()` and `serviceAlertPollService.start()`

  The `Promise.all` DASH gate is gone, and the alert poll no longer starts before listen.
- Shutdown calls `refreshService.stop()` and `serviceAlertPollService.stop()` before `server.close`.
- `ServiceAlertPollService.stop()` clears its stored interval (D-17).
- New real-app E2E `dataBootRetry.test.ts`: against a fake DASH that fails once, `/routes/all` goes from 503 (with Retry-After 5) to 200 without a restart, and `/routes/1A/stops` is also 200. The fake DASH sees exactly two routes requests, and the log has one warn and one info line.

## Task Commits

1. **Task 1: listen first and heal in the background (tracer)** - `bb9a667` (feat)
2. **Task 2: pin the loader schedule with fake timers** - `fd899b4` (test), plus `306727c` (refactor: comment correction)
3. **Task 3: stop the alert poll on shutdown** - `7cd764a` (feat)

## Files Created/Modified
- `src/server/api/services/BusDataRefreshService.ts` - the loader: backoff, hourly refresh, start/stop, and one log line per attempt
- `src/server/api/services/BusDataRefreshService.test.ts` - 25 fake-timer cases: backoff, cap, jitter ranges, adjacency edge, no overlap, stop/start, and logging
- `src/server/api/routes/dataBootRetry.test.ts` - real-app 503 -> 200 E2E against a fake DASH that fails once
- `src/server/app.ts` - D-18 boot order, both loops started after listen and stopped first in shutdown
- `src/server/api/services/ServiceAlertPollService.ts` - `stop()` and a stored interval handle
- `src/server/api/services/ServiceAlertPollService.test.ts` - stop() cases
- `src/server/api/routes/upstreamTimeout.test.ts` - blackholed-DASH one-warn-per-attempt test; the alert-poll test now calls `stop()`

## Decisions Made
- **Equal jitter:** below the cap, consecutive delays never shrink, so "increasing delays" is visible in the logs. Once capped, each delay falls independently between 30 s and 60 s.
- **stop() during an attempt:** an attempt already in flight when `stop()` is called still settles and logs its one line, but it schedules nothing after that. `start()` after `stop()` is a no-op.
- **Failed refresh:** once data has loaded, a failed refresh waits the hourly interval before the next attempt and never switches back to backoff. The repository keeps serving the last good data (13-03).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug in plan spec] Jitter-range adjacency only holds below the cap**
- **Found during:** Task 2
- **Issue:** The `<behavior>` section says that for n = 1 to 6, `computeRetryDelayMs(n + 1, () => 0)` equals `computeRetryDelayMs(n, () => 1)`. That contradicts the plan's own locked formula and its pinned values at n = 6. Attempt 6's ceiling is 32000, because it is not yet capped. Attempt 7's floor is 30000, half the 60000 cap, and the plan also pins `(7, () => 0) = 30000`. With live randomness, consecutive capped delays can shrink anywhere within 30 to 60 s.
- **Fix:** I kept the plan's exact formula and constants. The adjacency `it.each` now covers n = 1 to 5. A separate case pins the cap boundary: (6, 1) = 32000, (7, 0) = 30000, (7, 1) = 60000. I also corrected the source comment, which claimed delays never shrink, to say "below the cap". Truth 3's fixed-random sequence (500 to 30000, 30000) and the 20-attempt monotonic check at a constant random value both still hold.
- **Files modified:** `src/server/api/services/BusDataRefreshService.test.ts`, `src/server/api/services/BusDataRefreshService.ts` (comment only)
- **Verification:** 25/25 cases pass.
- **Committed in:** `fd899b4`, `306727c`

**2. [Rule 3 - Blocking] Signal smokes run tsx directly instead of through `bunx`**
- **Found during:** Task 1 verification
- **Issue:** Bun 1.0.31's `bun x` does not forward SIGTERM to its child. The plan's smoke killed only the `bunx` wrapper, which reported exit 143 and `shutdown=0`. The node server kept running as an orphan. The process tree showed bun, then node tsx, then node app.
- **Fix:** I ran the same smoke with `./node_modules/.bin/tsx src/server/app.ts`, the same tsx binary that `bunx` resolves to. tsx relays signals to its child. Results: SIGTERM gave `code=503 exit=0 listening=1 attempts=4 shutdown=1 keyleaks=0`, with delays of 598, 1772, 3083 and 5417 ms. SIGINT gave `code=503 exit=0 shutdown=1 keyleaks=0`. The SQLite smoke involves no signal, so it passes in the plan's exact `bunx` form: `exit=1 listening=0 dbfail=1 attempts=0`. I killed the orphaned processes left by the first attempt and confirmed none remained.
- **Files modified:** none (verification harness only)

**3. [Formatting] One acceptance grep does not match on a single line**
- **Found during:** Task 1
- **Issue:** `grep -c "favoritesRecentsRepository.initialize()" src/server/app.ts` prints 0, because Biome (required by CLAUDE.md) forces the chain onto separate lines: `favoritesRecentsRepository` / `.initialize()` / `.then(...)`. I tried the single-line form and Biome rejects it.
- **Fix:** I kept Biome's formatting. What the criterion checks still holds: SQLite's `initialize()` is the only boot gate, and there is no `Promise.all(`.

---

**Total deviations:** 3 (1 plan-spec bug, 1 verification blocker, 1 formatting-only)
**Impact on plan:** No behavior change from the plan. All truths hold, except that "never shrinks" holds only below the cap, as documented in deviation 1.

## TDD Gate Compliance

Task 2 (`tdd="true"`) pins behavior that Task 1, the tracer, had already built. So apart from the spec error in deviation 1, the first run was an unexpected GREEN.
- **Investigation:** I applied five temporary mutations to `BusDataRefreshService.ts`. Each one was caught:
  - full jitter: 8 computeRetryDelayMs cases failed;
  - schedule() without the stopped guard: the in-flight stop case failed;
  - a failed refresh using backoff: the hourly-cadence case failed;
  - arming the next timer before awaiting load: 4 cases failed, including "never overlaps attempts";
  - non-idempotent start: 2 cases failed.
- **Restore:** After each mutation the source was restored and checked byte-identical by shasum.
- **Commits:** RED-style commit `test(13-05)` `fd899b4`. The GREEN implementation is in Task 1's `feat(13-05)` `bb9a667`, which comes before it. `refactor(13-05)` `306727c` is a comment-only change.
- **`check tdd-red-evidence`:** I ran it on a TAP capture of the no-stopped-guard mutation. The raw TAP shows `not ok 22 - ... stop() during an in-flight attempt ...` with exit 1, but the checker returned `INVALID_RED (zero_tests_discovered)`. Its parser reads node:test summary lines (`# tests N` / `# fail N`), and Vitest's `tap-flat` reporter does not emit them. I did not alter the record to pass the check.

## Issues Encountered
- My first evidence capture failed with exit 127 because zsh does not word-split `$CMD`. I re-ran it with the command written inline.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness
- Phase 13's five plans are complete, so the phase is ready for verification.
- Phase 14 readiness can serialize `BusDataRepository.getLoadState()`. Before the first success, `lastLoadedAt` is undefined and `lastFailedAt`/`lastError` show the latest attempt's failure. The loader keeps them current hourly.
- Open flagged assumptions from the plan (BOOT-01, BOOT-02): SQLite still gates listen, retries have no attempt cap, and a restart resets backoff to attempt 1.
- Note for whoever owns the npm scripts: under Bun 1.0.31, any supervisor or script that signals a `bunx tsx` wrapper will orphan the server. `start-server` uses ts-node through `bun run`, which this plan did not test.

## Verification
- `bun run test`: 43 files, 630 tests passed, no type errors.
- `bun run test:coverage`: all files at 98.65% statements/lines, 95.98% branches, 98.37% functions; services at 99.71% lines (80% threshold).
- `bunx tsc --noEmit -p tsconfig.json`: exit 0.
- `bun run lint`: exit 0 (warnings only).
- `bunx biome check` on all 7 files: no errors. There are 2 `useFilenamingConvention` warnings on PascalCase `*.test.ts` files: the new `BusDataRefreshService.test.ts` and the existing `ServiceAlertPollService.test.ts`. This is the same warning every co-located service test already carries.
- Real-process smokes: see deviation 2 (SIGTERM, SIGINT and SQLite all match the expected lines).

## Self-Check: PASSED
- FOUND: src/server/api/services/BusDataRefreshService.ts, src/server/api/services/BusDataRefreshService.test.ts, src/server/api/routes/dataBootRetry.test.ts
- FOUND commits: bb9a667, fd899b4, 306727c, 7cd764a

---
*Phase: 13-resilient-route-stop-data-lifecycle*
*Completed: 2026-10-01*
