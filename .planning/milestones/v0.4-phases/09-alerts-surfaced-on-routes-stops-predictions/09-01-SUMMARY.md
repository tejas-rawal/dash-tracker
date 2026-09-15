---
phase: 06-alerts-surfaced-on-routes-stops-predictions
plan: 01
subsystem: service-alerts-route-embedding
tags: [service-alerts, alerts, routes, factory-di, tracer]
dependency-graph:
  requires: []
  provides:
    - ServiceAlertSummary
    - RouteWithAlerts
    - StopWithAlerts
    - mapToServiceAlertSummary
    - mapToServiceAlertSummaries
    - ServiceAlertRepository.getActiveAlertsForRoute
    - ServiceAlertRepository.getActiveAlertsForStop
  affects:
    - BusRouteService
    - busRoutes.ts DI wiring
tech-stack:
  added: []
  patterns:
    - Dash/domain -> response-shape mapping (mirrors PredictionService.mapToDestinations)
    - Factory-function DI (createBusRouteService now takes 2 repositories)
key-files:
  created:
    - src/server/api/models/ServiceAlertSummary.ts
    - src/server/api/services/serviceAlertMapping.ts
    - src/server/api/services/serviceAlertMapping.test.ts
    - .planning/phases/09-alerts-surfaced-on-routes-stops-predictions/deferred-items.md
  modified:
    - src/server/api/models/index.ts
    - src/server/api/repositories/ServiceAlertRepository.ts
    - src/server/api/repositories/ServiceAlertRepository.test.ts
    - src/server/api/services/BusRouteService.ts
    - src/server/api/services/BusRouteService.test.ts
    - src/server/api/routes/busRoutes.ts
    - src/server/api/routes/busRoutes.test.ts
decisions:
  - "RouteWithAlerts (BusRoute & { alerts }) requires a type-assertion cast at the one construction site (attachAlerts) since spreading a class instance loses its prototype methods; the response is JSON-serialized so this is safe and documented inline."
metrics:
  duration: ~35min
  completed: 2026-09-04
status: complete
actuals:
  tokens: 6872
  tasks: 2
  commits: 2
---

# Phase 9 Plan 01: End-to-end route-alerts embedding Summary

Embedded currently-active `ServiceAlert` data, trimmed to a public `ServiceAlertSummary`, onto `GET /api/v1/routes/all` and `GET /api/v1/routes/:shortName`, proving the model → repository → service → DI-wiring path this phase's Plan 06-02 will reuse for stops.

## What Was Built

**Task 1 (tracer): End-to-end route-alerts embedding**

- `src/server/api/models/ServiceAlertSummary.ts` (new) — `ServiceAlertSummary` interface (`id`, `cause?`, `effect?`, `headerText?`, `descriptionText?`, `activePeriod` — D-01's trimmed shape, omitting `url`/`informedRouteIds`/`informedStopIds`), `RouteWithAlerts` type alias (`BusRoute & { alerts: ServiceAlertSummary[] }`), and `StopWithAlerts` interface (defined now for Plan 06-02 to consume). Re-exported from `src/server/api/models/index.ts`.
- `src/server/api/services/serviceAlertMapping.ts` (new) — `mapToServiceAlertSummary(alert)` and `mapToServiceAlertSummaries(alerts)`, pure functions mirroring `PredictionService.mapToDestinations`'s one-shape-to-another style. Covered by `serviceAlertMapping.test.ts` (4 tests: exact-field-shape, url/informedRouteIds/informedStopIds omission, order preservation, empty-array handling).
- `src/server/api/repositories/ServiceAlertRepository.ts` — added `getActiveAlertsForRoute(routeId, referenceTime?)` and `getActiveAlertsForStop(stopId, referenceTime?)`, both building on the existing `getActiveAlerts()` active-window filter rather than duplicating it. `getActiveAlertsForStop` is defined now (per plan) but has no call site in this plan — Plan 06-02 wires it up. 6 new tests added to `ServiceAlertRepository.test.ts` covering match/exclude/expired/agency-wide-exclusion/order/empty-store behavior.
- `src/server/api/services/BusRouteService.ts` — `createBusRouteService` now takes `(repository, serviceAlertRepository)`; `getAgencyRoutes()`/`getAgencyRoute()` return types changed to `RouteWithAlerts[]`/`RouteWithAlerts` via a new private `attachAlerts(route)` helper that calls `serviceAlertRepository.getActiveAlertsForRoute(route.id)` and maps the result through `mapToServiceAlertSummaries`. `getAgencyStop`/`getAgencyStops`/`getRoutesForStop` are untouched (out of this phase's scope). 7 new/updated tests in `BusRouteService.test.ts`: all 12 pre-existing `createBusRouteService(mockRepo as never)` call sites updated to the 2-arg form via a `makeMockAlertRepo()` helper defaulting to `[]`; the two stale exact-equality assertions updated to expect `alerts: []`; new tests assert `getActiveAlertsForRoute` is called with the route's `id`, the mapped result appears verbatim as `alerts`, and 2+ matching alerts appear as separate, order-preserved entries.
- `src/server/api/routes/busRoutes.ts` — wired `ServiceAlertRepository.getInstance()` as the second argument to `createBusRouteService`.

**Tracer feedback gate:** Task 1's `<verify>` (scoped test run + `bun run build`) was re-run standalone after Task 1's commit per `human_verify_mode: end-of-phase` — passed, so Task 2 proceeded without a checkpoint.

**Task 2: Wiring regression + full-suite verification**

- Added a `describe("DI wiring")` block to `busRoutes.test.ts` asserting `createBusRouteService` is invoked with exactly 2 arguments on module load, locking in the factory-DI prohibition (no direct `ServiceAlertRepository.getInstance()` import inside `BusRouteService`).
- Ran full test suite, lint, and build as the closing gate.

## Verification Results

- `bun run test -- src/server/api/services/BusRouteService.test.ts src/server/api/repositories/ServiceAlertRepository.test.ts src/server/api/services/serviceAlertMapping.test.ts` — 37/37 passed.
- `bun run test` (full suite) — **270/270 passed**, 21 test files.
- `bun run build` — clean, no TypeScript errors.
- `bun run lint` — 1 pre-existing, unrelated error on `.planning/config.json` (see Deviations below); zero errors/new warnings on any file this plan touched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `RouteWithAlerts` spread-object type mismatch**
- **Found during:** Task 1, `bun run build`
- **Issue:** `RouteWithAlerts = BusRoute & { alerts }` intersects a class type; `{ ...route, alerts }` produces a plain object missing `BusRoute`'s prototype methods (`getAllStops`, `getDirectionById`), which `tsc` correctly rejects as not assignable to the intersection type.
- **Fix:** Added a documented `as RouteWithAlerts` cast at the single `attachAlerts` construction site — the response is JSON-serialized, so the class's prototype methods are never invoked on the returned object at runtime.
- **Files modified:** `src/server/api/services/BusRouteService.ts`
- **Commit:** a9a7e83

**2. [Rule 1 - Bug] Biome formatting violations in new test code**
- **Found during:** Task 1, `bun run lint`
- **Issue:** Two new test cases in `ServiceAlertRepository.test.ts` exceeded Biome's 120-char line width in their inline object-literal form.
- **Fix:** Ran `biome check --write` scoped to this plan's file list; Biome reformatted the two lines to its expected multi-line form.
- **Files modified:** `src/server/api/repositories/ServiceAlertRepository.test.ts`, `src/server/api/services/BusRouteService.test.ts` (no-op reformat)
- **Commit:** a9a7e83

### Out-of-Scope Issues (deferred, not fixed)

**`bun run lint` fails on `.planning/config.json` (pre-existing, unrelated).** `biome check .` scans the whole repo (`.planning` is not in `biome.json`'s `files.ignore`), and `.planning/config.json`'s existing formatting doesn't match Biome's JSON formatter output. Confirmed byte-identical to the committed base via `git show HEAD:.planning/config.json` — untouched by this plan, pre-dates Phase 9. Per the SCOPE BOUNDARY rule, out-of-scope pre-existing failures in unrelated files are not auto-fixed. Logged to `.planning/phases/09-alerts-surfaced-on-routes-stops-predictions/deferred-items.md`. All files in this plan's `files_modified` list are individually lint-clean.

## Known Stubs

None. All new code paths (`mapToServiceAlertSummary(ies)`, `getActiveAlertsForRoute`, `attachAlerts`) are fully wired and exercised by both unit tests and the live DI wiring in `busRoutes.ts`.

## Threat Flags

None beyond what the plan's `<threat_model>` already registered (T-06-01 through T-06-03, all `accept`/`mitigate` disposition, no new surface introduced beyond what was planned).

## Self-Check: PASSED

- FOUND: src/server/api/models/ServiceAlertSummary.ts
- FOUND: src/server/api/services/serviceAlertMapping.ts
- FOUND: src/server/api/services/serviceAlertMapping.test.ts
- FOUND: .planning/phases/09-alerts-surfaced-on-routes-stops-predictions/deferred-items.md
- FOUND commit a9a7e83 (Task 1: feat(06-01) embed active service alerts on route responses)
- FOUND commit 0609def (Task 2: test(06-01) lock in 2-arg factory-DI wiring for BusRouteService)
