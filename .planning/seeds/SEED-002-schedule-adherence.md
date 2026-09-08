---
id: SEED-002
status: dormant
planted: 2026-09-01
planted_during: v0.3 — Favorited & Recent Routes
trigger_when: next new-milestone cycle after v0.3 ships
scope: medium
---

# SEED-002: Schedule adherence / "how late is this bus"

## Why This Matters

Predictions today only surface a raw ETA — riders don't know whether a bus is
running on time, early, or late. Swiftly's real-time vehicle-positions feed
carries schedule-adherence data alongside vehicle locations; exposing it next
to existing predictions gives riders meaningfully better information (delay
awareness) without requiring a full live-vehicle-tracking/map feature.

## When to Surface

**Trigger:** next `/gsd-new-milestone` cycle after the current v0.3
(Favorited & Recent Routes) milestone ships.

This seed will surface during `/gsd-new-milestone` when the milestone scope
touches predictions or vehicle data.

## Scope Estimate

**Medium** — requires a new DASH vehicle-positions fetch (repository layer),
mapping DASH-shaped adherence fields into the existing `Prediction`/
`StopPredictionsResponse` service types (same explicit-mapping convention
`PredictionService` already uses for `Dash*` → response types), and attaching
adherence to prediction responses. Does not require the full live-map /
vehicle-tracking feature — adherence data alone is a much smaller slice.

## Breadcrumbs

- `src/server/api/services/PredictionService.ts` — where `Dash*` → response mapping happens; adherence would extend this
- `src/server/api/models/Prediction.ts` — `StopPredictionsResponse` shape to extend
- `src/server/api/services/PredictionStreamService.ts` — existing streaming pattern that adherence data could ride along with
- No existing code references adherence yet — clean slate

## Notes

Originated from a research pass over the Swiftly API docs
(https://swiftly-inc.stoplight.io/docs/swiftly-docs/6zpcgvbu5wbb3-swiftly-api-reference)
cross-checked against the DASH real-time API this app already integrates with.
Companion idea: [[SEED-001]] (service alerts) — both were proposed together
and could ship as separate milestones or be combined if scope allows.

Note: full "live vehicle tracking on a map" was considered and explicitly
deferred as a separate, larger, frontend-heavy feature — this seed scopes
only the adherence data itself, not vehicle positions/mapping.
