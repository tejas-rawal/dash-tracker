# Phase 5: SQLite Persistence Foundation - Context

**Gathered:** 2026-08-31
**Status:** Ready for planning

<domain>
## Phase Boundary

A tested, isolated SQLite-backed repository layer for favorites and recents, covering both routes and stops through a single entity-typed schema (one table per concern — favorites, recents — not per-entity-type). This phase delivers persistence plumbing only: connection lifecycle, schema, and repository storage methods. It does not deliver the Favorites/Recents HTTP endpoints, services, or controllers — those are Phase 6 and Phase 7. It must not modify `BusDataRepository` or any existing DASH-proxy code path.

</domain>

<decisions>
## Implementation Decisions

### SQLite Driver
- **D-01:** Use `better-sqlite3` (new dependency) — synchronous API. Its blocking calls mean each write completes before the next starts, which sidesteps most in-process race conditions by construction and simplifies satisfying the "atomic UPSERT, no SQLITE_BUSY" concurrency requirement (Phase 5 SC #3). — **Reversibility:** costly — **rationale:** swapping drivers later touches every repository method's call signature (sync → async) and the concurrency test's assertions.

### DB File Location & Lifecycle
- **D-02:** SQLite file lives at `data/dash-tracker.sqlite` (new git-ignored `data/` directory at repo root), path overridable via an optional `DB_PATH` env var with that default — added to the existing Zod `environmentSchema` in `src/server/config/environment.ts`, following the same pattern as `PORT` (optional, `z.coerce`/`.default(...)`).
- **D-03:** Connection lifecycle is explicit — an `initialize()` (opens connection, runs schema creation, sets `PRAGMA journal_mode = WAL` and `PRAGMA busy_timeout`) and a `close()`, wired into `app.ts` alongside (not inside) the existing `BusDataRepository.getInstance().initialize()` call. `close()` is called from the existing SIGTERM/SIGINT graceful-shutdown handler. This mirrors `BusDataRepository`'s singleton `getInstance()`/`initialize()` lifecycle and satisfies Phase 5 SC #1 (clean startup/shutdown).

### Schema Creation
- **D-04:** Schema is created via inline `CREATE TABLE IF NOT EXISTS` SQL strings executed once during `initialize()` — no migration library (knex/umzug). A 2-table schema (favorites, recents) isn't expected to churn enough to justify the added dependency and file convention.
- **D-05:** Each table (favorites, recents) carries a composite `UNIQUE(device_id, entity_type, entity_id)` constraint, backing a single `INSERT ... ON CONFLICT (...) DO UPDATE` statement per write. This is the mechanism that makes the "no read-then-write race" requirement (Phase 5 SC #3) achievable in one atomic call — exact column/index naming left to implementation.

### Testing Strategy
- **D-06:** Repository tests (including the concurrency test) use a real temp file per test suite (e.g. `os.tmpdir()`, cleaned up in `afterEach`) rather than `:memory:`. better-sqlite3's `:memory:` databases don't meaningfully exercise WAL mode or `busy_timeout` since there's no real file-locking to contend with — a temp file is needed to actually exercise the on-disk locking path that Phase 5 SC #3 verifies.
- **D-07:** The concurrency test fires many concurrent "bump to top" calls via `Promise.all` through the repository's public (Promise-wrapping) async API, then asserts: no exception thrown, exactly one row exists for that device+entity, and its timestamp reflects the last write. Because better-sqlite3 serializes at the driver level, this test mainly proves the UPSERT logic is correct rather than exercising true OS-level thread concurrency — but that's the right scope for a single-process Node/Express server, and matches how the app will actually call the repository (concurrent async request handlers on one event loop, not multiple OS threads).

### Claude's Discretion
- Exact table/column names, index naming, and the shape of the repository's public method signatures (e.g. `upsertFavorite`, `listFavorites`) are left to planning/implementation, as long as they follow the "one entity-typed table per concern" schema shape locked by the roadmap and the DI factory-function pattern (`createXRepository(...)`, no direct singleton imports into services) from CLAUDE.md conventions.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/ROADMAP.md` §Phase 5 — goal, dependencies, and the 4 success criteria this phase must satisfy
- `.planning/REQUIREMENTS.md` §Infrastructure — PERSIST-01 (isolation requirement: no changes to `BusDataRepository`)

### Existing Patterns to Mirror
- `src/server/config/environment.ts` — Zod env-schema pattern to extend with `DB_PATH`
- `src/server/api/repositories/BusDataRepository.ts` — singleton `getInstance()`/`initialize()` lifecycle pattern to mirror for the new repository (structurally, not by modifying this file)
- `src/server/app.ts` — startup/shutdown sequence where the new repository's `initialize()`/`close()` calls get wired in, alongside the existing `BusDataRepository` init

No external specs beyond the above — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/server/config/environment.ts`: Zod-validated env schema — extend (don't replace) with an optional `DB_PATH` following the `PORT` pattern (`z.coerce`, `.default(...)`).
- `src/server/config/logger.ts` (Winston): use for startup/shutdown logging of the new DB connection, per CLAUDE.md's "Logging: startup/shutdown, external API calls, error conditions" convention.

### Established Patterns
- Singleton repository with `getInstance()`/`initialize()`, populated once before request-serving starts (`BusDataRepository`) — the new repository should follow this shape so `app.ts`'s init sequence stays consistent, but must NOT be merged into or import from `BusDataRepository`.
- DI via factory functions (`createXService(repository)`) — the new repository must be injectable the same way once Phase 6/7 build services on top of it; avoid importing a repository singleton directly inside future services.
- Named exports, `PascalCase` classes, explicit return types, `Promise<T>` for async methods — standard CLAUDE.md conventions apply.

### Integration Points
- `src/server/app.ts` — add the new repository's `initialize()` call alongside `BusDataRepository.getInstance().initialize()`, and its `close()` call in the existing SIGTERM/SIGINT shutdown handler.
- `src/server/config/environment.ts` — add `DB_PATH` to the Zod schema and the exported `environment` object (e.g. `environment.database.path`).

</code_context>

<specifics>
## Specific Ideas

No specific UI/behavioral requirements beyond what's captured above — this is a pure persistence-layer phase. Data does not need to be denormalized (hydration from `BusDataRepository` happens in Phase 6/7 services, per REQUIREMENTS.md Out of Scope table).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. No todos matched this phase (`todo.match-phase` returned 0 matches).

</deferred>

---

*Phase: 5-SQLite Persistence Foundation*
*Context gathered: 2026-08-31*
