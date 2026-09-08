# Milestones

## v0.4 Service Alerts (Shipped: 2026-09-08)

**Phases completed:** 2 phases, 8 plans, 14 tasks

**Key accomplishments:**

- GTFS-RT service alert fetch, normalize, and active-window filtering pipeline (ServiceAlert model, ServiceAlertService, ServiceAlertRepository, ServiceAlertPollService) with a boot-triggered, non-blocking 5-minute poll wired into app.ts.
- Fixed the confirmed `gtfs-rt-alerts/v2` DASH/Swiftly endpoint path (closing G-05-1's live 404), corrected `deriveActiveWindow`'s silent open-ended-window collapse, and hardened `fetchAlerts()` against malformed upstream response shapes.
- Fixed two independent live-breaking bugs in ServiceAlertService: a defensive JSON.parse fallback for a string-encoded response body, and an `entity` -> `entities` field rename matching the live DASH/Swiftly payload shape
- Fixed `fetchFromDashApi()`'s body-shape guard to reject array-rooted upstream response bodies (`typeof [] === "object"` was letting them silently pass), closing 08-VERIFICATION.md's last confirmed blocking gap (G-05-3) with two TDD regression tests, plus closed three carried-forward code-review findings (WR-02, IN-01, IN-02) on the same file.
- Fixed the true root cause of G-05-2/G-05-4 by requesting `format=json` from Swiftly's gtfs-rt-alerts/v2 endpoint (which defaults to protobuf binary), removed a leftover debug `console.log`, and added a regression test proving headerText/descriptionText/url all map correctly together.
- Rewrote ServiceAlertService's DASH response parsing against a confirmed live payload capture — the real feed is a flat, custom Swiftly format, not GTFS-RT-protobuf JSON as previously assumed.

---

## v0.3 Favorited & Recent Routes (Shipped: 2026-09-01)

**Phases completed:** 3 phases, 4 plans, 9 tasks

**Key accomplishments:**

- FavoritesRecentsRepository — a singleton, WAL-mode SQLite repository with atomic upsert CRUD for favorites and recents, covering both routes and stops through one entity-typed table per concern, wired into app.ts's startup/shutdown lifecycle alongside BusDataRepository
- Anonymous device-scoped Favorites HTTP API (POST/DELETE/GET /api/v1/favorites) with requireDeviceId middleware, entity hydration via BusDataRepository, and idempotent add/no-op-remove semantics
- Fire-and-forget stop/route recents logging on every REST prediction lookup, cap-at-5 oldest-evicted-first eviction inside `FavoritesRecentsRepository.upsertRecent`, and a new `GET /api/v1/recents` endpoint mirroring the Favorites pattern

---

## v0.2 Real-Time Arrival Predictions (Shipped: 2026-08-27)

**Phases completed:** 2 phases, 3 plans, 7 tasks

**Key accomplishments:**

- Stop discovery: `GET /api/v1/routes/:shortName/stops` returns the ordered, per-direction list of stops for a route (`StopService`/`StopController`)
- Stop discovery: `GET /api/v1/stops/nearby` haversine-based search by lat/lng, radius + result-count bound (default 0.5mi/10 results, capped at 50)
- Live predictions: `GET /api/v1/predictions/stream?stop={id}` SSE endpoint backed by one shared 30-second upstream poll loop per subscribed stop, starting on first subscriber and stopping when idle
- REST predictions endpoint kept fully independent as a fallback/initial-load path alongside the new SSE feed
- `generatedAt` freshness timestamp added to both REST and SSE prediction responses
- Code review caught and fixed 3 Critical concurrency/leak bugs (duplicate poll loops on concurrent first-subscribers, a disconnect-cleanup race, one bad subscriber able to starve others) before phase close, via a 3-iteration fix/re-review cycle

---

## v0.1 Tooling Cleanup (Shipped: 2026-08-26)

**Phases completed:** 2 phases, 2 plans, 3 tasks

**Key accomplishments:**

- Biome is now the sole lint/format tool — Prettier, its plugin, and its config are fully removed from package.json, both lockfiles, and editor tooling, with format scripts rewired to `biome check .` / `biome check . --write`.
- Ran Biome's formatter (safe fixes only) across all 29 previously-unformatted tracked files, landing the result as a single isolated, purely-cosmetic commit that brings `bun run format`/`bun run lint` from 35 errors to 0 errors repo-wide.

---
