# Phase 5: Service Alerts Ingestion - Context

**Gathered:** 2026-09-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Server-side ingestion and normalization of GTFS-RT service alerts (detours, disruptions, stop closures) from the DASH/Swiftly API into an in-memory, currently-active `ServiceAlert` store — on a dedicated ~5-minute background poll, independent of the existing 30s prediction poll. No alerts are surfaced to clients yet (that's Phase 6); this phase only builds the ingestion pipeline: fetch → normalize → filter-by-active-window → query.

</domain>

<decisions>
## Implementation Decisions

### Repository & layering
- **D-01:** New dedicated repository/model/service for alerts, mirroring the existing `BusDataRepository`/`BusRoute`/`PredictionService` factory-DI pattern — not an extension of `BusDataRepository`. (Already stated in PROJECT.md's target features; confirmed as the shape to plan against.)

### Active window derivation
- **D-02:** When a GTFS-RT alert has multiple `active_period` entries, collapse them into a single window: earliest `start` across all periods → latest `end` across all periods.
- **D-03:** When a GTFS-RT alert has zero `active_period` entries (spec-valid "always active" alert), represent it as an open-ended window — `start` = fetch/publish time (or null) and `end` = null/undefined — and treat it as always-active in the filter (never expires).

### Severity/cause representation
- **D-04:** Pass through DASH's raw `cause`/`effect` strings as-is on `ServiceAlert` (typed as `string | undefined`); do not define a new typed union/enum for GTFS-RT cause/effect values. Mirrors the existing `Dash*` → domain-model mapping pattern (`PredictionService.mapToRoutePredictions`) without inventing a new taxonomy.
- **D-05:** Do not compute a derived severity ranking in this phase. ALRT-03 only requires "severity/cause when provided by the feed" — carry cause/effect through unmapped. Deriving a severity level (e.g. low/medium/high from `effect`) is a presentation concern, deferred to Phase 6+ if ever needed.

### Startup & poll lifecycle
- **D-06:** The alerts poll does NOT block server startup. Unlike `BusDataRepository.initialize()` (which `app.ts` awaits before `app.listen()`), the alerts store starts empty and the server begins accepting requests immediately — alerts are a supplementary layer, not a startup dependency, and per ALRT-02/success criteria the alerts poll must be decoupled from the existing critical path.
- **D-07:** The alerts poll fires an immediate first fetch on startup (fire-and-forget, non-blocking relative to `app.listen()`), then continues on a `setInterval(5min)` cadence — avoiding a cold ~5-minute window with an empty alert store after every restart.

### Claude's Discretion
- **Poll failure & staleness behavior** was not discussed by the user. Default to mirroring the existing `PredictionStreamService.poll()` pattern: on a failed fetch, log the error via Winston and keep serving the last successfully fetched alert set (stale-but-available) rather than clearing the store to empty.
- Exact GTFS-RT alerts endpoint path/response shape on the DASH/Swiftly API is not yet confirmed in this repo's `INTEGRATIONS.md` — research should investigate and record it.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing patterns to mirror
- `.planning/codebase/ARCHITECTURE.md` — layered architecture, DI factory-function pattern, error-type hierarchy, Dash* vs. domain-model separation
- `.planning/codebase/INTEGRATIONS.md` — DASH API auth/config, existing endpoints used (`GET /routes`, `GET /real-time/{agency}/predictions`); does not yet document a service-alerts endpoint — needs research
- `src/server/api/repositories/BusDataRepository.ts` — singleton repository pattern, `initialize()`/`refreshData()` shape to mirror (but NOT its startup-blocking behavior, per D-06)
- `src/server/api/services/PredictionStreamService.ts` — existing interval-poll pattern (`setInterval`, subscriber delivery, error logging on poll failure) to mirror for the alerts poll loop and failure handling
- `src/server/app.ts` — startup sequence; alerts poll must be wired in without blocking `app.listen()`

### Requirements
- `.planning/REQUIREMENTS.md` — ALRT-01 through ALRT-04 (this phase's scope); ALRT-05–09 (Phase 6, out of scope here)

No external specs/ADRs beyond the project's own planning docs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/server/config/axios.ts` — shared authenticated axios instance, reusable for the new alerts endpoint call
- `src/server/config/logger.ts` (Winston) — reuse for poll start/stop/error logging, matching existing conventions
- `src/server/api/errors/index.ts` (`NotFoundError`, `UpstreamApiError`) — reuse `UpstreamApiError` for alert-fetch failures if/when surfaced

### Established Patterns
- Factory-function DI: `createXService(repository)` — no direct singleton imports inside services
- `Dash*`-prefixed types for raw upstream shapes, separate domain types, explicit mapping functions
- Singleton repository via `getInstance()`, only instantiated/wired in route files or `app.ts`

### Integration Points
- `src/server/app.ts` is where the new alerts poll loop must be started (non-blocking, per D-06/D-07) — currently only wires `BusDataRepository.initialize()` before `app.listen()`
- No existing "start a global interval poll at boot" pattern exists yet — `PredictionStreamService`'s poll is per-stop and subscriber-triggered, not boot-triggered. Phase 5 introduces the first boot-triggered interval poll.

</code_context>

<specifics>
## Specific Ideas

No specific UI/output-format requirements — this phase is pure server-side ingestion infrastructure (no client-facing surface; that's Phase 6).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Derived severity ranking and poll-failure/staleness policy were left to Claude's discretion above, not deferred to a future phase — both are in-scope decisions for this phase's implementation, just not user-discussed.)

</deferred>

---

*Phase: 5-Service Alerts Ingestion*
*Context gathered: 2026-09-01*
