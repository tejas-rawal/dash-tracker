# Milestones

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
