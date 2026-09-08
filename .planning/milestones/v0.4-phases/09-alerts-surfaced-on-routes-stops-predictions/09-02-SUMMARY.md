---
phase: 06-alerts-surfaced-on-routes-stops-predictions
plan: 02
subsystem: service-alerts-stop-embedding
tags: [service-alerts, alerts, stops, factory-di]
dependency-graph:
  requires:
    - ServiceAlertSummary
    - StopWithAlerts
    - mapToServiceAlertSummaries
    - ServiceAlertRepository.getActiveAlertsForStop
  provides:
    - StopService.getStopsForRoute (embeds alerts)
    - StopService.getNearbyStops (embeds alerts)
  affects:
    - busRoutes.ts DI wiring (stopService instantiation)
    - stopRoutes.ts DI wiring
tech-stack:
  added: []
  patterns:
    - Dash/domain -> response-shape mapping (mirrors mapToServiceAlertSummaries from 06-01)
    - Factory-function DI (createStopService now takes 2 repositories)
key-files:
  created: []
  modified:
    - src/server/api/repositories/ServiceAlertRepository.test.ts
    - src/server/api/models/StopDiscovery.ts
    - src/server/api/services/StopService.ts
    - src/server/api/services/StopService.test.ts
    - src/server/api/routes/busRoutes.ts
    - src/server/api/routes/busRoutes.test.ts
    - src/server/api/routes/stopRoutes.ts
    - src/server/api/routes/stopRoutes.test.ts
decisions:
  - "attachStopAlerts in StopService.ts uses explicit field picks (id/name/code/lat/lon/alerts) rather than spreading the BusStop class instance, matching the existing getNearbyStops style and avoiding the RouteWithAlerts spread-cast workaround from 06-01."
metrics:
  duration: ~25min
  completed: 2026-09-04
status: complete
actuals:
  tokens: 7860
  tasks: 2
  commits: 2
---

# Phase 9 Plan 02: Alert embedding on stop responses Summary

Expanded the alert-embedding pattern proven in Plan 06-01 to `GET /api/v1/routes/:shortName/stops` and `GET /api/v1/stops/nearby`, completing all of Phase 9's requirements (ALRT-05 through ALRT-08).

## What Was Built

**Task 1: Expand alert embedding to stop responses**

- `src/server/api/repositories/ServiceAlertRepository.ts`'s `getActiveAlertsForStop` (implemented but untested in Plan 06-01) now has full test coverage in `ServiceAlertRepository.test.ts`: matching stop, non-matching stop, expired-but-matching, agency-wide exclusion (D-04), multi-alert stable order, and empty-store behavior — mirroring the `getActiveAlertsForRoute` describe block.
- `src/server/api/models/StopDiscovery.ts` — `RouteDirectionStops.stops` field type changed from `BusStop[]` to `StopWithAlerts[]`; `NearbyStop` gained an `alerts: ServiceAlertSummary[]` field (after `distance`). Both types imported from `./ServiceAlertSummary` (defined in Plan 06-01).
- `src/server/api/services/StopService.ts` — `createStopService` now takes `(repository, serviceAlertRepository)`. Added a private `attachStopAlerts(stop)` helper (explicit field picks + `mapToServiceAlertSummaries(serviceAlertRepository.getActiveAlertsForStop(stop.id))`), used by `getStopsForRoute` via `direction.stops.map(attachStopAlerts)`. `getNearbyStops` inlines the same alert lookup directly into its existing `.map()` callback, before the filter/sort/slice pipeline — sort order by distance is unaffected since `alerts` is never used as a sort key.
- `src/server/api/services/StopService.test.ts` — added `makeMockAlertRepo()` helper; all 20 pre-existing `createStopService(mockRepo as never)` call sites updated to the 2-arg form via `replace_all`. Updated 4 stale exact-equality assertions (`getStopsForRoute`'s grouped-array test, the shared-stop dedup test, the stop-sequence-order test, and `getNearbyStops`'s default-options test) to expect the mapped `StopWithAlerts`/`NearbyStop` shape with `alerts: []`. Added 5 new tests: `getStopsForRoute` embeds mapped alert summaries verbatim, returns `alerts: []` for unmatched stops, and calls `getActiveAlertsForStop` once per stop *occurrence* (twice for a stop shared across 2 directions); `getNearbyStops` embeds mapped alert summaries verbatim and preserves distance-ascending sort order when alerts differ per stop.
- `src/server/api/routes/busRoutes.ts` — wired `ServiceAlertRepository.getInstance()` as the second argument to the `stopService` instantiation (the `busRouteService` instantiation was already updated in Plan 06-01).
- `src/server/api/routes/stopRoutes.ts` — added `ServiceAlertRepository` to the `../repositories` import and wired `ServiceAlertRepository.getInstance()` as the second argument to `createStopService`.

**Task 2: Route-wiring regression + full-phase verification**

- `busRoutes.test.ts`'s `describe("DI wiring")` block gained a second assertion: `createStopService`'s first invocation has 2 arguments, proving `busRoutes.ts`'s `stopService` wiring.
- `stopRoutes.test.ts` gained a new `describe("DI wiring")` block asserting `createStopService`'s second invocation (per the file's existing `mock.results[1]` convention — `busRoutes.ts` instantiates a `StopService` first) has 2 arguments, proving `stopRoutes.ts`'s own wiring.
- Ran the full test suite (with coverage), lint, and build as the closing gate for the whole phase.

## Verification Results

- `bun run test -- src/server/api/services/StopService.test.ts src/server/api/repositories/ServiceAlertRepository.test.ts` — 48/48 passed.
- `bun run test:coverage` (full suite) — **283/283 passed**, 21 test files. Coverage: 98.07% statements, 94.69% branches, 97.91% functions, 98.07% lines — all above the 80% threshold.
- `bun run build` — clean, no TypeScript errors.
- `bun run lint` — 1 pre-existing, unrelated error in `src/server/api/controllers/BusRouteController.test.ts` (confirmed byte-identical to the pre-phase base via `git diff 7f57b11 -- src/server/api/controllers/BusRouteController.test.ts`, no diff); zero errors/new warnings on any file this plan touched.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. All new code paths (`attachStopAlerts`, `getActiveAlertsForStop` wiring, per-stop `alerts` embedding in both `getStopsForRoute` and `getNearbyStops`) are fully wired and exercised by unit tests, route-level regression tests, and the live DI wiring in `busRoutes.ts`/`stopRoutes.ts`.

## Threat Flags

None beyond what the plan's `<threat_model>` already registered (T-06-04 through T-06-06, all `accept`/`mitigate` disposition, no new surface introduced beyond what was planned).

## Self-Check: PASSED

- FOUND: src/server/api/models/StopDiscovery.ts (alerts field present)
- FOUND: src/server/api/services/StopService.ts (2-arg createStopService, attachStopAlerts)
- FOUND: src/server/api/routes/busRoutes.ts (ServiceAlertRepository wired into stopService)
- FOUND: src/server/api/routes/stopRoutes.ts (ServiceAlertRepository wired into service)
- FOUND commit 1165ffb (Task 1: feat(06-02) expand alert embedding to stop responses)
- FOUND commit 9b1fdd8 (Task 2: test(06-02) lock in 2-arg factory-DI wiring for StopService)
