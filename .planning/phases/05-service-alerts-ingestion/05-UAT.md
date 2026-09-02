---
status: complete
phase: 05-service-alerts-ingestion
source: [05-VERIFICATION.md]
started: 2026-09-01T23:52:00Z
updated: 2026-09-02T00:05:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Non-blocking startup timing
expected: Boot the real server (`bun run dev-server` or `bun run start-server`) with the DASH service-alerts endpoint deliberately slow or unreachable, and observe server startup. The server logs "Server is running on port ..." and begins accepting requests immediately — startup is not measurably delayed by the service-alerts poll succeeding, failing, or hanging.
result: issue
reported: "error: Failed to poll service alerts: Request failed with status code 404"
severity: blocker

## Summary

total: 1
passed: 0
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-05-1
  truth: "The server logs \"Server is running on port ...\" and begins accepting requests immediately — startup is not measurably delayed by the service-alerts poll succeeding, failing, or hanging."
  status: failed
  reason: "User reported: error: Failed to poll service alerts: Request failed with status code 404"
  severity: blocker
  test: 1
  root_cause: "Wrong DASH/Swiftly endpoint path. ServiceAlertService.ts:18 builds /real-time/{agency}/service-alerts, but the real Swiftly GTFS-RT alerts endpoint is /real-time/{agency}/gtfs-rt-alerts/v2 (CONFIRMED by user via Swiftly API reference docs). The plan's original flagged assumption about the path was wrong; the /v2 suffix is required, not optional."
  artifacts:
    - path: "src/server/api/services/ServiceAlertService.ts"
      issue: "buildDashApiUrl() (line 18) uses the wrong path segment 'service-alerts' instead of 'gtfs-rt-alerts/v2'"
    - path: ".planning/phases/05-service-alerts-ingestion/05-01-PLAN.md"
      issue: "Task 1 acceptance criteria and test also hard-code the wrong path (lines ~112, ~129) — must be corrected alongside the runtime fix, not left stale"
  missing:
    - "Correct URL path segment: gtfs-rt-alerts/v2 instead of service-alerts"
    - "Defensive response-shape validation so a non-JSON/protobuf response fails loud (UpstreamApiError) instead of silently parsing to an empty alert list — JSON-vs-protobuf default for this endpoint was not independently confirmed during diagnosis"
  debug_session: ".planning/debug/service-alerts-404.md"
