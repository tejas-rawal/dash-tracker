# Roadmap: dash-tracker

## Milestones

- ✅ **v0.1 Tooling Cleanup** — Phases 1-2 (shipped 2026-08-26)
- ✅ **v0.2 Real-Time Arrival Predictions** — Phases 3-4 (shipped 2026-08-27)
- 🚧 **v0.4 Service Alerts** — Phases 5-6 (in progress)

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Phase numbering is continuous across milestones (never restarts at 1)

<details>
<summary>✅ v0.1 Tooling Cleanup (Phases 1-2) — SHIPPED 2026-08-26</summary>

- [x] **Phase 1: Consolidate Lint & Format Tooling** (1/1 plans) — completed 2026-08-26
- [x] **Phase 2: Full-Repo Reformat** (1/1 plans) — completed 2026-08-26

</details>

<details>
<summary>✅ v0.2 Real-Time Arrival Predictions (Phases 3-4) — SHIPPED 2026-08-27</summary>

- [x] **Phase 3: Stop Discovery** (2/2 plans) — completed 2026-08-26
- [x] **Phase 4: Live Predictions via SSE** (1/1 plans) — completed 2026-08-27

</details>

### 🚧 v0.4 Service Alerts (In Progress)

**Milestone Goal:** Surface DASH/Swiftly's GTFS-RT service alerts (detours, disruptions, stop closures) so riders can see when a route or stop is affected, instead of only seeing an ETA for a bus that isn't actually coming.

- [x] **Phase 5: Service Alerts Ingestion** - The server fetches, models, and filters currently-active GTFS-RT service alerts from DASH/Swiftly on a dedicated background poll, independent of the existing prediction poll (completed 2026-09-04)
- [ ] **Phase 6: Alerts Surfaced on Routes, Stops & Predictions** - Riders see active alerts embedded directly in route, stop, and prediction responses, with no new dedicated alerts endpoint

## Phase Details

### Phase 5: Service Alerts Ingestion

**Goal**: The server continuously fetches and maintains an up-to-date, filtered set of currently-active GTFS-RT service alerts from the DASH/Swiftly API, ready to be queried by other layers once Phase 6 wires them into responses.
**Depends on**: Nothing (extends the existing `BusDataRepository`/poll infrastructure; independent of Phase 6 until alerts need to be surfaced to clients)
**Requirements**: ALRT-01, ALRT-02, ALRT-03, ALRT-04
**Success Criteria** (what must be TRUE):

  1. The server fetches GTFS-RT service alerts (detours, disruptions, stop closures) from the DASH/Swiftly service-alerts endpoint.
  2. Alerts refresh automatically on a dedicated ~5-minute background poll, running independently of (not blocked by, and not blocking) the existing 30-second prediction poll.
  3. Each fetched alert is normalized into a `ServiceAlert` model capturing affected route(s)/stop(s), a description, severity/cause when provided by the feed, and an active window (start/end).
  4. Querying the in-memory alert store at any point in time returns only alerts whose active window contains the current time — expired or not-yet-started alerts are filtered out server-side.

**Plans**: 6/6 plans executed
Plans:

- [x] 05-01-PLAN.md — Ingest, normalize, and filter GTFS-RT service alerts (fetch, model, boot-triggered 5-min poll, active-window query)
- [x] 05-02-PLAN.md — Gap closure (G-05-1): fix service-alerts endpoint 404 + open-ended active-window bug (WR-01/02/03)
- [x] 05-03-PLAN.md — Gap closure (G-05-2): JSON.parse fallback for string-encoded response body + entity -> entities field rename to match live API
- [x] 05-04-PLAN.md — Gap closure (G-05-3): array-root body-shape guard fix (WR-01) + carried-forward review findings
- [x] 05-05-PLAN.md — Gap closure (G-05-4): request format=json from DASH gtfs-rt-alerts/v2 to fix protobuf-vs-JSON root cause
- [x] 05-06-PLAN.md — Gap closure (G-05-5): confirm the live response's real top-level body shape via a human-run diagnostic capture, then fix fetchFromDashApi()/fetchAlerts() to handle it (no {entities} envelope required)

### Phase 6: Alerts Surfaced on Routes, Stops & Predictions

**Goal**: Riders (via route and stop responses) can see active service alerts affecting what they're viewing, without a separate alerts endpoint or any SSE stream changes.
**Depends on**: Phase 5 (alerts must be ingested, modeled, and filterable before they can be embedded in responses)
**Requirements**: ALRT-05, ALRT-06, ALRT-07, ALRT-08
**Success Criteria** (what must be TRUE):

  1. `GET /api/v1/routes/all` and `GET /api/v1/routes/:shortName` include each route's currently-active alerts in the response.
  2. `GET /api/v1/routes/:shortName/stops` and `GET /api/v1/stops/nearby` include each returned stop's currently-active alerts in the response.
  3. Routes and stops with no active alerts return the same response shape as before (e.g., an empty alerts array) — no regression for existing consumers of these endpoints, and no new endpoint or SSE payload changes are introduced.

Predictions responses are unchanged (ALRT-09 deferred — alert visibility for a stop/route is already covered by its route/stop response).

**Plans**: 2 plans
Plans:
**Wave 1**

- [ ] 06-01-PLAN.md — Route alerts (ALRT-05, ALRT-06): ServiceAlertSummary model, mapping fn, ServiceAlertRepository.getActiveAlertsForRoute, BusRouteService embedding + DI wiring

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 06-02-PLAN.md — Stop alerts (ALRT-07, ALRT-08): ServiceAlertRepository.getActiveAlertsForStop, StopService embedding on getStopsForRoute/getNearbyStops + DI wiring

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Consolidate Lint & Format Tooling | 1/1 | Complete | 2026-08-26 |
| 2. Full-Repo Reformat | 1/1 | Complete | 2026-08-26 |
| 3. Stop Discovery | 2/2 | Complete | 2026-08-26 |
| 4. Live Predictions via SSE | 1/1 | Complete | 2026-08-27 |
| 5. Service Alerts Ingestion | 6/6 | Complete    | 2026-09-04 |
| 6. Alerts Surfaced on Routes, Stops & Predictions | 0/2 | Planned | - |

---

_Full phase details for shipped milestones archived to `.planning/milestones/v0.1-ROADMAP.md` and `.planning/milestones/v0.2-ROADMAP.md`._
