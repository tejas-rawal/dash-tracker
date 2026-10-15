---
phase: 14-health-checks-rate-limiting
plan: 03
subsystem: api
tags: [express, trust-proxy, express-rate-limit, zod, env-config, vitest, supertest]

# Dependency graph
requires:
  - phase: 14-health-checks-rate-limiting
    provides: "14-01: GET /api/v1/health/live and /health/ready (RATE-02 rows)"
  - phase: 14-health-checks-rate-limiting
    provides: "14-02: shared upstreamRateLimiter on the four live routes, rateLimit.test.ts with its long-lived-server harness"
  - phase: 12-bounded-upstream-calls-error-safety-nets
    provides: "Zod env-var precedent and the 'empty fails startup' test-matrix convention"
provides:
  - "TRUST_PROXY_HOPS env var: digits only, default 0, exposed as environment.server.trustProxyHops"
  - "app.set('trust proxy', environment.server.trustProxyHops) in app.ts and the test app, before /api/v1"
  - "trustProxy.test.ts: with hops=1, separate per-forwarded-IP buckets, window reset, forged leading XFF entries ignored"
  - "RATE-02 proof: 10 in-memory/probe rows never 429 and never advertise a quota, even for a limited IP; concurrency leaves the live bucket untouched"
  - "Default-0 spoof resistance: forged X-Forwarded-For (single or chain) cannot reset the budget"
  - "Docs: .env.example TRUST_PROXY_HOPS=0; CLAUDE.md/AGENTS.md env line, probes, rate-limiting bullet, frozen-lockfile install with Bun 1.3.14, Vitest 3.2.6"
affects: [deployment, rate-limiting, verify-work, gsd-map-codebase]

# Actuals (#2632)
actuals:
  tokens: 4352
  tasks: 3
  commits: 3
plan_head_before: 2d509ae9a069ce2f6920271bbc024d39e6543acf

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Env-dependent test files stub env with vi.hoisted(() => vi.stubEnv(...)) so the stub is in place before config modules import"
    - "Strict digits-only Zod string + transform(Number) for integer env vars where an empty value must fail startup"
    - "Route test suites keep 14-02's one long-lived server per file (closeAllConnections in afterAll)"

key-files:
  created:
    - src/server/api/routes/trustProxy.test.ts
  modified:
    - src/server/config/environment.ts
    - src/server/app.ts
    - src/server/test/app.ts
    - src/server/config/environment.test.ts
    - src/server/api/routes/rateLimit.test.ts
    - .env.example
    - .claude/CLAUDE.md
    - AGENTS.md

key-decisions:
  - "TRUST_PROXY_HOPS uses z.string().regex(/^\\d+$/).default('0').transform(Number), not z.coerce.number(), so '' and ' 1' fail startup (D-17)"
  - "Express trust proxy is always the integer hop count, never true; the limiter raises no ERR_ERL_* validation for a numeric 0"
  - "The RATE-02 block is nested in rateLimit.test.ts's existing describe so it reuses the file's one long-lived server, spies and per-test resetKey"

patterns-established:
  - "Trusted-proxy config: one integer env var drives app.set('trust proxy', n) in both app.ts and the test app, so route tests resolve req.ip like production"

requirements-completed: [RATE-01, RATE-02]

coverage:
  - id: D1
    description: "TRUST_PROXY_HOPS validated by Zod: unset gives 0, '0'/'1'/'2' give 0/1/2, and '', ' 1', '-1', '1.5', 'abc', 'true' each fail startup with an error naming the variable"
    requirement: RATE-01
    verification:
      - kind: unit
        ref: "src/server/config/environment.test.ts#TRUST_PROXY_HOPS (10 cases)"
        status: pass
      - kind: other
        ref: "real-process smoke with TRUST_PROXY_HOPS=-1 -> exit=1 named=1 invalid=2 listening=0"
        status: pass
    human_judgment: false
  - id: D2
    description: "With TRUST_PROXY_HOPS=1, forwarded client 203.0.113.10 gets 429 (Retry-After 60) on its 61st request; 203.0.113.20 is still served at r=59; 203.0.113.10 is served again at r=59 after the window; forged leading XFF entries cannot dodge the limit"
    requirement: RATE-01
    verification:
      - kind: integration
        ref: "src/server/api/routes/trustProxy.test.ts#limits each forwarded client IP separately and serves it again once the window resets"
        status: pass
      - kind: integration
        ref: "src/server/api/routes/trustProxy.test.ts#keys on the address the trusted proxy appended, so forged leading X-Forwarded-For entries cannot dodge the limit"
        status: pass
      - kind: integration
        ref: "src/server/api/routes/trustProxy.test.ts#reads TRUST_PROXY_HOPS=1 into the app's trust proxy setting"
        status: pass
    human_judgment: false
  - id: D3
    description: "Real process (app.ts) with TRUST_PROXY_HOPS=1 and DASH unreachable: live 200 no-store, ready 503 never_loaded, 61st request from 203.0.113.7 is 429 with Retry-After, 203.0.113.8 gets 503, one warn, SIGTERM exit 0, no key leak"
    requirement: RATE-01
    verification:
      - kind: e2e
        ref: "Task 1 smoke 1 -> live=200 liveok=1 nostore=1 ready=503 neverloaded=1 c61=429 retryafter=1 other=503 warn=1 exit=0 keyleaks=0"
        status: pass
    human_judgment: false
  - id: D4
    description: "RATE-02: routes/all, routes/1A, routes/1A/stops, stops/nearby, GET/POST/DELETE favorites, recents, health/live and health/ready answer 61 requests from an IP limited on live routes with no 429 and no RateLimit/RateLimit-Policy headers, and leave the live bucket at 429"
    requirement: RATE-02
    verification:
      - kind: integration
        ref: "src/server/api/routes/rateLimit.test.ts#%s never answers 429 or advertises a quota, even while the same IP is limited on the live routes (10 rows)"
        status: pass
    human_judgment: false
  - id: D5
    description: "61 concurrent requests across the unlimited endpoints consume nothing from the shared bucket (next live request reports r=59)"
    requirement: RATE-02
    verification:
      - kind: integration
        ref: "src/server/api/routes/rateLimit.test.ts#concurrent bursts to unlimited endpoints never consume the shared live-route bucket"
        status: pass
    human_judgment: false
  - id: D6
    description: "Under the default TRUST_PROXY_HOPS=0, a forged X-Forwarded-For (single address or chain) still gets 429 once the socket IP is limited, with no ERR_ERL_* validation"
    requirement: RATE-01
    verification:
      - kind: integration
        ref: "src/server/api/routes/rateLimit.test.ts#with the default TRUST_PROXY_HOPS=0 a forged X-Forwarded-For does not escape the limit"
        status: pass
    human_judgment: false
  - id: D7
    description: "Docs: .env.example documents TRUST_PROXY_HOPS=0 with the forged-key warning; CLAUDE.md and AGENTS.md list the variable, both probes, the rate-limiting bullet, the frozen-lockfile Bun 1.3.14 install with the tracked text bun.lock, and Vitest 3.2.6"
    verification:
      - kind: other
        ref: "Task 2 grep acceptance checks (frozen=1 install=1 vit326=1 vit215=0 oldbun=0 per file; TRUST_PROXY_HOPS=0 exact line)"
        status: pass
    human_judgment: true
    rationale: "Greps prove presence, not that the operator-facing wording is clear and accurate for a deployer; a human should read the .env.example comment and the install bullet"

# Metrics
duration: 4min
completed: 2026-10-06
status: complete
---

# Phase 14 Plan 03: Trust Proxy and RATE-02 Proof Summary

**The live-route rate limit now keys on the real client IP: a Zod-validated `TRUST_PROXY_HOPS` (digits only, default 0) sets Express `trust proxy` in app.ts and the test app. Real-app E2E tests prove per-forwarded-IP buckets, window reset and spoof resistance. RATE-02 is proven: routes, stops, favorites, recents and both health probes never answer 429 or advertise a quota.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-10-06T20:32:36Z
- **Completed:** 2026-10-06T20:36:52Z
- **Tasks:** 3
- **Files modified:** 9 (1 created, 8 modified)

## Accomplishments
- `TRUST_PROXY_HOPS` env var (D-17). The schema is strict digits-only: `''`, `' 1'`, `'-1'`, `'1.5'`, `'abc'` and `'true'` all fail startup with "Invalid environment configuration" naming the variable.
- `app.set("trust proxy", environment.server.trustProxyHops)` runs before `/api/v1` in both `app.ts` and the test app. It is always an integer, never `true`, and `git grep` finds no `trust proxy", true` anywhere in src.
- SC3 is proven through the real app with hops=1 in `trustProxy.test.ts`: each forwarded client gets its own bucket, a limited IP is served again after the window, and forged leading entries are ignored.
- SC4 / RATE-02 is proven for 10 endpoint rows. They never answer 429 and never send RateLimit headers, even for an IP that is at 429. Concurrent bursts leave the live bucket at r=59.
- Default-0 spoof resistance: a forged X-Forwarded-For, single or chained, cannot reset the budget.
- Real-process smokes of `app.ts` both passed. The first printed the exact expected line. The second, with `TRUST_PROXY_HOPS=-1`, exited 1 before listening and named the variable.
- Docs: `.env.example`, `.claude/CLAUDE.md` and `AGENTS.md` are updated. Both agent docs now give the install procedure this phase actually used.

## Task Commits

1. **Task 1: TRUST_PROXY_HOPS end to end (env, app.set, E2E, smokes)** - `9e5c596` (feat)
2. **Task 2: Validation matrix + docs (env var, probes, rate limit, install/lockfile/Vitest facts)** - `5059ce9` (docs)
3. **Task 3: RATE-02 never-limited rows, concurrency, default-0 spoof test; phase gates** - `1ed9c64` (test)

## Files Created/Modified
- `src/server/config/environment.ts`: `TRUST_PROXY_HOPS` schema key and `server.trustProxyHops`.
- `src/server/app.ts`: sets trust proxy from the validated hop count, before the v1 router.
- `src/server/test/app.ts`: mirrors app.ts. It gains an `environment` import from `../config` and the same `app.set` line.
- `src/server/api/routes/trustProxy.test.ts` (new): the hops=1 E2E. It stubs the env with `vi.hoisted`, fakes only `Date`, and uses one long-lived server.
- `src/server/config/environment.test.ts`: the `describe("TRUST_PROXY_HOPS")` matrix (default, 3 valid, 6 invalid).
- `src/server/api/routes/rateLimit.test.ts`: `UNLIMITED_ROWS`, `sendUnlimited`, the RATE-02 boundary, concurrency and spoof tests.
- `.env.example`: a `TRUST_PROXY_HOPS=0` line with an operator warning about overcounting proxies.
- `.claude/CLAUDE.md` and `AGENTS.md` (mirrored): changes listed below.
  - The env-var line, both health probes on the Endpoints line, and a new "Rate limiting:" bullet.
  - The Install bullet now reads `bun install --frozen-lockfile` with Bun 1.3.14, and the stack line names the tracked text `bun.lock`.
  - Vitest is listed as 3.2.6.

## Decisions Made
- Followed the plan, including RESEARCH Pattern 5's strict digits-only schema.
- The RATE-02 tests are nested inside the existing describe in rateLimit.test.ts rather than given a sibling describe. They reuse 14-02's one long-lived server, spies and `resetKey("127.0.0.1")` hook, so the file does not open a second server.
- trustProxy.test.ts also uses 14-02's long-lived-server harness instead of `request(app)`, as the orchestrator instructed, to avoid the port-reuse issue logged in deferred-items.md.
- The plan said to put `vi.hoisted` right after the vitest import. It sits after all the imports instead: vitest hoists it above them regardless, and leaving the import block contiguous keeps Biome's organizeImports happy.
- 14-02 recorded the same install procedure the plan prescribed (Bun 1.3.14, `--minimum-release-age=604800`), so the docs follow the plan without any difference.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking / CLAUDE.md precedence] The TRUST_PROXY_HOPS schema line is Biome-wrapped, not on one line**
- **Found during:** Task 1 (Biome check).
- **Issue:** The plan's exact one-line chain is longer than 120 characters, so Biome's formatter (mandated by CLAUDE.md) breaks it into a member chain. Two checks expect the single line and therefore fail on the literal text, though the content is identical:
  - Task 1 acceptance grep 1;
  - the must_haves artifact `contains: "TRUST_PROXY_HOPS: z.string().regex("`.
- **Fix:** Applied `biome format`. The schema is byte-identical once whitespace is ignored (`tr -d ' \n'` followed by the same grep passes). No formatter suppression was added.
- **Files modified:** src/server/config/environment.ts
- **Verification:** Biome is clean. The whitespace-normalized grep passes. All 10 environment tests and the invalid-value smoke pass.
- **Committed in:** `9e5c596`

**2. [Rule 3 - Blocking] Biome `useNamingConvention` on a function-scoped `LIVE_PATH`**
- **Found during:** Task 3 (Biome check).
- **Fix:** Moved `LIVE_PATH` to module scope next to `LIMITED_ROWS`, where SCREAMING_CASE is allowed. Also dropped an unnecessary `as UnlimitedRow` cast, because `noUncheckedIndexedAccess` is off.
- **Files modified:** src/server/api/routes/rateLimit.test.ts
- **Committed in:** `1ed9c64`

**3. [Rule 3 - Blocking] A comment line in app.ts was longer than 120 characters**
- **Found during:** Task 1. The plan asked for a one-line comment above `app.set`. The required content does not fit in 120 characters, so it was wrapped to three lines.
- **Committed in:** `9e5c596`

---

**Total deviations:** 3 auto-fixed, all formatting or lint conflicts with the plan's literal text.
**Impact on plan:** None on behavior. Every truth and test the plan specified holds.

## Issues Encountered
- Vitest prints `$expected` = 0 as `+0` in the generated title: "reads TRUST_PROXY_HOPS='0' as +0 trusted hops". This is cosmetic, and the assertion uses `toBe(0)`.
- `bun run lint` exits 0 with 36 warnings. That is the same pre-existing count 14-02 recorded, and none of them are in this plan's files.
- I confirmed that every RATE-02 row reaches its real handler before load: 503 for routes, stops and POST favorites, 500 for GET/DELETE favorites and recents, 200 for live and 503 for ready. None is a 404, so the "never 429" assertions are not vacuous.

## Verification Results
- `bun run test -- --reporter=verbose` on trustProxy, rateLimit and environment: every case passes (3 + 19 + 18).
- `bun run test:coverage`: 50 files and 744 tests pass. All files are at 98.7% statements and lines, 96.16% branches and 97.72% functions, with no "does not meet" line.
- `bunx tsc --noEmit -p tsconfig.json` is clean, `bun run build` exits 0, and `bun run lint` exits 0.
- Real-process smoke 1 printed `live=200 liveok=1 nostore=1 ready=503 neverloaded=1 c61=429 retryafter=1 other=503 warn=1 exit=0 keyleaks=0` and the exact 429 body.
- Real-process smoke 2 (`TRUST_PROXY_HOPS=-1`) printed `exit=1 named=1 invalid=2 listening=0`.
- D-16 check: `grep -c upstreamRateLimit` returns 0 for healthRoutes, busRoutes, stopRoutes, favoriteRoutes, recentRoutes and index.

## Known Stubs
None.

## Threat Flags
None. The trust-proxy surface is covered by T-14-12 to T-14-16 in the plan's threat model, and each mitigation is implemented and tested.

## User Setup Required
None. Operators deploying behind a load balancer or PaaS router should set `TRUST_PROXY_HOPS` to the number of proxies they control. This is documented in `.env.example`.

## Next Phase Readiness
- Phase 14 is complete: HLTH-01/02 come from 14-01, and RATE-01/02 from 14-02 and 14-03.
- `requirements.ready-ids` reports RATE-01 and RATE-02 as ready to mark complete. REQUIREMENTS.md was left to the orchestrator, consistent with 14-01 and 14-02.
- The `.planning/codebase/` map (STACK.md, STRUCTURE.md) still carries the old Bun 1.0.31 / `bun.lockb` and Vitest 2.1.5 lines. The next `/gsd-map-codebase` refresh should pick up the corrected facts now in CLAUDE.md and AGENTS.md.
- Still open for /gsd-verify-work, carried from 14-02 (D6): an already-open SSE stream keeps flowing after its IP goes over the limit.

---
*Phase: 14-health-checks-rate-limiting*
*Completed: 2026-10-06*

## Self-Check: PASSED

- FOUND: src/server/api/routes/trustProxy.test.ts, src/server/config/environment.ts, src/server/app.ts, src/server/test/app.ts
- FOUND commits: 9e5c596, 5059ce9, 1ed9c64 (3 commits since plan_head_before 2d509ae, measured with git rev-list --count)
- All task acceptance criteria re-run: PASS, except the Task 1 literal one-line schema grep, which is Biome-wrapped (Deviation 1; the whitespace-normalized grep passes)
- STATE.md and ROADMAP.md not modified by this plan (orchestrator-owned)
