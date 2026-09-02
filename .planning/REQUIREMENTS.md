# Requirements: dash-tracker

**Defined:** 2026-09-01
**Core Value:** Riders can always see accurate, near-real-time arrival predictions for their stop.

## v1 Requirements

Requirements for milestone v0.4 (Service Alerts).

### Alerts Ingestion

- [x] **ALRT-01**: The server fetches GTFS-RT service alerts (detours, disruptions, stop closures) from the DASH/Swiftly service-alerts endpoint
- [ ] **ALRT-02**: Alerts are refreshed on a dedicated background poll every 5 minutes, independent of the 30s prediction poll
- [ ] **ALRT-03**: A `ServiceAlert` model represents a single alert — affected route(s)/stop(s), description, severity/cause if provided by the feed, and active window (start/end)
- [ ] **ALRT-04**: Only currently-active alerts (within their active window) are surfaced to clients; expired/future alerts are filtered out server-side

### Route Alerts

- [ ] **ALRT-05**: `GET /api/v1/routes/all` includes active alerts for each route
- [ ] **ALRT-06**: `GET /api/v1/routes/:shortName` includes active alerts for that route

### Stop Alerts

- [ ] **ALRT-07**: `GET /api/v1/routes/:shortName/stops` includes active alerts for each stop
- [ ] **ALRT-08**: `GET /api/v1/stops/nearby` includes active alerts for each returned stop

### Prediction Alerts

- [ ] **ALRT-09**: `GET /api/v1/predictions` (REST) flags when the requested route/stop has an active alert

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Schedule Adherence

- **ADHR-01**: Surface on-time performance / schedule adherence data (SEED-002)

### Alerts (future)

- **ALRT-10**: Standalone alerts-browsing endpoint (e.g. `GET /api/v1/alerts`)
- **ALRT-11**: Push alert updates over the SSE prediction stream

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Standalone alerts endpoint | Alerts are embedded into existing route/stop/prediction responses only for v0.4 |
| Alerts over SSE stream | SSE carries prediction updates only; alerts stay REST-only for now |
| Schedule adherence (SEED-002) | Companion idea to service alerts, deliberately deferred to its own future milestone |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ALRT-01 | Phase 5 | Complete |
| ALRT-02 | Phase 5 | Gaps Found |
| ALRT-03 | Phase 5 | Gaps Found |
| ALRT-04 | Phase 5 | Gaps Found |
| ALRT-05 | Phase 6 | Pending |
| ALRT-06 | Phase 6 | Pending |
| ALRT-07 | Phase 6 | Pending |
| ALRT-08 | Phase 6 | Pending |
| ALRT-09 | Phase 6 | Pending |

**Coverage:**

- v1 requirements: 9 total
- Mapped to phases: 9
- Unmapped: 0 ✓

---
*Requirements defined: 2026-09-01*
*Last updated: 2026-09-01 after roadmap creation (Phase 5: Service Alerts Ingestion, Phase 6: Alerts Surfaced on Routes, Stops & Predictions)*
