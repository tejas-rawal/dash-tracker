# Phase 14: Health Checks & Rate Limiting - Context

**Gathered:** 2026-10-06
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds two probe endpoints:
- A liveness endpoint that says the process is up.
- A readiness endpoint that says whether route/stop data is loaded and fresh enough to serve, and reports the data's age.

It also adds per-client-IP rate limiting (429 + `Retry-After`) on the endpoints that call DASH live. Every in-memory endpoint stays unlimited.

Requirements: HLTH-01, HLTH-02, RATE-01, RATE-02.

The phase only reads Phase 13's load state. It does not change the refresh scheduler, the repository load path, or any rider-facing response other than adding the 429 and the RateLimit headers on limited endpoints.

</domain>

<decisions>
## Implementation Decisions

### Probe endpoints
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

### Staleness
- **D-06:** The staleness threshold is **3 hours**. Data is stale when `now - lastLoadedAt` exceeds 3h. With hourly refreshes, the instance goes unready only after three refreshes in a row have failed, so one DASH blip never pulls it from rotation.
- **D-07:** The threshold is a **named module constant**, not an env var, following 13 D-07. Its comment should tie it to `REFRESH_INTERVAL_MS`, which equals 3 missed refreshes.
- **D-08:** `BusDataRefreshService` is **not changed**. A failed refresh still waits the full hour before retrying (13 D-09/D-10). The user accepted that after the third failure in a row, the instance can stay unready for up to an hour, until the next attempt succeeds.

### Rate limiting
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

### Client IP behind a proxy
- **D-17:** Add a new Zod-validated env var, **`TRUST_PROXY_HOPS`**: a non-negative integer, default `0`. Apply it with `app.set("trust proxy", hops)` in `app.ts`. With the default of 0, `X-Forwarded-For` is ignored and the socket IP is the key, so the limit can't be dodged by spoofing the header. Behind a single LB or PaaS proxy, operators set it to 1. An invalid value fails startup the same way the other env vars do. Document the variable wherever the other env vars are documented.
- **D-18:** The deployment target is **not decided yet**. Keep everything deployment-agnostic.

### Claude's Discretion
- The shared limiter's module name and location (e.g. `src/server/api/middleware/upstreamRateLimit.ts`). Prefer a `createUpstreamRateLimiter()` factory, with one shared instance wired into both `predictionRoutes.ts` and `vehicleRoutes.ts`, so tests can build fresh instances without bucket bleed.
- How to detect "first rejection in the window" for D-15. For example, inside the custom handler, `req.rateLimit.current === limit + 1`.
- Whether the readiness 503 also sends `Retry-After`, and whether either probe sets `Cache-Control: no-store`.
- How `dataAgeSeconds` is rounded (floor to whole seconds is fine), and whether the health service takes an injected clock or the tests use `vi.useFakeTimers()`.
- How the readiness logic is split between the health service and the controller. Factory DI still applies: inject `BusDataRepository` and never import the singleton inside the service.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` § Phase 14: goal and the 4 success criteria
- `.planning/REQUIREMENTS.md`: HLTH-01, HLTH-02, RATE-01, RATE-02, and the Out of Scope table (no Redis or shared store, no metrics/APM)

### Prior decisions this phase builds on
- `.planning/phases/13-resilient-route-stop-data-lifecycle/13-CONTEXT.md`: D-07 (constants, not env), D-09/D-10 (hourly chained refresh), D-13 (failed refresh shows only through readiness), D-14/D-16 (`getLoadState()` snapshot, where ready means `lastLoadedAt` is defined)
- `.planning/phases/12-bounded-upstream-calls-error-safety-nets/12-CONTEXT.md`: message-only error and secret-safe logging rules, and how env vars are added with Zod (`DASH_API_TIMEOUT_MS` precedent)

### Project rules
- `.claude/CLAUDE.md`: layering, factory DI, Engineering Principles (established libraries, no compatibility layers), and logging rules

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `BusDataRepository.getLoadState()` (`src/server/api/repositories/BusDataRepository.ts`, around line 103): returns a defensive copy of `{ lastLoadedAt?, lastFailedAt?, lastError? }`. This is the only input readiness needs.
- `sendErrorResponse` (`src/server/api/controllers/errorResponse.ts`): this is where the `{ error, details }` body shape and the `Retry-After` precedent come from. The 429 handler should match that shape. It doesn't have to go through this helper, because the limiter answers before any controller runs.
- `REFRESH_INTERVAL_MS` (`src/server/api/services/BusDataRefreshService.ts`): the staleness threshold is defined relative to it.
- `src/server/config/environment.ts`: the Zod schema and `environment` object, where `TRUST_PROXY_HOPS` goes (`environment.server.trustProxyHops`).

### Established Patterns
- Route modules build their service and controller at module load from repository singletons, then export a default `Router` (see `predictionRoutes.ts`, `vehicleRoutes.ts`).
- The existing middleware (`src/server/api/middleware/requireDeviceId.ts`) is a per-route Express middleware, which is the model for attaching the limiter per route.
- Tests are co-located, and route-level E2E tests (`dataNotReady.test.ts`, `dataBootRetry.test.ts`) drive real HTTP through the router. These are good models for readiness 200/503 and for proving that 429s are per IP and never hit unlimited endpoints.

### Integration Points
- `src/server/api/routes/index.ts`: add `router.use("/health", healthRoutes)`.
- `src/server/api/routes/predictionRoutes.ts` and `vehicleRoutes.ts`: put the shared limiter in front of the four GET handlers in D-11.
- `src/server/app.ts`: call `app.set("trust proxy", environment.server.trustProxyHops)` before the routers are mounted.
- `package.json`: add the `express-rate-limit` dependency with `bun install`.

</code_context>

<specifics>
## Specific Ideas

- Liveness must be trivially constant, and it must keep answering 200 throughout a DASH outage and before the first load.
- The 429 body and the readiness body should look like they belong to the existing API: the `{ error, details }` error shape and camelCase fields.

</specifics>

<deferred>
## Deferred Ideas

- Retrying sooner after a failed post-load refresh, for example by backing off instead of waiting the full hour. This was considered and rejected for this phase (D-08). If readiness flapping turns out to matter in practice, it would be a change to the Phase 13 scheduler.
- Alert-poll freshness in readiness, whether informational or gating. This was rejected for this phase (D-05).

</deferred>

---

*Phase: 14-health-checks-rate-limiting*
*Context gathered: 2026-10-06*
