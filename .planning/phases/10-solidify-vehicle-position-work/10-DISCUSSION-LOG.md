# Phase 10: Solidify vehicle position work - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-21
**Phase:** 10-solidify-vehicle-position-work
**Areas discussed:** Freshness strategy, Route filtering, Data integrity, Field verification

---

## Freshness strategy

| Option | Description | Selected |
|--------|-------------|----------|
| REST endpoint (current) | Keep `/real-time/{agency}/vehicles`, JSON, route-filterable | ✓ |
| GTFS-RT endpoint | `gtfs-rt-vehicle-positions`, returns all vehicles, protobuf | |

**User's choice:** REST endpoint (current)
**Notes:** GTFS-RT only pays off once there's a shared poll/cache layer serving many routes from one upstream call — reconsider then, not now.

| Option | Description | Selected |
|--------|-------------|----------|
| REST-only for MVP (recommended) | No caching, no streaming; defer SSE to a future phase | ✓ |
| Add SSE stream now | Grow a shared poll/SSE stream like `PredictionStreamService` | |

**User's choice:** REST-only for MVP
**Notes:** Avoids taking on `PredictionStreamService`-class concurrency complexity (duplicate loops, disconnect races, starved subscribers) ahead of a confirmed need.

---

## Route filtering

| Option | Description | Selected |
|--------|-------------|----------|
| Single route only (current) | Filter by route short name, e.g. `"30"` | ✓ |
| Multiple routes (`?route=1,2,3`) | Multi-route support | |
| No filter param at all | Drop filtering entirely | |

**User's choice:** Single route only (current)
**Notes:** None.

| Option | Description | Selected |
|--------|-------------|----------|
| Validate against `BusDataRepository`, 404 if unknown (recommended) | Matches `BusRouteService`'s existing pattern | ✓ |
| Pass through, no local validation | Forward unknown short names to DASH as-is | |

**User's choice:** Validate against `BusDataRepository`, 404 via `NotFoundError` if unknown
**Notes:** `VehicleService` now needs to take the repository as a dependency (it currently doesn't).

---

## Data integrity

| Option | Description | Selected |
|--------|-------------|----------|
| Drop the vehicle silently (recommended) | Filter out any vehicle with missing/NaN lat or lon | ✓ |
| Include with a flag | Keep the vehicle, mark it as malformed | |
| Fail the whole request | Reject the entire response on any bad vehicle | |

**User's choice:** Drop the vehicle silently
**Notes:** Log for visibility; rest of the payload unaffected.

| Option | Description | Selected |
|--------|-------------|----------|
| Not in this phase (recommended) | Return `lastUpdated` as-is, no server-side staleness threshold | ✓ |
| Add a staleness threshold now | Check/flag stale vehicle data | |

**User's choice:** Not in this phase
**Notes:** Keeps this phase focused on correctness, not policy.

---

## Field verification

A real live payload was supplied directly by the user during this discussion (SFMTA agency, non-verbose):
```json
{
  "data": {
    "agencyKey": "sfmta",
    "vehicles": [
      {
        "directionId": "0",
        "headsign": "West Portal Ave/Sloat/Portola",
        "id": "1550",
        "loc": { "heading": 113.8, "lat": 37.72179, "lon": -122.44705, "speed": 0, "time": 1534287835 },
        "routeId": "13223",
        "routeShortName": "KJ",
        "vehicleType": "0"
      }
    ]
  },
  "route": "/real-time/sfmta/vehicles GET",
  "success": true
}
```
This resolves the "not verified against a live payload" gap flagged in ROADMAP.md Phase 10 context and STATE.md's Blockers/Concerns (Quick 260915-fc8).

| Option | Description | Selected |
|--------|-------------|----------|
| No runtime validation (recommended) | Trust the corrected `DashVehicle` TS type, no Zod; existing Data Integrity coordinate-drop is the safety net | ✓ |
| Add Zod validation for this endpoint | New pattern — catches shape drift with a clear error | |

**User's choice:** No runtime validation
**Notes:** Confirmed Zod isn't used anywhere else in the codebase for API response validation (`PredictionService`, `ServiceAlertRepository`, `BusRouteService` all trust their `Dash*` types); only used for env validation today.

| Option | Description | Selected |
|--------|-------------|----------|
| Keep DashVehicle nested, flatten in mapping (recommended) | `DashVehicle.loc = {lat, lon, heading, speed, time}`; `VehicleService` maps `loc.time` → `lastUpdated` (ISO string) and flattens the rest | ✓ |
| Keep DashVehicle flat, coerce at parse time | Adapt the parsing step to pull fields out of `loc` before typing | |

**User's choice:** Keep DashVehicle nested, flatten in mapping
**Notes:** Matches the existing `Dash*`-shaped-vs-response-shaped separation convention (e.g. `DashPrediction` vs `Prediction`).

| Option | Description | Selected |
|--------|-------------|----------|
| Make it optional (`tripId?: string`) | Keep in the model, pass through when present | |
| Drop it from the model | Remove entirely — no evidence it's ever populated on this endpoint | ✓ |

**User's choice:** Drop it from the model
**Notes:** Later confirmed via the `verbose=true` docs: `tripId` is only sent as `trip`, and only under `verbose=true` (out of scope this phase) — so under the default response it never exists at all.

| Option | Description | Selected |
|--------|-------------|----------|
| Add and expose it now (recommended) | Real data DASH already sends; free to model now, avoids a schema change later for rail/subway support | ✓ |
| Add to DashVehicle only, don't expose | Type it but omit from the public response | |
| Ignore for now | Leave it out of both types | |

**User's choice:** Add and expose it now
**Notes:** `vehicleType` is GTFS `route_type` (0=tram/streetcar/light rail, 1=subway/metro, 2=rail, 3=bus, 4=ferry, 5=cable car, 6=gondola, 7=funicular). dash-tracker is bus-only today (`BusRoute`/`BusStop`, no other route types modeled) but the user flagged it as useful "when adding rail and subway support."

| Option | Description | Selected |
|--------|-------------|----------|
| Punt to a follow-up release (recommended) | Verbose fields are closer to a distinct schedule-adherence capability; overlaps the already-deferred ADHR-01 backlog item | ✓ |
| Add verbose support now | Add a `verbose` option to `VehicleOptions`, expose the richer detail this phase | |

**User's choice:** Punt to a follow-up release
**Notes:** User supplied the full `verbose=true` field list (block, blockAssignmentInfo, headwaySecs, nextStopId/Name, previousVehicleId, previousVehicleSchAdhSecs/Str, routeName, schAdhSecs/Str, scheduledHeadwaySecs, serviceId/ServiceName, trip, offRouteDetails) and noted they "might be useful in accurately determining the positioning of the vehicle on a map, but also fine if we want to punt this to a follow-up release."

---

## Claude's Discretion

- Exact wording of log messages for dropped/malformed vehicles and for the DASH API call.
- Whether `VehiclePosition.lastUpdated`'s ISO-string formatting reuses a shared date-formatting util vs. native `Date`, if one doesn't already exist (the ISO-string requirement itself is locked, per D-08).

## Deferred Ideas

- GTFS-RT `gtfs-rt-vehicle-positions` (protobuf) endpoint — reconsider once a shared poll/cache layer serves many routes from one upstream call
- SSE/streaming vehicle positions, mirroring `PredictionStreamService` — reconsider when a live-map consumer exists
- `verbose=true` fields (block/trip assignment, schedule adherence, headway, next-stop, previous-vehicle, off-route-details) — own future phase; overlaps the ADHR-01 schedule adherence backlog item
