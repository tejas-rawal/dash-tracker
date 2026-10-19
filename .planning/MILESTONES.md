# Milestones

## v0.6 Solidifying the backend (Shipped: 2026-10-15)

**Phases completed:** 5 phases, 18 plans, 46 tasks

**Key accomplishments:**

- No DASH call can hang any more. The shared axios client gives every request a deadline from the Zod-validated `DASH_API_TIMEOUT_MS` (default 10000 ms), and one interceptor turns timeouts and transport failures into a message-only `UpstreamApiError`. Live endpoints answer 502, and a stalled startup load or alert poll is logged instead of hanging.
- Errors that used to escape are now caught. SSE response errors are logged and run the same once-only cleanup a disconnect does. `unhandledRejection` is logged and the server stays up. `uncaughtException` is logged, then the process exits 1. All 8 controllers map errors through one `sendErrorResponse` helper, and none echoes thrown text in a 500.
- The server boots even when DASH is down. It listens as soon as SQLite opens, then loads route/stop data in the background with capped, jittered backoff until the first success, then refreshes hourly. Data-dependent endpoints answer 503 with `Retry-After: 5` until that first load. `BusDataRepository.load()` swaps in a complete, validated dataset in one step or changes nothing, so the last good copy keeps serving. Streams on a stop that a reload drops end on their next tick.
- Hosts and load balancers can probe the server. `GET /api/v1/health/live` always answers 200. `GET /api/v1/health/ready` reports the data's age and answers 503 before the first load or once the data goes stale. Neither probe ever calls DASH.
- Live DASH load is bounded per client IP. A shared limit of 60 requests per minute (express-rate-limit 8.7.0) covers `/predictions`, `/predictions/nearby`, `/predictions/stream` and `/vehicles`, and answers 429 with `Retry-After`. A separate cap allows 5 concurrent open prediction streams per IP. Both key on the client IP that `TRUST_PROXY_HOPS` resolves. In-memory endpoints and the health probes are never limited.
- Bad data no longer reaches riders. Soft-deleted alerts and alerts with malformed dates or lists are dropped one at a time, with no effect on the rest of the poll. Nearby-prediction entries with a missing or mistyped name, ID, stop code or headsign are dropped.

**Stats:** 160 commits, 163 files changed (+25,506 / −704), 72 `src/` files (+7,332 / −622); 853 tests, 98.78% statement coverage; timeline 2026-09-28 → 2026-10-13.

**Closeout:** override_closeout. The milestone audit was skipped by user choice, as for v0.1–v0.5. The VERIFICATION.md reports for Phases 12–15 all say passed, but they are flagged stale because later phases and quick task 261013-r6p edited files they covered. On 2026-10-15 the full suite (853/853), coverage, lint and build all passed. Phase 16 is verified and current. Two deferred items (Phase 12 lint, Phase 14 `request(app)`) were fixed by quick task 261013-r6p before the close.

Known verification overrides: 4 newly recorded (stale verification for Phases 12–15), 0 open audit items newly acknowledged, 2 carried forward from a prior close (see STATE.md Deferred Items)

---

## v0.5 Nearby Stop Predictions (Shipped: 2026-09-24)

**Phases completed:** 1 phases, 3 plans, 6 tasks

**Key accomplishments:**

- `GET /api/v1/predictions/nearby?lat&lng` is live. It makes one uncached DASH `predictions-near-location` call, groups the flat per-(route, stop) entries into nearest-first stops with unrounded mile distances, attaches each stop's active alerts once, returns 502 on upstream failure without leaking the API key, and drops malformed entries with a warning.
- `isValidNearbyEntry` now checks every prediction element: finite-number `min`/`sec`/`time` and string `tripId`/`vehicleId`, with no coercion. One null, scalar, empty or partial element drops only its own upstream entry with a single warn. Before this fix, a null element returned 500 with the raw TypeError text for every nearby stop, and a scalar element was served as an empty `{}` arrival.

**Stats:** 31 commits, 39 files changed (+5,042 / −95), 10 `src/` files (+1,774 / −37); 520 tests, 98.3% statement coverage; timeline 2026-09-22 → 2026-09-24.

**Closeout:** override_closeout. The milestone audit was skipped by user choice. Phase 11's VERIFICATION.md (passed, UAT 3/3) was flagged stale only because REQUIREMENTS.md changed afterward, and an override was recorded.

Known verification overrides: 2 newly acknowledged, 0 carried forward from a prior close (see STATE.md Deferred Items)

---

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
