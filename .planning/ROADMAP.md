# Roadmap: dash-tracker

## Milestones

- ✅ **v0.1 Tooling Cleanup** — Phases 1-2 (shipped 2026-08-26)
- ✅ **v0.2 Real-Time Arrival Predictions** — Phases 3-4 (shipped 2026-08-27)
- ✅ **v0.3 Favorited & Recent Routes** — Phases 5-7 (shipped 2026-09-01)
- ✅ **v0.4 Service Alerts** — Phases 8-9 (shipped 2026-09-08)
- 🚧 **v0.5 Nearby Stop Predictions** — Phase 11 (in progress)

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Phase numbering is continuous across milestones (never restarts at 1)
- v0.3 (phases 5-7) and v0.4 (phases 8-9) were developed independently on separate branches before both landing on `main`; v0.4's phases were renumbered from their original 5-6 to 8-9 when the branches were merged, to keep numbering continuous
- Phase 10 was a standalone post-v0.4 phase (promoted backlog item, not part of a milestone); v0.5 continues at Phase 11

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

**Standalone (post-v0.4):**

- [x] **Phase 10: Solidify vehicle position work** (1/1 plans) — completed 2026-09-22

### 🚧 v0.5 Nearby Stop Predictions (In Progress)

**Milestone Goal:** A rider can send their location and get live arrival predictions for every stop around them in one call, backed by DASH/Swiftly's `predictions-near-location` real-time endpoint.

- [ ] **Phase 11: Nearby Stop Predictions** - Rider sends a lat/lng and gets live, nearest-first predictions for every surrounding stop (with distance and active alerts) from one uncached upstream call, with 400/502 error handling

## Phase Details

### Phase 10: Solidify vehicle position work

**Goal:** Take the `GET /api/v1/vehicles` vertical slice from quick-task to production-solid: verified DASH field mapping, repository-backed route-filter validation, and safe handling of malformed per-vehicle data.
**Requirements**: TBD (no REQUIREMENTS.md for this phase — see 10-CONTEXT.md decisions D-01 through D-11)
**Depends on:** Phase 9
**Plans:** 1/1 plans complete

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

- [x] 10-01-PLAN.md — Correct DashVehicle/VehiclePosition field mapping (loc-nesting, tripId removal, vehicleType), add BusDataRepository-backed route validation, and filter malformed coordinates

### Phase 11: Nearby Stop Predictions

**Goal**: A rider can send their location to `GET /api/v1/predictions/nearby` and get live arrival predictions for every stop around them — nearest-first, with distance and active service alerts — from a single live call to DASH/Swiftly `real-time/{agency}/predictions-near-location`.
**Depends on**: Nothing new (builds on the existing `PredictionService` response shapes, `ServiceAlertRepository` stop-alert lookup from Phase 9, and the `UpstreamApiError` → 502 mapping; independent of Phase 10)
**Requirements**: NEAR-01, NEAR-02, NEAR-03, NEAR-04, NEAR-05, NEAR-06, NEAR-07, NEAR-08, NEAR-09
**Success Criteria** (what must be TRUE):

  1. The real `predictions-near-location` payload shape (envelope, per-stop fields, distance units, stop ID space) is confirmed against a live DASH/Swiftly response before the `Dash*` nearby types and mapping are locked, and the committed test fixtures mirror that live shape — including confirming the returned stop IDs match the `BusStop.id` space used for alert matching (Phase 8 lesson: never lock DTOs from doc examples alone).
  2. `GET /api/v1/predictions/nearby?lat=..&lng=..` returns a top-level `generatedAt` ISO timestamp plus a nearest-first list of stops, each carrying id, name, code, `distance` in miles, predictions grouped route → destination in the existing `RoutePrediction`/`Destination` shapes, and its active `ServiceAlertSummary[]` alerts (empty array when none) — served from exactly one uncached upstream call per request.
  3. An optional `radius` (miles, default 0.5, capped) is sent upstream as Swiftly's `meters` parameter, and an optional `number` is forwarded to limit predictions per destination; omitting both still yields a valid response using the defaults.
  4. Missing, empty-string, or non-numeric `lat`/`lng`, out-of-range coordinates, or an invalid `radius`/`number` return 400 without making any upstream call.
  5. An upstream `success: false`, network error, or malformed body returns 502; a single malformed stop entry in an otherwise valid upstream response is dropped and the remaining stops are still returned.

Existing `GET /api/v1/stops/nearby` (local haversine, no upstream call) and `GET /api/v1/predictions` responses are unchanged; no SSE stream and no recents logging for nearby lookups.

**Plans:** 2/2 plans executed

Plans:
**Wave 1**

- [x] 11-01-PLAN.md — Core nearby endpoint: types, shared prediction mapping, NearbyPredictionService (one live predictions-near-location call, stopId grouping, nearest-first sort, alerts), lat/lng-validated controller, /nearby route, 502/malformed-entry handling (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 11-02-PLAN.md — Rider-tuned search: radius (≤1 mi → meters) and number (1..10) over HTTP, plus the full NEAR-08 400 validation matrix (wave 2, depends on 11-01)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11

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
| 10. Solidify vehicle position work | 1/1 | Complete | 2026-09-22 |
| 11. Nearby Stop Predictions | 2/2 | In Progress|  |

---

_Full phase details for shipped milestones archived to `.planning/milestones/v0.1-ROADMAP.md`, `.planning/milestones/v0.2-ROADMAP.md`, `.planning/milestones/v0.3-ROADMAP.md`, and `.planning/milestones/v0.4-ROADMAP.md`._
