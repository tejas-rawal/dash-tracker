# dash-tracker

## What This Is

dash-tracker is a Node.js/Express REST API that proxies and structures data from the DASH public transit API (goswift.ly), exposing bus routes, stop discovery, and arrival predictions — via both REST and a live Server-Sent Events feed — through a layered architecture (routes → controllers → services → repositories). v0.1 shipped a dev-tooling cleanup (Biome-only lint/format); v0.2 shipped the first real feature set: riders (via a future client) can discover stops and get near-real-time arrival predictions that update automatically over a live connection.

## Core Value

Riders can always see accurate, near-real-time arrival predictions for their stop.

## Current Milestone: v0.3 Favorited & Recent Routes

**Goal:** Riders can save routes AND stops they care about, and jump back into ones they recently viewed, scoped per device, through this backend — so a home screen can take them straight to either.

**Target features:**
- Anonymous device-ID-scoped favorites, covering both routes and stops (add/remove, no cap, most-recently-favorited-first)
- Auto-tracked recents, covering both routes and stops (last 5 per device, logged on explicit-route/stop REST prediction lookups only — not unfiltered stop lookups, not SSE subscriptions)
- SQLite-backed persistence via a new repository layer, following the existing routes → controllers → services → repository architecture

## Requirements

### Validated

- ✓ REST API proxies DASH transit API for bus routes and arrival predictions — existing
- ✓ Layered architecture (routes → controllers → services → repositories) with factory-function DI — existing
- ✓ TypeScript strict mode, compiled via `tsc` to `dist/` (ES2020, CommonJS) — existing
- ✓ Vitest test suite with 80% coverage thresholds — existing
- ✓ Biome is the sole tool for both linting and formatting (`biome check`/`biome check --write`) — v0.1
- ✓ Prettier, `@jonahsnider/prettier-config`, and `prettier-plugin-packagejson` fully removed (dependency, config, scripts) — v0.1
- ✓ `package.json` scripts (`lint`, `lint:fix`, `format`, `format:write`) updated to reflect the single-tool flow — v0.1
- ✓ Full codebase reformatted under Biome's formatter with zero outstanding diffs, landed as its own commit separate from the config/dependency change — v0.1
- ✓ Stop discovery: list stops for a given route (`GET /api/v1/routes/:shortName/stops`, grouped by direction) — Phase 3
- ✓ Stop discovery: find nearby stops by lat/lng (`GET /api/v1/stops/nearby`, radius + result-count bound, haversine distance) — Phase 3
- ✓ Live predictions via Server-Sent Events, subscribed per stop (`GET /api/v1/predictions/stream?stop={id}`) — v0.2 Phase 4
- ✓ Shared per-stop upstream poll loop (30s), started on first subscriber and stopped when idle — v0.2 Phase 4
- ✓ REST predictions endpoint retained as fallback/initial-load path, fully independent of SSE — v0.2 Phase 4
- ✓ `generatedAt` freshness timestamp added to REST and SSE prediction payloads — v0.2 Phase 4
- ✓ SQLite-backed persistence layer for favorites/recents, isolated behind a repository (no changes to existing DASH proxy repository) — v0.3 Phase 5
- ✓ Anonymous device-ID-scoped favorites: add/remove a route OR stop as favorite, list favorites with full details, most-recently-favorited-first, no cap — v0.3 Phase 6

### Active

- [ ] Auto-tracked recents (routes and stops): last 5 per device, logged automatically on explicit-route/stop REST prediction lookups (not unfiltered stop lookups, not SSE subscriptions), list with full details

### Out of Scope

- The Expo/React Native frontend app itself — this repo is intended to eventually house both backend and frontend (monorepo, not separate repos), but the app is deferred to a future milestone
- Offline caching and countdown animation UI — client-side concerns that land with the future Expo milestone
- Replacing `tsc` as the build tool (e.g. with Vite/esbuild) — Vite is a frontend bundler/dev server and doesn't fit compiling this Node/Express backend; not part of this cleanup
- Replacing Vitest — it's a test runner only, unrelated to lint/format consolidation

## Context

- This repo is intended to eventually house both the backend API and the Expo/React Native frontend (monorepo by design, not separate repos) — the frontend itself is planned for a future milestone
- The Expo app will consume this API for near-real-time bus arrivals: 30-second refresh cadence, offline caching, and an animated countdown UI (client-side concerns, out of scope until that milestone)
- Existing codebase mapped in `.planning/codebase/` (STACK.md, ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, INTEGRATIONS.md, CONCERNS.md) — predates v0.2, not yet refreshed with Phase 3/4 additions
- Shipped v0.1: Biome is now the sole lint/format tool (Prettier fully removed), entire repo reformatted to it
- Shipped v0.2 (2026-08-27): stop discovery (`StopService`/`StopController`) plus a live SSE predictions feed (`PredictionStreamService`/`PredictionStreamController`) with a shared per-stop poll loop and `generatedAt` freshness on both REST and SSE — 217/217 tests pass, ~97% coverage on new code, `bun run build`/`bun run lint` clean
- Package manager is Bun; TypeScript target ES2020/CommonJS, strict mode fully enabled
- Known tech debt: `lint:fix`'s `--apply-unsafe` flag is deprecated by Biome 1.9.4 in favor of `--write --unsafe` (non-blocking, flagged in Phase 1 code review); 15 pre-existing Biome warnings remain by design (Axios `baseURL` naming, `*.test.ts` filename convention, intentional non-Error throws in tests) — see 02-CONTEXT.md D-02
- Known tech debt (v0.2): `PredictionStreamController`'s initial SSE write is guarded only against synchronous throws — a mid-write client-socket error surfaces asynchronously via an `'error'` event, which no handler currently catches anywhere in `src/server` (no `res.on("error", ...)` or process-level `unhandledRejection` handler). Flagged as residual Warning WR-05 in `.planning/phases/04-live-predictions-via-sse/04-REVIEW.md` after a 3-iteration code-review fix cycle that closed 3 Critical race/leak bugs and 4 other Warnings; does not violate any LIVE-01..05 requirement as scoped
- Note: an unrelated, pre-existing uncommitted fix to `BusDataRepository.ts` (dedupe `initialize()`/`refreshData()` load paths, commit `b52c130`) was swept into the v0.2 execution history by the automated code-review-fix pipeline picking up dirty working-tree state — not part of Phase 3/4 scope, flagged to the user during execution, left in place as a correct fix
- Shipped v0.3 Phase 6 (2026-08-31): anonymous device-scoped Favorites HTTP API (`POST`/`DELETE`/`GET /api/v1/favorites`) on top of Phase 5's `FavoritesRecentsRepository`, plus a new `requireDeviceId` middleware (reusable by Phase 7 Recents) and `FavoritesService`/`FavoritesController` pattern for Phase 7 to mirror — 284/284 tests pass, existing v0.2 endpoints verified untouched
- Known tech debt (v0.3 Phase 6): `FavoritesController.unfavorite` doesn't trim/validate `entityId` the way `favorite` does, and `favorite`'s `entityId` is trim-validated but the untrimmed value is what's persisted/looked up — both whitespace-padded-id edge cases, non-blocking, flagged as WR-01/WR-03 in `.planning/phases/06-favorites-routes-stops/06-REVIEW.md`

## Constraints

- **Tooling**: Biome must remain the linter (existing `biome.json` config — 120 char line width, 4-space indent, `noDefaultExport` disabled) — no reason to replace it, only to stop pairing it with Prettier
- **Compatibility**: Build step (`tsc` → `dist/`) and test runner (Vitest) are out of scope and must keep working unchanged after the lint/format swap

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Drop Prettier, standardize on Biome for lint + format | Biome already includes a formatter; running Prettier alongside it is pure redundancy | Shipped Phase 1 |
| Keep `tsc` for build | Standard, dependency-free way to compile TS → CommonJS for a Node server; Vite is a frontend-oriented bundler and a poor fit here | Confirmed Phase 1 (build unaffected) |
| Land the mass reformat as its own commit | Keeps the tooling/config change reviewable separately from the resulting whitespace/style diff | ✓ Shipped Phase 2 |
| Leave `lint`/`lint:fix` scripts untouched in Phase 1 | They already invoked Biome and were the reference pattern for the new `format`/`format:write` scripts | ✓ Shipped Phase 1 — surfaced one follow-up: `lint:fix`'s `--apply-unsafe` flag is deprecated by Biome 1.9.4 in favor of `--write --unsafe` (non-blocking, logged in code review) |
| Preserve the 15 pre-existing Biome warnings unchanged (no renames, no suppressions) during the Phase 2 reformat | Keeps the reformat purely cosmetic and scoped; fixing warnings is a separate, deliberate decision | ✓ Shipped Phase 2 |
| Replace Core Value with a product-level statement ("Riders can always see accurate, near-real-time arrival predictions for their stop") | The v0.1 Core Value ("single command for lint/format") was scoped to that tooling cleanup, not a lasting product value; v0.2 is the first feature milestone | ✓ Good — Shipped v0.2 |
| Use Server-Sent Events (not WebSocket) for live predictions, with REST retained as fallback | SSE is one-way push over plain HTTP — simplest fit for this Express app and easy for the future Expo client to consume; bidirectional messaging isn't needed yet | ✓ Good — Shipped Phase 4 |
| Server runs one shared 30s upstream poll per subscribed stop, stopping when idle | Decouples client refresh cadence from per-client polling; protects upstream DASH API from being hammered by many simultaneous phone clients | ✓ Good — Shipped Phase 4, verified concurrency-safe after a 3-iteration code-review fix cycle (see Context) |
| This repo will eventually house both backend and Expo/React Native frontend (monorepo) | User doesn't want to manage separate repos; frontend build itself deferred to a future milestone | — Pending (unchanged by v0.2, still the plan for next milestone) |
| Stop discovery lives in a new `StopController`/`StopService` pair, not folded into `BusRouteController`/`BusRouteService` | Stop discovery is a distinct concern from route CRUD even though one URL nests under `/routes`; splitting it out later would touch call sites and tests | ✓ Shipped Phase 3 |
| `GET /:shortName/stops` groups stops by direction (`[{ directionId, title, stops }]`) instead of a deduped flat list | Response shape is a public contract — flattening later would be a breaking change for client apps; iterating `route.directions` preserves real sequence order that `getAllStops()` loses | ✓ Shipped Phase 3 |
| Nearby-search radius/distance in miles, default radius 0.5mi, default count 10 (cap 50), results sorted ascending by distance | Matches how a rider thinks about "how far," and bounds response size against a dense stop dataset | ✓ Shipped Phase 3 |
| Favorites/recents identity is an anonymous device ID sent via `X-Device-Id` header, no auth system | Backend serves multiple clients, so favorites can't live in per-device local storage alone; full accounts are unnecessary complexity for v1 and the device ID becomes a natural foreign key if real accounts are added later | ✓ Shipped Phase 6 |
| Favorites/recents persisted in SQLite behind a new repository, isolated from the existing DASH-proxy `BusDataRepository` | Zero ops (file-based, no external service), fits the existing repository-pattern architecture, easy to swap for Postgres later without touching services/controllers | ✓ Shipped Phase 5/6 |
| Unfavorite is a plain SQL DELETE with no rows-affected check, and repository upsert uses `INSERT ... ON CONFLICT DO UPDATE` | Makes both favorite-an-already-favorited and unfavorite-a-non-favorite true no-op successes without a read-then-write race | ✓ Shipped Phase 6 |
| Recents are auto-logged on any prediction/stop lookup rather than requiring a dedicated "log view" call | Reflects actual usage automatically; avoids relying on clients to remember to call a separate endpoint | — Pending (v0.3, Phase 7) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-31 after Phase 6*
