---
id: SEED-001
status: dormant
planted: 2026-09-01
planted_during: v0.3 — Favorited & Recent Routes
trigger_when: next new-milestone cycle after v0.3 ships
scope: medium
---

# SEED-001: Service alerts per route

## Why This Matters

DASH/Swiftly's GTFS-RT service-alerts feed (detours, disruptions, stop closures)
is currently unused by this app. Riders checking predictions or favorited
routes have no way to know a route is detoured or a stop is closed — the app
can show an ETA for a bus that isn't actually coming. Surfacing alerts closes
that gap with a proportionally small addition given the layers already in place.

## When to Surface

**Trigger:** next `/gsd-new-milestone` cycle after the current v0.3
(Favorited & Recent Routes) milestone ships.

This seed will surface during `/gsd-new-milestone` when the milestone scope
touches routes, stops, or predictions.

## Scope Estimate

**Medium** — mirrors the existing `BusRoute`/`PredictionService` integration
pattern exactly: one new repository fetch against the DASH service-alerts
endpoint, a new model (e.g. `ServiceAlert`), and a service/controller layer to
attach alerts to route or stop responses. No new architecture required —
same DI/factory pattern as `createBusRouteService`, `createPredictionService`.

## Breadcrumbs

- `src/server/api/services/BusRouteService.ts` — pattern to mirror for a new `ServiceAlertService`
- `src/server/api/repositories/BusDataRepository.ts` — where a new alerts fetch would live
- `src/server/api/models/BusRoute.ts` — sibling model location for a new `ServiceAlert` model
- No existing code references alerts/adherence yet — clean slate

## Notes

Originated from a research pass over the Swiftly API docs
(https://swiftly-inc.stoplight.io/docs/swiftly-docs/6zpcgvbu5wbb3-swiftly-api-reference)
cross-checked against the DASH real-time API this app already integrates with.
Companion idea: [[SEED-002]] (schedule adherence) — both were proposed together
and could ship as separate milestones or be combined if scope allows.
