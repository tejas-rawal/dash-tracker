# Roadmap: dash-tracker

## Milestones

- ✅ **v0.1 Tooling Cleanup** — Phases 1-2 (shipped 2026-08-26)
- 🚧 **v0.2 Real-Time Arrival Predictions** — Phases 3-4 (in progress)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Phase numbering is continuous across milestones (never restarts at 1)

<details>
<summary>✅ v0.1 Tooling Cleanup (Phases 1-2) — SHIPPED 2026-08-26</summary>

- [x] **Phase 1: Consolidate Lint & Format Tooling** (1/1 plans) — completed 2026-08-26
- [x] **Phase 2: Full-Repo Reformat** (1/1 plans) — completed 2026-08-26

</details>

### 🚧 v0.2 Real-Time Arrival Predictions (In Progress)

**Milestone Goal:** Give the future Expo/React Native app what it needs to show near-real-time bus arrivals for a selected stop — stop discovery plus a live-updating predictions feed.

- [ ] **Phase 3: Stop Discovery** - Riders can find stops by route or by location before subscribing to predictions
- [ ] **Phase 4: Live Predictions via SSE** - Riders get live-updating arrival predictions over SSE, backed by a shared poll loop, with REST fallback and freshness timestamps

## Phase Details

### Phase 3: Stop Discovery
**Goal**: Riders (via future client apps) can discover which stops belong to a route and which stops are near their current location, so they can pick a stop before requesting predictions for it.
**Depends on**: Nothing (independent of Phase 4; builds on existing route/stop data already loaded in `BusDataRepository`)
**Requirements**: STOP-01, STOP-02
**Success Criteria** (what must be TRUE):
  1. Given a valid route (by short name), a client can retrieve the ordered list of stops served by that route.
  2. Given a latitude/longitude plus optional radius and max-count parameters, a client can retrieve nearby stops within that radius, sorted by proximity, capped at the requested (or a sensible default) count.
  3. Requesting stops for an unknown route returns a typed 404 (`NotFoundError`), and invalid or out-of-range coordinate/radius input returns a typed 400 validation error, consistent with existing controller conventions.
  4. Existing routes and predictions endpoints continue to respond exactly as before — no regression introduced by adding the new stop-discovery endpoints.
**Plans**: TBD

### Phase 4: Live Predictions via SSE
**Goal**: Riders can subscribe to a stop and see arrival predictions update automatically over a live connection, with the existing REST endpoint still available as a fallback, and both response shapes reporting server-side freshness.
**Depends on**: Nothing (independent of Phase 3; extends the existing `PredictionService`/REST endpoint with a new SSE path and a shared poll loop)
**Requirements**: LIVE-01, LIVE-02, LIVE-03, LIVE-04, LIVE-05
**Success Criteria** (what must be TRUE):
  1. A client can open a Server-Sent Events connection scoped to a stop and receive prediction updates automatically, roughly every 30 seconds, without any client-side polling.
  2. However many clients are subscribed to a given stop's SSE stream, the upstream DASH API for that stop is polled at most once per 30-second interval — one shared poll loop per stop, not one per subscriber.
  3. When the last SSE subscriber for a stop disconnects, that stop's upstream polling stops; when a new subscriber connects (immediately or later), polling resumes automatically.
  4. The existing REST endpoint (`GET /api/v1/predictions`) still returns predictions on demand, unchanged in behavior, usable for initial load or as a fallback when SSE isn't available.
  5. Both the REST response and every SSE update include a `generatedAt` timestamp indicating when the server produced that specific payload.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Consolidate Lint & Format Tooling | 1/1 | Complete | 2026-08-26 |
| 2. Full-Repo Reformat | 1/1 | Complete | 2026-08-26 |
| 3. Stop Discovery | 0/TBD | Not started | - |
| 4. Live Predictions via SSE | 0/TBD | Not started | - |
