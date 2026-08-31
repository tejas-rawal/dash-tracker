# Requirements: dash-tracker

**Defined:** 2026-08-31
**Core Value:** Riders can always see accurate, near-real-time arrival predictions for their stop.

## v1 Requirements

Requirements for milestone v0.3 (Favorited & Recent Routes). Each maps to roadmap phases.

### Favorites

- [x] **FAV-01**: User can favorite a route (device-scoped, idempotent — favoriting an already-favorited route is a no-op success, not an error or duplicate)
- [x] **FAV-02**: User can favorite a stop (device-scoped, idempotent — same semantics as FAV-01)
- [x] **FAV-03**: User can unfavorite a route (idempotent — unfavoriting a non-favorited route is a no-op success, not a 404)
- [x] **FAV-04**: User can unfavorite a stop (idempotent — same semantics as FAV-03)
- [x] **FAV-05**: User can list their favorites as one combined list mixing routes and stops, each entry tagged with its type (`entityType: "route" | "stop"`), hydrated with full details (not bare IDs), ordered most-recently-favorited-first, no cap on count

### Recents

- [x] **RECENT-01**: System auto-logs a recent route when a client makes a prediction lookup with an explicit `route` param (an unfiltered stop-only lookup does NOT log a route recent, since it may return multiple routes and no single one was explicitly chosen)
- [x] **RECENT-02**: System auto-logs a recent stop whenever a client looks up predictions for that stop (the `stop` param is always a single explicit value, so every prediction lookup logs its stop)
- [x] **RECENT-03**: Recents are deduped via bump-to-top semantics (UPSERT) — re-viewing an already-recent route or stop moves its existing entry to the top instead of creating a duplicate
- [x] **RECENT-04**: Recents list is capped at 5 entries per device (across routes and stops combined), oldest entry evicted when the cap is exceeded
- [x] **RECENT-05**: User can list their recents as one combined list mixing routes and stops, each entry tagged with its type, hydrated with full details, ordered most-recently-viewed-first
- [x] **RECENT-06**: Opening an SSE prediction stream subscription (`/predictions/stream`) never logs a recent — only REST prediction lookups do (SSE has no explicit route param and shouldn't infer one)

### Infrastructure

- [x] **DEVICE-01**: All favorites/recents endpoints require an `X-Device-Id` header; a missing or empty header returns 400, never a silent shared-bucket fallback
- [x] **PERSIST-01**: Favorites and recents persist in a new SQLite-backed repository, isolated from the existing `BusDataRepository` (no changes to the DASH-proxy repository), following the existing routes → controllers → services → repository architecture

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Personalization

- **PERS-01**: Manual favorite reordering (drag-and-drop / explicit sort order)
- **PERS-02**: Favorite folders/tags/grouping
- **PERS-03**: Favorite-aware batched predictions endpoint (single call returning predictions for all favorited routes/stops)
- **PERS-04**: Push notifications when a favorited route has a service alert
- **PERS-05**: Real accounts / linking multiple device IDs to one identity (device ID is designed to become a foreign key for this later)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Cap on number of favorites | Explicit requirement is no cap — a rider's deliberate favorite set is self-limiting at this domain's scale (dozens of routes/stops, not thousands) |
| Combined single `/favorites-and-recents` endpoint | Different write triggers (explicit toggle vs. auto-logged side effect) and different cardinalities (unbounded vs. capped-at-5) — kept as two separate endpoints/resources |
| Dedicated "log a view" endpoint | Explicitly rejected — recents must be inferred automatically from existing prediction lookups so no client can forget to call it |
| Denormalized route/stop snapshot stored on favorite/recent rows | Would go stale as DASH data changes; hydrate from `BusDataRepository` at read time instead |
| Device ID validation/signing/tokens | Nothing sensitive is behind a favorites list yet; treat `X-Device-Id` as an opaque, client-generated, non-secret identifier |
| Cascading delete of favorites/recents when a DASH route/stop disappears | Would couple the new repository to `BusDataRepository`'s refresh cycle, violating the existing repository-isolation constraint; handle missing routes/stops at read time instead |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FAV-01 | Phase 6 | Complete |
| FAV-02 | Phase 6 | Complete |
| FAV-03 | Phase 6 | Complete |
| FAV-04 | Phase 6 | Complete |
| FAV-05 | Phase 6 | Complete |
| RECENT-01 | Phase 7 | Complete |
| RECENT-02 | Phase 7 | Complete |
| RECENT-03 | Phase 7 | Complete |
| RECENT-04 | Phase 7 | Complete |
| RECENT-05 | Phase 7 | Complete |
| RECENT-06 | Phase 7 | Complete |
| DEVICE-01 | Phase 6 | Complete |
| PERSIST-01 | Phase 5 | Complete |

**Coverage:**

- v1 requirements: 13 total
- Mapped to phases: 13 (Phase 5: 1, Phase 6: 6, Phase 7: 6)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-31*
*Last updated: 2026-08-31 after v0.3 roadmap creation (Phases 5-7)*
