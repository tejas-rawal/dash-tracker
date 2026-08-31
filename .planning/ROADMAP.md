# Roadmap: dash-tracker

## Milestones

- ✅ **v0.1 Tooling Cleanup** — Phases 1-2 (shipped 2026-08-26)
- ✅ **v0.2 Real-Time Arrival Predictions** — Phases 3-4 (shipped 2026-08-27)
- 🚧 **v0.3 Favorited & Recent Routes** — Phases 5-7 (in progress)

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

### 🚧 v0.3 Favorited & Recent Routes (In Progress)

**Milestone Goal:** Riders can save routes AND stops they care about, and jump back into ones they recently viewed, scoped per anonymous device, through this backend — so a home screen can take them straight to either.

- [x] **Phase 5: SQLite Persistence Foundation** - A tested, isolated SQLite-backed repository exists for favorites and recents, covering both routes and stops via a single entity-typed schema (completed 2026-08-31)
- [x] **Phase 6: Favorites (Routes & Stops)** - Riders can favorite/unfavorite any route or stop and list their combined, type-tagged favorites (completed 2026-08-31)
- [ ] **Phase 7: Recents (Routes & Stops)** - Riders' route/stop views are auto-tracked as recents and listable as a combined, type-tagged, capped list

## Phase Details

### Phase 5: SQLite Persistence Foundation

**Goal**: A working, tested favorites/recents repository layer exists, backed by SQLite (WAL mode, busy timeout), covering both routes and stops through a single entity-typed schema — isolated from and without modifying the existing DASH-proxy repository — ready for the Favorites and Recents services to build on.
**Depends on**: Nothing new (independent of Phase 4; adds a parallel, isolated repository — doesn't touch `BusDataRepository`)
**Requirements**: PERSIST-01
**Success Criteria** (what must be TRUE):

  1. The server starts up and shuts down cleanly with the new SQLite connection lifecycle wired into the existing `app.ts` init/shutdown sequence, alongside (not inside) `BusDataRepository`.
  2. Favorite and recent rows can be written and read back for both entity types (route and stop) through the new repository's storage methods, using one entity-typed table per concern (not two parallel schemas for routes vs. stops).
  3. Concurrent "bump to top" writes to the same device's recents complete via a single atomic UPSERT (no read-then-write race) and never throw `SQLITE_BUSY`, verified under a concurrency test.
  4. `BusDataRepository` and its existing tests are completely unmodified and continue to pass unchanged — the new repository is fully additive.

**Plans**: 2/2 plans executed

Plans:
**Wave 1**

- [x] 05-01-PLAN.md — Package legitimacy checkpoint (better-sqlite3, D-01)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 05-02-PLAN.md — SQLite repository: connection lifecycle, schema, CRUD, concurrency (PERSIST-01)

### Phase 6: Favorites (Routes & Stops)

**Goal**: Riders, identified by an anonymous device ID, can favorite and unfavorite any route or stop and retrieve their full favorites as a single combined, type-tagged, hydrated list — fully self-contained, without touching any existing v0.2 code path.
**Depends on**: Phase 5 (SQLite repository must exist before favorites can persist)
**Requirements**: FAV-01, FAV-02, FAV-03, FAV-04, FAV-05, DEVICE-01
**Success Criteria** (what must be TRUE):

  1. A client can favorite a route or a stop by ID, scoped to their `X-Device-Id`; favoriting an already-favorited entity is a no-op success, not an error or duplicate.
  2. A client can unfavorite a route or a stop; unfavoriting a non-favorited entity is a no-op success, not a 404.
  3. A client can list their favorites as one combined array mixing routes and stops, each entry tagged `entityType: "route" | "stop"`, hydrated with full route/stop details (not bare IDs), ordered most-recently-favorited-first, with no cap on count.
  4. Any favorites request with a missing or empty `X-Device-Id` header is rejected with 400 — never a silent shared-bucket fallback.
  5. All existing v0.2 endpoints (routes, stop discovery, predictions, SSE) continue to respond exactly as before — favorites is purely additive.

**Plans**: 1/1 plans executed

Plans:
**Wave 1**

- [x] 06-01-PLAN.md — requireDeviceId middleware, favorite/unfavorite/list HTTP surface, FavoritesRecentsRepository.deleteFavorite (FAV-01..05, DEVICE-01)

### Phase 7: Recents (Routes & Stops)

**Goal**: Riders' real route and stop lookups are automatically tracked as recents — deduped, capped at 5, combined and type-tagged — as a side effect of prediction lookups, without ever slowing down or breaking the underlying prediction/stop response.
**Depends on**: Phase 5 (SQLite repository), Phase 6 (`requireDeviceId` middleware and the Favorites service/controller pattern this phase mirrors for Recents)
**Requirements**: RECENT-01, RECENT-02, RECENT-03, RECENT-04, RECENT-05, RECENT-06
**Success Criteria** (what must be TRUE):

  1. A prediction lookup made with an explicit `route` param auto-logs that route as a recent; an unfiltered stop-only lookup does not log any route recent.
  2. Every prediction lookup (the `stop` param is always explicit) auto-logs that stop as a recent.
  3. Re-viewing an already-recent route or stop bumps its existing entry to the top instead of creating a duplicate, and the combined recents list (routes + stops together) never exceeds 5 entries per device — oldest evicted first.
  4. A client can list their recents as one combined array mixing routes and stops, each tagged `entityType`, hydrated with full details, ordered most-recently-viewed-first.
  5. Opening an SSE prediction stream subscription never logs a recent, and the auto-logging side effect never delays or breaks the primary prediction/stop response, even if the persistence write fails.

**Plans**: 0/1 plans executed

Plans:
**Wave 1**

- [ ] 07-01-PLAN.md — Fire-and-forget stop/route recent auto-logging, cap-at-5 eviction, GET /api/v1/recents (RECENT-01..06)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Consolidate Lint & Format Tooling | 1/1 | Complete | 2026-08-26 |
| 2. Full-Repo Reformat | 1/1 | Complete | 2026-08-26 |
| 3. Stop Discovery | 2/2 | Complete | 2026-08-26 |
| 4. Live Predictions via SSE | 1/1 | Complete | 2026-08-27 |
| 5. SQLite Persistence Foundation | 2/2 | Complete    | 2026-08-31 |
| 6. Favorites (Routes & Stops) | 1/1 | Complete    | 2026-08-31 |
| 7. Recents (Routes & Stops) | 0/1 | Not started | - |

---

_Full phase details for shipped milestones archived to `.planning/milestones/v0.1-ROADMAP.md` and `.planning/milestones/v0.2-ROADMAP.md`._
