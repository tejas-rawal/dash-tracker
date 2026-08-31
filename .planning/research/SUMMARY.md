# Project Research Summary

**Project:** dash-tracker
**Domain:** Anonymous-identity favorites & recents persistence layer for a Node/Express transit-data backend (v0.3 milestone)
**Researched:** 2026-08-31
**Confidence:** HIGH

## Executive Summary

This milestone adds the project's first persistent, device-scoped state — favorited routes and auto-tracked recent routes — on top of an otherwise stateless, in-memory Express API. Experts build this kind of feature as a small embedded SQLite store (one table for favorites, one for recents) behind a single new repository, joined at read time against the existing in-memory `BusDataRepository` for full route details, with an anonymous `X-Device-Id` header as the sole partition key. There is no account system and none is needed for v1: the header is an opaque scoping key, not authentication, and that tradeoff is explicit and accepted.

The single most important technical decision is the SQLite driver: despite the project using Bun as its package manager, all scripts execute under plain Node 20 via `ts-node`/`tsc`, so `bun:sqlite` and `node:sqlite` (which requires Node 22.5+) are both unusable. `better-sqlite3@^12.11.1` (pinned, not `latest`, which requires Node 22+) is the correct, synchronous, Node-20-compatible driver, and it matches this codebase's existing synchronous-repository style. Architecturally, favorites and recents should share one `UserRouteDataRepository` singleton (one physical DB, one connection) but get separate services and controllers — mirroring the project's existing precedent of splitting `StopService`/`BusRouteService` over a shared repository.

The main risks are concurrency-shaped, not feature-shaped: a naive read-then-write "bump to top" implementation for recents will race under concurrent requests and must be a single atomic UPSERT with `ON CONFLICT DO UPDATE`, wrapped with a trim-to-5 delete in one transaction; SQLite needs WAL mode and a busy timeout set at connection open or it will throw `SQLITE_BUSY` under concurrent writers; and the recents auto-logging side effect (triggered from existing `PredictionController`/`StopController` request paths) must never block or fail the primary prediction/stop response, since that would violate the product's core value of always-available predictions. Test isolation is also a real risk: the existing "reset singleton in `beforeEach`" pattern is insufficient for a file/connection-backed repository and must use fresh `:memory:` databases per test.

## Key Findings

### Recommended Stack

Add exactly two new dependencies: `better-sqlite3@^12.11.1` (runtime) and `@types/better-sqlite3@^9.6.0` (dev, since better-sqlite3 ships no bundled types). No ORM, query builder, connection pool, or migration framework — two small flat tables with basic CRUD don't warrant that overhead, and it would be a first-of-its-kind pattern in a codebase with zero existing ORM usage. `zod` (already a dependency) validates the `X-Device-Id` header and request payloads at the controller boundary, consistent with existing env-validation conventions. Tests use `better-sqlite3` against `:memory:` — synchronous, fast, zero mocking of the driver itself.

**Core technologies:**
- `better-sqlite3` (^12.11.1): synchronous native SQLite driver — the only viable option under this project's actual Node 20 runtime; must be pinned below `13.x`, which requires Node 22+
- `@types/better-sqlite3` (^9.6.0): TypeScript definitions — better-sqlite3 ships none of its own
- `zod` (existing): validates `X-Device-Id` and request payloads — reuses established project convention, no new dependency

### Expected Features

**Must have (table stakes) — all in scope for this milestone:**
- Add/remove favorite (idempotent both directions, device-scoped)
- List favorites with full hydrated route details, most-recently-favorited-first, no cap
- Auto-logged recent routes as a side effect of existing prediction/stop lookups (no separate "log view" endpoint — explicitly rejected by requirements)
- Recents deduped via UPSERT bump-to-top, capped at last 5, oldest evicted
- List recents with full hydrated route details
- Required `X-Device-Id` header with clear 4xx on absence — never a silent shared-bucket fallback

**Should have (differentiators) — explicitly deferred, not silently forgotten:**
- Favorite-aware batched predictions endpoint (once a real client dashboard exists)
- Recents spanning stops, not just routes (v1.1 schema extension)

**Defer (v2+):**
- Real accounts / cross-device-ID linking (device ID is designed as a future foreign key)
- Manual favorite reordering, folders/tags (no UI or route-count scale demands it yet)
- Push notifications on favorited-route alerts (separate infrastructure milestone)

**Anti-features to explicitly avoid:** a combined favorites+recents endpoint (different write semantics/cardinality), a dedicated "log a view" endpoint, denormalized route snapshots on favorite/recent rows, device-ID authentication/signing, a cap on favorites, and cascading deletes when a DASH route disappears.

### Architecture Approach

Extend the existing layered architecture (routes → controllers → services → repository) with one new repository (`UserRouteDataRepository`, SQLite-backed singleton) shared by two new service/controller pairs (`FavoriteService`/`FavoriteController`, `RecentService`/`RecentController`), plus a new cross-cutting `requireDeviceId` Express middleware mounted only on the two new routers. Recent-view auto-logging is orchestrated at the controller layer (not the service layer) as a fire-and-forget side effect after the primary response is sent — `PredictionController`/`StopController` take `RecentService` as an added DI parameter, keeping `PredictionService`/`StopService` untouched and preserving the product's core value (predictions must never be delayed or broken by a persistence write).

**Major components:**
1. `UserRouteDataRepository` — singleton owning the one `better-sqlite3` connection; pure storage methods for both favorites and recents rows; no business logic, no cross-repository joins
2. `FavoriteService`/`RecentService` — business rules (route-existence validation via `BusDataRepository`, ordering, cap enforcement), each DI'd with the shared repository plus `BusDataRepository`
3. `requireDeviceId` middleware — extracts/validates `X-Device-Id`, attaches `req.deviceId`, responds 400 directly on absence (request-shape validation, not a domain error)
4. `config/sqlite.ts` — new config module owning the shared `Database` factory + schema DDL, parallel to existing `config/axios.ts`

### Critical Pitfalls

1. **Reaching for `bun:sqlite` or `node:sqlite`** — both fail under this project's actual Node-20-via-ts-node execution path. Use `better-sqlite3` and verify via `bun run dev-server`/`bun run build && bun run start-server`, not standalone `bun run file.ts`.
2. **Read-then-write race in recents "bump to top"** — concurrent requests can both read "not present" and double-insert. Must be a single atomic UPSERT (`ON CONFLICT DO UPDATE`) plus a transactional trim-to-5, not SELECT-then-branch.
3. **`SQLITE_BUSY` under concurrent writers** — SQLite defaults block a second writer instantly. Set `journal_mode = WAL` and a `busy_timeout` at connection open, in the same `initialize()` step.
4. **Treating `X-Device-Id` as authentication instead of a scoping key** — must reject missing/malformed headers with 400 (never a silent shared-bucket fallback), validate shape/length, and never log raw device IDs at info level.
5. **Test state leaking across Vitest runs** — the existing "reset singleton" pattern doesn't clean up file/connection state; use fresh `:memory:` DBs per test, injected via factory DI rather than fighting the singleton internals.

## Implications for Roadmap

Based on research, suggested phase structure (matches the architecture research's "Suggested Build Order," reordered into roadmap-scale phases):

### Phase 1: SQLite persistence foundation
**Rationale:** Everything else depends on a working, tested repository layer; driver/runtime pitfalls (bun:sqlite, node:sqlite, WAL/busy_timeout, path/permissions, test isolation) must be locked in before any business logic is built on top.
**Delivers:** `SQLITE_DB_PATH`/`DATABASE_PATH` env var (Zod-validated), `config/sqlite.ts` connection factory + idempotent schema DDL (favorites + recents tables, WAL + busy_timeout pragmas), `UserRouteDataRepository` singleton with favorites CRUD + recents UPSERT/trim/list methods, wired into `app.ts`'s init/shutdown sequence, fully unit-tested against `:memory:` including a concurrency test.
**Uses:** `better-sqlite3` (^12.11.1), `@types/better-sqlite3`
**Avoids:** Pitfalls 1, 2 (wrong driver), 3 (race condition), 4 (SQLITE_BUSY), 7 (path/permissions), 8 (test isolation)

### Phase 2: Favorites vertical slice
**Rationale:** Fully self-contained — no touching existing v0.2 controllers — so it can ship and be verified end-to-end before the riskier recents auto-logging work begins.
**Delivers:** `requireDeviceId` middleware, `FavoriteService`/`FavoriteController`/`favoriteRoutes.ts`, add/remove (idempotent)/list (hydrated, most-recent-first, no cap) endpoints.
**Addresses:** Add/remove favorite, list favorites with full route details, ordering, device-ID required-header handling
**Avoids:** Pitfall 5 (device-ID spoofing hygiene), Pitfall 6 (orphaned route ID handling in hydration)

### Phase 3: Recents read path + auto-logging integration
**Rationale:** Recents' read path (list) is independently buildable/testable; the auto-logging hook is the only place this milestone modifies existing, already-shipped v0.2 code (`PredictionController`, `StopController`) and should land last, once `RecentService` already exists and is proven.
**Delivers:** `RecentService`/`RecentController`/`recentRoutes.ts` (read path), then `PredictionController`/`StopController` modified to take `RecentService` as an added DI param, firing `logView` as a fire-and-forget call after the response is sent. Requires resolving during phase discussion whether an unfiltered predictions response logs one route or all routes present. Auto-tracked recents (UPSERT bump-to-top, capped at 5), list recents endpoint.
**Avoids:** Pitfall 3 (race, already handled by Phase 1's UPSERT primitive), the "blocking the response" anti-pattern, and the UX pitfall of logging on server-side SSE poll ticks instead of explicit client actions

### Phase Ordering Rationale

- Dependencies flow bottom-up: schema/repository before any service/controller work; the device-ID middleware and the persistence layer are independent of each other and can be built in parallel within Phase 1/2 boundaries, but both must exist before any new endpoint is reachable.
- Favorites is ordered before recents specifically because it touches zero existing code (lower risk, faster feedback loop), while recents' auto-logging is the only place this milestone modifies already-shipped v0.2 prediction/stop code — isolating that risk to the last phase minimizes exposure to regressions in the stated core value (always-available predictions).
- This ordering directly avoids the two highest-severity pitfalls (wrong SQLite driver, and blocking/breaking the predictions response) by resolving the driver question first and touching the hot path last, after the safe append-only pattern is already proven in isolation via favorites.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (recents auto-logging integration):** The "single route vs. all routes in an unfiltered predictions response" question is a product decision flagged but not resolved by architecture research — needs explicit discussion during phase planning. Also needs a concrete decision on whether SSE subscribe counts as a "view."

Phases with standard patterns (skip research-phase):
- **Phase 1 (SQLite foundation):** Driver choice, schema, WAL/busy_timeout, and test-isolation patterns are already fully specified with HIGH confidence in STACK.md/ARCHITECTURE.md/PITFALLS.md — implementation-ready.
- **Phase 2 (favorites vertical):** Directly mirrors the existing `StopService`/`StopController` precedent already shipped in this codebase — well-documented, established internal pattern.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified directly against npm registry `engines` fields per major version; driver choice is unambiguous given this project's confirmed Node-20-via-ts-node execution model |
| Features | MEDIUM | Core feature list (favorites/recents CRUD, ordering, caps) is well-grounded in the PROJECT.md requirements and standard "recently viewed" precedent (Salesforce, e-commerce), but general-web sources cited were shallow/generic rather than transit-domain-specific |
| Architecture | HIGH | Directly derived from reading this codebase's existing source (`BusDataRepository`, `StopService`/`StopController`, `app.ts`) and its own established Phase-3 precedent for splitting services over a shared repository |
| Pitfalls | MEDIUM-HIGH | Codebase-specific pitfalls (test isolation, layering, device-ID hygiene) are HIGH confidence from direct code reading; SQLite/Bun driver-interaction specifics are MEDIUM confidence, sourced from web search but cross-verified against official SQLite/Node docs |

**Overall confidence:** HIGH

### Gaps to Address

- **Unfiltered predictions response — which route(s) get logged as "recent":** Explicitly flagged as unresolved in ARCHITECTURE.md — needs a product decision during Phase 3 discussion, not an architectural one.
- **Whether SSE subscribe (not just REST predictions/stops calls) should trigger a recent-view log:** Touched on in both ARCHITECTURE.md and PITFALLS.md (UX pitfall: don't log on internal poll ticks) but the definitive scope (does subscribing count as "viewing"?) needs to be pinned down in phase planning.
- **Deploy target / writable filesystem for the SQLite file path:** PROJECT.md doesn't specify a deploy target yet; Pitfall 7 (path/permissions breaking in production) can't be fully closed out until a deploy environment is chosen — flag for validation whenever that target is decided.
- **Orphaned route ID behavior (filter vs. flag) when a favorited/recent route no longer exists in `BusDataRepository`:** Identified as a required explicit decision (Pitfall 6) but not made in research — needs to be decided and tested during the Phase 2/3 service work.

## Sources

### Primary (HIGH confidence)
- npm registry (`npm view better-sqlite3`, `npm view better-sqlite3@12.11.1 engines`, `npm view @types/better-sqlite3`) — verified 2026-08-31, per-major-version `engines` fields
- Direct codebase reading: `package.json`, `tsconfig.json`, `.node-version`, `src/server/app.ts`, `src/server/api/repositories/BusDataRepository.ts`(`.test.ts`), `src/server/api/controllers/PredictionController.ts`/`StopController.ts`, `src/server/api/services/StopService.ts`, `src/server/config/environment.ts`, `src/server/test/setup.ts`, `vitest.config.mts`, `.claude/CLAUDE.md`, `.planning/PROJECT.md`
- better-sqlite3 (GitHub, WiseLibs) — official source repo
- SQLite Write-Ahead Logging (sqlite.org) and SQLite Foreign Key Support (sqlite.org) — official docs

### Secondary (MEDIUM confidence)
- SQLite | Bun Docs and "`node:sqlite` not available in Bun?" — oven-sh/bun Discussion #27092 — runtime-specific SQLite module boundaries
- "Node.js Built-in SQLite (node:sqlite): 2026 Production Guide" and SQLite | Node.js v26 Documentation — confirms `node:sqlite` version floor (22.5+)
- "What to do about SQLITE_BUSY errors despite setting a timeout" (Bert Hubert) and "SQLite Upsert" (SQLite Tutorial) — busy_timeout and UPSERT mechanics
- Salesforce Recent Items REST API Developer Guide — bump-to-top precedent

### Tertiary (LOW confidence)
- General REST resource-design articles (Medium, freeCodeCamp) — generic conventions, consistent with but not specific to this domain
- "Amazon Recently Viewed Items system design" write-up and Mixpanel device-ID identity docs — analogous patterns, not transit-domain-specific

---
*Research completed: 2026-08-31*
*Ready for roadmap: yes*
