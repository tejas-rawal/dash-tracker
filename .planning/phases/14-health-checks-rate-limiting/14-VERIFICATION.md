---
phase: 14-health-checks-rate-limiting
verified: 2026-10-06T20:45:55Z
status: human_needed
score: 26/27 must-haves verified
covered_files:
  - ".claude/CLAUDE.md"
  - ".env.example"
  - ".planning/REQUIREMENTS.md"
  - ".planning/phases/14-health-checks-rate-limiting/14-01-PLAN.md"
  - ".planning/phases/14-health-checks-rate-limiting/14-01-SUMMARY.md"
  - ".planning/phases/14-health-checks-rate-limiting/14-02-PLAN.md"
  - ".planning/phases/14-health-checks-rate-limiting/14-02-SUMMARY.md"
  - ".planning/phases/14-health-checks-rate-limiting/14-03-PLAN.md"
  - ".planning/phases/14-health-checks-rate-limiting/14-03-SUMMARY.md"
  - "AGENTS.md"
  - "bun.lock"
  - "package.json"
  - "src/server/api/controllers/HealthController.test.ts"
  - "src/server/api/controllers/HealthController.ts"
  - "src/server/api/middleware/upstreamRateLimit.test.ts"
  - "src/server/api/middleware/upstreamRateLimit.ts"
  - "src/server/api/routes/healthRoutes.test.ts"
  - "src/server/api/routes/healthRoutes.ts"
  - "src/server/api/routes/index.ts"
  - "src/server/api/routes/predictionRoutes.ts"
  - "src/server/api/routes/rateLimit.test.ts"
  - "src/server/api/routes/trustProxy.test.ts"
  - "src/server/api/routes/vehicleRoutes.ts"
  - "src/server/api/services/BusDataRefreshService.ts"
  - "src/server/api/services/HealthService.test.ts"
  - "src/server/api/services/HealthService.ts"
  - "src/server/app.ts"
  - "src/server/config/environment.test.ts"
  - "src/server/config/environment.ts"
  - "src/server/test/app.ts"
covered_digest: "v1:sha256:1db48c1fb28d490b76668e0b7fbcae49f7ee15ae8dc9fa6e5bb4168202031855"
behavior_unverified: 0
overrides_applied: 0
coincidental_reliance_items:
  - truth: "With the default TRUST_PROXY_HOPS=0, a forged X-Forwarded-For cannot escape the limit (rateLimit.test.ts asserts app.get('trust proxy') === 0)"
    reason: undeclared-precondition
    harden: "Pin process.env.TRUST_PROXY_HOPS = \"0\" in src/server/test/setup.ts. environment.ts calls dotenv.config(), so a developer .env that sets TRUST_PROXY_HOPS changes the test app's trust setting. environment.test.ts already mocks dotenv; rateLimit.test.ts does not (review WR-04)."
human_verification:
  - test: "Open a real SSE stream: GET /api/v1/predictions/stream?stop=<loaded stop> from IP A, with route/stop data loaded and a DASH stub answering. While it stays open, send 61 or more GET /api/v1/predictions requests from the same IP A, so it gets 429. Then watch the open stream for at least one 30s poll cycle."
    expected: "The open stream keeps receiving prediction events after IP A is at 429. It is not closed, errored or written to by the limiter. Only new /stream connects from IP A get 429."
    why_human: "Covers the 14-02 backstop truth (verification: backstop) and the judgment-tier prohibition 'MUST NOT end, interrupt, or write to an already-open SSE stream'. No test opens a stream and then exceeds the limit. The code evidence is non-authoritative: express-rate-limit 8.7.0 only attaches response.once('finish'/'close'/'error') hooks when skipFailedRequests or skipSuccessfulRequests is on (dist/index.cjs:914-916), and both are off. Presence plus wiring does not qualify for a backstop truth."
  - test: "Developer decision: accept or close the /predictions/stream fan-out residual risk (review WR-02) against the phase goal 'no single client IP can exhaust the live DASH upstream'."
    expected: "Either an explicit acceptance recorded in 14-CONTEXT.md (D-11 already locks per-connect counting, and ROADMAP SC3 names only /predictions, /predictions/nearby and /vehicles), or a follow-up to cap concurrent streams per IP."
    why_human: "This is a scope and judgment call, not a code defect against the SC contract. PredictionStreamService keeps one 30s DASH poll loop per distinct stop while any subscriber is connected. One IP can open 60 connects per minute to different stops and hold them, so a single client can raise the steady DASH load up to the global ceiling of (distinct stops)/30s. The limiter cannot see held-open streams by design (D-11)."
---

# Phase 14: Health Checks & Rate Limiting Verification Report

**Phase Goal:** A host or load balancer can tell whether the server is alive and whether its data is fresh enough to serve, and no single client IP can exhaust the live DASH upstream.
**Verified:** 2026-10-06T20:45:55Z
**Status:** human_needed
**Re-verification:** No (initial verification)

## Goal Achievement

All four ROADMAP success criteria pass. They are backed by passing tests through the real router, and I confirmed the parts that depend on `app.ts` by re-running the real-process smoke in my own process. Two items need a person:

- **Backstop truth (insufficient_spec):** no test exercises an already-open SSE stream that outlives a 429 on the same IP.
- **Developer decision:** whether to accept the WR-02 stream fan-out residual risk against the goal wording.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | **SC1 / HLTH-01:** liveness returns 200 whenever the process is up, including while DASH is down and before the first load, and never calls upstream | ✓ VERIFIED | `HealthController.getLiveness` is a constant `200 {status:"ok"}` with no service or repository access. healthRoutes.test.ts covers: before load; after a failed load with an unchanged axios call count; after load; 20 concurrent requests. Real-process smoke with DASH unreachable gave `live=200 liveok=1 nostore=1`. |
| 2 | **SC2 / HLTH-02:** readiness is 200 with the age when fresh, and 503 before the first load or when stale, reporting the age or never_loaded in both cases | ✓ VERIFIED | `HealthService.getReadiness` returns never_loaded, stale (`ageMs > STALE_AFTER_MS`) or ready. E2E: 503 never_loaded with nulls; 200 with `dataAgeSeconds 90`; 200 at exactly 11_100_000 ms; 503 stale with `dataAgeSeconds 11100` at +1 ms. Unit: stale after a failure, with both timestamps. Smoke gave `ready=503 neverloaded=1` with `lastFailedAt` populated. |
| 3 | **SC3 / RATE-01:** one IP over the limit on /predictions, /predictions/nearby or /vehicles gets 429 + Retry-After; a different IP is unaffected; the limited IP is served after the window | ✓ VERIFIED | rateLimit.test.ts: 61st request gets 429, the `{error,details}` body, `Retry-After` 1-60; all four routes share one bucket. trustProxy.test.ts (real app, hops=1): 203.0.113.10 gets 429 with `Retry-After: 60`; 203.0.113.20 gets 503 with `r=59`; 203.0.113.10 is served again at T0+60_000 with `r=59`. Smoke gave `c61=429 retryafter=1 other=503 warn=1`. |
| 4 | **SC4 / RATE-02:** routes, stops, favorites/recents and health never return 429 | ✓ VERIFIED | rateLimit.test.ts covers 10 rows (routes/all, routes/1A, routes/1A/stops, stops/nearby, GET/POST/DELETE favorites, recents, health/live, health/ready). Each takes 61 requests while the same IP is already at 429 and never gets 429 or a RateLimit or RateLimit-Policy header. A concurrent burst of 61 leaves the live bucket at `r=59`. The limiter is imported only by predictionRoutes.ts and vehicleRoutes.ts. |
| 5 | HEAD /api/v1/health/live answers 200 with no-store | ✓ VERIFIED | healthRoutes.test.ts "HEAD /api/v1/health/live answers 200" |
| 6 | Readiness boundary and precision: 11_100_000 ms threshold, strict comparison, floor to seconds, clock skew clamped to 0 | ✓ VERIFIED | `STALE_AFTER_MS = 3 * REFRESH_INTERVAL_MS + STALE_GRACE_MS`; `Math.max(0, …)`; `Math.floor`. HealthService.test.ts it.each age and stale rows plus the future-timestamp case |
| 7 | A failed refresh after load leaves readiness 200 with the original lastLoadedAt; one getLoadState() per call; never calls load() | ✓ VERIFIED | E2E "stays 200 ready with the original lastLoadedAt after a failed refresh"; unit "reads exactly one load-state snapshot per call"; the mock repo has no `load` |
| 8 | D-05: readiness reads only `getLoadState()`, with no alert, SQLite or upstream input | ✓ VERIFIED | HealthService.ts imports only the repository type and `REFRESH_INTERVAL_MS` |
| 9 | D-01: healthRoutes.ts is the composition root, mounted with `router.use("/health", …)` | ✓ VERIFIED | healthRoutes.ts:6-7; index.ts:18 |
| 10 | D-07/D-08: the only change to BusDataRefreshService is the `export` keyword | ✓ VERIFIED | `git diff --numstat bdff1bd` gives `1 1` |
| 11 | D-04 prohibition (test-tier): no lastError, upstream text or secret in probe bodies | ✓ VERIFIED | Only `lastLoadedAt` and `lastFailedAt` are destructured. Tests assert no `lastError` key and no "ECONNREFUSED", "timed out" or "boom" in bodies. Smoke `keyleaks=0`. |
| 12 | D-10/D-11: one limiter instance shared by the four live routes | ✓ VERIFIED | `export const upstreamRateLimiter = createUpstreamRateLimiter()`; imported in predictionRoutes.ts:5 and vehicleRoutes.ts:3. The remaining count runs 59 down to 0 across alternating routes. |
| 13 | D-14: draft-8 RateLimit and RateLimit-Policy headers, no X-RateLimit-* | ✓ VERIFIED | `standardHeaders: "draft-8"`, `legacyHeaders: false`; header regexes in rateLimit.test.ts |
| 14 | D-12: named constants 60 and 60_000 | ✓ VERIFIED | upstreamRateLimit.ts:5-6 |
| 15 | Edge boundary, Retry-After precision and window reset (60 / 30 / 1, served again at +60_000) | ✓ VERIFIED | upstreamRateLimit.test.ts "window boundary and Retry-After precision" and "allows the 59th and 60th…" |
| 16 | Edge idempotency and concurrency: each request counted once; 70 concurrent requests give 60 passes, 10 rejections and 1 warn | ✓ VERIFIED | upstreamRateLimit.test.ts "counts each request exactly once" and "counts concurrent requests exactly"; no `ERR_ERL_` in errorSpy |
| 17 | D-15 prohibition (test-tier): one warn per IP per window, no query string or coordinates | ✓ VERIFIED | `used === UPSTREAM_RATE_LIMIT + 1`; logs `${req.baseUrl}${req.path}`. rateLimit.test.ts:203-206 asserts no "38.8048", "-77.0469", "lat=", "lng=" or "?". |
| 18 | Library messages reach Winston as one message-only string | ✓ VERIFIED | Logger adapter in upstreamRateLimit.ts:23-30; test "routes library validation messages through Winston…" |
| 19 | D-09: express-rate-limit pinned to exactly 8.7.0 in package.json and bun.lock; package-lock.json unchanged | ✓ VERIFIED | package.json:42 `"8.7.0"`; bun.lock contains `express-rate-limit@8.7.0`; node_modules version is 8.7.0; package-lock.json has no diff since bdff1bd. I cannot check the human approval checkpoint itself from the code. |
| 20 | D-16: the limiter is attached per handler only, never per router or app | ✓ VERIFIED | `git grep upstreamRateLimit` shows only the middleware file, predictionRoutes.ts and vehicleRoutes.ts; no `router.use` in either route file |
| 21 | SSE connect counted once; an open stream is never touched later (backstop) | ? insufficient_spec (human) | Code evidence is non-authoritative (library response hooks are off by default). No test holds a stream open across a 429. See Human Verification 1. |
| 22 | TRUST_PROXY_HOPS=1: separate buckets per forwarded IP, and forged leading XFF entries cannot dodge the limit | ✓ VERIFIED | trustProxy.test.ts, both tests |
| 23 | Default TRUST_PROXY_HOPS=0: a forged XFF cannot reset the budget | ✓ VERIFIED (coincidental-reliance) | rateLimit.test.ts spoof test passes, but its `trust proxy === 0` precondition depends on the developer `.env` not setting the variable (see coincidental_reliance_items) |
| 24 | D-17 validation: unset gives 0; "0", "1" and "2" parse; "", " 1", "-1", "1.5", "abc" and "true" fail startup | ✓ VERIFIED | environment.ts digits-only regex; environment.test.ts `describe("TRUST_PROXY_HOPS")` with dotenv mocked; real-process smoke with `-1` gave `exit=1 named=1 invalid=2 listening=0` |
| 25 | app.ts and test/app.ts set an integer trust proxy before mounting /api/v1, never `true` | ✓ VERIFIED | app.ts:17 is before :27; test/app.ts:6 is before :13; `git grep 'trust proxy", *true'` is empty |
| 26 | Real process (TRUST_PROXY_HOPS=1, DASH unreachable): probes, 429 vs another IP, one warn, SIGTERM exits 0, no key leak | ✓ VERIFIED | Re-run by the verifier: `live=200 liveok=1 nostore=1 ready=503 neverloaded=1 c61=429 retryafter=1 other=503 warn=1 exit=0 keyleaks=0` plus the exact 429 body |
| 27 | Docs: TRUST_PROXY_HOPS, probes, rate-limit bullet, install command, Vitest 3.2.6 in .env.example, .claude/CLAUDE.md and AGENTS.md | ✓ VERIFIED | grep: `.env.example:7 TRUST_PROXY_HOPS=0`; CLAUDE.md:13,34,37,39,74,75; AGENTS.md:7,17,20,22,51,52 |

**Score:** 26/27 truths verified (0 present-but-behavior-unverified; 1 insufficient_spec backstop routed to human)

### Code Review Findings vs. Success Criteria

I checked each 14-REVIEW.md finding against the SC contract and the locked decisions in 14-CONTEXT.md:

| Finding | Breaks an SC or must-have? | Disposition |
|---------|-------------------------|-------------|
| **CR-01**: a stale instance stays 503 for up to about 1h after DASH recovers | **No.** SC2 requires 503 when refreshes "have failed long enough for the data to go stale", and 200 when data is "loaded and fresher than the threshold". After DASH recovers, `lastLoadedAt` really is old until the next successful load, so readiness reports the truth. The slow recovery comes from the Phase 13 scheduler (`delayMs = hasLoaded ? REFRESH_INTERVAL_MS : …`, which I confirmed in BusDataRefreshService.ts). **D-08 explicitly accepts it**: "the instance can stay unready for up to an hour, until the next attempt succeeds". 14-CONTEXT `<deferred>` lists "retrying sooner after a failed post-load refresh" as rejected for this phase. | Accepted-scope operational risk. Not a gap. Recommend revisiting in a scheduler phase before deploying behind an orchestrator that de-routes on readiness (made worse by WR-05). |
| **WR-01**: `trust proxy = 0` silences ERR_ERL_UNEXPECTED_X_FORWARDED_FOR | **No.** D-17 says `app.set("trust proxy", hops)` with default 0, and the required behavior (XFF ignored, socket IP keyed) holds; truths 22, 23 and 25 are verified. The lost diagnostic only matters when an operator misconfigures (behind a proxy with hops left at 0). That is a hardening gap, and .env.example documents it (T-14-14). | Warning (hardening). Mapping 0 to `false` is cheap and changes no behavior. |
| **WR-02**: per-connect SSE limit does not cap held-open streams | **Not against the SC contract.** SC3 and RATE-01 name only /predictions, /predictions/nearby and /vehicles, and D-11 locks per-connect counting. **It does touch the goal sentence**: one IP can hold loops on many distinct stops, up to the global ceiling of stops/30s (confirmed: one `setInterval` per stop in PredictionStreamService.ts). | Warning, escalated to the developer (Human Verification 2). |
| **WR-03**: 5-min grace not derived from DASH_API_TIMEOUT_MS | **No.** At the default 10s timeout, three attempts take 30s or less, well inside the 300s grace. The "3 consecutive failures" guarantee breaks only when the timeout is set above about 100s. D-06 locks the 5-minute grace. The code comment overclaims. | Warning (comment accuracy / configurable edge). |
| **WR-04**: tests depend on the local `.env` for TRUST_PROXY_HOPS | **No.** environment.test.ts already mocks dotenv, so that half of the finding is out of date. rateLimit.test.ts does depend on it, which is recorded as coincidental-reliance on truth 23. The tests pass in this worktree, and a `.env` is present. | Warning (test hygiene). |
| **WR-05**: readiness de-routes every replica when the shared DASH is down | **No, and the proposed fix would violate SC2**, which requires 503 when stale. D-05 and D-06 lock this design. | Info / product decision for a later phase. |
| IN-01 to IN-03 | No | Info |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/server/api/services/HealthService.ts` | Readiness from the load-state snapshot | ✓ VERIFIED | 57 lines; exports `createHealthService`, `STALE_AFTER_MS`, `ReadinessReport`, `HealthService`; wired from healthRoutes.ts |
| `src/server/api/controllers/HealthController.ts` | Liveness and readiness handlers with no-store | ✓ VERIFIED | Two `res.set("Cache-Control", "no-store")`; 200/503 mapping; no sendErrorResponse or Retry-After |
| `src/server/api/routes/healthRoutes.ts` | GET /live, GET /ready | ✓ VERIFIED | Mounted at index.ts:18 |
| `src/server/api/middleware/upstreamRateLimit.ts` | Factory plus shared instance | ✓ VERIFIED | Imported by both live route modules |
| `src/server/api/routes/predictionRoutes.ts` / `vehicleRoutes.ts` | Limiter on 4 handlers | ✓ VERIFIED | Lines 20, 23, 24 / 12 |
| `src/server/config/environment.ts` | TRUST_PROXY_HOPS → `server.trustProxyHops` | ✓ VERIFIED | Biome wraps the chain over several lines; content matches the plan |
| `src/server/app.ts`, `src/server/test/app.ts` | trust proxy before router | ✓ VERIFIED | |
| Test files (HealthService, HealthController, healthRoutes, upstreamRateLimit, rateLimit, trustProxy, environment) | Behavior pinning | ✓ VERIFIED | All pass in the full run |
| `package.json` / `bun.lock` | exact pin 8.7.0 | ✓ VERIFIED | |
| `.env.example`, `.claude/CLAUDE.md`, `AGENTS.md` | Docs | ✓ VERIFIED | |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| healthRoutes.ts | HealthService.ts | `createHealthService(BusDataRepository.getInstance())` | ✓ WIRED |
| HealthService.ts | BusDataRepository | `repository.getLoadState()` | ✓ WIRED |
| HealthService.ts | BusDataRefreshService.ts | `import { REFRESH_INTERVAL_MS }` | ✓ WIRED |
| routes/index.ts | healthRoutes.ts | `router.use("/health", healthRoutes)` | ✓ WIRED |
| HealthController.ts | HealthService.ts | `service.getReadiness()` | ✓ WIRED |
| predictionRoutes.ts / vehicleRoutes.ts | upstreamRateLimit.ts | shared `upstreamRateLimiter` as the handler middleware | ✓ WIRED |
| upstreamRateLimit.ts | config/logger | `logger.warn(` / `logger.error(` | ✓ WIRED |
| app.ts / test/app.ts | environment.ts | `app.set("trust proxy", environment.server.trustProxyHops)` | ✓ WIRED |
| rateLimit.test.ts | healthRoutes | `/api/v1/health/(live\|ready)` rows | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| HealthController.getReadiness | `report` | `HealthService.getReadiness()` → `BusDataRepository.getLoadState()` (set by `load()` on success or failure) | Yes. The smoke showed a real `lastFailedAt` after the actual DASH failure | ✓ FLOWING |
| upstreamRateLimit handler | `req.rateLimit.{used,key}` | express-rate-limit MemoryStore keyed by `ipKeyGenerator(req.ip)` | Yes (smoke warn named 203.0.113.7) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite (run once) | `bun run test` | 50 files, 744 tests passed, no type errors | ✓ PASS |
| Lint | `bun run lint` | exit 0 (36 pre-existing repo-wide warnings; 2 in phase files are `useFilenamingConvention` on PascalCase test files, matching existing convention) | ✓ PASS |
| Typecheck | `bunx tsc --noEmit -p tsconfig.json` | exit 0 | ✓ PASS |
| Scheduler untouched | `git diff --numstat bdff1bd -- …/BusDataRefreshService.ts` | `1 1` | ✓ PASS |
| Installed library version | `node -p require(...express-rate-limit/package.json).version` | `8.7.0` | ✓ PASS |
| Real process, hops=1, DASH down | plan 14-03 smoke 1 (temp DB, watchdog) | `live=200 liveok=1 nostore=1 ready=503 neverloaded=1 c61=429 retryafter=1 other=503 warn=1 exit=0 keyleaks=0` | ✓ PASS |
| Invalid TRUST_PROXY_HOPS fails startup | plan 14-03 smoke 2 | `exit=1 named=1 invalid=2 listening=0` | ✓ PASS |

Note: the two smokes start a short-lived `app.ts` process with a temp SQLite path and a kill watchdog, and clean up after themselves. I ran them because `app.ts` is excluded from coverage and has no unit test. They were the only way to get first-hand evidence for truth 26 instead of relying on the SUMMARY.

### Probe Execution

No `scripts/*/tests/probe-*.sh` exist, and the plans declare no probe scripts. Step 7c: N/A.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| HLTH-01 | 14-01 | Liveness 200 whenever up, no DASH or data state | ✓ SATISFIED | Truths 1 and 5 |
| HLTH-02 | 14-01 | Readiness 200 fresh / 503 otherwise, age in both cases | ✓ SATISFIED | Truths 2, 6 and 7 |
| RATE-01 | 14-02, 14-03 | Live-upstream endpoints limited per IP, 429 + Retry-After | ✓ SATISFIED | Truths 3 and 12-16, 22 |
| RATE-02 | 14-03 | In-memory endpoints not limited | ✓ SATISFIED | Truths 4 and 20 |

All four phase IDs appear in plan frontmatter, and no orphaned IDs map to Phase 14 in REQUIREMENTS.md. Bookkeeping note: REQUIREMENTS.md still shows RATE-01 and RATE-02 as `[ ]` / "Pending" (lines 39-40, 84-85), while HLTH-01 and HLTH-02 are marked Complete. The orchestrator should tick these when it closes the phase. This is not a code gap.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (phase files) | none | TBD/FIXME/XXX/TODO/HACK | none | No debt markers |
| src/server/api/services/HealthService.ts | 7-8 | Comment says the grace is "bounded by the DASH timeout" and "derived … so the two cannot drift"; the grace is hard-coded and the timeout is configurable (WR-03) | ⚠️ Warning | Misleading comment; guarantee holds only for timeouts up to about 100s |
| src/server/test/setup.ts | n/a | TRUST_PROXY_HOPS not pinned (WR-04) | ⚠️ Warning | rateLimit.test.ts depends on the local `.env` |
| src/server/app.ts | 17 | numeric 0 instead of `false` hides the library's XFF diagnostic (WR-01) | ⚠️ Warning | Silent shared-bucket misconfiguration behind a proxy |

No stubs, no empty handlers, no hardcoded empty data.

### Human Verification Required

#### 1. Open SSE stream survives its IP being rate-limited (backstop truth + judgment prohibition)

**Test:** Load route/stop data with DASH stubbed. Open `GET /api/v1/predictions/stream?stop=<stop>` from IP A and keep it open. Send 61 or more `GET /api/v1/predictions` from IP A until it gets 429. Watch the open stream for at least one 30s poll.
**Expected:** The stream keeps delivering events and is never closed or written to by the limiter. Only new `/stream` connects from IP A get 429.
**Why human:** This is a backstop truth, and presence plus wiring cannot verify it. No test holds a stream open across a 429. Non-authoritative LLM-judge verdict: holds. express-rate-limit 8.7.0 attaches response listeners only when `skipFailedRequests` or `skipSuccessfulRequests` is set, and neither is.

#### 2. Decide on WR-02 (stream fan-out against the goal wording)

**Test:** Review whether "no single client IP can exhaust the live DASH upstream" must also cover held-open `/predictions/stream` connections.
**Expected:** Either record acceptance in 14-CONTEXT.md (consistent with D-11 and SC3's endpoint list), or schedule a per-IP concurrent-stream cap.
**Why human:** This is a scope decision. The SC contract is met, but one IP can push stream-driven DASH polling to the global per-stop ceiling.

### Gaps Summary

There are no blocking gaps. Every ROADMAP success criterion and every requirement (HLTH-01, HLTH-02, RATE-01, RATE-02) is met in the codebase and proven by passing tests through the real router. The `app.ts` wiring is confirmed by a real-process smoke I re-ran myself.

The review's critical finding CR-01 does not falsify SC2: readiness accurately reports stale data, and the up-to-1h recovery lag is a Phase 13 scheduler behavior that D-08 explicitly accepted and CONTEXT deferred. WR-01, WR-03 and WR-04 are hardening or test-hygiene warnings within the locked decisions. WR-05's suggested fix would contradict SC2.

Status is `human_needed` for two reasons: one backstop truth (open SSE streams untouched by the limiter) that only a real stream test or manual check can confirm, and the WR-02 scope decision.

---

_Verified: 2026-10-06T20:45:55Z_
_Verifier: Claude (gsd-verifier)_
