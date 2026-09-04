# Phase 6: Alerts Surfaced on Routes, Stops & Predictions - Context

**Gathered:** 2026-09-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Embed currently-active `ServiceAlert` data (ingested in Phase 5) onto existing route and stop responses — `GET /api/v1/routes/all`, `GET /api/v1/routes/:shortName`, `GET /api/v1/routes/:shortName/stops`, `GET /api/v1/stops/nearby`. No new endpoint, no SSE changes. Predictions responses are explicitly out of scope for this phase (see D-05).

</domain>

<decisions>
## Implementation Decisions

### Embedded alert shape
- **D-01:** Embed a trimmed alert summary, not the full `ServiceAlert` object — fields: `id`, `cause`, `effect`, `headerText`, `descriptionText`, `activePeriod`. Omit `url` and `informedRouteIds`/`informedStopIds` (redundant once attached to a specific route/stop). Requires a new response-shaping type/mapping function, separate from the domain `ServiceAlert` model, mirroring the existing `Dash*` → domain → response-shape mapping pattern already used for predictions.
- **D-02:** Every route/stop response includes an `alerts` field as an array, always present — `alerts: []` when there are no active alerts, never omitted. — **Reversibility:** reversible — pure response-shaping choice, no stored state depends on it.

### Route/stop matching against alerts
- **D-03:** Match `ServiceAlert.informedRouteIds` against `BusRoute.id` (DASH's internal route ID) and `ServiceAlert.informedStopIds` against `BusStop.id` — not `shortName`/`code`. Same ID space GTFS-RT `informedEntities.routeId`/`.stopId` already populate on ingestion (Phase 5).
- **D-04:** An alert with both `informedRouteIds` and `informedStopIds` empty (no informed entity at all — a general/agency-wide alert) is NOT surfaced on any route or stop in this phase. It stays ingested/stored (Phase 5's job), just never attached to a response. — **Reversibility:** reversible — a later phase can add agency-wide surfacing without touching the matching logic for scoped alerts.

### Scope change: predictions dropped
- **D-05:** ALRT-09 (predictions flagging active alerts) is deferred out of this phase and out of v1 — moved to REQUIREMENTS.md's "Alerts (future)" v2 section. Rationale (user): predictions are always requested for a specific stop/route, and that stop/route's own response already carries its active alerts via D-01–D-04, so a duplicate flag/array on the predictions response is redundant. `GET /api/v1/predictions` is unchanged by this phase. ROADMAP.md Phase 6 success criteria and REQUIREMENTS.md were both updated to reflect this (ALRT-09 moved to v2, requirements traceability count now 8). — **Reversibility:** reversible — re-adding ALRT-09 later is additive, no rework of route/stop embedding needed.

### Claude's Discretion
- Exact repository/service method signatures for filtering alerts by route/stop ID (e.g. new `getActiveAlertsForRoute(routeId)` on `ServiceAlertRepository`, vs. filtering in a new service layer) — architecture-layer detail, not discussed with the user. Follow the existing factory-DI, layered-architecture conventions (Routes → Controllers → Services → Repository).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing patterns to mirror
- `.planning/codebase/ARCHITECTURE.md` — layered architecture, DI factory-function pattern, error-type hierarchy, `Dash*` vs. domain-model vs. response-shape separation
- `src/server/api/repositories/ServiceAlertRepository.ts` — `getActiveAlerts(referenceTime)`; has no per-route/per-stop filtering yet — this phase needs to add that
- `src/server/api/services/ServiceAlertService.ts` — `ServiceAlert`/`Dash*` mapping pattern to mirror for the new trimmed response-shape type
- `src/server/api/services/BusRouteService.ts`, `src/server/api/services/PredictionService.ts` — existing service response-shaping and factory-DI conventions
- `src/server/api/models/BusRoute.ts`, `src/server/api/models/BusStop.ts` — `id` field is the DASH internal ID to match alerts against (D-03)
- `src/server/api/models/ServiceAlert.ts` — `ServiceAlert`, `ServiceAlertActivePeriod` domain types; `informedRouteIds`/`informedStopIds` are the match-source fields

### Requirements
- `.planning/REQUIREMENTS.md` — ALRT-05 through ALRT-08 (this phase's scope, after ALRT-09 was moved to v2 per D-05)
- `.planning/ROADMAP.md` — Phase 6 section, updated success criteria (predictions no longer listed)

No external specs/ADRs beyond the project's own planning docs.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ServiceAlertRepository.getInstance()` / `getActiveAlerts()` — existing singleton read path for currently-active alerts, needs a route/stop-scoped query added on top
- Existing `Dash*` → domain → response mapping pattern (`PredictionService.mapToRoutePredictions`, `ServiceAlertService.mapToServiceAlert`) — template for the new alert-summary mapping function

### Established Patterns
- Factory-function DI: `createXService(repository)` — no direct singleton imports inside services/controllers
- Controllers parse requests, map errors to HTTP status, format responses; services hold business logic; repository is the singleton data source

### Integration Points
- `BusRouteService.getAgencyRoutes()`, `getAgencyRoute()`, `getAgencyStops()`, `getRoutesForStop()` (stops-for-route via `getRoutesForStop`) and the stop-discovery service (`.planning/codebase` — Phase 3) are where alert-embedding logic attaches, since they already build the route/stop response shapes
- `ServiceAlertRepository` needs a new method (or the embedding layer needs new filtering logic) to go from "all active alerts" to "active alerts for route X" / "active alerts for stop Y"

</code_context>

<specifics>
## Specific Ideas

No UI/visual requirements — this is a server-side response-shape change. The user's specific asks were the trimmed alert field list (D-01) and dropping predictions from scope (D-05).

</specifics>

<deferred>
## Deferred Ideas

- **ALRT-09 (predictions alert flag)** — moved to REQUIREMENTS.md v2 "Alerts (future)" section per D-05. Not lost, just deferred past v0.4.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 6-Alerts Surfaced on Routes, Stops & Predictions*
*Context gathered: 2026-09-04*
