---
phase: 12-bounded-upstream-calls-error-safety-nets
plan: 01
subsystem: api
tags: [axios, abortsignal, timeout, zod, upstream-errors, vitest]

# Dependency graph
requires:
  - phase: 11-nearby-stop-predictions
    provides: message-only UpstreamApiError wrap pattern (T-11-01) that the interceptor generalizes
provides:
  - DASH_API_TIMEOUT_MS env var (Zod, default 10000) exposed as environment.dashApi.timeoutMs
  - Per-request hard total deadline (AbortSignal.timeout) on every call through the shared DASH axios client
  - Central response-error interceptor mapping every DASH transport failure to a message-only UpstreamApiError
  - Real-socket test harness patterns (blackholed / trickle / refused / 503 local servers)
affects: [12-02, 13-resilient-data-lifecycle, 14-health-rate-limiting]

# Actuals (#2632)
actuals:
  tokens: 3944
  tasks: 2
  commits: 2
plan_head_before: 4f10081c62e9c66c387eb6f8500f6389cb2ae764

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "axios request interceptor creating a fresh AbortSignal.timeout per request (never on instance defaults)"
    - "axios response-error interceptor as the single transport-error to UpstreamApiError mapping point"
    - "Real local node:http servers on 127.0.0.1:0 for upstream-failure tests, torn down with closeAllConnections() then close()"
    - "Env schema tests via vi.mock('dotenv') + vi.resetModules() + vi.stubEnv() + dynamic import"

key-files:
  created:
    - src/server/api/routes/upstreamTimeout.test.ts
    - src/server/config/axios.test.ts
    - src/server/config/environment.test.ts
  modified:
    - src/server/config/axios.ts
    - src/server/config/environment.ts
    - src/server/test/setup.ts
    - .env.example

key-decisions:
  - "The DASH deadline is a fresh AbortSignal.timeout(dashApi.timeoutMs) set by a request interceptor, and axios's idle-based timeout option is not used. axios.isCancel identifies a fired deadline, because the interceptor replaces config.signal on every call."
  - "All DASH transport failures (timeout, abort, connection error, non-2xx) become a message-only UpstreamApiError in one response-error interceptor on the shared axios instance. Timeouts read 'DASH API request timed out after {ms}ms' and everything else reads 'DASH API request failed: {axios message}'."

patterns-established:
  - "Upstream error mapping lives in src/server/config/axios.ts. Services need no try/catch for transport errors."
  - "Tests that need a short deadline rely on DASH_API_TIMEOUT_MS=200 from src/server/test/setup.ts."

requirements-completed: [UPST-01, UPST-02]

coverage:
  - id: D1
    description: "A blackholed DASH makes GET /api/v1/vehicles return 502 { error: 'Bad Gateway', details: 'DASH API request timed out after 200ms' } in 150-2000 ms, with no API key in the body or any log call"
    requirement: "UPST-02"
    verification:
      - kind: integration
        ref: "src/server/api/routes/upstreamTimeout.test.ts#returns 502 for GET /api/v1/vehicles shortly after the deadline, without leaking the API key"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every DASH call has its own hard total deadline: a slow trickle is cut off, and consecutive calls, including one after a timed-out call, never inherit an expired deadline"
    requirement: "UPST-01"
    verification:
      - kind: integration
        ref: "src/server/config/axios.test.ts#rejects a blackholed request with the timeout message once the deadline passes"
        status: pass
      - kind: integration
        ref: "src/server/config/axios.test.ts#cuts off an upstream that trickles bytes without finishing at the same deadline"
        status: pass
      - kind: integration
        ref: "src/server/config/axios.test.ts#gives every request its own deadline, so a call after an earlier deadline window still succeeds"
        status: pass
    human_judgment: false
  - id: D3
    description: "Refused connections and non-2xx responses map to 'DASH API request failed: ...'. The wrapped error has no config/request/response/cause and leaks no key, path or rider coordinates. The key still reaches DASH."
    requirement: "UPST-02"
    verification:
      - kind: integration
        ref: "src/server/config/axios.test.ts#maps a refused connection to the generic failure message"
        status: pass
      - kind: integration
        ref: "src/server/config/axios.test.ts#maps a non-2xx upstream response to the generic failure message"
        status: pass
      - kind: integration
        ref: "src/server/config/axios.test.ts#wraps a $label failure without the API key, the request path or the axios error"
        status: pass
      - kind: integration
        ref: "src/server/config/axios.test.ts#still sends the API key upstream as the Authorization header"
        status: pass
    human_judgment: false
  - id: D4
    description: "DASH_API_TIMEOUT_MS is Zod-validated: unset gives 10000, '2500' gives 2500, and abc/0/-1/1.5/empty each fail startup with 'Invalid environment configuration ... DASH_API_TIMEOUT_MS'"
    requirement: "UPST-01"
    verification:
      - kind: unit
        ref: "src/server/config/environment.test.ts#defaults dashApi.timeoutMs to 10000 when DASH_API_TIMEOUT_MS is unset"
        status: pass
      - kind: unit
        ref: "src/server/config/environment.test.ts#reads DASH_API_TIMEOUT_MS as a whole number of milliseconds"
        status: pass
      - kind: unit
        ref: "src/server/config/environment.test.ts#fails startup when DASH_API_TIMEOUT_MS is $label"
        status: pass
    human_judgment: false

# Metrics
duration: 2min
completed: 2026-09-29
status: complete
---

# Phase 12 Plan 01: Bounded DASH Client & UpstreamApiError Mapping Summary

**Every DASH call through the shared axios client now has a hard total deadline: a per-request `AbortSignal.timeout` set from the Zod-validated `DASH_API_TIMEOUT_MS`, default 10000 ms. One response-error interceptor turns every timeout, refused connection or non-2xx response into a message-only `UpstreamApiError`, so a hung DASH now returns 502 on `/api/v1/vehicles`. Before this change it hung indefinitely or returned 500.**

## Performance

- **Duration:** about 2 min
- **Started:** 2026-09-29T15:00:05Z
- **Completed:** 2026-09-29T15:02:28Z
- **Tasks:** 2
- **Files modified:** 7 (3 created, 4 modified)

## Accomplishments
- `DASH_API_TIMEOUT_MS` is a new env var: `z.coerce.number().int().positive().default(10000)`, exposed as `environment.dashApi.timeoutMs`. It is documented in `.env.example`, and tests set it to `"200"`.
- A request interceptor on `axiosInstance` gives every request its own `AbortSignal.timeout(dashApi.timeoutMs)`. This is a total deadline over connect, headers and body. It covers all five DASH call sites, including the startup routes load and the alert poll.
- A response-error interceptor (`toUpstreamApiError`) maps a deadline abort (`axios.isCancel`) to `DASH API request timed out after {ms}ms` and anything else to `DASH API request failed: {message}`. The axios error object is never attached, which keeps `DASH_API_KEY` and the rider-coordinate URL out of the error (T-12-01, T-12-03).
- The tracer E2E proves the whole route path against a real blackholed local DASH with no mocks. The response is a 502 with exact details, arrives about 235 ms after the request, and neither the body nor the logs contain the key.
- The client-level edges are pinned over real sockets: slow trickle, fresh deadline per call, ECONNREFUSED, 503, no key/path/coords/axios-error leak, and the Authorization header still being sent. Env validation is covered for the default, a valid override and 5 invalid values.

## Task Commits

1. **Task 1: End-to-end "a hung DASH call becomes a 502" (tracer)** - `ce1cfc2` (feat)
2. **Task 2: Pin deadline and error-mapping edges plus env validation** - `a8353b4` (test)

**Plan metadata:** recorded in the final docs commit

## Files Created/Modified
- `src/server/config/axios.ts` - Per-request deadline request interceptor, and the `toUpstreamApiError` response-error interceptor.
- `src/server/config/environment.ts` - Adds the `DASH_API_TIMEOUT_MS` schema entry and `dashApi.timeoutMs`.
- `src/server/test/setup.ts` - Sets `DASH_API_TIMEOUT_MS = "200"` so real-socket tests stay fast.
- `.env.example` - Documents `DASH_API_TIMEOUT_MS=10000`.
- `src/server/api/routes/upstreamTimeout.test.ts` - Route E2E against a blackholed DASH, with `startBlackholedDash()` and `loggedText()`. Plan 12-02 extends it.
- `src/server/config/axios.test.ts` - Real-socket client tests (7 cases, 8 runs).
- `src/server/config/environment.test.ts` - `DASH_API_TIMEOUT_MS` default, override and invalid-value startup tests (7 runs).

## Decisions Made
- The deadline is detected with `axios.isCancel(error)` rather than by inspecting the signal reason. The request interceptor overwrites `config.signal` on every call, so the deadline is the only abort source.
- The success handler of the response interceptor is an explicit identity function `(response: AxiosResponse): AxiosResponse => response`, which satisfies the explicit-return-type convention.
- `upstreamTimeout.test.ts` keeps all three logger spies in describe-scoped variables (not only the error spy), so `loggedText()` can read them without re-spying.

## Deviations from Plan

None - plan executed exactly as written.

Task 2 is marked `tdd="true"`, but the plan says its tests pin behavior Task 1 already built. All 15 cases therefore passed on their first run, which the plan expected, and the commit uses the `test(...)` type. To confirm the tests are not vacuous, two throwaway mutations of `axios.ts` were run and then reverted without being committed:
- Replacing the signal with axios's idle `timeout` option failed the blackhole, trickle and per-call-deadline tests. The trickle case hung until vitest's 5 s test timeout, which shows the idle timer never fires.
- Attaching the axios error as `cause` failed the "wraps a non-2xx failure" leak test.

## Issues Encountered
None.

## TDD Gate Compliance
The plan is `type: execute`, not `type: tdd`, so the plan-level RED/GREEN gate does not apply. Task 2's tests are characterization tests over Task 1's implementation, as the plan intended: they went green on the first run, and mutation checks confirmed they are sensitive to the behavior they protect.

## Threat Surface
Nothing beyond the plan's threat model. T-12-01 through T-12-05 are mitigated and each has a passing test. T-12-06 is accepted as planned.

## User Setup Required
None. `DASH_API_TIMEOUT_MS` is optional and defaults to 10000.

## Verification
- `bun run test`: 37 files, 536 tests passed, no type errors
- `bunx tsc --noEmit -p tsconfig.json`: exit 0
- `bunx biome check src/server/config src/server/test/setup.ts src/server/api/routes/upstreamTimeout.test.ts`: exit 0. The one warning is the pre-existing `baseURL` naming warning in `axios.ts`, one of the 15 kept by design.
- `git diff --quiet 8a91098 -- src/server/api/services src/server/api/repositories <live controllers>`: exit 0. No service, repository or controller changes were needed (D-09).

## Next Phase Readiness
- Ready for 12-02. It can remove Nearby's redundant try/catch (D-07); `predictionRoutes.test.ts` still uses `vi.spyOn(axios, "get")` and its nearby 502 test asserts the old Nearby-specific message, which is 12-02's job to update. It can also extend `upstreamTimeout.test.ts` to `/predictions`, `/predictions/nearby`, the startup load and the alert poll.
- The v0.5 WR-02 / T-11-06 concern ("shared axios client has no timeout") is closed at the client level.

---
*Phase: 12-bounded-upstream-calls-error-safety-nets*
*Completed: 2026-09-29*

## Self-Check: PASSED
- All 3 created files and 4 modified files exist on disk.
- Commits `ce1cfc2` (feat) and `a8353b4` (test) are present in `git log`.
- Every Task 1 and Task 2 acceptance criterion was re-run and passed.
