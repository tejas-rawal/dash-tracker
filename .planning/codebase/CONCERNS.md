# Codebase Concerns

**Analysis Date:** 2026-08-20

## Tech Debt

**Performance bottleneck in `getRoutesForStop`:**
- Issue: The method in `src/server/api/repositories/BusDataRepository.ts` (lines 259-266) performs a full scan through all routes with nested `filter()` and `some()` operations on every call. With hundreds of routes and stops, this becomes O(n²) complexity.
- Files: `src/server/api/repositories/BusDataRepository.ts`, `src/server/api/services/BusRouteService.ts`
- Impact: Response time for queries like "which routes serve this stop?" degrades linearly with dataset size. No caching means repeated calls pay full cost.
- Fix approach: During repository initialization, build an index map `Map<stopId, BusRoute[]>` alongside existing maps. Update `getRoutesForStop` to return `this.routesByStop.get(stopId) ?? []` in O(1) time.

**Missing API request timeout configuration:**
- Issue: Axios instance in `src/server/config/axios.ts` (line 7) lacks a timeout setting. Network requests to DASH API have no maximum duration.
- Files: `src/server/config/axios.ts`
- Impact: If DASH API becomes unresponsive, application requests hang indefinitely, exhausting Node.js event loop and connection pools. Startup initialization can hang forever if API is down.
- Fix approach: Add `timeout: 5000` (or appropriate value) to axios create options. Implement retry logic with exponential backoff for startup failures.

**Test coverage exclusion of critical paths:**
- Issue: `vitest.config.mts` (lines 16-17) excludes `src/server/app.ts` and `src/server/config/**` from coverage calculations. These files handle startup, error initialization, and environment validation.
- Files: `vitest.config.mts`, `src/server/app.ts`, `src/server/config/`
- Impact: No coverage tracking for initialization logic, config parsing, or error handling during startup. Silent failures in env var validation or repository initialization won't be caught by tests.
- Fix approach: Add integration tests for app startup scenarios (missing env vars, API unavailable at startup, successful initialization). Include config files in coverage or mark specific lines as tested via documentation.

**Unvalidated API response deserialization:**
- Issue: `src/server/api/services/PredictionService.ts` (line 46) casts `response.data` to `DashApiResponse` without runtime validation. If DASH API response structure changes, type safety is violated at runtime.
- Files: `src/server/api/services/PredictionService.ts`
- Impact: Invalid API responses are passed through without error. Consumers receive malformed data (missing fields, wrong types). Difficult to diagnose — errors appear downstream when accessing undefined properties.
- Fix approach: Use a Zod schema to parse and validate `response.data` before type assertion. Wrap in try/catch and throw `UpstreamApiError` on schema violation.

## Known Limitations

**Application startup dependency on external API:**
- Problem: `src/server/app.ts` (lines 20-26) calls `repository.initialize()` which immediately fetches data from DASH API. If the API is unavailable or slow at startup, the server won't accept requests for an indefinite period.
- Files: `src/server/app.ts`, `src/server/api/repositories/BusDataRepository.ts`
- Current mitigation: Application crashes after initialization timeout (handled implicitly by Promise rejection).
- Recommendations: Implement optional startup modes: (1) Fail-fast on API unavailability (current), (2) Start with cached data from previous run, (3) Start with empty data and retry initialization asynchronously in background with health check endpoints.

**No caching or request deduplication for predictions:**
- Problem: Each request to `/api/v1/predictions?stop=X` hits the DASH API. No in-memory cache exists for recent predictions. Identical requests within seconds requery the upstream API.
- Files: `src/server/api/services/PredictionService.ts`, `src/server/api/controllers/PredictionController.ts`
- Current mitigation: None — relied on upstream rate limiting and response time.
- Recommendations: Add in-memory TTL cache (e.g., 30-60 seconds) for prediction responses by stop ID. Cache invalidation on manual refresh or time expiry.

**Logging lacks production readiness:**
- Problem: `src/server/config/logger.ts` uses Winston but with basic console transport and simple format. No log rotation, no structured logging, no request correlation IDs.
- Files: `src/server/config/logger.ts`
- Current mitigation: Logs are readable in development; production deployments have no persistent logging or structured format for aggregation.
- Recommendations: Implement structured logging (JSON format), add request ID middleware to correlate logs across service calls, configure file or cloud transport for production, set appropriate log levels per environment.

**Global service initialization in route modules:**
- Problem: `src/server/api/routes/busRoutes.ts` and `src/server/api/routes/predictionRoutes.ts` create service instances at module load time. Dependency injection happens at import time, making these routes difficult to test with alternative dependencies.
- Files: `src/server/api/routes/busRoutes.ts`, `src/server/api/routes/predictionRoutes.ts`
- Current mitigation: Tests work around this by mocking the config/repository at setup time.
- Recommendations: Pass dependencies as route factory parameters or middleware. Consider route factory functions that accept dependencies instead of relying on module-level initialization.

## Security Considerations

**Error response information disclosure:**
- Risk: Controllers return full error details to clients (see `resolveErrorBody` in `src/server/api/controllers/PredictionController.ts` lines 27-38). Internal error messages, API failures, and system state are exposed in HTTP responses.
- Files: `src/server/api/controllers/PredictionController.ts`, `src/server/api/controllers/BusRouteController.ts`
- Current mitigation: Only non-sensitive errors are thrown (NotFoundError, UpstreamApiError). Application doesn't use error messages containing credentials or paths.
- Recommendations: In production, sanitize error details. Return generic "Request Failed" for 5xx errors. Log full error details server-side for debugging. Return error codes instead of messages.

**Missing rate limiting:**
- Risk: No rate limiting on API endpoints. A malicious client can flood `/api/v1/predictions` or `/api/v1/routes/all` with requests, exhausting server resources or upstream API quota.
- Files: All route handlers in `src/server/api/routes/`
- Current mitigation: Express middleware default limits exist but are not explicitly configured.
- Recommendations: Add rate limiting middleware (e.g., express-rate-limit) with per-IP or per-API-key limits. Configure upstream API rate limit awareness.

**API Key in Authorization header without protection:**
- Risk: DASH API key is added to all axios requests in `src/server/config/axios.ts` (line 8). If logs or error responses include request headers, the key is exposed.
- Files: `src/server/config/axios.ts`, `src/server/config/logger.ts`
- Current mitigation: Logger doesn't capture request/response headers by default. Application runs in trusted environment (internal deployment).
- Recommendations: Ensure logger never logs Axios request/response headers. Add request sanitization middleware to strip Authorization from access logs. Consider API key rotation policy.

## Performance Bottlenecks

**Linear scan in getRoutesForStop:**
- Problem: Every call to `repository.getRoutesForStop(stopId)` scans all routes and filters for matching directions. With N routes, M directions per route, and K stops per direction, this is O(N×M×K) per call.
- Files: `src/server/api/repositories/BusDataRepository.ts:259-266`
- Cause: Routes are indexed by ID and short name, but not by stops they serve. A reverse index is missing.
- Improvement path: Build `Map<stopId, Set<routeId>>` during `fetchAndProcessData`. Query time drops to O(log n) for Set lookup.

**Repeated data fetching on each request:**
- Problem: Predictions API calls go to upstream DASH API synchronously for every `/api/v1/predictions` request. No caching layer.
- Files: `src/server/api/services/PredictionService.ts:42-47`
- Cause: In-memory cache not implemented. Predictions are real-time data, so TTL cache might not fit all use cases.
- Improvement path: Add optional Redis or in-memory cache layer with configurable TTL. Allow callers to opt in to cached responses via query parameter. Monitor cache hit rates.

## Fragile Areas

**Data initialization with no fallback:**
- Files: `src/server/app.ts`, `src/server/api/repositories/BusDataRepository.ts`
- Why fragile: Entire application depends on successful initial data load. Any transient network error during startup crashes the process.
- Safe modification: Test startup scenarios with API failures using integration tests. Implement retry loop with exponential backoff in `initialize()`. Add health check endpoint to detect stale data.
- Test coverage: Covered by unit tests for BusDataRepository.initialize() error paths, but integration test missing for full app startup failure recovery.

**Complex stop deduplication logic in repository:**
- Files: `src/server/api/repositories/BusDataRepository.ts:142-163`
- Why fragile: Stops are deduplicated across directions using `stagingStops.get()` and `stagingStops.set()`. If a stop appears in multiple routes with slightly different data (e.g., different lat/lon due to rounding), only first occurrence is used.
- Safe modification: Validate that all occurrences of a stop have identical metadata (code, lat, lon). Throw on mismatch. Add warning log for near-duplicates.
- Test coverage: Tests cover happy path but not data inconsistency scenarios (same stop ID with different coordinates).

**Single repository instance accessed from global state:**
- Files: `src/server/api/repositories/BusDataRepository.ts:37-47`
- Why fragile: Tests must reset `BusDataRepository.instance` using `@ts-expect-error` in beforeEach/afterEach. If a test forgets cleanup, state bleeds into other tests.
- Safe modification: Replace singleton with dependency injection throughout. Consider factory pattern without static state.
- Test coverage: Tests explicitly reset singleton (lines 59, 65 in BusDataRepository.test.ts), but this is fragile.

## Scaling Limits

**In-memory data structures with no distribution:**
- Current capacity: All routes and stops held in memory. For a large transit agency (1000+ routes, 100k+ stops), memory usage is in hundreds of MB range.
- Limit: Node.js process memory limit (typically 2GB) reached before distributing to multiple servers.
- Scaling path: Migrate to database backend (PostgreSQL with geospatial indexing). Implement caching layer (Redis) for predictions. Horizontally scale stateless API servers.

**Single repository initialization on startup:**
- Current capacity: Synchronous fetch and processing. Typical response time 5-30 seconds depending on API latency.
- Limit: Application unavailable during initialization. Large datasets take long to process. Cannot accept requests during reload/refresh.
- Scaling path: Implement async data refresh in background without blocking requests. Use event-driven updates from upstream API webhooks if available. Pre-warm cache with data snapshots.

## Test Coverage Gaps

**App startup and initialization logic:**
- What's not tested: `src/server/app.ts` (entry point) and error handling when repository fails to initialize.
- Files: `src/server/app.ts`
- Risk: If environment is misconfigured or API is unavailable, startup failure mode is untested. Changes to error handling or graceful shutdown can break silently.
- Priority: High — startup failure is catastrophic.

**Configuration and environment validation:**
- What's not tested: `src/server/config/environment.ts` and `src/server/config/axios.ts` edge cases (missing vars, invalid values, axios request errors).
- Files: `src/server/config/environment.ts`, `src/server/config/axios.ts`
- Risk: Invalid config is caught at runtime, but error message format and error recovery paths are untested.
- Priority: Medium — can be caught by integration tests.

**Route handler error paths:**
- What's not tested: Some error scenarios in route handlers, e.g., service exceptions that don't match known error types.
- Files: `src/server/api/routes/busRoutes.ts`, `src/server/api/routes/predictionRoutes.ts`
- Risk: Unexpected exceptions propagate unhandled or return 500 with raw error details.
- Priority: Medium — can be addressed by route-level error middleware tests.

**Graceful shutdown and signal handling:**
- What's not tested: `src/server/app.ts` SIGTERM/SIGINT handlers and server.close() behavior.
- Files: `src/server/app.ts` (lines 27-36)
- Risk: Long-running requests may not drain before process exit. Connection cleanup untested.
- Priority: Low — depends on hosting environment; many deployments handle SIGTERM externally.

---

*Concerns audit: 2026-08-20*
