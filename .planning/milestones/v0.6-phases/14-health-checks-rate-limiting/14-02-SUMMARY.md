---
phase: 14-health-checks-rate-limiting
plan: 02
subsystem: api
tags: [express, express-rate-limit, rate-limiting, ietf-ratelimit-headers, vitest, supertest]

# Dependency graph
requires:
  - phase: 11-nearby-stop-predictions
    provides: "Rider-location rule: lat/lng are never logged (applied to the limiter's warn line)"
  - phase: 12-bounded-upstream-calls-error-safety-nets
    provides: "D-12 message-only logging rule (applied to the library logger adapter)"
provides:
  - "express-rate-limit 8.7.0 exact pin, recorded in the tracked bun.lock"
  - "src/server/api/middleware/upstreamRateLimit.ts: createUpstreamRateLimiter() factory and the shared upstreamRateLimiter instance (60 req / 60_000 ms per client IP)"
  - "One shared bucket in front of GET /api/v1/predictions, /predictions/nearby, /predictions/stream and /vehicles, attached per handler"
  - "429 { error: 'Too Many Requests', details } with Retry-After; draft-8 RateLimit / RateLimit-Policy headers on every limited response; no X-RateLimit-*"
  - "One coordinate-free warn per IP per window: 'Rate limit exceeded for <key> on <baseUrl + path>; rejecting until the window resets'"
affects: [14-03, rate-limiting, trust-proxy, deployment]

# Actuals (#2632)
actuals:
  tokens: 11968
  tasks: 3
  commits: 3
plan_head_before: bd8c760a9c3761a32fcb6c51cdd7e46e1088a7cc

# Tech tracking
tech-stack:
  added: ["express-rate-limit@8.7.0 (transitive: debug@4.4.3, ip-address@10.7.2)"]
  patterns:
    - "Shared per-route limiter: one module-level instance imported by each route module and passed as the second argument of router.get, never router.use or app.use"
    - "First rejection detected with (req as AugmentedRequest).rateLimit.used === limit + 1, so one warn per key per window"
    - "Route-level supertest suites serve the app from one long-lived server closed with closeAllConnections(), never from supertest's throwaway per-request servers"

key-files:
  created:
    - src/server/api/middleware/upstreamRateLimit.ts
    - src/server/api/middleware/upstreamRateLimit.test.ts
    - src/server/api/routes/rateLimit.test.ts
    - .planning/phases/14-health-checks-rate-limiting/deferred-items.md
  modified:
    - package.json
    - bun.lock
    - src/server/api/routes/predictionRoutes.ts
    - src/server/api/routes/vehicleRoutes.ts

key-decisions:
  - "express-rate-limit pinned at 8.7.0, not the under-a-day-old 8.7.1, and installed with Bun 1.3.14 --minimum-release-age=604800 only after the user approved the blocking-human legitimacy checkpoint"
  - "draft-8 standard headers stay on: the library only sets Retry-After on a 429 while standard or legacy headers are enabled"
  - "The warn line logs only baseUrl + path, never originalUrl/url, so /predictions/nearby's coordinates never reach logs"
  - "Limiter tests serve each app from a long-lived server: supertest's per-request servers plus Node 20's keep-alive agent can route a request to a different, earlier server"

patterns-established:
  - "Limited routes: router.get(path, upstreamRateLimiter, handler); never build another limiter in a route module"
  - "Library logger adapters log one string, `<lib>: ${message}`, never the error object"

requirements-completed: [RATE-01]

coverage:
  - id: D1
    description: "express-rate-limit 8.7.0 pinned exactly in package.json and recorded in the tracked bun.lock; package-lock.json untouched"
    requirement: RATE-01
    verification:
      - kind: other
        ref: "node -p \"require('./node_modules/express-rate-limit/package.json').version\" -> 8.7.0; git diff --name-only 1e20618 -- package.json bun.lock package-lock.json -> bun.lock, package.json"
        status: pass
    human_judgment: false
  - id: D2
    description: "The 61st GET /api/v1/predictions in a minute through the real app answers 429 with Retry-After 1-60, the { error, details } body, draft-8 headers and no legacy headers; exactly one warn"
    requirement: RATE-01
    verification:
      - kind: integration
        ref: "src/server/api/routes/rateLimit.test.ts#GET /api/v1/predictions answers 429 with Retry-After and the error body on the 61st request in a minute"
        status: pass
    human_judgment: false
  - id: D3
    description: "All four live routes share one bucket: each starts at remaining 59, 60 requests cycling over them count down 59..0 exactly once each, then every one answers 429"
    requirement: RATE-01
    verification:
      - kind: integration
        ref: "src/server/api/routes/rateLimit.test.ts#%s carries the shared draft-8 RateLimit headers (4 rows)"
        status: pass
      - kind: integration
        ref: "src/server/api/routes/rateLimit.test.ts#the four live routes draw from one bucket: 15 requests to each leave the next request on any of them at 429"
        status: pass
    human_judgment: false
  - id: D4
    description: "The first rejected /predictions/nearby?lat=..&lng=.. logs one warn with the path only: no coordinates, no lat=, no lng=, no ?"
    requirement: RATE-01
    verification:
      - kind: integration
        ref: "src/server/api/routes/rateLimit.test.ts#the first rejected /predictions/nearby request logs one warn with the path and none of the query string"
        status: pass
      - kind: unit
        ref: "src/server/api/middleware/upstreamRateLimit.test.ts#logs the first rejection once without any of the query string"
        status: pass
    human_judgment: false
  - id: D5
    description: "Limiter behavior pinned on a minimal app: 59/60 pass and 61/62 reject; Retry-After 60/30/1 then reset at T0+60_000; one warn per window; per-IP keying behind trust proxy 1; 70 concurrent -> exactly 60/10; one count per request; library messages as one message-only string; independent instances"
    requirement: RATE-01
    verification:
      - kind: unit
        ref: "src/server/api/middleware/upstreamRateLimit.test.ts (10 tests, incl. window boundary and Retry-After precision, counts concurrent requests exactly)"
        status: pass
    human_judgment: false
  - id: D6
    description: "An SSE stream that is already open keeps flowing when its IP later goes over the limit; only new connections are counted (D-11)"
    requirement: RATE-01
    verification: []
    human_judgment: true
    rationale: "Holds by construction (the limiter calls next() once at connect and never touches the response again) but no test holds a stream open across a limit breach; the plan marks this truth as backstop/judgment"

# Metrics
duration: 11min
completed: 2026-10-06
status: complete
---

# Phase 14 Plan 02: Upstream Rate Limit Summary

**A shared 60-requests-per-minute, per-IP limit (express-rate-limit 8.7.0 with its in-memory store) now sits in front of all four live DASH endpoints. Over the limit, a client gets 429 with `Retry-After`, the `{ error, details }` body, and draft-8 `RateLimit` headers. One warn per IP per window is logged, and it never includes coordinates.**

## Performance

- **Duration:** about 11 min
- **Started:** 2026-10-06T20:19:45Z
- **Completed:** 2026-10-06T20:31:00Z
- **Tasks:** 3 (Task 1 checkpoint approved by the user; Tasks 2 and 3 executed here)
- **Files modified:** 8 (7 code/lockfile plus deferred-items.md)

## Accomplishments
- **Task 1 (blocking-human legitimacy checkpoint): approved by the user ("approved").** The previous agent checked the following:
  - express-rate-limit@8.7.0: repository, maintainers, MIT license, publish date (2026-08-29), runtime deps (only debug ^4.4.3 and ip-address ^10.2.0), no install-time lifecycle scripts, and the integrity hash.
  - The installed tarball's integrity (`sha512-hOwV7WOx...MyY26g==`) matches the approved one exactly.
- express-rate-limit 8.7.0 is installed with the exact approved command and pinned exactly. With the 7-day release-age gate, transitive ip-address resolved to 10.7.2 rather than the 5-day-old 10.7.3.
- `createUpstreamRateLimiter()` and the shared `upstreamRateLimiter`:
  - limit and window are the named constants 60 and 60_000;
  - draft-8 headers on, legacy headers off;
  - 429 body `{ error, details }`;
  - first-rejection warn via `rateLimit.used === UPSTREAM_RATE_LIMIT + 1`, logging only `baseUrl + path`;
  - message-only Winston adapter for the library's own validation and store messages.
- The shared instance is attached per handler to `GET /predictions`, `/predictions/stream`, `/predictions/nearby` and `/vehicles`. No `router.use`, and no import from `routes/index.ts`, `app.ts`, or the routes, stops, favorites or recents modules (D-16).
- 17 new tests: a real-app E2E (7) and a minimal-app behavior suite (10). The full suite has 49 files and 719 tests, all passing. Coverage is 98.7% lines overall, with the thresholds met.

## Task Commits

1. **Task 1: Package legitimacy gate.** No commit (gate only), approved by the user.
2. **Task 2 (tracer): install, limiter, wire GET /predictions, real-app E2E.** `5762666` (feat)
3. **Task 3 (TDD): shared bucket across all four live routes plus the minimal-app behavior suite**
   - RED: `3b2146f` (test)
   - GREEN: `ea16465` (feat)
   - REFACTOR: none needed

**Plan metadata:** the docs commit that follows this SUMMARY.

## Files Created/Modified
- `package.json`: `"express-rate-limit": "8.7.0"` (exact) in dependencies.
- `bun.lock`:
  - express-rate-limit 8.7.0, debug 4.4.3 (nested) and ip-address 10.7.2;
  - Bun 1.3.14 also reconciled the stale vitest 2.1.5 entries to the vitest 3.2.6 that package.json declares (about 95 `@vitest/*` lines), matching node_modules.
- `src/server/api/middleware/upstreamRateLimit.ts`: limiter factory, constants, handler, logger adapter, shared instance.
- `src/server/api/routes/predictionRoutes.ts`: limiter on `/`, `/stream` and `/nearby`.
- `src/server/api/routes/vehicleRoutes.ts`: limiter on `/`.
- `src/server/api/routes/rateLimit.test.ts`: real-app E2E.
  - the 61st-request 429;
  - per-route draft-8 rows;
  - the four-route shared bucket with exactly one count per request;
  - the coordinate-free warn.
- `src/server/api/middleware/upstreamRateLimit.test.ts`: minimal-app behavior suite.
  - boundary;
  - Retry-After precision and window reset;
  - warn once per window;
  - per-IP keying;
  - concurrency;
  - one count per request;
  - headers;
  - library message adapter;
  - independent instances.
- `.planning/phases/14-health-checks-rate-limiting/deferred-items.md`: the same supertest hazard in pre-existing route test files, logged as out of scope.

## TDD Gate Compliance (Task 3)
- **RED** `3b2146f`:
  - target test: "the four live routes draw from one bucket: 15 requests to each leave the next request on any of them at 429";
  - it failed on its assertion: remaining read `[59, NaN, NaN, NaN, 58, ...]`, because /stream, /nearby and /vehicles were not behind the limiter;
  - 5 real-app tests failed and the 12 others passed, including all 10 minimal-app tests against Task 2's module;
  - `check tdd-red-evidence` returned `RED_EVIDENCE_OK` (target_test_failed).
  - Vitest's `tap-flat` reporter does not print node:test's `# tests/# pass/# fail` footer. The footer in the record was derived by counting the real `ok`/`not ok` lines (12 pass, 5 fail).
- **GREEN** `ea16465`: the three routes were wired, and all 17 tests pass.
- **REFACTOR:** none.

## Decisions Made
- Followed the plan's choices: draft-8, `used === limit + 1`, `baseUrl + path`, library defaults for key generator and store, and the instance created at module load.
- Test harness: limiter tests serve each app from one long-lived server (see Deviations).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] supertest requests could be answered by a different app's server**
- **Found during:** Task 3 GREEN.
- **Issue:**
  - What failed: "keeps independent buckets for separate instances" once got 200 where it expected 429.
  - Mechanism: `request(app)` starts a throwaway `listen(0)` server per request, and Node 20's `http.globalAgent` keeps sockets alive. A pooled socket to an earlier server that has since closed can be reused when the OS gives its port to a new server, so the request reaches the old app and its limiter.
  - Reproduced in a scratch script: 1 of 900 requests crossed apps.
  - The single unexplained Task 2 failure (a missing header on the first, cold run) was most likely the same class of issue. It did not reproduce in 22 reruns, including a cold cache and parallel load.
- **Fix:**
  - `makeApp()` in upstreamRateLimit.test.ts now returns a listening `Server`, tracked per test and closed in `afterEach` with `closeAllConnections()`.
  - rateLimit.test.ts serves `test/app` from one server per file (`beforeAll`/`afterAll`). This follows the `dataBootRetry.test.ts` precedent.
  - Helper signatures changed accordingly: `makeApp` became async and returns `Promise<Server>`, and `sendSequential` takes a `Server`.
- **Files modified:** src/server/api/middleware/upstreamRateLimit.test.ts, src/server/api/routes/rateLimit.test.ts.
- **Verification:** 20 sequential runs plus 20 runs under 4-way parallel load, 17/17 each time. The full suite is green.
- **Committed in:** `ea16465` (Task 3 GREEN commit).

**2. [Rule 3 - Blocking] Biome `useLiteralKeys` on `headers["ratelimit"]`**
- **Found during:** Task 2 verify.
- **Fix:** switched to `headers.ratelimit`. Hyphenated header names keep bracket access.
- **Committed in:** `5762666`.

---

**Total deviations:** 2 auto-fixed (1 bug in the test harness, 1 lint blocker).
**Impact on plan:** No production behavior changed beyond the plan. Both fixes are confined to test files.

## Issues Encountered
- The tracked `bun.lock` vitest reconciliation (about 95 lines) was expected, as RESEARCH Pitfall 5 and the plan both noted. It is called out in the `5762666` commit message.
- `bun run lint` exits 0 with 36 warnings. All of them are pre-existing, in files this plan did not touch. None is in the plan's files.
- The executor-protocol worktree allow-list (`agent-*` branch names) does not match this checkout, which is a user-managed linked worktree. The orchestrator explicitly dispatched this plan sequentially on `feat/backend-reliability-ops`, which is not a protected branch (`git.base-branch --is-protected` returned false). The root-pin guard passed before every write and commit.

## Known Stubs
None.

## Threat Flags
None. The only new surface is the limiter itself, and it is fully covered by T-14-06 to T-14-10 and T-14-SC in the plan's threat model.

## User Setup Required
None. No external service configuration is required.

## Next Phase Readiness
- Ready for 14-03:
  - it wires `TRUST_PROXY_HOPS` / `trust proxy` through the real app (finishing SC3);
  - it proves SC4 / RATE-02, that every unlimited endpoint never answers 429.
- RATE-01 is shared with 14-03, so the shared-ID gate (`requirements.ready-ids`) kept it unmarked in REQUIREMENTS.md. 14-03's completion marks it.
- Open for /gsd-verify-work (D6): confirm that an already-open SSE stream keeps flowing after its IP goes over the limit. It holds by construction but is untested.

---
*Phase: 14-health-checks-rate-limiting*
*Completed: 2026-10-06*

## Self-Check: PASSED

- FOUND: src/server/api/middleware/upstreamRateLimit.ts, src/server/api/middleware/upstreamRateLimit.test.ts, src/server/api/routes/rateLimit.test.ts, .planning/phases/14-health-checks-rate-limiting/deferred-items.md
- FOUND commits: 5762666, 3b2146f, ea16465 (3 commits since plan_head_before bd8c760, measured with git rev-list --count)
- All Task 2 and Task 3 acceptance criteria re-run: PASS. Plan-level verification: `bun run test` 49 files / 719 tests pass, `bunx tsc --noEmit` clean, per-file `bunx biome check` clean, and `git diff --name-only 1e20618 -- package.json bun.lock package-lock.json` lists only bun.lock and package.json.
- STATE.md and ROADMAP.md not modified by this plan (orchestrator-owned).
