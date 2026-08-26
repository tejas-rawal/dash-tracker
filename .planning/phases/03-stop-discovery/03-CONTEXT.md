# Phase 3: Stop Discovery - Context

**Gathered:** 2026-08-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Riders (via future client apps) can discover which stops belong to a route and which stops are near their current location, so they can pick a stop before requesting predictions for it. Two new read-only endpoints on top of data already loaded in `BusDataRepository` — no new upstream API calls, no data mutation, no client app work.

</domain>

<decisions>
## Implementation Decisions

### Endpoint & Route Design
- **D-01:** `GET /api/v1/routes/:shortName/stops` returns the stops for a route, nested under the existing routes router — mirrors the existing `GET /api/v1/routes/:shortName` pattern and reuses its shortName-lookup/404 semantics.
- **D-02:** `GET /api/v1/stops/nearby?lat=&lng=&radius=&count=` is a new top-level `stops` resource/router, following `predictionRoutes.ts`'s query-string style.
- **D-03:** Both endpoints are implemented in a new `StopController` + `StopService` pair (new files), not added to `BusRouteController`/`BusRouteService` — stop discovery is a distinct concern from route CRUD, even though one URL nests under `/routes`. — **Reversibility:** costly — splitting logic out of an existing controller/service after the fact touches call sites and tests; deciding the split now avoids that rework.

### Stop Ordering (routes/:shortName/stops)
- **D-04:** Response groups stops **by direction**, not as a single deduped flat list: `[{ directionId, title, stops: [...] }]`, one entry per `RouteDirection`, each with its stops in that direction's real sequence order. Do NOT reuse `BusRoute.getAllStops()` (it dedupes across directions and loses order) — iterate `route.directions` directly. — **Reversibility:** costly — response shape is a public contract; changing from grouped-by-direction to flat (or vice versa) after client apps consume it is a breaking change.

### Nearby-Search Defaults & Response Shape
- **D-05:** `radius` query parameter is specified in **miles** (e.g. `radius=0.5`, `radius=2`), not meters.
- **D-06:** Default radius when omitted: **0.5 miles**.
- **D-07:** Default result count when omitted: **10**; hard cap (max even if client requests more): **50**.
- **D-08:** Each stop in the nearby-search response includes its computed **distance** (in miles, consistent with the radius unit) from the query point, alongside the existing stop fields. Results are sorted by ascending distance.
- Distance calculation requires new code (haversine formula) — no geo library exists in `package.json` currently; this is Claude's implementation detail during planning, not a locked decision.

### Claude's Discretion
- Exact validation error messages/boundaries for lat/lng/radius/count (400 vs malformed vs out-of-range) — follow the existing `parseNumberParam` pattern in `PredictionController` as the reference convention; not separately locked by the user.
- Internal haversine/distance-calculation implementation approach.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & Requirements
- `.planning/ROADMAP.md` — Phase 3 goal, success criteria, requirements STOP-01/STOP-02
- `.planning/REQUIREMENTS.md` — STOP-01, STOP-02 definitions
- `.planning/PROJECT.md` — v0.2 milestone goal and constraints

### Codebase Maps
- `.planning/codebase/ARCHITECTURE.md`
- `.planning/codebase/CONVENTIONS.md`
- `.planning/codebase/STRUCTURE.md`

No external specs/ADRs beyond the above — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `BusDataRepository.getRouteByShortName(shortName)` — existing lookup for route-by-shortName, already used by `BusRouteController`/`BusRouteService`; reuse for the new `/routes/:shortName/stops` endpoint's route validation.
- `BusDataRepository.getAllStops()` — existing full stop list; base data source for nearby-search (no new upstream fetch needed).
- `NotFoundError` / `UpstreamApiError` (`src/server/api/errors/index.ts`) — reuse `NotFoundError` for unknown route shortName; no upstream calls happen in this phase, so `UpstreamApiError` doesn't apply here.
- `parseNumberParam()` pattern in `PredictionController.ts` — existing convention for parsing/validating optional numeric query params (returns `undefined` on invalid input, controller then 400s); reuse this pattern for `radius`/`count`, and extend for `lat`/`lng` validation.

### Established Patterns
- Factory-function DI: `createXService(repository)` / `createXController(service)` — new `createStopService(repository)` and `createStopController(service)` must follow this exactly, per `BusRouteService`/`BusRouteController`.
- Controllers map errors to HTTP status via a `resolveErrorStatus`/`resolveErrorBody` pair (see `PredictionController.ts`) — reuse this shape for the new `StopController`.
- Route files wire the dependency graph and export a `Router` as default export (see `busRoutes.ts`, `predictionRoutes.ts`) — new `stopRoutes.ts` follows the same shape; `busRoutes.ts` gains the nested `/:shortName/stops` route.

### Integration Points
- `src/server/api/routes/busRoutes.ts` — add `GET /:shortName/stops` route, wired to the new `StopController`.
- `src/server/api/routes/index.ts` — register a new `stopRoutes.ts` router (check how `busRoutes`/`predictionRoutes` are currently mounted here).
- `src/server/api/models/BusRoute.ts` / `RouteDirection.ts` — read directly (`route.directions`, each direction's `stops` in sequence) instead of `getAllStops()` for the ordered-by-direction response.
- `src/server/api/models/BusStop.ts` — `getLocation()` already returns `{ lat, lon }`; distance calc consumes this.

</code_context>

<specifics>
## Specific Ideas

No particular external references beyond what's captured in decisions above — standard REST conventions matching this codebase's existing style.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 3-Stop Discovery*
*Context gathered: 2026-08-26*
