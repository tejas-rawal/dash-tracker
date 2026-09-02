---
status: complete
phase: 05-service-alerts-ingestion
source: [05-VERIFICATION.md, 05-02-SUMMARY.md]
started: 2026-09-01T23:52:00Z
updated: 2026-09-02T11:05:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Non-blocking startup timing
expected: Boot the real server (`bun run dev-server` or `bun run start-server`) against the live DASH/Swiftly API. The server logs "Server is running on port ..." and begins accepting requests immediately — startup is not measurably delayed by the service-alerts poll. No "Failed to poll service alerts: Request failed with status code 404" is logged (gap G-05-1 fix: endpoint corrected to /real-time/{agency}/gtfs-rt-alerts/v2).
result: issue
reported: "error: Failed to poll service alerts: DASH API returned a malformed service alerts response (body is not an object)"
severity: major

### 2. Real-payload field-shape check for headerText/descriptionText/url
expected: |
  Boot the real server (`bun run dev-server` or `bun run start-server`) against the live DASH/Swiftly API while at least one active alert exists. Inspect ServiceAlertRepository's in-memory store (temporary log line or debugger) for a real alert's headerText/descriptionText/url values. These fields should contain the actual alert text from the feed, not undefined.
result: issue
reported: "error: Failed to poll service alerts: DASH API returned a malformed service alerts response (body is not an object) — string body failed JSON.parse"
severity: major

## Summary

total: 2
passed: 0
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-05-1
  truth: "The server logs \"Server is running on port ...\" and begins accepting requests immediately — startup is not measurably delayed by the service-alerts poll succeeding, failing, or hanging."
  status: resolved
  resolved_by: 05-02-PLAN.md
  resolved_at: 2026-09-02
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

- gap_id: G-05-2
  truth: "The server logs \"Server is running on port ...\" and begins accepting requests immediately — startup is not measurably delayed by the service-alerts poll succeeding, failing, or hanging."
  status: resolved
  resolved_by: 05-03-PLAN.md
  resolved_at: 2026-09-02
  reason: "User reported: error: Failed to poll service alerts: DASH API returned a malformed service alerts response (body is not an object)"
  severity: major
  test: 1
  artifacts: []
  missing: []
  live_response_example: |
    {
      "header": {"gtfs_realtime_version": "string", "incrementality": "string", "timestamp": 0},
      "entities": [
        {
          "id": "string",
          "alert": {
            "active_period": [{"start": 0, "end": 0}],
            "informed_entity": [{"agency_id": "string", "route_id": "string", "stop_id": "string"}],
            "cause": "UNKNOWN_CAUSE",
            "effect": "NO_SERVICE",
            "header_text": [{"translation": [{"text": "string", "language": "string"}]}],
            "description_text": [{"translation": [{"text": "string", "language": "string"}]}],
            "url": "string"
          }
        }
      ]
    }
  root_cause: "Two independent bugs. (1) Top-level field name mismatch: code reads response.entity (singular) but the live DASH/Swiftly payload uses entities (plural) — undetected today because that path silently returns [] with a warn log rather than throwing. (2) fetchFromDashApi() rejects any response.data that isn't already a parsed object, with no fallback for a JSON-encoded string body — which is what axios's default transform produces when the upstream Content-Type isn't recognized as JSON. (2) is the proximate cause of the observed 'body is not an object' error."
  artifacts:
    - path: "src/server/api/services/ServiceAlertService.ts"
      issue: "fetchFromDashApi() has no string-body JSON.parse fallback before the object-shape check; fetchAlerts() reads response.entity instead of response.entities"
    - path: "src/server/api/models/ServiceAlert.ts"
      issue: "DashAlertsApiResponse.entity should be entities to match the live API"
  missing:
    - "JSON.parse fallback in fetchFromDashApi() when response.data is a string, before the object-shape check"
    - "Rename entity -> entities in DashAlertsApiResponse and all ServiceAlertService.ts call sites"
    - "Tests: string-body JSON parsing, entities-keyed response mapping, existing malformed-body/entity guards still pass post-rename"
  debug_session: ".planning/debug/service-alerts-malformed-body.md"

- gap_id: G-05-4
  truth: "Boot the real server against the live DASH/Swiftly API while at least one active alert exists, and headerText/descriptionText/url are populated from the feed, not undefined."
  status: failed
  reason: "User reported (regression of G-05-2's symptom, new root cause): error: Failed to poll service alerts: DASH API returned a malformed service alerts response (body is not an object) — string body failed JSON.parse"
  severity: major
  test: 2
  root_cause: "The DASH/Swiftly gtfs-rt-alerts/v2 endpoint's default response format is the Google Protocol Buffer BINARY encoding, not JSON — confirmed by the user from Swiftly's own API docs (JSON is available only via an explicit format query parameter, format=json). fetchFromDashApi() requests the endpoint with no format parameter, so axios receives raw protobuf bytes. When axios coerces that binary body into a JS string, the result is not valid JSON text, so JSON.parse() at ServiceAlertService.ts:31 throws — this is the true root cause of both the original G-05-2 report and today's recurrence; the 05-03 gap-closure fix (JSON.parse string-body fallback + entity->entities rename) handled the JSON-shape assumptions correctly but never addressed why the body wasn't JSON in the first place."
  artifacts:
    - path: "src/server/api/services/ServiceAlertService.ts"
      issue: "buildDashApiUrl() (line 18-21) builds the URL with no query parameter, so the DASH API defaults to returning protobuf-binary instead of JSON"
  missing:
    - "Append ?format=json to the URL built by buildDashApiUrl() so the DASH API returns JSON text/object instead of protobuf binary"
    - "Re-verify against the live API that fetchAlerts() succeeds end-to-end and headerText/descriptionText/url populate correctly (this closes Test 2 as well, since the field-shape check cannot run until the poll succeeds)"
  debug_session: "diagnosed inline during /gsd-verify-work 05 session (2026-09-02) — user identified the root cause directly from Swiftly API docs, no separate debug agent spawned"
