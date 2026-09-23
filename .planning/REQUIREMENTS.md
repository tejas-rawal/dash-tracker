# Requirements: dash-tracker

**Defined:** 2026-09-22
**Core Value:** Riders can always see accurate, near-real-time arrival predictions for their stop.

## v0.5 Requirements

Requirements for milestone v0.5 Nearby Stop Predictions. Each maps to roadmap phases.

### Nearby Predictions

- [ ] **NEAR-01**: Rider can call `GET /api/v1/predictions/nearby?lat&lng` and receive live predictions for stops near that point, backed by a single call to DASH/Swiftly `real-time/{agency}/predictions-near-location`
- [ ] **NEAR-02**: Rider can pass an optional `radius` in miles (default 0.5, capped); the service converts it to Swiftly's `meters` parameter
- [ ] **NEAR-03**: Rider can pass an optional `number` to limit predictions per destination, forwarded to Swiftly
- [ ] **NEAR-04**: Each stop in the response carries id, name, code, and `distance` from the rider in miles; stops are sorted nearest-first
- [ ] **NEAR-05**: Each stop's predictions are grouped by route → destination, reusing the existing `RoutePrediction`/`Destination` response shapes
- [ ] **NEAR-06**: Each stop embeds its active service alerts (`ServiceAlertSummary[]`), consistent with `/stops/nearby`
- [ ] **NEAR-07**: Response includes a top-level `generatedAt` ISO timestamp

### Validation & Errors

- [ ] **NEAR-08**: Missing/non-numeric `lat`/`lng`, out-of-range coordinates, or an invalid `radius`/`number` returns 400
- [ ] **NEAR-09**: Upstream `success: false`, network error, or malformed body returns 502 via `UpstreamApiError`; individual malformed stop entries are dropped rather than failing the whole request

## Future Requirements

Deferred. Tracked but not in current roadmap.

- **NEAR-10**: Live SSE stream of nearby-location predictions
- **NEAR-11**: Optional `route` filter on nearby predictions

## Out of Scope

| Feature | Reason |
|---------|--------|
| SSE / location-based streaming | Location isn't a stable subscription key like stopId; REST-only keeps v0.5 small |
| Route filter on nearby predictions | Not needed for the initial "what's arriving around me" use case |
| Logging nearby lookups as device recents | Recents stay tied to explicit stop/route prediction lookups |
| Changes to `GET /api/v1/stops/nearby` | Stays as cheap local haversine stop discovery with no upstream call |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| NEAR-01 | Phase 11 | Pending |
| NEAR-02 | Phase 11 | Pending |
| NEAR-03 | Phase 11 | Pending |
| NEAR-04 | Phase 11 | Pending |
| NEAR-05 | Phase 11 | Pending |
| NEAR-06 | Phase 11 | Pending |
| NEAR-07 | Phase 11 | Pending |
| NEAR-08 | Phase 11 | Pending |
| NEAR-09 | Phase 11 | Pending |

**Coverage:**
- v0.5 requirements: 9 total
- Mapped to phases: 9
- Unmapped: 0 ✓

---
*Requirements defined: 2026-09-22*
*Last updated: 2026-09-23 after v0.5 roadmap creation*
