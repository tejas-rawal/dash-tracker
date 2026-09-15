# Roadmap: dash-tracker

## Milestones

- ✅ **v0.1 Tooling Cleanup** — Phases 1-2 (shipped 2026-08-26)
- ✅ **v0.2 Real-Time Arrival Predictions** — Phases 3-4 (shipped 2026-08-27)
- ✅ **v0.3 Favorited & Recent Routes** — Phases 5-7 (shipped 2026-09-01)
- ✅ **v0.4 Service Alerts** — Phases 8-9 (shipped 2026-09-08)

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Phase numbering is continuous across milestones (never restarts at 1)
- v0.3 (phases 5-7) and v0.4 (phases 8-9) were developed independently on separate branches before both landing on `main`; v0.4's phases were renumbered from their original 5-6 to 8-9 when the branches were merged, to keep numbering continuous

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

<details>
<summary>✅ v0.3 Favorited & Recent Routes (Phases 5-7) — SHIPPED 2026-09-01</summary>

- [x] **Phase 5: SQLite Persistence Foundation** (2/2 plans) — completed 2026-08-31
- [x] **Phase 6: Favorites (Routes & Stops)** (1/1 plans) — completed 2026-08-31
- [x] **Phase 7: Recents (Routes & Stops)** (1/1 plans) — completed 2026-09-01

</details>

<details>
<summary>✅ v0.4 Service Alerts (Phases 8-9) — SHIPPED 2026-09-08</summary>

- [x] **Phase 8: Service Alerts Ingestion** (6/6 plans) — completed 2026-09-04
- [x] **Phase 9: Alerts Surfaced on Routes, Stops & Predictions** (2/2 plans) — completed 2026-09-08

See `.planning/milestones/v0.4-ROADMAP.md` for full phase details.

</details>

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Consolidate Lint & Format Tooling | 1/1 | Complete | 2026-08-26 |
| 2. Full-Repo Reformat | 1/1 | Complete | 2026-08-26 |
| 3. Stop Discovery | 2/2 | Complete | 2026-08-26 |
| 4. Live Predictions via SSE | 1/1 | Complete | 2026-08-27 |
| 5. SQLite Persistence Foundation | 2/2 | Complete | 2026-08-31 |
| 6. Favorites (Routes & Stops) | 1/1 | Complete | 2026-08-31 |
| 7. Recents (Routes & Stops) | 1/1 | Complete | 2026-09-01 |
| 8. Service Alerts Ingestion | 6/6 | Complete | 2026-09-04 |
| 9. Alerts Surfaced on Routes, Stops & Predictions | 2/2 | Complete | 2026-09-08 |

---

## Backlog

### Phase 999.1: Solidify vehicle position work (BACKLOG)

**Goal:** [Captured for future planning]
**Requirements:** TBD
**Plans:** 0 plans

**Context — what's already done (quick task 260915-fc8, branch `feat/gtfs-realtime-endpoints`, commits `4a5c1f5`/`04a2b66`/`73b20b6`):**

- Confirmed `PredictionService` already calls Swiftly's real-time predictions endpoint (`/real-time/{agency}/predictions` against `https://api.goswift.ly`) — no change needed there.
- Added a first vertical slice for vehicle positions, following the existing layered architecture: `src/server/api/models/Vehicle.ts` (`DashVehicle`/`DashVehiclesApiResponse` vs. `VehiclePosition`/`VehiclePositionsResponse`/`VehicleOptions`), `VehicleService.ts` (fetches `/real-time/{agency}/vehicles`, optional `route` filter), `VehicleController.ts`, `vehicleRoutes.ts`, wired to `GET /api/v1/vehicles?route=`. 14 new tests (`VehicleService.test.ts`, `VehicleController.test.ts`), all passing.

**What's remaining/missing before this is production-solid:**

- `DashVehicle`'s field names (`id`, `routeId`, `routeShortName`, `tripId`, `directionId`, `headsign`, `lat`, `lon`, `heading`, `speed`, `lastUpdated`) are a best-effort inference, **not verified** against Swiftly's real-time vehicles API docs (the Stoplight page is JS-rendered and couldn't be fetched by either the planner or a follow-up check) or a live payload (no `DASH_API_KEY` was available in the dev environment). Needs verification against a real DASH API response before this is trusted in production — same risk class as the Phase 8 alerts payload, and isolated the same way (only `DashVehicle` + its mapping function would need to change).
- No caching/polling strategy decided. Vehicle positions currently fetch live/uncached per request, same as predictions — but vehicles update more frequently than predictions and are a natural fit for the existing SSE infrastructure built for live predictions (Phase 4). Worth deciding whether `GET /api/v1/vehicles` should stay REST-only or grow a streaming variant.
- No handling/tests yet for: filtering by multiple routes at once, malformed or missing coordinates in the upstream payload, or stale/out-of-date vehicle data (no `lastUpdated` staleness check).
- No rate-limiting or upstream error-budget consideration for this new live call path.
- This was intentionally scoped as a minimal quick task (no discussion, research, or plan-checker phases were run), so none of the above assumptions were validated — this backlog item should go through a full phase (discuss → plan → execute) rather than another quick task.

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

---

_Full phase details for shipped milestones archived to `.planning/milestones/v0.1-ROADMAP.md`, `.planning/milestones/v0.2-ROADMAP.md`, `.planning/milestones/v0.3-ROADMAP.md`, and `.planning/milestones/v0.4-ROADMAP.md`._
