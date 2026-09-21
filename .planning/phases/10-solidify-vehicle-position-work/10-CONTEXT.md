# Phase 10: Solidify vehicle position work - Context

**Gathered:** 2026-09-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Quick task 260915-fc8 (branch `feat/gtfs-realtime-endpoints`) landed a first vertical slice for vehicle positions (`GET /api/v1/vehicles?route=`) without discussion, research, or plan-checking. This phase takes that slice from "quick task" to production-solid: correct DASH field mapping (now confirmed against a real payload — see Decisions), route-filter validation matching the existing `BusRouteService` 404 pattern, and safe handling of malformed per-vehicle data. It does not add caching/polling/SSE, multi-route filtering, staleness detection, or `verbose=true` fields — those are explicitly deferred (see Deferred Ideas).

</domain>

<decisions>
## Implementation Decisions

### Freshness strategy
- **D-01:** Keep the REST `/real-time/{agency}/vehicles` endpoint (current). Do not switch to the GTFS-RT `gtfs-rt-vehicle-positions` endpoint (protobuf, returns all vehicles unfiltered). GTFS-RT only pays off once there's a shared poll/cache layer serving many routes from one upstream call.
- **D-02:** `GET /api/v1/vehicles` stays REST-only for this phase — no caching, no SSE/streaming. Defer streaming to a future phase if/when a live-map consumer exists.

### Route filtering
- **D-03:** Single route only, filtered by route short name (e.g. `"30"`) — same as today. No multi-route support (`?route=1,2,3`).
- **D-04:** An unknown/invalid route short name must 404 via `NotFoundError`, validated against `BusDataRepository` — matches `BusRouteService.getAgencyRoute`'s existing pattern (`src/server/api/services/BusRouteService.ts:31`). — **Reversibility:** costly — **Rationale:** `VehicleService` currently has no dependencies (`createVehicleService()` takes none); adding this validation means it must take `BusDataRepository` as a factory-DI dependency, changing its constructor signature and every call site that constructs it (`app.ts` wiring, tests).

### Data integrity
- **D-05:** Vehicles with missing/NaN `lat` or `lon` are dropped silently from the mapped response (filtered out, not included with a flag, not failing the whole request). Log for visibility. Rest of the payload is unaffected.
- **D-06:** No staleness check/threshold on `lastUpdated` in this phase — return it as-is. Keeps this phase focused on correctness, not policy.

### Field verification
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
This resolves the "not verified against a live payload" gap flagged in ROADMAP.md Phase 10 context and in `STATE.md`'s Blockers/Concerns (Quick 260915-fc8).

- **D-07:** No runtime (Zod) validation of the DASH vehicles response. Matches existing convention — `PredictionService`, `ServiceAlertRepository`, and `BusRouteService` all trust their `Dash*` TypeScript types with no runtime schema validation; Zod is used only for env validation (`src/server/config/environment.ts`) today. D-05's coordinate-dropping is the safety net for shape drift, not schema validation.
- **D-08:** `DashVehicle` must mirror DASH's actual nested shape: `lat`, `lon`, `heading`, `speed`, and `time` (Unix seconds, replaces the previously-assumed top-level `lastUpdated`) live under a `loc: { lat, lon, heading, speed, time }` object, not top-level. `VehicleService`'s mapping function flattens `loc.lat`/`loc.lon`/`loc.heading`/`loc.speed` onto `VehiclePosition` and converts `loc.time` → `lastUpdated` as an ISO string (matching `generatedAt`'s format convention), preserving the existing `Dash*`-shaped-vs-response-shaped separation used elsewhere (e.g. `DashPrediction` vs. `Prediction`).
- **D-09:** `tripId` is dropped from both `DashVehicle` and `VehiclePosition` entirely — it does not appear in the non-verbose payload at all. Confirmed: it's only sent as `trip`, and only when `verbose=true` (out of scope — see D-11), so under the default response it never exists. — **Reversibility:** reversible — re-adding it later as optional is a small, local type change.
- **D-10:** `vehicleType` (GTFS `route_type` enum: `0`=tram/streetcar/light rail, `1`=subway/metro, `2`=rail, `3`=bus, `4`=ferry, `5`=cable car, `6`=gondola, `7`=funicular) is added to `DashVehicle` and exposed on `VehiclePosition`. It's real data DASH already sends per-vehicle; modeling it now avoids a schema change later if rail/subway support (beyond today's bus-only scope — `BusRoute`/`BusStop`, no other route types modeled anywhere) is ever added, and costs nothing today.
- **D-11:** `verbose=true` (unlocks `block`, `blockAssignmentInfo`, `headwaySecs`, `nextStopId`/`nextStopName`, `previousVehicleId`, `previousVehicleSchAdhSecs`/`Str`, `routeName`, `schAdhSecs`/`Str`, `scheduledHeadwaySecs`, `serviceId`/`ServiceName`, `trip`, `offRouteDetails`) is punted to a follow-up release, not this phase. These fields are closer to a distinct schedule-adherence capability than basic vehicle positioning, and overlap the already-deferred ADHR-01 schedule adherence backlog item (see `.planning/PROJECT.md` Next Milestone Goals). A future phase should decide whether `verbose` is client-controlled via `VehicleOptions`, exposed as a separate endpoint, or something else — that's a fresh discussion, not assumed here.

### Claude's Discretion
- Exact wording of log messages for dropped/malformed vehicles and for the DASH API call (follow existing `logger.info`/`logger.warn` conventions in `VehicleService.ts` and sibling services).
- Whether `VehiclePosition`'s `lastUpdated` is typed as `string` (ISO) to match `generatedAt`, vs. any other representation — D-08 already settles this as ISO string, but exact formatting helper (native `Date` vs. a shared util) is Claude's call if one doesn't already exist.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase origin and existing implementation
- `.planning/ROADMAP.md` (Phase 10 section, "Context — what's already done") — full description of quick task 260915-fc8's scope and the gaps this phase closes
- `src/server/api/models/Vehicle.ts` — current (unverified-until-now) `DashVehicle`/`VehiclePosition` types to be corrected per D-08/D-09/D-10
- `src/server/api/services/VehicleService.ts` — current service; needs `BusDataRepository` DI (D-04), `loc`-flattening mapping (D-08), and malformed-coordinate filtering (D-05)
- `src/server/api/controllers/VehicleController.ts`, `src/server/api/routes/vehicleRoutes.ts` — existing controller/route wiring for `GET /api/v1/vehicles`
- `src/server/api/services/VehicleService.test.ts`, `src/server/api/controllers/VehicleController.test.ts` — existing 14 tests to extend, not replace

### Patterns to mirror
- `src/server/api/services/BusRouteService.ts` (`getAgencyRoute`, lines ~31-36) — the `repository.getXById(...)` → `NotFoundError` if missing pattern D-04 must replicate
- `src/server/api/models/Prediction.ts` (`DashPrediction` vs `Prediction`) — the `Dash*`-shaped-vs-response-shaped separation convention D-08 must preserve

### Prior known-unknowns being resolved
- `.planning/STATE.md` Blockers/Concerns, "Quick 260915-fc8" entry — the unverified-field-names risk this phase's Field Verification decisions (D-07 through D-11) close out

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `BusDataRepository` (singleton, `getInstance()`) — already has `getRouteByShortName`; `VehicleService` needs to take this as a DI dependency for D-04's 404 validation.
- `NotFoundError` (`src/server/api/errors`) — existing error class, already mapped to 404 in the controller-error-translation layer; reuse directly, no new error type needed.

### Established Patterns
- Factory-function DI (`createVehicleService(repository)`) — `VehicleService` is the odd one out today (zero dependencies); this phase brings it in line with `createBusRouteService(repository, serviceAlertRepository)`.
- `Dash*` internal types kept separate from public response types, with explicit mapping functions (`mapToVehiclePositions` already exists in `VehicleService.ts` — extend, don't replace).

### Integration Points
- `VehicleService`'s construction site (wherever `createVehicleService()` is currently called, e.g. `app.ts` or a service-wiring module) needs to pass `BusDataRepository.getInstance()` once D-04 lands.

</code_context>

<specifics>
## Specific Ideas

The live payload example in the Field Verification decisions section above is the concrete reference for correct field shapes — use it directly when writing/updating tests, not a re-guessed shape.

</specifics>

<deferred>
## Deferred Ideas

- GTFS-RT `gtfs-rt-vehicle-positions` (protobuf) endpoint — reconsider once a shared poll/cache layer serves many routes from one upstream call (D-01)
- SSE/streaming vehicle positions, mirroring `PredictionStreamService` — reconsider when a live-map consumer exists (D-02)
- Multi-route filtering (`?route=1,2,3`) — not requested, single-route filtering stays (D-03)
- Vehicle staleness threshold/flagging on `lastUpdated` — explicitly out of scope this phase (D-06)
- `verbose=true` fields (block/trip assignment, schedule adherence, headway, next-stop, previous-vehicle, off-route-details) — own future phase; overlaps the ADHR-01 schedule adherence backlog item already noted in `.planning/PROJECT.md` (D-11)

### Reviewed Todos (not folded)
None — no pending todos matched this phase during discussion.

</deferred>

---

*Phase: 10-solidify-vehicle-position-work*
*Context gathered: 2026-09-21*
