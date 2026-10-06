# Phase 14: Health Checks & Rate Limiting - Research

**Researched:** 2026-10-06
**Domain:** Express 4 liveness/readiness probes, per-IP rate limiting (express-rate-limit 8.x), trust-proxy configuration
**Confidence:** HIGH (library behavior was probed against the real package under the project's tsconfig and Node 20; in-repo values were read this session)

> **Resolution note (2026-10-06, plan-phase):** CONTEXT.md is authoritative. All three Open Questions are RESOLVED: D-06 and D-07 were revised and D-19 was added. The staleness threshold is `STALE_AFTER_MS = 3 * REFRESH_INTERVAL_MS + 5 * 60_000` (11_100_000 ms, 3h5m), not a bare 3h. `REFRESH_INTERVAL_MS` is exported, and that export is the only edit to `BusDataRefreshService.ts`. Both probes send `Cache-Control: no-store`, and the readiness 503 sends no `Retry-After`. Any statement below that predates the revision (a bare `3 * REFRESH_INTERVAL_MS`, a 3h / 10800 s boundary, or "needs user confirmation") is superseded. Each one is marked where it appears.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Probe endpoints
- **D-01:** The probes are `GET /api/v1/health/live` and `GET /api/v1/health/ready`. They live in a new `healthRoutes.ts` mounted as `router.use("/health", ...)` in `src/server/api/routes/index.ts`, and follow the usual routes → controller → service layering with factory DI. They are not root-level paths and are not registered in `app.ts`.
- **D-02:** Liveness always returns `200 { status: "ok" }`. It reads no data state, never touches the repository or DASH, and works before the first load and while DASH is down (HLTH-01).
- **D-03:** Readiness returns this body:
  ```
  { status: "ready" | "not_ready",
    reason?: "never_loaded" | "stale",
    dataAgeSeconds: number | null,
    lastLoadedAt: string | null,
    lastFailedAt: string | null }
  ```
  The status code is 200 when ready and 503 when not ready. When data has never loaded, `dataAgeSeconds` and `lastLoadedAt` are `null`. Timestamps are ISO strings. `reason` appears only on 503. The body is built from `BusDataRepository.getLoadState()`.
- **D-04:** The readiness body **omits `lastError`**. The endpoint is public and upstream error text should not be exposed. Operators can find that text in the warn logs from the refresh service.
- **D-05:** Readiness gates **only on route/stop data**. It does not consider alert-poll freshness or SQLite. A failed SQLite open already exits at boot (13 D-18), and alerts are only an enrichment. Readiness never makes an upstream call.

#### Staleness
*(Synced with CONTEXT.md after the 2026-10-06 plan-phase revision of D-06/D-07/D-08 and the addition of D-19.)*
- **D-06:** The staleness threshold is **3 × `REFRESH_INTERVAL_MS` plus a 5-minute grace margin** (3h5m). Data is stale when `now - lastLoadedAt` exceeds it. *(Revised 2026-10-06 at plan-phase after research: each refresh is scheduled one interval after the previous attempt **finishes**, so a bare 3h threshold trips after only two failed refreshes, milliseconds to ~20s before the third attempt starts. The grace margin makes "unready only after three refreshes in a row have failed" literally true, so one DASH blip never pulls the instance from rotation.)*
- **D-07:** The threshold is a **named module constant**, not an env var, following 13 D-07. It is **derived from `REFRESH_INTERVAL_MS`**, which `BusDataRefreshService` now **exports** (export only, no behavior change), so the two cannot drift. Its comment explains the 3 missed refreshes + grace reasoning. *(Revised 2026-10-06 at plan-phase.)*
- **D-08:** `BusDataRefreshService`'s **scheduling behavior is not changed** (the only edit is exporting `REFRESH_INTERVAL_MS`, per D-07). A failed refresh still waits the full hour before retrying (13 D-09/D-10). The user accepted that after the third failure in a row, the instance can stay unready for up to an hour, until the next attempt succeeds.
- **D-19:** Both probes send **`Cache-Control: no-store`**. The readiness 503 does **not** send `Retry-After`: staleness and never-loaded are not short transients, unlike the API-level `DataNotReadyError` 503. *(Decided 2026-10-06 at plan-phase.)*

#### Rate limiting
- **D-09:** Use the **`express-rate-limit`** package with its default in-memory store, per the "prefer established libraries" principle. A Redis or shared store is out of scope (REQUIREMENTS Out of Scope). The planner checks which version is compatible with Express 4.21 / Node 20 / Bun 1.0.31 and reads its types before relying on any option.
- **D-10:** **One shared limiter instance (one bucket)** covers every live-upstream endpoint. The budget is total DASH-triggering requests per IP, not a separate budget per endpoint.
- **D-11:** These routes are limited:
  - `GET /api/v1/predictions`
  - `GET /api/v1/predictions/nearby`
  - `GET /api/v1/vehicles`
  - `GET /api/v1/predictions/stream`. Each new SSE connection counts as one request. This prevents reconnect storms. Streams that are already open are never cut off by the limiter.
- **D-12:** The limit is **60 requests per 1-minute window per IP**, set as named module constants.
- **D-13:** A 429 uses the project's existing error shape, `{ error: "Too Many Requests", details: "<human message>" }`, plus a `Retry-After` header. This keeps it consistent with `sendErrorResponse`'s 404/502/503 bodies, which use `{ error, details }`.
- **D-14:** Responses on limited routes carry the **standard IETF draft `RateLimit` / `RateLimit-Policy` headers**. The legacy `X-RateLimit-*` headers are off.
- **D-15:** The limiter logs **one `warn` per IP per window**, on that IP's first rejected request in the window, not on every 429. The log line may include the client IP and the path. It must **not** include the query string, because `/predictions/nearby` carries rider coordinates (Phase 11 rule: rider lat/lng are never logged).
- **D-16:** The routes, stops, favorites, recents, and health endpoints are never limited (RATE-02). The limiter is attached only to the routes in D-11, not to the v1 router or the app as a whole.

#### Client IP behind a proxy
- **D-17:** Add a new Zod-validated env var, **`TRUST_PROXY_HOPS`**: a non-negative integer, default `0`. Apply it with `app.set("trust proxy", hops)` in `app.ts`. With the default of 0, `X-Forwarded-For` is ignored and the socket IP is the key, so the limit can't be dodged by spoofing the header. Behind a single LB or PaaS proxy, operators set it to 1. An invalid value fails startup the same way the other env vars do. Document the variable wherever the other env vars are documented.
- **D-18:** The deployment target is **not decided yet**. Keep everything deployment-agnostic.

### Claude's Discretion
- The shared limiter's module name and location (e.g. `src/server/api/middleware/upstreamRateLimit.ts`). Prefer a `createUpstreamRateLimiter()` factory, with one shared instance wired into both `predictionRoutes.ts` and `vehicleRoutes.ts`, so tests can build fresh instances without bucket bleed.
- How to detect "first rejection in the window" for D-15. For example, inside the custom handler, `req.rateLimit.current === limit + 1`.
- ~~Whether the readiness 503 also sends `Retry-After`, and whether either probe sets `Cache-Control: no-store`.~~ No longer discretion: decided by D-19.
- How `dataAgeSeconds` is rounded (floor to whole seconds is fine), and whether the health service takes an injected clock or the tests use `vi.useFakeTimers()`.
- How the readiness logic is split between the health service and the controller. Factory DI still applies: inject `BusDataRepository` and never import the singleton inside the service.

### Deferred Ideas (OUT OF SCOPE)
- Retrying sooner after a failed post-load refresh, for example by backing off instead of waiting the full hour. This was considered and rejected for this phase (D-08). If readiness flapping turns out to matter in practice, it would be a change to the Phase 13 scheduler.
- Alert-poll freshness in readiness, whether informational or gating. This was rejected for this phase (D-05).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HLTH-01 | A liveness endpoint returns 200 whenever the process is up, without touching DASH or data state | Controller-local constant response, no service/repository call (Pattern 2). Verified by an E2E test that runs with the repository in its pre-load state and asserts `axios.get` is never called. |
| HLTH-02 | A readiness endpoint returns 200 when route/stop data is loaded and fresher than a staleness threshold, and 503 otherwise, reporting the data's age in both cases | `getLoadState()` snapshot → `HealthService.getReadiness()` (Pattern 3). Staleness uses a strict `>` against `STALE_AFTER_MS = 3 * REFRESH_INTERVAL_MS + 5 * 60_000` (revised D-06). Pitfall 1 explains why the grace margin is needed; the user confirmed it at plan-phase. |
| RATE-01 | Live-upstream endpoints (`/predictions`, `/predictions/nearby`, `/vehicles`) are rate-limited per client IP, returning 429 with a `Retry-After` header when exceeded | `express-rate-limit@8.7.0`, a single shared instance, `standardHeaders: "draft-8"`, `legacyHeaders: false`, and a custom `handler` (Pattern 1). Retry-After is set by the library only when standard or legacy headers are enabled (verified in source). |
| RATE-02 | In-memory endpoints (routes, stops, favorites/recents, health) are not rate-limited | The limiter is attached per route in `predictionRoutes.ts` and `vehicleRoutes.ts` only (Pattern 4). An E2E test sends more than 60 requests to each unlimited endpoint and asserts no 429 and no `ratelimit` header. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Layering: Routes → Controllers → Services → Repository → Models. Don't skip layers. DI goes through `createX` factory functions. Never import the repository singleton inside a service or controller; route modules are the composition root. [VERIFIED: .claude/CLAUDE.md]
- Prefer established libraries, and lean on dependencies that are already installed. No compatibility layers, no speculative config. Make decisions for the long term. [VERIFIED: .claude/CLAUDE.md]
- Style is enforced by Biome 1.9.4: 120-character lines, 4-space indent, double quotes, semicolons, trailing commas, `style: all` (so `useNamingConvention` applies and env keys need the existing `biome-ignore` comment). [VERIFIED: biome.json]
- Functions have explicit return types. Use named exports, except that route modules default-export their `Router`. Imports are relative only. [VERIFIED: .claude/CLAUDE.md]
- Logging (Winston): startup/shutdown, external calls, and error conditions only. No per-call noise. Never log whole error objects (Phase 12 D-12). Never log rider lat/lng (Phase 11). [VERIFIED: src/server/api/controllers/errorResponse.ts:25-30]
- Tests: Vitest, co-located `*.test.ts`, AAA comments, `makeX` factories, `vi.mock()`. 80% coverage thresholds on branches, functions, lines, and statements, with `app.ts` and `config/**` excluded from coverage. [VERIFIED: vitest.config.mts]
- GSD workflow: edits go through `/gsd-execute-phase`.

## Summary

This phase is small and has no unknowns in the library itself. The work splits into three parts. **Probes**: add `healthRoutes.ts`, `HealthController.ts`, and `HealthService.ts`, built at module load from `BusDataRepository.getInstance()`, the same pattern as `vehicleRoutes.ts`. **Rate limiting**: add one `express-rate-limit` instance in `src/server/api/middleware/upstreamRateLimit.ts`, placed in front of four GET handlers. **Trust proxy**: add a `TRUST_PROXY_HOPS` env var applied in `app.ts`. I installed `express-rate-limit@8.7.0` into a scratch project with the repo's exact `tsconfig.json`, `@types/express@5.0.0`, `express@4.21.2`, and Node 20.20.2. It typechecks cleanly, and the probe confirmed the exact headers, the Retry-After behavior, IPv4-mapped key normalization, the "first rejection" detection, per-IP separation through `X-Forwarded-For` with `trust proxy = 1`, spoof resistance with `trust proxy = 0`, and window reset driven by `Date.now`.

Three findings change what the planner writes:
1. **`req.rateLimit.current` is not typed in v8.** The field is `used`. At runtime `current` is only a non-enumerable deprecated alias, so the CONTEXT example would fail `tsc`. Detect the first rejection with `info.used === UPSTREAM_RATE_LIMIT + 1`.
2. **Off-by-one in the D-06 rationale.** Refreshes are chained (each one is scheduled an hour after the previous attempt *settles*), so a 3-hour threshold measured from `lastLoadedAt` expires *before* the third post-load refresh attempt starts. The instance goes unready after **two** consecutive failed refreshes, a few milliseconds to about 20 seconds before the third attempt. The locked number (3h) can stay, but the code comment must not claim "three failed refreshes" unless the user agrees to add a small grace margin. See Pitfall 1 and Open Question 1. **RESOLVED (revised D-06):** the user approved a 5-minute grace margin, so `STALE_AFTER_MS = 3 * REFRESH_INTERVAL_MS + 5 * 60_000` and the "three failed refreshes" comment is true.
3. **Lockfile tooling.** The tracked lockfile is the text `bun.lock`. The pinned `bun@1.0.31` ignores it and writes the git-ignored `bun.lockb`, so a plain `bun install` would leave the committed lockfile without the new dependency. Use the proto-installed Bun 1.3.14 with `--minimum-release-age` (exact command below).

**Primary recommendation:** Add `express-rate-limit@8.7.0` (exact pin) with `~/.proto/tools/bun/1.3.14/bun add express-rate-limit@8.7.0 --minimum-release-age=604800`. Build one `createUpstreamRateLimiter()` instance with `windowMs: 60_000`, `limit: 60`, `standardHeaders: "draft-8"`, `legacyHeaders: false`, a custom `handler` that warns once (on `used === limit + 1`) and sends `{ error, details }`, and a Winston `logger` adapter. Place that instance in front of the four D-11 handlers. Build readiness as a pure function of `getLoadState()` plus `Date.now()`, with no upstream I/O.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Liveness probe | API / Backend (controller) | — | A constant response. It must not touch any data tier (HLTH-01), so it stops at the controller. |
| Readiness evaluation (ready / stale / never_loaded, age) | API / Backend (service) | Repository (`getLoadState()` snapshot) | Business rule (threshold) belongs to the service. The repository only reports state. |
| Readiness HTTP mapping (200/503, headers) | API / Backend (controller) | — | Controllers own status-code mapping (CLAUDE.md). |
| Per-IP rate limiting | API / Backend (route-level middleware) | In-process memory (MemoryStore) | Attached per route so that only the D-11 routes are limited. No shared store (out of scope). |
| Client IP resolution behind proxies | API / Backend (Express app setting) | Config (Zod env) | `trust proxy` is an app-level Express setting, and `req.ip` reads it on every request. |
| Probe consumption | External (LB / orchestrator) | — | D-18: target undecided. Endpoints are plain HTTP and work for any LB, PaaS, or k8s. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| express-rate-limit | 8.7.0 (exact pin; published 2026-08-29) | Per-IP fixed-window limiter, IETF RateLimit headers, Retry-After | Locked by D-09. ~82M weekly downloads, MIT, maintained, ships its own types (`dist/index.d.ts`), CJS + ESM builds, `peerDependencies: { express: ">= 4.11" }`, `engines: { node: ">= 16" }`. [VERIFIED: npm registry `npm view express-rate-limit@8.7.0`, package tarball `package.json`] |

### Supporting (already installed, reused)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 3.25.76 installed (`^3.24.0` declared) | `TRUST_PROXY_HOPS` validation | Env schema in `src/server/config/environment.ts` [VERIFIED: node_modules/zod/package.json] |
| winston (via `logger`) | ^3.17.0 | Warn once per IP per window, and route the library's own validation messages | `src/server/config/logger.ts` |
| supertest | 7.2.2 | Route-level E2E for probes and limiter | Existing pattern (`dataNotReady.test.ts`) |
| vitest | 3.2.6 installed | `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime` for staleness and window reset | Precedent: `BusDataRepository.test.ts:491` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `standardHeaders: "draft-8"` | `"draft-7"` | Both emit `RateLimit` + `RateLimit-Policy` (D-14). The library README and docs recommend draft-8 as the latest. draft-7 gives a simpler `limit=60, remaining=59, reset=60` string. Use **draft-8**. |
| `express-rate-limit@8.7.1` (latest) | — | Published 2026-10-06T02:04Z, hours before this research. The legitimacy seam flags it `too-new`. Pin 8.7.0. |
| Hand-rolled Map + timer limiter | — | Forbidden by D-09 and the Engineering Principles. It would also miss IPv6 subnet keying and header formatting. |

**Installation (exact command — do NOT use plain `bun install` / `bun add`):**
```bash
~/.proto/tools/bun/1.3.14/bun add express-rate-limit@8.7.0 --minimum-release-age=604800
```
- I verified this in a scratch copy of `package.json` + `bun.lock`. It writes `"express-rate-limit": "8.7.0"` (exact) to `package.json` and updates the tracked text `bun.lock`. With the 7-day release-age gate, the transitive `ip-address` resolves to `10.7.2` (published 2026-09-15) instead of the 5-day-old `10.7.3`. [VERIFIED: scratch run, Bun 1.3.14]
- Side effect: the tracked `bun.lock` currently still records `vitest 2.1.5` while `package.json` says `3.2.6` (a dependabot bump touched only package.json). Bun 1.3.14 reconciles that in the same write, which adds about 95 changed lines of `@vitest/*`. That is correct (it matches what `node_modules` already has), but the commit should mention it. [VERIFIED: diff of scratch bun.lock]
- `package-lock.json` is tracked but already stale (it has no `better-sqlite3`). Do not touch it. [VERIFIED: grep]

**Version verification:** `npm view express-rate-limit version` → `8.7.1` (latest). `8.7.0` time → `2026-08-29T00:49:51.601Z`. No `postinstall` script on `express-rate-limit`, `debug`, or `ip-address`. [VERIFIED: npm registry]

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| express-rate-limit | npm | package ~10 yrs; latest 8.7.1 is <1 day old; recommended 8.7.0 is 5+ weeks old | ~82M/wk | github.com/express-rate-limit/express-rate-limit | [SUS] (reason: `too-new`, which applies to the latest 8.7.1 only) | Flagged. Pin 8.7.0. The planner adds `checkpoint:human-verify` before install. |
| debug (transitive) | npm | ~13 yrs | ~867M/wk | github.com/debug-js/debug | [OK] | Approved |
| ip-address (transitive) | npm | ~12 yrs; latest 10.7.3 is 5 days old | ~117M/wk | github.com/beaugunderson/ip-address | [SUS] (reason: `too-new` on 10.7.3) | Flagged. The `--minimum-release-age=604800` install resolves 10.7.2 instead. Covered by the same checkpoint. |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `express-rate-limit` [WARNING: flagged as suspicious — verify before using.], `ip-address` (transitive) [WARNING: flagged as suspicious — verify before using.]. In both cases the flag is the recency of the *latest* release, not the package. The planner inserts one `checkpoint:human-verify` before the install task.

`express-rate-limit` is named by the user's locked decision D-09 and was confirmed against its official docs (express-rate-limit.mintlify.app) and its published tarball. It is not a WebSearch discovery.

## Architecture Patterns

### System Architecture Diagram

```
                         HTTP request
                              │
                 app.ts: app.set("trust proxy", TRUST_PROXY_HOPS)   ← req.ip = socket IP (hops=0)
                              │                                       or Nth-from-right XFF (hops=N)
                         /api/v1 router
     ┌───────────────┬────────┴────────┬──────────────────────┬────────────────────┐
  /health          /routes /stops    /predictions            /vehicles
     │             /favorites        │  "/" "/nearby" "/stream"  │  "/"
     │             /recents          ▼                         ▼
     │             (never limited)  upstreamRateLimiter (ONE shared MemoryStore bucket, key = ipKeyGenerator(req.ip))
     │                                │ used ≤ 60 ──► set RateLimit + RateLimit-Policy ──► controller ──► service ──► DASH (live)
     │                                │ used > 60 ──► Retry-After + 429 {error,details}
     │                                │               └─ used == 61 ──► logger.warn(key + baseUrl+path, no query)
     ├─ /live  ──► HealthController.getLiveness ──► 200 {status:"ok"}           (no service, no repo, no I/O)
     └─ /ready ──► HealthController.getReadiness ──► HealthService.getReadiness()
                                                    └─► BusDataRepository.getLoadState() (in-memory snapshot)
                                                         lastLoadedAt undefined ──► 503 not_ready/never_loaded
                                                         now-lastLoadedAt > STALE_AFTER_MS (3h5m, revised D-06) ──► 503 not_ready/stale
                                                         else ─────────────────► 200 ready
```

### Recommended Project Structure
```
src/server/
├── api/
│   ├── middleware/
│   │   ├── upstreamRateLimit.ts        # createUpstreamRateLimiter() + shared upstreamRateLimiter instance + constants
│   │   └── upstreamRateLimit.test.ts   # behavior on a minimal express app (fresh instance per test)
│   ├── services/
│   │   ├── HealthService.ts            # createHealthService(repository) → getReadiness(): ReadinessReport; STALE_AFTER_MS
│   │   └── HealthService.test.ts
│   ├── controllers/
│   │   ├── HealthController.ts         # getLiveness, getReadiness (status mapping, Cache-Control)
│   │   └── HealthController.test.ts
│   └── routes/
│       ├── healthRoutes.ts             # GET /live, GET /ready
│       ├── healthRoutes.test.ts        # E2E: probes before load, after load, stale, never call DASH
│       ├── rateLimit.test.ts           # E2E wiring: 4 limited routes share a bucket; unlimited routes never 429
│       ├── index.ts                    # + router.use("/health", healthRoutes)
│       ├── predictionRoutes.ts         # + upstreamRateLimiter on "/", "/stream", "/nearby"
│       └── vehicleRoutes.ts            # + upstreamRateLimiter on "/"
├── config/environment.ts               # + TRUST_PROXY_HOPS → environment.server.trustProxyHops
├── config/environment.test.ts          # + TRUST_PROXY_HOPS cases
├── app.ts                              # + app.set("trust proxy", environment.server.trustProxyHops)
└── test/app.ts                         # mirror the same app.set line so the test app matches app.ts
.env.example                            # + TRUST_PROXY_HOPS=0 with a one-line comment
```

### Pattern 1: Shared upstream limiter (factory + one instance)
**What:** One module owns the constants, the factory, and the single shared instance that both route modules import.
**When to use:** All four D-11 handlers. Never `router.use(...)` and never `app.use(...)` (D-16).
```typescript
// Source: express-rate-limit 8.7.0 dist/index.d.ts (Options, AugmentedRequest, RateLimitInfo) — probed under repo tsconfig
import type { NextFunction, Request, Response } from "express";
import { type AugmentedRequest, type Options, type RateLimitRequestHandler, rateLimit } from "express-rate-limit";
import { logger } from "../../config";

const UPSTREAM_RATE_LIMIT = 60; // requests per window per client IP (D-12)
const UPSTREAM_RATE_WINDOW_MS = 60_000; // 1 minute (D-12)

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function createUpstreamRateLimiter(): RateLimitRequestHandler {
    return rateLimit({
        windowMs: UPSTREAM_RATE_WINDOW_MS,
        limit: UPSTREAM_RATE_LIMIT,
        standardHeaders: "draft-8", // RateLimit + RateLimit-Policy (D-14)
        legacyHeaders: false, // no X-RateLimit-* (D-14)
        // Library validation and store messages go through Winston, message only (Phase 12 D-12).
        logger: {
            warn: (error: unknown): void => {
                logger.warn(`express-rate-limit: ${messageOf(error)}`);
            },
            error: (error: unknown): void => {
                logger.error(`express-rate-limit: ${messageOf(error)}`);
            },
        },
        handler: (req: Request, res: Response, _next: NextFunction, options: Options): void => {
            const { used, key } = (req as AugmentedRequest).rateLimit;
            // MemoryStore keeps counting rejected hits, so exactly one request per key per window sees limit + 1 (D-15).
            if (used === UPSTREAM_RATE_LIMIT + 1) {
                // baseUrl + path, never originalUrl: /predictions/nearby carries rider coordinates in the query.
                logger.warn(`Rate limit exceeded for ${key} on ${req.baseUrl}${req.path}; rejecting until the window resets`);
            }
            res.status(options.statusCode).json({
                error: "Too Many Requests",
                details: "Too many live requests from this client; retry after the Retry-After interval",
            });
        },
    });
}

// The one shared bucket (D-10). Created at module load: express-rate-limit warns if created inside a request handler.
export const upstreamRateLimiter = createUpstreamRateLimiter();
```
Biome's `useNamingConvention` may object to `UPSTREAM_RATE_LIMIT`-style constants. The existing `REFRESH_INTERVAL_MS` and `RETRY_AFTER_SECONDS` already pass lint, so the convention is fine.

### Pattern 2: Liveness — constant, controller-local
```typescript
const getLiveness: RequestHandler = (_req: Request, res: Response): void => {
    res.set("Cache-Control", "no-store");
    res.status(200).json({ status: "ok" });
};
```
No service call is needed. Layering means never *skipping down* a layer, and liveness has nothing below it to call. Express `router.get` also answers `HEAD`, which some LBs use. [CITED: expressjs.com/en/4x/api.html#app.METHOD — `app.get` also matches HEAD]

### Pattern 3: Readiness — pure function of the load-state snapshot
*(Constant and comment updated after the plan-phase revision: revised D-06/D-07. The bare `3 * REFRESH_INTERVAL_MS` first proposed here is superseded.)*
```typescript
// HealthService.ts
import type { BusDataRepository } from "../repositories";
import { REFRESH_INTERVAL_MS } from "./BusDataRefreshService"; // requires adding `export` (behavior-neutral; D-07, Open Question 2 RESOLVED)

// Each refresh is scheduled one REFRESH_INTERVAL_MS after the previous attempt settles, so three bare intervals
// expire just before the third failed refresh starts. The grace absorbs those attempt durations, so readiness
// drops only after three consecutive failed refreshes (revised D-06 / D-07).
const STALE_GRACE_MS = 5 * 60_000;
export const STALE_AFTER_MS = 3 * REFRESH_INTERVAL_MS + STALE_GRACE_MS;

export interface ReadinessReport {
    status: "ready" | "not_ready";
    reason?: "never_loaded" | "stale";
    dataAgeSeconds: number | null;
    lastLoadedAt: string | null;
    lastFailedAt: string | null;
}

export interface HealthService {
    getReadiness(): ReadinessReport;
}

export function createHealthService(repository: BusDataRepository): HealthService {
    function getReadiness(): ReadinessReport {
        const { lastLoadedAt, lastFailedAt } = repository.getLoadState(); // lastError deliberately not read (D-04)
        const failedAt = lastFailedAt?.toISOString() ?? null;
        if (lastLoadedAt === undefined) {
            return { status: "not_ready", reason: "never_loaded", dataAgeSeconds: null, lastLoadedAt: null, lastFailedAt: failedAt };
        }
        const ageMs = Math.max(0, Date.now() - lastLoadedAt.getTime()); // a clock step backwards must not go negative
        const base = { dataAgeSeconds: Math.floor(ageMs / 1000), lastLoadedAt: lastLoadedAt.toISOString(), lastFailedAt: failedAt };
        return ageMs > STALE_AFTER_MS ? { status: "not_ready", reason: "stale", ...base } : { status: "ready", ...base };
    }
    return { getReadiness };
}
```
The controller maps the result: `res.status(report.status === "ready" ? 200 : 503).json(report)` and sets `Cache-Control: no-store`. **Do not** route not-ready through `DataNotReadyError`/`sendErrorResponse`, because that would emit `{ error, details }` + `Retry-After: 5` instead of the D-03 body.

Clock: use `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime(...)`, which is the repo precedent at `BusDataRepository.test.ts:491`. That keeps the factory signature at a single argument, matching `createVehicleService(repository)`.

### Pattern 4: Per-route attachment
```typescript
// predictionRoutes.ts
router.get("/", upstreamRateLimiter, controller.getPredictions);
router.get("/stream", upstreamRateLimiter, streamController.getPredictionsStream);
router.get("/nearby", upstreamRateLimiter, nearbyController.getNearbyPredictions);
// vehicleRoutes.ts
router.get("/", upstreamRateLimiter, controller.getVehiclePositions);
```
Current lines being changed [VERIFIED: src/server/api/routes/predictionRoutes.ts:19-21, vehicleRoutes.ts:11]:
```
router.get("/", controller.getPredictions);
router.get("/stream", streamController.getPredictionsStream);
router.get("/nearby", nearbyController.getNearbyPredictions);
```
```
router.get("/", controller.getVehiclePositions);
```
SSE: the limiter runs once when the request starts, then calls `next()`. It never touches an open stream again, so D-11's "open streams never cut off" holds by construction. The `RateLimit` headers set before the controller's `res.writeHead(200, {...})` (PredictionStreamController.ts:73) are merged into the SSE response by Node.

### Pattern 5: TRUST_PROXY_HOPS env var
Existing schema neighbors [VERIFIED: src/server/config/environment.ts:17-19, 40-42]:
```
    DASH_API_TIMEOUT_MS: z.coerce.number().int().positive().max(2_147_483_647).default(10000),
    // biome-ignore lint/style/useNamingConvention: env vars use SCREAMING_SNAKE_CASE by convention
    PORT: z.coerce.number().int().positive().default(3000),
```
```
    server: {
        port: parsed.data.PORT,
    },
```
Recommended addition (I ran it against zod 3.25.76 this session):
```typescript
    // Hops of trusted reverse proxies in front of the server. 0 ignores X-Forwarded-For entirely, so the rate
    // limit keys on the socket IP and cannot be dodged by a spoofed header (D-17).
    // biome-ignore lint/style/useNamingConvention: env vars use SCREAMING_SNAKE_CASE by convention
    TRUST_PROXY_HOPS: z.string().regex(/^\d+$/, "TRUST_PROXY_HOPS must be a non-negative integer").default("0").transform(Number),
```
and `server: { port: parsed.data.PORT, trustProxyHops: parsed.data.TRUST_PROXY_HOPS }`.

Probe results: `undefined→0`, `"0"→0`, `"1"→1`, and `""`, `" 1"`, `"-1"`, `"1.5"`, `"abc"`, `"true"` all fail. The precedent style `z.coerce.number().int().nonnegative().default(0)` silently turns `""` and `" 1"` into numbers (`""→0`), which breaks the Phase 12 test-matrix convention that "empty fails startup". [VERIFIED: node probe against node_modules/zod]

`app.ts` (after `const app = express();`, before `app.use("/api/v1", router)`): `app.set("trust proxy", environment.server.trustProxyHops);`. Mirror the same line in `src/server/test/app.ts`, which hand-copies `app.ts` [VERIFIED: src/server/test/app.ts:4-11].

### Anti-Patterns to Avoid
- **`router.use(upstreamRateLimiter)` in predictionRoutes or `app.use(limiter)`:** violates D-16 and would also limit future routes added to that router.
- **One limiter per route module:** violates D-10 (separate buckets). Import the single `upstreamRateLimiter` instance.
- **Logging `req.originalUrl` or `req.url`:** both include the query string (rider coordinates). Use `req.baseUrl + req.path`, or log the key alone.
- **`app.set("trust proxy", true)`:** trusts every XFF hop, so the limit is trivially bypassed. express-rate-limit even logs `ERR_ERL_PERMISSIVE_TRUST_PROXY` for it. Integers only.
- **Readiness calling `repository.load()` or DASH:** forbidden by D-05. Readiness is a read-only snapshot.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-IP counting, window reset, headers | Map + setInterval limiter | `express-rate-limit` MemoryStore | Fixed per-client window, unref'd cleanup timer, IETF draft headers, Retry-After computation |
| IPv6 / IPv4-mapped client keys | String keys from `req.ip` | Default `keyGenerator` (`ipKeyGenerator`, /56 default) | `::ffff:1.2.3.4` collapses to `1.2.3.4`; IPv6 is grouped per /56 so a client can't rotate addresses inside its own prefix |
| X-Forwarded-For parsing | Splitting the header manually | Express `trust proxy` (hop count) → `req.ip` via `proxy-addr` | Right-to-left trusted-hop logic is easy to get wrong and easy to spoof |
| Retry-After seconds | Computing from window math | Library sets it on rejection (`ceil((resetTime - now)/1000)`) | Matches the actual per-client reset time |

**Key insight:** The only custom code in the limiter is the 429 body and the once-per-window warn. Everything else is library configuration.

## Common Pitfalls

### Pitfall 1: The 3h threshold fires after TWO failed refreshes, not three
> **RESOLVED by revised D-06 (2026-10-06):** the user chose option (b) below. The threshold is `STALE_AFTER_MS = 3 * REFRESH_INTERVAL_MS + 5 * 60_000` (11_100_000 ms, 3h5m). Data aged exactly 11_100_000 ms is ready and data aged 11_100_001 ms is stale. The analysis below explains why a bare 3h threshold is wrong. Do **not** implement the bare 3h boundary, or a comment saying it expires after two failed refreshes.

**What goes wrong:** D-06/D-07 say "unready only after three refreshes in a row have failed". With the existing scheduler that isn't true.
**Why it happens:** `lastLoadedAt` is stamped inside the successful attempt (`applyData`), and the next attempt is scheduled `REFRESH_INTERVAL_MS` after the current one *settles*. With a success at T0 followed by failures of durations d1 and d2: attempt 1 runs at T0+1h and fails at T0+1h+d1. Attempt 2 runs at T0+2h+d1 and fails at T0+2h+d1+d2. Attempt 3 *starts* at T0+3h+d1+d2. The data turns stale at T0+3h, which is d1+d2 (milliseconds up to about 2×`DASH_API_TIMEOUT_MS` = 20s) **before** the third attempt. If that attempt succeeds, readiness flips back after a short not_ready blip. A probe every 5–10s could catch the blip.
Verified source [VERIFIED: src/server/api/services/BusDataRefreshService.ts:6, 57, 61; BusDataRepository.ts:123-125]:
```
const REFRESH_INTERVAL_MS = 60 * 60_000; // hourly once loaded: DASH route/stop data changes rarely (D-09)
            schedule(REFRESH_INTERVAL_MS);
            const delayMs = hasLoaded ? REFRESH_INTERVAL_MS : computeRetryDelayMs(consecutiveFailures);
```
```
        this.lastLoadedAt = new Date();
        this.lastFailedAt = undefined;
        this.lastError = undefined;
```
**How to avoid:** Either (a) keep exactly `3 * REFRESH_INTERVAL_MS` (locked) and write the comment truthfully ("two consecutive failed refreshes; expires just before the third attempt"), or (b) with user approval, add a grace margin (e.g. `+ 5 * 60_000`), which covers three attempts at up to 100s each so that the third failure is what flips readiness. The user chose (b) with exactly `+ 5 * 60_000` (revised D-06; Open Question 1 RESOLVED). The "one DASH blip never pulls it from rotation" property holds either way.
**Warning signs:** A test that simulates "two failures then success" sees a 503 between them.

### Pitfall 2: `req.rateLimit.current` does not typecheck
**What goes wrong:** The CONTEXT example `req.rateLimit.current === limit + 1` fails `vitest --typecheck` / `tsc`.
**Why:** v8's `RateLimitInfo` is `{ limit, used, remaining, resetTime, key }`. `current` is defined only as a non-enumerable runtime alias. The `Request` type is not augmented either, so cast to the exported `AugmentedRequest`. Verified type [VERIFIED: express-rate-limit 8.7.0 dist/index.d.ts:533-539]:
```
export type RateLimitInfo = {
	limit: number;
	used: number;
	remaining: number;
	resetTime: Date | undefined;
	key: string;
};
```
**How to avoid:** `(req as AugmentedRequest).rateLimit.used === UPSTREAM_RATE_LIMIT + 1`. In the probe this fired exactly once across five requests with `limit: 3`.

### Pitfall 3: Retry-After disappears if headers are disabled
**What goes wrong:** If someone sets `standardHeaders: false` along with `legacyHeaders: false`, the 429 loses `Retry-After` (RATE-01 fails).
**Why:** [VERIFIED: express-rate-limit 8.7.0 dist/index.cjs:1050-1058] `if (totalHits > limit) { if (config.legacyHeaders || config.standardHeaders) { ... setRetryAfterHeader(...) } config.handler(...) }`.
**How to avoid:** Keep `standardHeaders: "draft-8"`, and assert `retry-after` in the 429 test. The custom handler must not set its own Retry-After.

### Pitfall 4: Bucket bleed in tests
**What goes wrong:** The shared `upstreamRateLimiter` is a module-level singleton. Within one test file every supertest request comes from `127.0.0.1` (key `127.0.0.1`; `req.ip` is `::ffff:127.0.0.1`, normalized by the key generator). `predictionRoutes.test.ts` already sends about 30 requests to limited routes, under 60 today but fragile.
**How to avoid:** Vitest isolates modules per file (the repo relies on this; see the `dataNotReady.test.ts:5-7` comment), so separate files never share a bucket. In limiter-behavior tests, build a fresh `createUpstreamRateLimiter()` per test on a minimal express app. In the route-wiring E2E, call `upstreamRateLimiter.resetKey("127.0.0.1")` in `beforeEach` (`resetKey` is on `RateLimitRequestHandler` [VERIFIED: dist/index.d.ts:234-249]), or give each test its own `X-Forwarded-For` IP after `app.set("trust proxy", 1)` on the test app.
**Warning signs:** Unrelated prediction tests start returning 429 after new tests are added to the same file.

### Pitfall 5: Pinned Bun 1.0.31 does not update the tracked lockfile
**What goes wrong:** `bun install` / `bun add` resolves to 1.0.31 through `packageManager` + proto. 1.0.31 ignores the text `bun.lock` and writes `bun.lockb`, which `.gitignore:142` ignores. The commit then ships `package.json` with a dependency that `bun.lock` doesn't contain.
**How to avoid:** Use the exact Bun 1.3.14 command in Standard Stack, then run `git diff --stat bun.lock package.json` and confirm both changed. [VERIFIED: scratch run with both Bun versions]

### Pitfall 6: Path logging inside a sub-router
**What goes wrong:** `req.path` inside `predictionRoutes` is `/` or `/nearby`, without the mount prefix. `req.originalUrl` has the prefix *and* the query string (rider lat/lng).
**How to avoid:** `${req.baseUrl}${req.path}`. In the probe this produced `/api/v1/predictions/` with no query. Assert in a test that the warn line for `/predictions/nearby?lat=..&lng=..` contains neither `lat` nor `lng`.

### Pitfall 7: Fake timers + supertest
**What goes wrong:** `vi.useFakeTimers()` with default `toFake` freezes the socket and HTTP timers supertest needs, so tests hang.
**How to avoid:** `vi.useFakeTimers({ toFake: ["Date"] })` only. MemoryStore resets windows by comparing `Date.now()` (`dist/index.cjs:124`), so `vi.setSystemTime(now + 60_001)` resets the window. In the probe, patching `Date.now` by +60,001ms turned a 429 into a 200. Restore with `vi.useRealTimers()` in `afterEach`.

## Code Examples

### 429 + headers observed in the probe (express-rate-limit 8.7.0, Node 20.20.2, limit 3)
```
1 200 RateLimit: "3-in-1min"; r=2; t=60 | Policy: "3-in-1min"; q=3; w=60; pk=:MTJjYTE3YjQ5YWYy: | Retry-After: undefined
3 200 RateLimit: "3-in-1min"; r=0; t=60 | ...                                                        | Retry-After: undefined
4 429 {"error":"Too Many Requests","details":"slow down"} RateLimit: ...; r=0; t=60                     | Retry-After: 60
logs: [ 'first rejection ip=::ffff:127.0.0.1 path=/api/v1/predictions/' ]   (once, for requests 4 and 5)
other ip via XFF (trust proxy 1): 200 { ip: '203.0.113.9' }
spoofed XFF (trust proxy 0):     429
```
With the production constants, the headers read `RateLimit: "60-in-1min"; r=59; t=60` and `RateLimit-Policy: "60-in-1min"; q=60; w=60; pk=:<hash>:`. Tests should match with a regex (`/^"60-in-1min"; r=\d+; t=\d+$/`), not exact strings, because `t` counts down. [VERIFIED: scratch probe]

### Readiness E2E skeleton (models: dataNotReady.test.ts, dataReload.test.ts)
```typescript
// Before any load: the singleton is pre-load for the whole file (vitest per-file isolation).
const live = await request(app).get("/api/v1/health/live");        // 200 { status: "ok" }
const ready = await request(app).get("/api/v1/health/ready");      // 503 { status: "not_ready", reason: "never_loaded", dataAgeSeconds: null, lastLoadedAt: null, lastFailedAt: null }
// Load via a spied axios.get (or the fake-DASH server in dataReload.test.ts) + BusDataRepository.getInstance().load(), then:
vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(T0); await repo.load();
vi.setSystemTime(T0 + 11_100_000);      // exactly STALE_AFTER_MS (3h5m, revised D-06) → 200 ready, dataAgeSeconds 11100
vi.setSystemTime(T0 + 11_100_000 + 1);  // → 503 stale, dataAgeSeconds 11100, lastLoadedAt ISO
// Assert axios.get was never called by either probe (spy call count unchanged across probe requests).
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `max` option | `limit` option (`max` deprecated alias) | express-rate-limit v7 | Use `limit` |
| `req.rateLimit.current` | `req.rateLimit.used` | v7 (alias kept non-enumerable, untyped) | Use `used` |
| `onLimitReached` callback | Custom `handler` + `used === limit + 1` check | removed in v7 | Detect the first rejection in the handler |
| `X-RateLimit-*` default on | `legacyHeaders: false` + `standardHeaders: "draft-8"` recommended | v7/v8 docs | D-14 |
| `draft_polli_ratelimit_headers` | `standardHeaders: 'draft-6' / 'draft-7' / 'draft-8'` | v7 | n/a |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 60 req/min per IP won't throttle legitimate riders behind a shared NAT (campus or office Wi-Fi, carrier CGNAT) | Rate limiting | Some riders get 429s at peak; the constant would need raising. The value is locked by D-12; this only notes the risk. [ASSUMED] |
| A2 | Express `router.get` handlers also answer `HEAD` probes | Pattern 2 | An LB using HEAD would get 404. Low risk; Express 4 has done this for a long time. [ASSUMED from training; cited doc not fetched this session] |
| A3 | Bun 1.3.14 installing `node_modules` (hoisted linker, since `bun.lock` has `configVersion: 0`) leaves the test suite green | Install | If the linker layout differs, run `bun run test` right after install. [ASSUMED] |

## Open Questions (RESOLVED)

All three were decided at plan-phase on 2026-10-06 and recorded in CONTEXT.md. None is open.

1. **Should the stale threshold get a grace margin so it matches the "three failed refreshes" rationale?** (Pitfall 1)
   - **RESOLVED (revised D-06):** yes. `STALE_AFTER_MS = 3 * REFRESH_INTERVAL_MS + 5 * 60_000` (11_100_000 ms, 3h5m), with a strict `>`. The scheduler is unchanged (D-08). The original recommendation below, to keep a bare 3h, is superseded.
   - What we know: `3 * REFRESH_INTERVAL_MS` expires after two consecutive failures, d1+d2 before the third attempt.
   - What was unclear: whether the user cared about this blip of up to ~20s, or only about the locked "3 hours".
   - Original recommendation (superseded by revised D-06): implement the locked 3h with a truthful comment, and raise the margin option as a confirmation item in the plan. Don't change the scheduler (D-08).
2. **Export `REFRESH_INTERVAL_MS` or duplicate it?**
   - **RESOLVED (revised D-07):** export it. `BusDataRefreshService` gets the `export` keyword on `REFRESH_INTERVAL_MS` as its only edit (D-08), and `STALE_AFTER_MS` is derived from it, so the two values can't drift. The duplicate-literal fallback is not used.
   - What we know: it is a non-exported `const` today. D-07 wants the threshold derived from it. D-08 says the refresh service's behavior is not changed.
3. **Readiness 503 `Retry-After`?**
   - **RESOLVED (D-19):** no `Retry-After` on the readiness 503, and both probes send `Cache-Control: no-store`.
   - Rationale (matches the original recommendation): probes ignore the header, and no single value is truthful for both cases. never_loaded may recover within seconds, while stale may last up to an hour.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | runtime/tests | ✓ | 20.20.2 (project dir via proto) | — |
| Bun (pinned) | `bun run test/lint` scripts | ✓ | 1.0.31 | — |
| Bun (newer, via proto) | updating the tracked text `bun.lock` | ✓ | 1.3.14 at `~/.proto/tools/bun/1.3.14/bun` (1.2.7 also present) | None that updates `bun.lock` correctly |
| npm registry access | install | ✓ | — | — |

**Missing dependencies with no fallback:** none.

## Validation Architecture

(`workflow.nyquist_validation` is `false` in config; this section is included because the orchestrator asked for test strategy.)

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.6 + supertest 7.2.2 |
| Config file | `vitest.config.mts` (setup `src/server/test/setup.ts`; per-file module isolation is the default) |
| Quick run command | `bun run test -- src/server/api/middleware/upstreamRateLimit.test.ts src/server/api/services/HealthService.test.ts` |
| Full suite command | `bun run test:coverage && bun run lint` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HLTH-01 | `/health/live` → 200 `{status:"ok"}` before load and with DASH unreachable; zero `axios.get` calls | E2E | `bun run test -- src/server/api/routes/healthRoutes.test.ts` | ❌ new |
| HLTH-02 | ready/never_loaded/stale bodies and status codes; boundary at exactly `STALE_AFTER_MS` = 11_100_000 ms, 3h5m (ready) vs +1ms (stale), per revised D-06; `lastError` never in body; no upstream call | unit + E2E | `bun run test -- src/server/api/services/HealthService.test.ts src/server/api/routes/healthRoutes.test.ts` | ❌ new |
| HLTH-02 | controller maps ready→200 and not_ready→503 with `Cache-Control: no-store` | unit | `bun run test -- src/server/api/controllers/HealthController.test.ts` | ❌ new |
| RATE-01 | 60 OK then 429 with `{error,details}`, `Retry-After`, `RateLimit`/`RateLimit-Policy`, no `X-RateLimit-*`; different IP unaffected; window reset via fake Date; one warn per key per window without the query string | unit (minimal app) | `bun run test -- src/server/api/middleware/upstreamRateLimit.test.ts` | ❌ new |
| RATE-01 | all four D-11 routes share one bucket (e.g. 30 `/predictions` + 30 `/vehicles` → next `/predictions/nearby` is 429; 61st `/stream` connect is 429) | E2E | `bun run test -- src/server/api/routes/rateLimit.test.ts` | ❌ new |
| RATE-02 | more than 60 requests each to `/routes/all`, `/stops/...`, `/favorites`, `/recents`, `/health/live`, `/health/ready` → never 429, no `ratelimit` header | E2E | same file | ❌ new |
| D-17 | `TRUST_PROXY_HOPS` unset→0, `"1"`→1; `""`/`"-1"`/`"1.5"`/`"abc"`/`"true"` fail startup | unit | `bun run test -- src/server/config/environment.test.ts` | ✅ extend |

### Sampling Rate
- **Per task commit:** quick run for the touched files.
- **Per wave merge / phase gate:** `bun run test:coverage && bun run lint`, all green, 80% thresholds held.

### Wave 0 Gaps
None for infrastructure. All new test files sit alongside existing patterns. The E2E tests for limited routes must stub upstream calls (spy `axios.get` with a rejection, or leave route/stop data unloaded so `/predictions` returns 503) so that no real DASH call is made. The limiter counts every response status, including 4xx and 5xx.

## Security Domain

`security_enforcement: true`, ASVS level 1.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth in this API |
| V3 Session Management | no | — |
| V4 Access Control | no | Probes are intentionally public (D-04 keeps them free of secrets) |
| V5 Input Validation | yes | Zod for `TRUST_PROXY_HOPS` (strict digits); probes take no input |
| V7 Error Handling & Logging | yes | Readiness omits `lastError` (D-04); limiter warn excludes the query string (D-15); library logs go through Winston message-only |
| V11 Business Logic (anti-automation) | yes | express-rate-limit per-IP limiter on live-upstream routes (RATE-01) |
| V14 Configuration | yes | `trust proxy` as an integer hop count, never `true`; default 0 |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| X-Forwarded-For spoofing to evade the limit | Spoofing | `TRUST_PROXY_HOPS=0` default ignores XFF (probe: spoofed XFF still 429). Document that setting hops > 0 without a real proxy re-enables spoofing. |
| Single client exhausting the DASH quota or upstream | DoS | 60/min/IP shared bucket across all DASH-triggering routes, including SSE connects |
| IPv6 address rotation inside one allocation | DoS / Spoofing | Default `ipv6Subnet: 56` keying |
| Upstream error text or secrets leaking via the probe | Information disclosure | Body built only from timestamps; `lastError` never serialized |
| Rider location leaking into logs | Information disclosure | `baseUrl + path` only; test asserts no `lat`/`lng` in the warn line |
| Log flooding from 429s | DoS (log) | One warn per key per window (D-15) |
| Distributed many-IP attack, multi-instance bypass | DoS | Out of scope (no shared store per REQUIREMENTS). Accepted residual risk. |

## Sources

### Primary (HIGH confidence)
- express-rate-limit 8.7.0 npm tarball: `dist/index.d.ts` (Options 362-521, RateLimitInfo 533-539, AugmentedRequest 526-528, RateLimitRequestHandler 234-249) and `dist/index.cjs` (ipKeyGenerator 48-62, MemoryStore 66-150, trustProxy/XFF validations 381-404, Retry-After 1050-1058), read this session
- A scratch probe project with the repo `tsconfig.json`, `@types/express@5.0.0`, `express@4.21.2`, Node 20.20.2: typecheck and runtime output pasted above
- In-repo files read this session: `BusDataRepository.ts`, `BusDataRefreshService.ts`, `app.ts`, `routes/index.ts`, `predictionRoutes.ts`, `vehicleRoutes.ts`, `errorResponse.ts`, `environment.ts`, `environment.test.ts`, `test/app.ts`, `test/setup.ts`, `requireDeviceId.ts`, `dataNotReady.test.ts`, `vitest.config.mts`, `package.json`, `.env.example`, `node_modules/express/lib/utils.js` (compileTrust), `request.js` (req.ip)
- npm registry (`npm view`), and `gsd-tools package-legitimacy check`

### Secondary (MEDIUM confidence)
- https://express-rate-limit.mintlify.app/reference/configuration (draft-8 recommendation, handler signature, Retry-After conditions)
- https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/ (liveness must not depend on backends; readiness removes from rotation without restart)

### Tertiary (LOW confidence)
- None relied upon.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. Version, types, and runtime behavior were probed directly.
- Architecture: HIGH. It mirrors existing route/controller/service/middleware patterns that were read this session.
- Pitfalls: HIGH for 2–7 (verified in source or by probe). HIGH on the mechanics of 1, which follow from the scheduler code. The remedy for 1 was decided by revised D-06 (a 5-minute grace margin).

**Research date:** 2026-10-06
**Valid until:** 2026-11-05 (re-check the express-rate-limit and ip-address release ages at install time)
