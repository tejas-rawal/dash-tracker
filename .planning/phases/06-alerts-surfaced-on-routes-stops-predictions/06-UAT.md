---
status: testing
phase: 06-alerts-surfaced-on-routes-stops-predictions
source: [06-VERIFICATION.md]
started: 2026-09-04T21:48:28Z
updated: 2026-09-04T21:48:28Z
---

## Current Test

number: 1
name: Route-alerts lookup reads a consistent Map snapshot during a concurrent poll swap
expected: |
  The in-flight request's route-alerts lookups all read from a single consistent Map
  snapshot — either entirely pre-swap or entirely post-swap data, never a mix of both —
  for every route in the same response.
awaiting: user response

## Tests

### 1. Route-alerts lookup during concurrent ServiceAlertPollService.applyAlerts() swap
expected: Under real concurrent load, triggering ServiceAlertPollService.applyAlerts() (a
  5-minute-poll swap of the alerts Map) at the same moment a request is mid-flight through
  BusRouteService.getAgencyRoutes()/getAgencyRoute() must never produce a torn/partial read
  across the routes in that response.
result: [pending]

### 2. Stop-alerts lookup during concurrent ServiceAlertPollService.applyAlerts() swap
expected: Same as above, but for StopService.getStopsForRoute()/getNearbyStops() racing
  against a concurrent ServiceAlertPollService.applyAlerts() swap — no torn/partial read
  across the stops in that response.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
