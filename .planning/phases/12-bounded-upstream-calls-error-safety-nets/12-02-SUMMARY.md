---
phase: 12-bounded-upstream-calls-error-safety-nets
plan: 02
subsystem: api
tags: [axios, abortsignal, timeout, upstream-errors, supertest, vitest, fake-timers]

# Dependency graph
requires:
  - phase: 12-bounded-upstream-calls-error-safety-nets
    provides: "12-01 per-request AbortSignal.timeout deadline and the response-error interceptor mapping every DASH transport failure to a message-only UpstreamApiError; the upstreamTimeout.test.ts blackhole harness"
provides:
  - "NearbyPredictionService.fetchFromDashApi without its transport try/catch: the shared client's interceptor is the single transport-error wrap (D-07)"
  - "Blackholed-DASH E2E for /predictions/nearby, /predictions, concurrent live requests, the startup route/stop load and the 5-minute alert poll"
  - "stubKnownStop() helper in upstreamTimeout.test.ts"
affects: [13-resilient-route-stop-data-lifecycle, 14-health-rate-limiting]

# Actuals (#2632)
actuals:
  tokens: 2858
  tasks: 2
  commits: 2
plan_head_before: b27e7a355d64f06a278f0c829e3544c1c616ad5b

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Services never catch DASH transport rejections; they propagate the interceptor's UpstreamApiError as-is and only throw their own UpstreamApiError for response-content problems"
    - "Background-call E2E: vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }) silences a poll's interval while AbortSignal.timeout and vi.waitFor stay on real timers"

key-files:
  created: []
  modified:
    - src/server/api/services/NearbyPredictionService.ts
    - src/server/api/services/NearbyPredictionService.test.ts
    - src/server/api/routes/predictionRoutes.test.ts
    - src/server/api/routes/upstreamTimeout.test.ts

key-decisions:
  - "[Phase 12-02] NearbyPredictionService no longer wraps axios rejections (D-07). The shared client's interceptor is the only transport-error wrap, so the nearby 502 details are exactly the interceptor's message. Nearby's content-level UpstreamApiErrors (success: false, malformed body) are unchanged"
  - "[Phase 12-02] BusDataRepository.fetchAndProcessData's catch/rethrow stays unchanged (CONTEXT discretion item 4). It already rethrows message-only, and the E2E shows a startup timeout surfaces as 'Failed to initialize bus data: Failed to fetch and process data: DASH API request timed out after 200ms'"

patterns-established:
  - "Transport errors are wrapped once, centrally, in src/server/config/axios.ts; service tests that mock axios assert propagation by identity (rejects.toBe), and key-leak coverage lives in axios.test.ts"

requirements-completed: [UPST-01, UPST-02]

coverage:
  - id: D1
    description: "A blackholed DASH makes GET /api/v1/predictions/nearby return 502 { error: 'Bad Gateway', details: 'DASH API request timed out after 200ms' } with no API key or rider coordinates (38.8048 / -77.0469) in the body or any log call"
    requirement: "UPST-02"
    verification:
      - kind: integration
        ref: "src/server/api/routes/upstreamTimeout.test.ts#returns 502 for GET /api/v1/predictions/nearby with only the shared client's timeout message, without leaking the API key or the rider's coordinates"
        status: pass
    human_judgment: false
  - id: D2
    description: "Transport errors are wrapped exactly once: NearbyPredictionService propagates the shared client's rejection as the same error object, and the nearby network-level route test gets the client's own message back as the 502 details"
    requirement: "UPST-02"
    verification:
      - kind: unit
        ref: "src/server/api/services/NearbyPredictionService.test.ts#propagates the shared DASH client's rejection unchanged"
        status: pass
      - kind: integration
        ref: "src/server/api/routes/predictionRoutes.test.ts#responds with 502 when the upstream request fails at the network level"
        status: pass
      - kind: other
        ref: "! grep -rn 'request failed for nearby' src/server"
        status: pass
    human_judgment: false
  - id: D3
    description: "Nearby's content-level UpstreamApiErrors (success: false and malformed bodies) are unchanged and still map to 502"
    verification:
      - kind: unit
        ref: "src/server/api/services/NearbyPredictionService.test.ts#rejects with UpstreamApiError when upstream returns success: false"
        status: pass
      - kind: unit
        ref: "src/server/api/services/NearbyPredictionService.test.ts#rejects with UpstreamApiError for $label (4 rows)"
        status: pass
      - kind: integration
        ref: "src/server/api/routes/predictionRoutes.test.ts#responds with 502 when the upstream body has no predictionsData array"
        status: pass
    human_judgment: false
  - id: D4
    description: "A blackholed DASH makes GET /api/v1/predictions?stop=stop-1 return 502 with the exact timeout details in 150-2000 ms, with no API key in the body or logs"
    requirement: "UPST-02"
    verification:
      - kind: integration
        ref: "src/server/api/routes/upstreamTimeout.test.ts#returns 502 for GET /api/v1/predictions shortly after the deadline, without leaking the API key"
        status: pass
    human_judgment: false
  - id: D5
    description: "/predictions, /predictions/nearby and /vehicles issued in parallel against a blackholed DASH each return 502 with the timeout details, and the batch finishes in under 2000 ms"
    requirement: "UPST-01"
    verification:
      - kind: integration
        ref: "src/server/api/routes/upstreamTimeout.test.ts#times out concurrent live requests independently"
        status: pass
    human_judgment: false
  - id: D6
    description: "The startup route/stop load and the 5-minute service-alert poll go through the same bounded client: each fails at the deadline with a logged timeout error instead of hanging, and neither logs the key"
    requirement: "UPST-01"
    verification:
      - kind: integration
        ref: "src/server/api/routes/upstreamTimeout.test.ts#fails the startup route/stop load with a logged timeout error instead of hanging"
        status: pass
      - kind: integration
        ref: "src/server/api/routes/upstreamTimeout.test.ts#logs a timeout error from the service-alert poll instead of hanging"
        status: pass
    human_judgment: false

# Metrics
duration: 3min
completed: 2026-09-29
status: complete
---

# Phase 12 Plan 02: Single Transport Wrap & Blackholed-DASH Coverage for Every Call Site Summary

**`NearbyPredictionService` no longer wraps axios rejections, so the shared client's interceptor is the only place a DASH transport failure becomes an `UpstreamApiError` (D-07). A real blackholed DASH now proves that all three live endpoints, alone and in parallel, the startup route/stop load and the 5-minute alert poll each fail at the 200 ms test deadline with the exact `DASH API request timed out after 200ms` message. No API key or rider coordinates appear in any body or log.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-09-29T15:14:54Z
- **Completed:** 2026-09-29T15:18:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Removed the redundant transport try/catch in `NearbyPredictionService.fetchFromDashApi`. The function now ends with `const response = await axios.get(url); return response.data;`, the same shape as `PredictionService`. The coordinate-free log line and the content-level `UpstreamApiError`s in `parseDashResponse` are unchanged.
- The nearby 502 details are now exactly the interceptor's message. Before the fix, the prefix was stacked twice. Pre-fix failure of the new tracer E2E:
  ```
  - "details": "DASH API request timed out after 200ms",
  + "details": "DASH API request failed for nearby predictions: DASH API request timed out after 200ms",
  ```
- Replaced the service-level key-leak unit test with `propagates the shared DASH client's rejection unchanged`, which asserts `rejects.toBe(upstreamError)`. The key-leak assertion now lives only in `axios.test.ts`, where the wrap happens.
- Extended `upstreamTimeout.test.ts` from 1 to 6 real-socket tests:
  - `/predictions/nearby`
  - `/predictions`
  - 3 concurrent live requests
  - startup `BusDataRepository.initialize()`
  - `ServiceAlertPollService.start()`

  This fully demonstrates ROADMAP Phase 12 SC1 and SC3.

## Task Commits

1. **Task 1: nearby timeout is a clean 502 (tracer), D-07 wrap removal** - `72408c2` (refactor)
2. **Task 2: blackholed DASH across every remaining call site** - `227e70d` (test)

**Plan metadata:** see the `docs(12-02)` commit that follows.

## Files Created/Modified
- `src/server/api/services/NearbyPredictionService.ts`: `fetchFromDashApi` has no transport try/catch. The `UpstreamApiError` import is kept for the content-level throws.
- `src/server/api/services/NearbyPredictionService.test.ts`: the key-leak test is replaced by the propagation test, and the now-unused `mockLoggerError` is removed.
- `src/server/api/routes/predictionRoutes.test.ts`: the nearby network-level 502 test rejects with `new UpstreamApiError("DASH API request failed: connect ECONNREFUSED")` and asserts `details` with `toBe`.
- `src/server/api/routes/upstreamTimeout.test.ts`: adds `stubKnownStop()`, the nearby, `/predictions` and concurrency tests, and a nested `describe("background DASH calls")` for the startup load and the alert poll.

## Decisions Made
- Followed the plan as specified. `BusDataRepository` and `ServiceAlertPollService` were left unchanged, per the plan's discretion decision. The E2E confirmed that both already log message-only timeout errors, so no scope widening was needed.
- The fake-timer restore for the alert-poll test is an `afterEach(vi.useRealTimers)` local to the nested describe. The plan allowed either this or a `finally` block.

## Tracer Feedback Gate
Auto mode was active (`workflow._auto_chain_active: true`). Task 1's four `<verify>` commands were re-run and all passed before expanding to Task 2: 82/82 tests across the 3 files, the grep printed nothing, tsc exited 0, and Biome reported 0 errors.

## Non-vacuity Check
Task 2's tests are characterization tests over 12-01's client. To confirm they depend on the deadline, the `config.signal = AbortSignal.timeout(...)` line in `axios.ts` was temporarily removed, and all 6 `upstreamTimeout.test.ts` tests failed: 5 hung to vitest's 5 s timeout, and the poll test's `waitFor` expired at 2 s. The file was then restored with `git checkout -- src/server/config/axios.ts` and the diff was empty. The mutant was not committed.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- None in plan scope. The pre-existing `.superset/config.json` formatter failure in `bun run lint` is still out of scope and is already logged in `deferred-items.md`. `bunx biome check src/server` reports 0 errors, and its 32 warnings are pre-existing naming and filename-convention warnings.

## Threat Surface
Nothing beyond the plan's threat model. T-12-07 (rider coordinates) and T-12-09 (API key in 502 bodies) have passing assertions on every live endpoint. T-12-08 (boot and poll hang) is mitigated and proven by the two background-call tests. T-12-10 is accepted as planned.

## Verification
- `bun run test`: 38 files, 553/553 tests pass, no type errors.
- `bun run test:coverage`: passes the thresholds (98.42% statements, 93.85% branches, 98.48% functions, 98.42% lines).
- `bunx tsc --noEmit -p tsconfig.json`: exit 0.
- `! grep -rn "request failed for nearby" src/server`: exit 0, no output.
- `git diff --quiet 8a91098 -- BusDataRepository.ts ServiceAlertPollService.ts ServiceAlertService.ts PredictionService.ts VehicleService.ts`: exit 0. The only production change is D-07.
- Every Task 1 and Task 2 acceptance-criteria grep printed the expected count: 1, 1, 0 lines, 1 and 1 for Task 1, then 1, 1, 1 and 1 for Task 2.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 12 is complete: all 4 plans have summaries, and UPST-01, UPST-02, ERR-01 and ERR-02 are delivered.
- Phase 13 (resilient route/stop data lifecycle) can build its background retry on top of a startup load that now fails at the deadline with a logged error instead of hanging.

## Self-Check: PASSED
- FOUND: src/server/api/services/NearbyPredictionService.ts
- FOUND: src/server/api/services/NearbyPredictionService.test.ts
- FOUND: src/server/api/routes/predictionRoutes.test.ts
- FOUND: src/server/api/routes/upstreamTimeout.test.ts
- FOUND: 72408c2, 227e70d (`git rev-list --count b27e7a3..HEAD` = 2 before this docs commit)

---
*Phase: 12-bounded-upstream-calls-error-safety-nets*
*Completed: 2026-09-29*
