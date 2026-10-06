---
phase: 14-health-checks-rate-limiting
plan: 01
subsystem: api
tags: [express, health-check, liveness, readiness, vitest, supertest]

# Dependency graph
requires:
  - phase: 13-resilient-route-stop-data-lifecycle
    provides: "BusDataRepository.getLoadState() snapshot (lastLoadedAt/lastFailedAt/lastError) and the chained hourly BusDataRefreshService"
provides:
  - "GET/HEAD /api/v1/health/live: constant 200 {status:'ok'}, Cache-Control: no-store"
  - "GET/HEAD /api/v1/health/ready: 200 ready / 503 never_loaded|stale with dataAgeSeconds, lastLoadedAt, lastFailedAt; no Retry-After"
  - "STALE_AFTER_MS = 3 * REFRESH_INTERVAL_MS + 5 min (11_100_000 ms) exported from HealthService"
  - "REFRESH_INTERVAL_MS exported from BusDataRefreshService (export only)"
affects: [14-02, 14-03, rate-limiting, deployment-probes]

# Actuals (#2632)
actuals:
  tokens: 6936
  tasks: 3
  commits: 5
plan_head_before: bdff1bd23288904497dcafa35d277758d1914e94

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Probe controllers bypass sendErrorResponse: they set headers and the status code directly so the readiness 503 has its own body and no Retry-After"
    - "Readiness is a pure synchronous function of one getLoadState() snapshot plus Date.now()"

key-files:
  created:
    - src/server/api/services/HealthService.ts
    - src/server/api/services/HealthService.test.ts
    - src/server/api/controllers/HealthController.ts
    - src/server/api/controllers/HealthController.test.ts
    - src/server/api/routes/healthRoutes.ts
    - src/server/api/routes/healthRoutes.test.ts
  modified:
    - src/server/api/routes/index.ts
    - src/server/api/services/BusDataRefreshService.ts

key-decisions:
  - "ReadinessReport stays in HealthService.ts, following the NearbyPredictionService precedent for service-local types; there is no models/Health.ts"
  - "dataAgeSeconds is Math.floor(ageMs / 1000), with ageMs clamped at 0 when the clock steps backwards"
  - "The stale comparison is strict (ageMs > STALE_AFTER_MS), so data exactly at the threshold still reads as ready"
  - "The clock is controlled in tests with vi.useFakeTimers({ toFake: ['Date'] }) rather than injected, so createHealthService keeps a single repository argument"

patterns-established:
  - "Health probes: routes -> controller -> service with factory DI, and healthRoutes.ts as the only composition root"
  - "Per-file singleton ordering in E2E: pre-load describe first, then describes that load data"

requirements-completed: [HLTH-01, HLTH-02]

coverage:
  - id: D1
    description: "GET/HEAD /api/v1/health/live answers 200 {status:'ok'} with Cache-Control: no-store before load, after a failed first load, after load and under 20 concurrent requests, without calling DASH"
    requirement: HLTH-01
    verification:
      - kind: integration
        ref: "src/server/api/routes/healthRoutes.test.ts#GET /api/v1/health/live answers 200 ok before any route/stop load and makes no DASH call"
        status: pass
      - kind: integration
        ref: "src/server/api/routes/healthRoutes.test.ts#HEAD /api/v1/health/live answers 200"
        status: pass
      - kind: integration
        ref: "src/server/api/routes/healthRoutes.test.ts#GET /api/v1/health/live still answers 200 ok after a failed first load while DASH is down"
        status: pass
      - kind: integration
        ref: "src/server/api/routes/healthRoutes.test.ts#20 concurrent GET /api/v1/health/live requests all answer 200 ok without calling DASH"
        status: pass
      - kind: unit
        ref: "src/server/api/controllers/HealthController.test.ts#getLiveness"
        status: pass
    human_judgment: false
  - id: D2
    description: "GET /api/v1/health/ready answers 503 never_loaded before the first load (with lastFailedAt after a failed load), 200 ready with the floored data age once loaded, and 503 stale once data is older than 11_100_000 ms. It sends Cache-Control: no-store, no Retry-After, and no upstream error text"
    requirement: HLTH-02
    verification:
      - kind: integration
        ref: "src/server/api/routes/healthRoutes.test.ts#GET /api/v1/health/ready answers 503 never_loaded with null age and timestamps before any load attempt"
        status: pass
      - kind: integration
        ref: "src/server/api/routes/healthRoutes.test.ts#GET /api/v1/health/ready stays never_loaded and reports lastFailedAt after a failed first load"
        status: pass
      - kind: integration
        ref: "src/server/api/routes/healthRoutes.test.ts#GET /api/v1/health/ready answers 200 ready with the data age and never calls DASH"
        status: pass
      - kind: integration
        ref: "src/server/api/routes/healthRoutes.test.ts#GET /api/v1/health/ready stays 200 at exactly the staleness threshold and turns 503 stale one millisecond later"
        status: pass
      - kind: integration
        ref: "src/server/api/routes/healthRoutes.test.ts#GET /api/v1/health/ready stays 200 ready with the original lastLoadedAt after a failed refresh"
        status: pass
      - kind: unit
        ref: "src/server/api/services/HealthService.test.ts (15 cases: threshold constant, boundary, precision, clock skew, failed refresh, one snapshot per call)"
        status: pass
      - kind: unit
        ref: "src/server/api/controllers/HealthController.test.ts#getReadiness"
        status: pass
    human_judgment: false
  - id: D3
    description: "REFRESH_INTERVAL_MS is exported with no change to the refresh schedule (numstat vs 1e20618 is exactly 1 insertion and 1 deletion)"
    verification:
      - kind: other
        ref: "git diff --numstat 1e20618 -- src/server/api/services/BusDataRefreshService.ts -> '1 1'"
        status: pass
      - kind: unit
        ref: "src/server/api/services/BusDataRefreshService.test.ts (25 cases, unchanged)"
        status: pass
    human_judgment: false

# Metrics
duration: 4min
completed: 2026-10-06
status: complete
---

# Phase 14 Plan 01: Health Probes Summary

**Two in-memory probes: `GET /api/v1/health/live` always answers 200 `{status:"ok"}`, and `GET /api/v1/health/ready` answers 200 with the data age, 503 `never_loaded` before the first load, or 503 `stale` past 3 refresh intervals plus 5 minutes. Both send `Cache-Control: no-store`, neither ever calls DASH, and the readiness body never carries upstream error text.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-10-06T18:34:17Z
- **Completed:** 2026-10-06T18:38:31Z
- **Tasks:** 3
- **Files modified:** 8 (6 created, 2 modified)

## Accomplishments
- Readiness (HLTH-02) is built as `HealthService` → `HealthController` → `healthRoutes` and mounted at `/api/v1/health`. It answers `never_loaded`, `stale` or `ready`, and always reports `dataAgeSeconds`, `lastLoadedAt` and `lastFailedAt`.
- The staleness threshold is `STALE_AFTER_MS = 3 * REFRESH_INTERVAL_MS + STALE_GRACE_MS` (11_100_000 ms), derived from the newly exported `REFRESH_INTERVAL_MS` so the two cannot drift apart. Readiness therefore drops only after three refreshes in a row have failed.
- Liveness (HLTH-01) is a constant 200 that never reads the service, the repository or DASH. Express serves HEAD on both probes from the GET routes.
- Tests: 32 cases across 3 new files (unit plus real-app E2E). The full suite passes 702/702, and line coverage across all files is 98.73%.

## Task Commits

1. **Task 1 (tracer): readiness end to end, never_loaded and ready** - `0e84fce` (feat)
2. **Task 2: staleness threshold**
   - RED `d02ccb0` (test): 4 target cases failed on assertions, verified RED_EVIDENCE_OK
   - GREEN `9ea0984` (feat)
3. **Task 3: liveness**
   - RED `086b7ee` (test): the handler-shape and getLiveness cases failed, verified RED_EVIDENCE_OK
   - GREEN `a2c5647` (feat)

No REFACTOR commits were made, because no cleanup was needed.

## TDD Gate Compliance

- Task 2: the RED commit `d02ccb0` comes before the GREEN commit `9ea0984`.
  - `check tdd-red-evidence` returned RED_EVIDENCE_OK.
  - Target: "STALE_AFTER_MS is three refresh intervals plus a five-minute grace", failing with `expected undefined to be 3600000`.
  - The 3 stale cases also failed with `expected {status:'ready'} to deeply equal {status:'not_ready'…}`.
- Task 3: the RED commit `086b7ee` comes before the GREEN commit `a2c5647`.
  - `check tdd-red-evidence` returned RED_EVIDENCE_OK.
  - Target: "exposes a liveness and a readiness handler", failing with `expected ['getReadiness'] to deeply equal ['getLiveness','getReadiness']`.
- Evidence note: vitest's `tap-flat` reporter has no node:test `# tests/# pass/# fail` footer. For each record I appended that footer, computing the counts from the run's own `ok`/`not ok` lines. No values were made up.

## Files Created/Modified
- `src/server/api/services/HealthService.ts`: `ReadinessReport`, `HealthService`, `createHealthService(repository)`, `STALE_AFTER_MS`. It reads exactly one `getLoadState()` snapshot per call and never reads `lastError`.
- `src/server/api/controllers/HealthController.ts`: synchronous `getLiveness` and `getReadiness`. Both send `Cache-Control: no-store`. Readiness maps ready to 200 and not_ready to 503.
- `src/server/api/routes/healthRoutes.ts`: the composition root, `createHealthService(BusDataRepository.getInstance())`, with `GET /live` and `GET /ready`.
- `src/server/api/routes/index.ts`: imports healthRoutes and adds `router.use("/health", healthRoutes);`.
- `src/server/api/services/BusDataRefreshService.ts`: `export` added to `REFRESH_INTERVAL_MS`. Nothing else changed.
- `src/server/api/services/HealthService.test.ts`: Date-only fake-timer unit matrix (boundary, precision, clock skew, failed refresh, lastError omission, one snapshot per call).
- `src/server/api/controllers/HealthController.test.ts`: status mapping, header assertions, liveness never reading the service, and no Retry-After.
- `src/server/api/routes/healthRoutes.test.ts`: real-app E2E for pre-load, failed first load, ready, the stale boundary, failed refresh, liveness, HEAD and concurrency. The DASH call count stays the same on every probe.

## Decisions Made
- `ReadinessReport` is defined inside `HealthService.ts`, not in a models file, which keeps the tracer to 5 files as the plan chose.
- Task 3's RED step includes an extra contract test, "exposes a liveness and a readiness handler". It makes the RED target fail on an assertion rather than a `TypeError: getLiveness is not a function`, which gives valid intentional-RED evidence.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Biome format error in HealthController.test.ts from the RED commit**
- **Found during:** Task 3 (`bun run lint` in the GREEN verification)
- **Issue:** One `it.each` row went past 120 characters. It slipped into RED commit `086b7ee` because the per-file Biome output was piped through `tail` and the error line was hidden.
- **Fix:** Ran `biome format --write` on the file. Formatting only, no change to the test's logic.
- **Files modified:** src/server/api/controllers/HealthController.test.ts
- **Verification:** `bun run lint` exits 0, and the 8 controller tests still pass.
- **Committed in:** `a2c5647` (Task 3 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug, formatting only)
**Impact on plan:** None. The behavior and file set are exactly as planned.

## Issues Encountered
- `bun run lint` reports 36 warnings, all from before this plan: `useFilenamingConvention` on PascalCase files and unused suppressions in other files. The new `HealthService.test.ts` and `HealthController.test.ts` get the same filename warning as every existing `PascalCase.test.ts`. These are warnings, not errors, and are out of scope.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness
- 14-02 and 14-03 (rate limiting) can attach the limiter per handler. The health routes must stay unlimited (D-16), and `healthRoutes.ts` has no limiter.
- `src/server/app.ts` is unchanged (verified against `1e20618`).

## Self-Check: PASSED
- All 6 created files exist, and both modified files carry the planned edits.
- Commits `0e84fce`, `d02ccb0`, `9ea0984`, `086b7ee` and `a2c5647` are all in `git log`.
- Every acceptance criterion for Tasks 1-3 passes.
- Plan-level checks pass: 3 new test files (32 tests), `bun run test:coverage` (702/702, thresholds met), `tsc --noEmit`, `bun run lint`, `bun run build`, and numstat `1 1`.

---
*Phase: 14-health-checks-rate-limiting*
*Completed: 2026-10-06*
