# Roadmap: dash-tracker

## Milestones

- ✅ **v0.1 Tooling Cleanup** — Phases 1-2 (shipped 2026-08-26)
- ✅ **v0.2 Real-Time Arrival Predictions** — Phases 3-4 (shipped 2026-08-27)
- ✅ **v0.3 Favorited & Recent Routes** — Phases 5-7 (shipped 2026-09-01)
- ✅ **v0.4 Service Alerts** — Phases 8-9 (shipped 2026-09-08)
- ✅ **v0.5 Nearby Stop Predictions** — Phase 11 (shipped 2026-09-24)
- ✅ **v0.6 Solidifying the backend** — Phases 12-16 (shipped 2026-10-15)

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Phase numbering is continuous across milestones (never restarts at 1); the next milestone continues at Phase 17
- v0.3 (phases 5-7) and v0.4 (phases 8-9) were developed independently on separate branches before both landing on `main`; v0.4's phases were renumbered from their original 5-6 to 8-9 when the branches were merged, to keep numbering continuous
- Phase 10 was a standalone post-v0.4 phase (promoted backlog item, not part of a milestone); v0.5 continued at Phase 11

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

- [x] **Phase 10: Solidify vehicle position work** (1/1 plans) — completed 2026-09-22 (details in `.planning/milestones/v0.4-phases/10-solidify-vehicle-position-work/`)

<details>
<summary>✅ v0.5 Nearby Stop Predictions (Phase 11) — SHIPPED 2026-09-24</summary>

- [x] **Phase 11: Nearby Stop Predictions** (3/3 plans) — completed 2026-09-24

See `.planning/milestones/v0.5-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v0.6 Solidifying the backend (Phases 12-16) — SHIPPED 2026-10-15</summary>

- [x] **Phase 12: Bounded Upstream Calls & Error Safety Nets** (4/4 plans) — completed 2026-09-29
- [x] **Phase 13: Resilient Route/Stop Data Lifecycle** (7/7 plans) — completed 2026-10-01
- [x] **Phase 14: Health Checks & Rate Limiting** (3/3 plans) — completed 2026-10-07
- [x] **Phase 15: Alert & Nearby Data Hygiene** (3/3 plans) — completed 2026-10-07
- [x] **Phase 16: Concurrent SSE Stream Cap per IP** (1/1 plans) — completed 2026-10-13

See `.planning/milestones/v0.6-ROADMAP.md` for full phase details.

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Consolidate Lint & Format Tooling | v0.1 | 1/1 | Complete | 2026-08-26 |
| 2. Full-Repo Reformat | v0.1 | 1/1 | Complete | 2026-08-26 |
| 3. Stop Discovery | v0.2 | 2/2 | Complete | 2026-08-26 |
| 4. Live Predictions via SSE | v0.2 | 1/1 | Complete | 2026-08-27 |
| 5. SQLite Persistence Foundation | v0.3 | 2/2 | Complete | 2026-08-31 |
| 6. Favorites (Routes & Stops) | v0.3 | 1/1 | Complete | 2026-08-31 |
| 7. Recents (Routes & Stops) | v0.3 | 1/1 | Complete | 2026-09-01 |
| 8. Service Alerts Ingestion | v0.4 | 6/6 | Complete | 2026-09-04 |
| 9. Alerts Surfaced on Routes, Stops & Predictions | v0.4 | 2/2 | Complete | 2026-09-08 |
| 10. Solidify vehicle position work | standalone | 1/1 | Complete | 2026-09-22 |
| 11. Nearby Stop Predictions | v0.5 | 3/3 | Complete | 2026-09-24 |
| 12. Bounded Upstream Calls & Error Safety Nets | v0.6 | 4/4 | Complete | 2026-09-29 |
| 13. Resilient Route/Stop Data Lifecycle | v0.6 | 7/7 | Complete | 2026-10-01 |
| 14. Health Checks & Rate Limiting | v0.6 | 3/3 | Complete | 2026-10-07 |
| 15. Alert & Nearby Data Hygiene | v0.6 | 3/3 | Complete | 2026-10-07 |
| 16. Concurrent SSE Stream Cap per IP | v0.6 | 1/1 | Complete | 2026-10-13 |

---

_Full phase details for shipped milestones archived to `.planning/milestones/v0.1-ROADMAP.md` through `.planning/milestones/v0.6-ROADMAP.md`._
