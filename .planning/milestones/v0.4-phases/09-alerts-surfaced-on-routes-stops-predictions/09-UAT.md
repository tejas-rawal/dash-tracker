---
status: complete
phase: 06-alerts-surfaced-on-routes-stops-predictions
source: [09-VERIFICATION.md]
started: 2026-09-04T21:48:28Z
updated: 2026-09-08T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Route-alerts lookup during concurrent ServiceAlertPollService.applyAlerts() swap
expected: Under real concurrent load, triggering ServiceAlertPollService.applyAlerts() (a
  5-minute-poll swap of the alerts Map) at the same moment a request is mid-flight through
  BusRouteService.getAgencyRoutes()/getAgencyRoute() must never produce a torn/partial read
  across the routes in that response.
result: pass

### 2. Stop-alerts lookup during concurrent ServiceAlertPollService.applyAlerts() swap
expected: Same as above, but for StopService.getStopsForRoute()/getNearbyStops() racing
  against a concurrent ServiceAlertPollService.applyAlerts() swap — no torn/partial read
  across the stops in that response.
result: pass

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
