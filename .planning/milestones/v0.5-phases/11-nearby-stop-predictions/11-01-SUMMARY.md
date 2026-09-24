---
phase: 11-nearby-stop-predictions
plan: 01
subsystem: api
tags: [express, axios, vitest, supertest, swiftly, predictions-near-location, service-alerts]

requires:
  - phase: 09-alerts-surfaced-on-routes-stops-predictions
    provides: ServiceAlertRepository.getActiveAlertsForStop and mapToServiceAlertSummaries
  - phase: 10-solidify-vehicle-position-work
    provides: typeof + Number.isFinite drop-and-warn filter pattern
provides:
  - GET /api/v1/predictions/nearby?lat&lng (nearest-first stops, miles distance, RoutePrediction routes, per-stop alerts, generatedAt)
  - NearbyPredictionService contract with NearbyPredictionOptions { radius, number } (meters via Math.ceil, number forwarded or omitted)
  - Shared predictionMapping module (mapToRoutePrediction, mapToRoutePredictions) used by PredictionService and NearbyPredictionService
  - Nearby Dash*/response types in models/Prediction.ts
affects: [11-02 radius/number HTTP params and 400 caps, future Expo client, NEAR-10 SSE nearby stream]

actuals:
  tokens: 13500
  tasks: 2
  commits: 3
plan_head_before: 59c651a37951a113dc2920cddf3215a82a0940b0

tech-stack:
  added: []
  patterns:
    - "Upstream network errors wrapped as UpstreamApiError from error.message only (never the axios error object, which carries the API key)"
    - "Ordered body-shape guard on an unknown upstream body before per-entry type-guard filtering"
    - "Route E2E tests stub only axios.get via vi.spyOn so the real service/controller/repository run"

key-files:
  created:
    - src/server/api/services/predictionMapping.ts
    - src/server/api/services/predictionMapping.test.ts
    - src/server/api/services/NearbyPredictionService.ts
    - src/server/api/services/NearbyPredictionService.test.ts
    - src/server/api/controllers/NearbyPredictionController.ts
  modified:
    - src/server/api/models/Prediction.ts
    - src/server/api/services/PredictionService.ts
    - src/server/api/routes/predictionRoutes.ts
    - src/server/api/routes/predictionRoutes.test.ts

key-decisions:
  - "Radius converts to upstream meters with Math.ceil(radius * 1609.344), so meters is never 0 and never narrower than requested (0.5 mi -> 805)"
  - "The upstream-call info log names only the path and meters value; rider lat/lng never appear in logs"
  - "Nearby controller has its own strict parseStrictNumber (rejects blank, array, object values); StopController left untouched"

patterns-established:
  - "Pattern: nearby upstream entries are grouped by raw stopId in a Map, first entry wins for stop fields, then stable-sorted by distance"

requirements-completed: [NEAR-01, NEAR-02, NEAR-03, NEAR-04, NEAR-05, NEAR-06, NEAR-07, NEAR-08, NEAR-09]

coverage:
  - id: D1
    description: "GET /api/v1/predictions/nearby returns nearest-first stops (548, 561, 949) with miles distance, RoutePrediction routes without blockId, alerts [] and generatedAt, from one upstream call with lat/lon/meters=805"
    requirement: NEAR-01
    verification:
      - kind: e2e
        ref: "src/server/api/routes/predictionRoutes.test.ts#GET /api/v1/predictions/nearby > returns nearest-first stops with miles distance, routes and alerts from one upstream call"
        status: pass
    human_judgment: false
  - id: D2
    description: "Active alerts from the real ServiceAlertRepository singleton are embedded once per stop"
    requirement: NEAR-06
    verification:
      - kind: e2e
        ref: "src/server/api/routes/predictionRoutes.test.ts#GET /api/v1/predictions/nearby > embeds active alerts from the real ServiceAlertRepository singleton on the matching stop"
        status: pass
      - kind: unit
        ref: "src/server/api/services/NearbyPredictionService.test.ts#alerts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Missing lat/lng returns 400 Bad Request with no upstream call"
    requirement: NEAR-08
    verification:
      - kind: e2e
        ref: "src/server/api/routes/predictionRoutes.test.ts#GET /api/v1/predictions/nearby > responds with 400 without calling upstream when lat is missing"
        status: pass
    human_judgment: false
  - id: D4
    description: "success:false, network errors and malformed bodies return 502 Bad Gateway without leaking DASH_API_KEY; malformed entries are dropped with one warn each"
    requirement: NEAR-09
    verification:
      - kind: unit
        ref: "src/server/api/services/NearbyPredictionService.test.ts#upstream failures"
        status: pass
      - kind: unit
        ref: "src/server/api/services/NearbyPredictionService.test.ts#malformed entries"
        status: pass
      - kind: e2e
        ref: "src/server/api/routes/predictionRoutes.test.ts#GET /api/v1/predictions/nearby > responds with 502 when the upstream request fails at the network level"
        status: pass
    human_judgment: false
  - id: D5
    description: "Service-side radius-to-meters conversion and number forwarding (0.25 -> 403, 1 -> 1610, 0.0001 -> 1, number=3, number omitted by default)"
    requirement: NEAR-02
    verification:
      - kind: unit
        ref: "src/server/api/services/NearbyPredictionService.test.ts#upstream request"
        status: pass
    human_judgment: false
  - id: D6
    description: "Grouping, ordering and distance invariants (stable sort, first-entry-wins, raw stopId equality, empty lists kept, unrounded miles)"
    requirement: NEAR-04
    verification:
      - kind: unit
        ref: "src/server/api/services/NearbyPredictionService.test.ts#grouping and ordering"
        status: pass
    human_judgment: false
  - id: D7
    description: "Shared predictionMapping extracted; PredictionService behavior unchanged"
    requirement: NEAR-05
    verification:
      - kind: unit
        ref: "src/server/api/services/predictionMapping.test.ts"
        status: pass
      - kind: unit
        ref: "src/server/api/services/PredictionService.test.ts (unchanged since b33dc28)"
        status: pass
    human_judgment: false
  - id: D8
    description: "Client disconnect mid-flight leaves no server-side state and no unhandled rejection (backstop truth)"
    verification: []
    human_judgment: true
    rationale: "Marked verification: backstop in the plan; no automated test simulates a client abort during the upstream call"

duration: 5min
completed: 2026-09-24
status: complete
---

# Phase 11 Plan 01: Nearby Stop Predictions Core Summary

**`GET /api/v1/predictions/nearby?lat&lng` is live. It makes one uncached DASH `predictions-near-location` call, groups the flat per-(route, stop) entries into nearest-first stops with unrounded mile distances, attaches each stop's active alerts once, returns 502 on upstream failure without leaking the API key, and drops malformed entries with a warning.**

## Performance

- **Duration:** about 5 min
- **Started:** 2026-09-24T14:54:47Z
- **Completed:** 2026-09-24T14:59:35Z
- **Tasks:** 2
- **Files modified:** 9 (5 created, 4 modified)

## Accomplishments
- New endpoint wired end to end: route, then `NearbyPredictionController` (strict lat/lng checks, 400), then `NearbyPredictionService`, then the shared `predictionMapping` and `ServiceAlertRepository`.
- Closure-private mapping moved out of `PredictionService` into `predictionMapping.ts`. PredictionService behavior is unchanged, and its test suite is untouched and passing.
- Hardened upstream handling:
  - Network errors, a non-object body, `success !== true`, and a non-array `predictionsData` all raise `UpstreamApiError`, which returns 502.
  - `isValidNearbyEntry` drops bad entries with exactly one `logger.warn` each.
- 38 service unit tests, 5 mapping tests and 7 nearby route E2E tests, all built on the verbatim live alexandria-dash sample.

## Task Commits

1. **Task 1: End-to-end nearby predictions (tracer)**: `62195c7` (feat)
2. **Task 2 RED: failing failure-mode, malformed-entry, mapping and route tests**: `69372a7` (test)
3. **Task 2 GREEN: 502 mapping and malformed-entry drop**: `d5f0ed7` (feat)

No REFACTOR commit was needed.

## Files Created/Modified
- `src/server/api/models/Prediction.ts`: adds `DashNearbyPredictionData`, `DashNearbyApiResponse`, `NearbyPredictionOptions`, `NearbyStopPredictions` and `NearbyPredictionsResponse`.
- `src/server/api/services/predictionMapping.ts`: `mapToRoutePrediction` and `mapToRoutePredictions`, with a private `mapToDestinations`.
- `src/server/api/services/PredictionService.ts`: now uses the shared mapping. The type import was trimmed.
- `src/server/api/services/NearbyPredictionService.ts`: URL builder (lat/lon/meters/number), upstream fetch with error wrapping, body guard, entry validation, stop grouping, distance sort and alerts.
- `src/server/api/controllers/NearbyPredictionController.ts`: `parseStrictNumber`/`parseCoordinateParam` for 400s. `UpstreamApiError` maps to 502, anything else to 500.
- `src/server/api/routes/predictionRoutes.ts`: `router.get("/nearby", ...)`, wired with `ServiceAlertRepository.getInstance()`.
- `src/server/api/routes/predictionRoutes.test.ts`: `GET /api/v1/predictions/nearby` describe block, cases (a) to (g).
- `src/server/api/services/NearbyPredictionService.test.ts` and `predictionMapping.test.ts`: new unit suites.

## Decisions Made
- Meters use a ceiling, so 0.5 mi becomes 805, 0.25 becomes 403 and 1 becomes 1610. The upstream search is never 0 m and never smaller than requested.
- The upstream-call log line records only `meters`, never the rider's coordinates (privacy prohibition).
- `agencyKey` is copied from the upstream body as-is. The plan specifies no validation for it.

## Deviations from Plan

**Minor signature choice:** `buildDashApiUrl(lat, lng, meters, number)` takes the already-computed meters instead of the whole options object. This lets the fetch helper compute meters once and log it without repeating the radius defaulting. Behavior matches the plan.

**Test lint hygiene:** the fake axios error's `Authorization` header key in the service test has a `biome-ignore lint/style/useNamingConvention` comment that states why. The `NearbyPredictionService.test.ts` filename warning is left as is. The plan mandates that name, and it matches the repo's existing `PascalCase.test.ts` convention (e.g. `VehicleService.test.ts`, which raises the same warning).

**Total deviations:** 0 auto-fixed under Rules 1-4.
**Impact on plan:** none.

## TDD Gate Compliance
- RED: `69372a7` failed 19 tests against the Task 1 service, all of them unimplemented hardening behaviors (network wrapping, body guards, malformed-entry drop, route cases e to g).
- GREEN: `d5f0ed7` passes all 93 targeted tests.
- REFACTOR: not needed.

## Issues Encountered
- Repo-wide `bun run lint` exits 1 because of a formatting error in the tracked `.superset/config.json`. That file is unchanged since the plan base, and the plan's verification section already documents this. File-scoped `biome check` on every file in this plan exits 0.

## Verification
- `bun run test`: 33 files, 453 tests, all passing, no type errors (baseline was 31 files / 403 tests).
- `bun run test:coverage`: all files at 97.85% statements and 92.29% branches, above the 80% thresholds.
- `bun run build` and `bunx tsc --noEmit -p tsconfig.json` exit 0.
- `git diff --quiet b33dc28` holds for StopController, PredictionController, StopService, PredictionStreamService, VehicleService, VehicleService.test and PredictionService.test.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness
- Plan 11-02 can expose `radius`/`number` over HTTP and add their 400 caps. The service already honors `NearbyPredictionOptions`.

---
*Phase: 11-nearby-stop-predictions*
*Completed: 2026-09-24*

## Self-Check: PASSED
- All 5 created files exist on disk.
- Commits 62195c7, 69372a7 and d5f0ed7 are present in git log.
