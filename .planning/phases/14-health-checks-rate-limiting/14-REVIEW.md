---
phase: 14-health-checks-rate-limiting
reviewed: 2026-10-06T20:41:27Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - .claude/CLAUDE.md
  - .env.example
  - AGENTS.md
  - package.json
  - src/server/api/controllers/HealthController.test.ts
  - src/server/api/controllers/HealthController.ts
  - src/server/api/middleware/upstreamRateLimit.test.ts
  - src/server/api/middleware/upstreamRateLimit.ts
  - src/server/api/routes/healthRoutes.test.ts
  - src/server/api/routes/healthRoutes.ts
  - src/server/api/routes/index.ts
  - src/server/api/routes/predictionRoutes.ts
  - src/server/api/routes/rateLimit.test.ts
  - src/server/api/routes/trustProxy.test.ts
  - src/server/api/routes/vehicleRoutes.ts
  - src/server/api/services/BusDataRefreshService.ts
  - src/server/api/services/HealthService.test.ts
  - src/server/api/services/HealthService.ts
  - src/server/app.ts
  - src/server/config/environment.test.ts
  - src/server/config/environment.ts
  - src/server/test/app.ts
findings:
  critical: 1
  warning: 5
  info: 3
  total: 9
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-10-06T20:41:27Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

I reviewed the Phase 14 diff (`bdff1bd..HEAD`): liveness and readiness probes (`HealthService`, `HealthController`, `healthRoutes`), the shared `express-rate-limit@8.7.0` limiter on the four live DASH routes, `TRUST_PROXY_HOPS` validation and wiring, and the new tests.

The limiter itself is configured correctly. Headers, the 429 body, the once-per-window warn and the query-string redaction all work as the tests claim. The main problems are in how the pieces interact:

- Readiness and the Phase 13 refresh cadence work against each other. Once an instance reports `stale`, it stays out of rotation for up to an hour after DASH has recovered.
- The `trust proxy` value of `0` turns off the library's diagnostic for the most likely production misconfiguration: running behind a proxy while `TRUST_PROXY_HOPS` is still 0, so every client shares the proxy's single bucket.
- The per-connect SSE limit does not cap how much a client can make the server call DASH.
- The staleness grace is not derived from the DASH timeout, although the comment says it is.
- Two test files depend on whatever `TRUST_PROXY_HOPS` is in the developer's local `.env`.

I checked the trust-proxy behaviour directly. With `app.set("trust proxy", 0)` and a forwarded header present, express-rate-limit logs no validation error. With the Express default (`false`) it logs `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: A stale instance stays not-ready for up to an hour after DASH recovers

**File:** `src/server/api/services/HealthService.ts:9-10, 50-52` (interaction with `src/server/api/services/BusDataRefreshService.ts:61`)
**Issue:** Readiness turns `stale` once `lastLoadedAt` is more than `3 * REFRESH_INTERVAL_MS + 5min` old (3h05m). After the first successful load, `BusDataRefreshService` schedules every later attempt `REFRESH_INTERVAL_MS` (1h) after the previous one, including after failures (`const delayMs = hasLoaded ? REFRESH_INTERVAL_MS : ...`).

Timeline:
- The third failed refresh settles at about T0+3h.
- Readiness flips to 503 at T0+3h05m.
- The next load attempt is not until about T0+4h.

If DASH comes back at T0+3h06m, the instance still answers `not_ready` for about 54 more minutes. Nothing re-checks DASH any sooner. The same happens on every replica, because they all depend on the same DASH, so an orchestrator acting on `/health/ready` pulls the whole fleet. That includes endpoints that never need fresh DASH data: SQLite favorites/recents, and route/stop reads from the last good copy. The probe stays wrong for most of an hour after the cause has cleared. That is incorrect behaviour for a component whose only job is to steer traffic.

**Fix:** Once a refresh has failed, retry on the capped backoff instead of waiting an hour, so a stale instance recovers within about a minute of DASH returning:
```ts
// BusDataRefreshService.runAttempt catch block
consecutiveFailures += 1;
const delayMs = computeRetryDelayMs(consecutiveFailures); // capped at MAX_RETRY_DELAY_MS whether or not loaded
```
If hourly-on-failure has to stay for the healthy case, at least switch to the backoff schedule once `consecutiveFailures >= 3`, which is the point where readiness is about to drop. Then add a test showing that readiness returns to `ready` within `MAX_RETRY_DELAY_MS` of a successful load after going stale.

## Warnings

### WR-01: `trust proxy = 0` hides express-rate-limit's misconfiguration warning, so the whole site can share one bucket without any signal

**File:** `src/server/app.ts:17`, `src/server/test/app.ts:6` (pinned by `src/server/api/routes/rateLimit.test.ts:286-291`)
**Issue:** express-rate-limit's `xForwardedForHeader` validation only fires when `app.get("trust proxy") === false` (`node_modules/express-rate-limit/dist/index.cjs:400`). The default `TRUST_PROXY_HOPS=0` is passed through as the number `0`, so the check never fires. I confirmed this with a scratch Express app: `false` logs `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`, while `0` logs nothing and behaves identically otherwise.

The most likely production mistake is deploying behind a load balancer or PaaS router and leaving `TRUST_PROXY_HOPS` at its default. In that case every rider is keyed on the proxy's IP and shares one 60/min bucket on all live routes. That is a site-wide self-DoS, and the one built-in diagnostic that would have reported it is suppressed. `rateLimit.test.ts:289-291` asserts this silence as intended behaviour.

**Fix:** Map 0 back to Express's default so the library's check still runs:
```ts
const hops = environment.server.trustProxyHops;
app.set("trust proxy", hops === 0 ? false : hops);
```
Apply the same change in `src/server/test/app.ts`, and update `rateLimit.test.ts` to expect `false` and to expect the one `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` message when a forwarded header arrives with hops at 0.

### WR-02: The per-connect limit on `/predictions/stream` does not cap upstream load; held-open SSE connections build up without limit

**File:** `src/server/api/routes/predictionRoutes.ts:21-23`
**Issue:** The limiter counts an SSE connect once and never touches an open stream (D-11). `PredictionStreamService` starts a 30s DASH poll loop for each distinct stop and keeps it running while any subscriber stays connected. One IP can open 60 streams per minute, each for a different stop, and keep them open. After about 10 minutes that is hundreds of loops, each calling DASH every 30s, plus hundreds of open sockets. The limiter's stated purpose, protecting the DASH quota from one client, is therefore defeated on the endpoint that generates the most sustained upstream traffic. Upstream load is capped only by the number of stops in the dataset, not by anything per client.
**Fix:** Add a per-IP cap on concurrent streams in the stream controller, for example a `Map<string, number>` keyed on `req.ip` that is decremented in the close handler, and reject past a small limit (for example 5) with the same `{ error, details }` 429 body. Alternatively, count open streams against the shared bucket while they stay open.

### WR-03: The staleness grace is fixed at 5 minutes, but each refresh attempt can take up to the configurable DASH timeout

**File:** `src/server/api/services/HealthService.ts:4-10`
**Issue:** The comment says the grace "absorbs those attempt durations, each bounded by the DASH timeout" and is "derived from the refresh interval so the two cannot drift". Neither is true for the grace itself. `STALE_GRACE_MS` is a hard-coded `5 * 60_000`, while `DASH_API_TIMEOUT_MS` is user-configurable up to 2,147,483,647 ms (`environment.ts:17`). Three attempts fit inside the grace only if each takes ≤100s. With `DASH_API_TIMEOUT_MS=120000`, readiness drops while the third refresh is still running, which breaks the "three consecutive failures" guarantee (D-06/D-07) that the comment documents.
**Fix:** Derive the grace from the timeout:
```ts
import { environment } from "../../config";
const STALE_GRACE_MS = 3 * environment.dashApi.timeoutMs + 60_000; // three bounded attempts plus timer slack
```
Alternatively, inject the timeout through `createHealthService` and pin the relationship in `HealthService.test.ts`.

### WR-04: Tests depend on the developer's local `.env` for `TRUST_PROXY_HOPS`

**File:** `src/server/api/routes/rateLimit.test.ts:286`, `src/server/config/environment.test.ts:66-75` (root cause: `src/server/test/setup.ts` does not pin the variable; `environment.ts:5` calls `dotenv.config()`)
**Issue:**
- `setup.ts` pins every other env var, but not `TRUST_PROXY_HOPS`.
- `dotenv.config()` fills any unset variable from the working-tree `.env`.
- `environment.test.ts` "defaults ... to 0 when unset" calls `vi.stubEnv("TRUST_PROXY_HOPS", undefined)`, which deletes the variable, so dotenv then loads the `.env` value.
- `rateLimit.test.ts` asserts `app.get("trust proxy")` is `0`.

A developer whose `.env` sets `TRUST_PROXY_HOPS=1`, which is reasonable when running locally behind a dev proxy, gets failures in both files. `rateLimit.test.ts` also starts keying on `X-Forwarded-For`, so its forged-header test (`:274-292`) fails as well. The tests pass or fail depending on a git-ignored file.
**Fix:** Add `process.env.TRUST_PROXY_HOPS = "0";` to `src/server/test/setup.ts`. In the "unset" test, keep `dotenv` from repopulating the variable, either with `vi.mock("dotenv", () => ({ default: { config: vi.fn() } }))` or by passing `{ path: undefined }` / `override: false` with a non-existent path.

### WR-05: Readiness removes every replica when the shared upstream is down, which contradicts the repository's "last good copy keeps serving" design

**File:** `src/server/api/services/HealthService.ts:49-52`
**Issue:** `BusDataRepository` is designed to keep serving the last good dataset during DASH outages. Readiness then reports `stale`. Every replica reads the same DASH, so all of them go `not_ready` within minutes of each other. An orchestrator that removes not-ready pods leaves zero endpoints, and the in-memory and SQLite routes that work fine during an outage become unreachable. Readiness that tracks a dependency shared by every replica cannot help routing; it can only cause a full outage. This makes CR-01 worse.
**Fix:** Keep `stale` informational on `/health/ready` and do not let it change the HTTP status, so 503 is returned only for `never_loaded`. Alternatively, expose staleness on a separate monitoring endpoint or a metric that alerts instead of de-routing. Record the decision in the phase CONTEXT so it is deliberate.

## Info

### IN-01: `TRUST_PROXY_HOPS` has no upper bound, so a large value is the same as `trust proxy: true`

**File:** `src/server/config/environment.ts:26-30`
**Issue:** `^\d+$` accepts values like `100` or `99999999999999999999`. Express then trusts every hop, which is effectively the `true` setting the `app.ts:15` comment says must never be used. express-rate-limit's `trustProxy` validation only checks `=== true`, so it stays silent.
**Fix:** Add a realistic bound after the transform, for example `.pipe(z.number().int().max(10))`, and a test case for an out-of-range value.

### IN-02: Readiness keeps answering 200 during graceful shutdown

**File:** `src/server/app.ts:53-74`, `src/server/api/services/HealthService.ts:24-56`
**Issue:** On SIGTERM, `server.close()` stops new connections, but a load balancer probing over an existing keep-alive connection still gets `ready` until connections are dropped 10s later. Some load balancers keep routing to the instance during that time.
**Fix:** Set a `shuttingDown` flag in `shutdown()` and have readiness return 503 (`reason: "shutting_down"`) once it is set.

### IN-03: The rate-limit warn writes the client IP to the logs

**File:** `src/server/api/middleware/upstreamRateLimit.ts:37-40`
**Issue:** The handler carefully avoids logging query-string coordinates (Phase 11 rule), but it logs `key`, which is the rider's IP address (or IPv6 /56). That is also personal data. Logging it may be intended for abuse triage, but it is not called out in the comment or the decision log, unlike the coordinate rule.
**Fix:** Either note the decision in the comment, or log a truncated or hashed form (for example the draft-8 `pk` hash the library already computes).

---

_Reviewed: 2026-10-06T20:41:27Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
