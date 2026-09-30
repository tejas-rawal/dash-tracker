# Roadmap: dash-tracker

## Milestones

- ✅ **v0.1 Tooling Cleanup** — Phases 1-2 (shipped 2026-08-26)
- ✅ **v0.2 Real-Time Arrival Predictions** — Phases 3-4 (shipped 2026-08-27)
- ✅ **v0.3 Favorited & Recent Routes** — Phases 5-7 (shipped 2026-09-01)
- ✅ **v0.4 Service Alerts** — Phases 8-9 (shipped 2026-09-08)
- ✅ **v0.5 Nearby Stop Predictions** — Phase 11 (shipped 2026-09-24)
- 🚧 **v0.6 Solidifying the backend** — Phases 12-15 (in progress)

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Phase numbering is continuous across milestones (never restarts at 1); v0.6 continues at Phase 12
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

### 🚧 v0.6 Solidifying the backend (In Progress)

**Milestone Goal:** The server stays up, stays current, and stays responsive when DASH is slow, down, or changing — and can tell a host or load balancer whether it is healthy.

- [x] **Phase 12: Bounded Upstream Calls & Error Safety Nets** - No DASH call can hang (timeouts map to 502), and SSE socket errors and stray promise rejections are logged and cleaned up instead of escaping (completed 2026-09-29)
- [ ] **Phase 13: Resilient Route/Stop Data Lifecycle** - Server listens even when DASH is down at boot, loads route/stop data in the background with backoff (503 until ready), then keeps it fresh on an interval while holding last-good data through failures
- [ ] **Phase 14: Health Checks & Rate Limiting** - Liveness and readiness endpoints report process health and route/stop data age; live-upstream endpoints return 429 per client IP while in-memory endpoints stay unlimited
- [ ] **Phase 15: Alert & Nearby Data Hygiene** - Soft-deleted and malformed-date alerts never reach riders, and nearby-prediction entries with missing or mistyped display fields are dropped

## Phase Details

### Phase 12: Bounded Upstream Calls & Error Safety Nets

**Goal**: No DASH call can hang the server or a rider's request, and asynchronous errors that currently escape (SSE socket errors, unhandled promise rejections) are logged and cleaned up.
**Depends on**: Nothing in this milestone (builds on the shared axios client in `src/server/config/axios.ts`, the existing `UpstreamApiError` → 502 mapping, and `PredictionStreamController`'s disconnect cleanup)
**Requirements**: UPST-01, UPST-02, ERR-01, ERR-02
**Success Criteria** (what must be TRUE):

  1. With DASH blackholed (connection accepted, no response), `GET /api/v1/predictions`, `/predictions/nearby`, and `/vehicles` each return 502 shortly after the configured timeout elapses instead of staying pending, and the error body/logs never include the DASH API key.
  2. The upstream timeout comes from a Zod-validated env var with a sensible default; an invalid value fails startup the same way the other env vars do.
  3. The startup route/stop load and the 5-minute alert poll go through the same bounded client, so a blackholed DASH produces a logged timeout error instead of a silently hung boot or poll.
  4. When an SSE response emits an error mid-stream, the error is logged, that subscriber is removed exactly as a client disconnect would remove it (the per-stop poll stops if it was the last subscriber), and other subscribers on the same stop keep receiving updates.
  5. An unhandled promise rejection anywhere in the process is logged through Winston with its reason instead of going unhandled.

**Plans**: 4/4 plans executed

Plans:
**Wave 1**

- [x] 12-01-PLAN.md — Bounded shared DASH client: `DASH_API_TIMEOUT_MS` (Zod, default 10000), per-request `AbortSignal.timeout` deadline, central message-only `UpstreamApiError` mapping; tracer on `/vehicles` against a blackholed DASH (wave 1)
- [x] 12-03-PLAN.md — SSE `res.on("error")` warn + shared idempotent disconnect cleanup in `PredictionStreamController`, multi-subscriber isolation (wave 1)
- [x] 12-04-PLAN.md — `registerProcessErrorHandlers()`: `unhandledRejection` logs and stays up, `uncaughtException` logs then exits 1, secret-safe reason logging, registered first in `app.ts` (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 12-02-PLAN.md — Remove Nearby's redundant transport wrap (D-07); blackholed-DASH 502s for `/predictions` and `/predictions/nearby`, concurrent requests, startup load and alert poll logged timeouts (wave 2, after 12-01)

### Phase 13: Resilient Route/Stop Data Lifecycle

**Goal**: The server comes up and serves what it can even when DASH is down at boot, becomes fully usable on its own once DASH is reachable, and keeps route/stop data current for as long as it runs without ever losing its last good copy.
**Depends on**: Phase 12 (bounded timeouts are what let each boot-retry and refresh attempt fail and move on instead of hanging)
**Requirements**: BOOT-01, BOOT-02, BOOT-03, DATA-01, DATA-02, DATA-03
**Success Criteria** (what must be TRUE):

  1. Started with DASH unreachable, the server accepts HTTP connections right away instead of exiting, and the logs show the initial route/stop load being retried with increasing delays.
  2. Until the first successful load, endpoints that depend on route/stop data (routes, route stops, nearby stops, favorites/recents hydration, route-validated prediction/vehicle lookups) return 503 instead of 500; once DASH becomes reachable, the same endpoints start returning 200 without a restart.
  3. After the first load, route/stop data is re-fetched from DASH on a background interval for the life of the process, so an upstream route/stop change appears in responses without a restart.
  4. A failed refresh is logged and every endpoint keeps serving the last successfully loaded route/stop data, with no 5xx and no partially swapped data.
  5. The repository records when route/stop data was last loaded successfully, advancing that timestamp on each successful load or refresh and leaving it unchanged on a failed one. Background load and refresh timers stop cleanly on SIGTERM/SIGINT.

**Plans**: 5 plans

Plans:
**Wave 1**

- [ ] 13-01-PLAN.md — `DataNotReadyError` + shared `sendErrorResponse` (404/503 + `Retry-After: 5`/502/generic logged 500); tracer on `/predictions/stream`, then `/vehicles?route=` (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 13-02-PLAN.md — BusRoute, Stop and Prediction controllers on the shared helper; 503 before load for `/routes/all`, `/routes/:shortName`, `/routes/:shortName/stops`, `/stops/nearby`, `/predictions` (wave 2)
- [ ] 13-03-PLAN.md — Single atomic `BusDataRepository.load()` with `getLoadState()` (`lastLoadedAt`/`lastFailedAt`/`lastError`), zero routes = failure, no repository logging; failed reloads keep the last good data (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 13-04-PLAN.md — Favorites, Recents and NearbyPrediction controllers on the shared helper; favorites/recents hydration surfaces 503; all 8 controllers share one mapping (wave 3)
- [ ] 13-05-PLAN.md — `BusDataRefreshService` (equal-jitter backoff 1s→60s cap, then hourly, chained `setTimeout`, one log line per attempt), D-18 boot order (listen before DASH), `ServiceAlertPollService.stop()`, clean SIGTERM/SIGINT (wave 3)

### Phase 14: Health Checks & Rate Limiting

**Goal**: A host or load balancer can tell whether the server is alive and whether its data is fresh enough to serve, and no single client IP can exhaust the live DASH upstream.
**Depends on**: Phase 13 (readiness reports the data-loaded state and last-loaded timestamp that Phase 13 introduces)
**Requirements**: HLTH-01, HLTH-02, RATE-01, RATE-02
**Success Criteria** (what must be TRUE):

  1. The liveness endpoint returns 200 whenever the process is up, including while DASH is down and before route/stop data has loaded, and never makes an upstream call.
  2. The readiness endpoint returns 200 with the data's age once route/stop data is loaded and fresher than the staleness threshold. It returns 503 before the first load and when refreshes have failed long enough for the data to go stale, and it reports the data age (or that data was never loaded) in both cases.
  3. A single client IP that exceeds the limit on `/predictions`, `/predictions/nearby`, or `/vehicles` receives 429 with a `Retry-After` header, while a different IP is unaffected and the limited IP is served again after the window resets.
  4. Routes, stops, favorites/recents, and health endpoints never return 429 no matter how many requests one IP sends.

**Plans**: TBD

### Phase 15: Alert & Nearby Data Hygiene

**Goal**: Riders are never shown alerts that DASH has deleted or whose dates can't be trusted, and never shown nearby-prediction stops with missing or garbled names.
**Depends on**: Nothing in this milestone (independent of Phases 12-14; ordered last by priority, touches `ServiceAlertRepository`/`ServiceAlertService` and the nearby entry guard only)
**Requirements**: ALRT-12, ALRT-13, NEAR-12
**Success Criteria** (what must be TRUE):

  1. An alert whose upstream record carries a `deletedAt` value never appears on route, stop, nearby-stop, or nearby-prediction responses, even when its active window covers the current time.
  2. An alert with a malformed `activePeriod` date is excluded from every response and logged with its alert id, instead of being treated as active.
  3. A nearby-prediction upstream entry whose display fields (route/stop/destination names and IDs, `agencyKey`) are missing or the wrong type is dropped with the existing single warn, so no nearby stop is served without its name. Valid entries in the same response are still returned.
  4. Well-formed alerts and nearby entries are served exactly as before (no regression in existing route, stop, and nearby-prediction responses).

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 12 → 13 → 14 → 15

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
| 12. Bounded Upstream Calls & Error Safety Nets | v0.6 | 4/4 | Complete    | 2026-09-29 |
| 13. Resilient Route/Stop Data Lifecycle | v0.6 | 0/5 | Planned | - |
| 14. Health Checks & Rate Limiting | v0.6 | 0/TBD | Not started | - |
| 15. Alert & Nearby Data Hygiene | v0.6 | 0/TBD | Not started | - |

---

_Full phase details for shipped milestones archived to `.planning/milestones/v0.1-ROADMAP.md` through `.planning/milestones/v0.5-ROADMAP.md`._
