# Debug Session: service-alerts poll 404

**Phase:** 05-service-alerts-ingestion
**Gap:** G-05-1
**Reported:** `error: Failed to poll service alerts: Request failed with status code 404`

## Root Cause (high-confidence, not fully confirmed)

`ServiceAlertService.buildDashApiUrl()` (`src/server/api/services/ServiceAlertService.ts:18`) builds
`` `/real-time/${agency}/service-alerts` ``. This path segment does not exist on Swiftly's real-time
API. Swiftly's actual GTFS-RT alerts endpoint uses the segment **`gtfs-rt-alerts`**, not
`service-alerts` — corroborated by Swiftly's public docs site (a page titled "GTFS-rt-alerts" under
`realtime-standalone`, sibling to "GTFS-rt-trip-updates") and by concrete example URLs following the
pattern `https://api.goswift.ly/real-time/{agencyKey}/gtfs-rt-alerts`, matching this project's existing
`/real-time/{agency}/predictions` pattern except for the final segment.

The GTFS-RT JSON field-casing assumptions in the code (`entity`, `active_period`, `informed_entity`,
snake_case) are separately correct — only the URL segment is wrong.

**Confidence:** CONFIRMED. The user supplied the Swiftly API reference link directly
(https://swiftly-inc.stoplight.io/docs/swiftly-docs/6zpcgvbu5wbb3-swiftly-api-reference/operations/get-a-real-time-gtfs-rt-alert-v-2)
and the resolved endpoint: `https://api.goswift.ly/real-time/{agencyKey}/gtfs-rt-alerts/v2`. This
confirms BOTH the `gtfs-rt-alerts` segment AND the `/v2` suffix (risk #2 below is now resolved — v2
is required, not optional). The docs page itself could not be scraped by an automated fetch (JS-rendered
Stoplight site returns no body content to WebFetch), so the JSON-vs-protobuf question (risk #1) remains
unconfirmed by direct doc read — treat the defensive-parsing recommendation below as still required.

## Two related risks — must be verified alongside the path fix, not silently assumed

1. **Response format may default to protobuf, not JSON.** Swiftly's GTFS-RT endpoints reportedly
   default to Protocol Buffer binary, with JSON selectable via a `?format=json` query parameter,
   separate from the `Accept` header. If the real endpoint requires `format=json` and doesn't get it,
   fixing the path alone trades today's loud 404 for a **silent** failure: the protobuf body would
   misparse, `entity` would come back `undefined`, and `fetchAlerts()` would log
   "No service alerts found in API response" and return `[]` — indistinguishable from "there are
   really no alerts." This is worse than the current failure mode.
2. **Possible `/v2` version suffix** on the endpoint for some agencies — unconfirmed whether required
   for this agency's JSON entity shape.

## Recommendation (updated — path CONFIRMED by user)

- Apply the confirmed path fix: `/real-time/{agency}/service-alerts` → `/real-time/{agency}/gtfs-rt-alerts/v2`
  in `ServiceAlertService.ts:18` (and the hard-coded wrong path in `05-01-PLAN.md`'s Task 1 acceptance
  criteria / test, which also assumed `service-alerts` — the test itself needs the correction, not just
  the runtime code).
- Risk #1 (JSON vs protobuf default) is still open — this project's axios client sends
  `Accept: application/json` by default but that has not been confirmed sufficient for this endpoint.
  Add a defensive response-shape check so a non-JSON/protobuf body fails LOUD (throws `UpstreamApiError`)
  rather than silently misparsing into `entity: undefined` → an empty alerts list indistinguishable from
  "no alerts." This is a cheap, permanent safety net regardless of what the live endpoint actually
  requires, and should ship as part of the same fix.
- Risk #2 (`/v2` suffix) is now RESOLVED — confirmed required, baked into the path fix above.
- Recommend a human still do one live smoke test (boot the server against the real API, confirm alerts
  populate and no error is logged) once the fix lands, since this diagnosis did not execute an
  authenticated request against the live endpoint itself.

## Files

- `src/server/api/services/ServiceAlertService.ts` (line 18 — fix site)
- `src/server/api/services/PredictionService.ts` (line 39 — working reference pattern)
- `.planning/phases/05-service-alerts-ingestion/05-01-PLAN.md` (lines 61–76, 112, 129 — original flagged assumption + hard-coded wrong path in test/acceptance criteria)
- `.planning/codebase/INTEGRATIONS.md` (needs updating once path is confirmed)
