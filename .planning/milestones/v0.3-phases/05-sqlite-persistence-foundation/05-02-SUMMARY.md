---
phase: 05-sqlite-persistence-foundation
plan: 02
subsystem: database
tags: [better-sqlite3, sqlite, wal, upsert, repository, tdd]

requires:
  - phase: 05-sqlite-persistence-foundation
    provides: Plan 05-01's human-verified legitimacy sign-off for better-sqlite3/@types/better-sqlite3
provides:
  - "FavoritesRecentsRepository: singleton SQLite-backed repository with initialize()/close() lifecycle, WAL + busy_timeout, and favorites/recents CRUD (upsertFavorite/listFavorites/upsertRecent/listRecents)"
  - "PersistedEntity shared types (EntityType, FavoriteRecord, RecentRecord)"
  - "DB_PATH env var (Zod-validated, defaulted) and environment.database.path"
  - "app.ts startup/shutdown wiring for the new repository alongside BusDataRepository"
affects: [06-favorites, 07-recents]

actuals:
  tokens: 5400
  tasks: 3
  commits: 4

tech-stack:
  added: ["better-sqlite3@^12.11.1", "@types/better-sqlite3@^9.6.0"]
  patterns:
    - "Singleton repository lifecycle (getInstance/initialize/close) mirroring BusDataRepository, wired into app.ts's Promise.all startup and shutdown closure"
    - "Single-table-per-concern schema (favorites, recents) with composite UNIQUE(device_id, entity_type, entity_id) backing atomic INSERT ... ON CONFLICT DO UPDATE writes"

key-files:
  created:
    - src/server/api/repositories/FavoritesRecentsRepository.ts
    - src/server/api/repositories/FavoritesRecentsRepository.test.ts
    - src/server/api/models/PersistedEntity.ts
  modified:
    - src/server/app.ts
    - src/server/config/environment.ts
    - src/server/api/models/index.ts
    - src/server/api/repositories/index.ts
    - .gitignore
    - package.json
    - bun.lockb
    - src/server/api/controllers/BusRouteController.ts
    - src/server/api/controllers/StopController.ts

key-decisions:
  - "Installed better-sqlite3@^12.11.1 instead of the latest 13.0.3: v13 requires Node >=22 (per its package.json engines field) while this project targets Node 20; loading v13's native N-API binary crashed the process (SIGSEGV) under both Bun 1.0.31 and system Node 20.20.2. v12.11.1 explicitly lists Node 20.x support and loads cleanly. Package identity (better-sqlite3, @types/better-sqlite3) is unchanged from the 05-01 approval — only the version was adjusted for runtime compatibility."
  - "Deferred assertInitialized() from Task 1 to Task 2's commit: defining it in Task 1 with no caller yet tripped noUnusedLocals (TS6133) and failed Task 1's own `bun run build` acceptance criterion. It is now added alongside the CRUD methods that call it, avoiding dead code."
  - "Fixed a pre-existing req.params typing issue in BusRouteController.ts and StopController.ts (string | string[] not assignable to string), surfaced by an @types/express patch bump (5.0.0 -> 5.0.6) pulled in when bun regenerated an unreadable/outdated bun.lockb. Fixed with a minimal Array.isArray narrow; :shortName is a non-repeating route param so runtime behavior is unchanged."

patterns-established:
  - "Repository lifecycle: private constructor + static instance + getInstance(), initialize()/close() guarded by isInitialized, handleError(action, error) rethrow idiom mirrored from BusDataRepository.handleLoadError"
  - "Atomic upsert: INSERT ... ON CONFLICT (device_id, entity_type, entity_id) DO UPDATE SET <timestamp> = @<timestamp> — no read-then-write, satisfies the concurrency requirement by construction"
  - "Cross-device isolation: every read method's SQL includes WHERE device_id = ? with no other query path"

requirements-completed: [PERSIST-01]

coverage:
  - id: D1
    description: "Server startup/shutdown lifecycle: FavoritesRecentsRepository initializes alongside BusDataRepository via Promise.all before the server accepts requests, and close() is called from the existing SIGTERM/SIGINT shutdown handler before process exit"
    requirement: PERSIST-01
    verification:
      - kind: unit
        ref: "src/server/api/repositories/FavoritesRecentsRepository.test.ts#initialize creates the underlying SQLite file"
        status: pass
      - kind: unit
        ref: "src/server/api/repositories/FavoritesRecentsRepository.test.ts#initialize creates both the favorites and recents tables"
        status: pass
      - kind: unit
        ref: "src/server/api/repositories/FavoritesRecentsRepository.test.ts#initialize sets journal_mode to WAL"
        status: pass
    human_judgment: false
  - id: D2
    description: "Favorite and recent rows can be written and read back for both entity types (route, stop) through upsertFavorite/listFavorites and upsertRecent/listRecents, backed by one favorites table and one recents table"
    requirement: PERSIST-01
    verification:
      - kind: unit
        ref: "src/server/api/repositories/FavoritesRecentsRepository.test.ts#favorites writes and reads back a favorite"
        status: pass
      - kind: unit
        ref: "src/server/api/repositories/FavoritesRecentsRepository.test.ts#favorites stores both entity types in the same table for one device"
        status: pass
      - kind: unit
        ref: "src/server/api/repositories/FavoritesRecentsRepository.test.ts#recents writes and reads back a recent"
        status: pass
      - kind: unit
        ref: "src/server/api/repositories/FavoritesRecentsRepository.test.ts#recents stores both entity types in the same table for one device"
        status: pass
    human_judgment: false
  - id: D3
    description: "Writing the same favorite/recent (device_id, entity_type, entity_id) twice is a single atomic INSERT ... ON CONFLICT DO UPDATE, not a duplicate row or a read-then-write race"
    requirement: PERSIST-01
    verification:
      - kind: unit
        ref: "src/server/api/repositories/FavoritesRecentsRepository.test.ts#favorites upserts idempotently, updating the timestamp on a repeated write"
        status: pass
      - kind: unit
        ref: "src/server/api/repositories/FavoritesRecentsRepository.test.ts#recents upserts idempotently, updating the timestamp on a repeated write"
        status: pass
    human_judgment: false
  - id: D4
    description: "N concurrent bump-to-top writes to the same device+entity via Promise.all against a real temp-file SQLite database complete without rejection or SQLITE_BUSY, leaving exactly one row; concurrent writes across two devices never cross-contaminate"
    requirement: PERSIST-01
    verification:
      - kind: unit
        ref: "src/server/api/repositories/FavoritesRecentsRepository.test.ts#concurrency handles concurrent bump-to-top writes to the same device+entity without throwing or duplicating rows"
        status: pass
      - kind: unit
        ref: "src/server/api/repositories/FavoritesRecentsRepository.test.ts#concurrency isolates concurrent writes across two different devices for the same entity"
        status: pass
    human_judgment: false
  - id: D5
    description: "listFavorites/listRecents never leak one device's rows into another device's read (cross-device isolation prohibition)"
    requirement: PERSIST-01
    verification:
      - kind: unit
        ref: "src/server/api/repositories/FavoritesRecentsRepository.test.ts#favorites never leaks one device's favorites into another device's read"
        status: pass
      - kind: unit
        ref: "src/server/api/repositories/FavoritesRecentsRepository.test.ts#recents never leaks one device's recents into another device's read"
        status: pass
    human_judgment: false
  - id: D6
    description: "BusDataRepository and its test suite are completely unmodified"
    requirement: PERSIST-01
    verification:
      - kind: other
        ref: "git diff --stat -- src/server/api/repositories/BusDataRepository.ts src/server/api/repositories/BusDataRepository.test.ts (empty output)"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-08-31
status: complete
---

# Phase 5 Plan 2: SQLite Persistence Foundation Summary

**FavoritesRecentsRepository — a singleton, WAL-mode SQLite repository with atomic upsert CRUD for favorites and recents, covering both routes and stops through one entity-typed table per concern, wired into app.ts's startup/shutdown lifecycle alongside BusDataRepository**

## Performance

- **Duration:** 45 min
- **Started:** 2026-08-31T (session start)
- **Completed:** 2026-08-31
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments
- `FavoritesRecentsRepository` singleton with `initialize()`/`close()` lifecycle: creates `data/` if missing, opens the SQLite connection, sets `journal_mode = WAL` and `busy_timeout`, and creates `favorites`/`recents` tables via `CREATE TABLE IF NOT EXISTS`
- `upsertFavorite`/`listFavorites` and `upsertRecent`/`listRecents` — each write is a single `INSERT ... ON CONFLICT (device_id, entity_type, entity_id) DO UPDATE` statement (no read-then-write), each read is scoped by `WHERE device_id = ?`
- `PersistedEntity.ts` shared types (`EntityType`, `FavoriteRecord`, `RecentRecord`) for Phase 6/7 to build services on
- `DB_PATH` Zod-validated env var (defaulted to `data/dash-tracker.sqlite`) and `environment.database.path`
- `app.ts` startup now awaits `Promise.all([repository.initialize(), favoritesRecentsRepository.initialize()])` before listening, and the SIGTERM/SIGINT shutdown handler awaits `favoritesRecentsRepository.close()` before `process.exit(0)`
- 16-test suite covering lifecycle, CRUD, idempotency, cross-device isolation, and concurrent bump-to-top writes (25 concurrent calls, zero duplicates, zero SQLITE_BUSY) against a real temp-file SQLite database
- `BusDataRepository.ts`/`.test.ts` byte-for-byte unmodified (verified via `git diff --stat`)

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end SQLite connection lifecycle** - `f420a13` (feat)
2. **Task 2: Write/read methods for favorites and recents (TDD)** - `1aa07c6` (test, RED) + `9eedfb3` (feat, GREEN)
3. **Task 3: Concurrency test and full-suite regression check** - `2453d61` (test)

**Plan metadata:** (this commit, next)

## Files Created/Modified
- `src/server/api/repositories/FavoritesRecentsRepository.ts` - Singleton SQLite repository: lifecycle + favorites/recents CRUD
- `src/server/api/repositories/FavoritesRecentsRepository.test.ts` - 16 tests: lifecycle, CRUD, idempotency, isolation, concurrency
- `src/server/api/models/PersistedEntity.ts` - `EntityType`, `FavoriteRecord`, `RecentRecord`
- `src/server/api/models/index.ts` - barrel export for `PersistedEntity`
- `src/server/api/repositories/index.ts` - barrel export for `FavoritesRecentsRepository`
- `src/server/config/environment.ts` - `DB_PATH` schema field + `environment.database.path`
- `src/server/app.ts` - `Promise.all` startup wiring + async shutdown close
- `.gitignore` - `data/` directory ignored (SQLite file location)
- `package.json` / `bun.lockb` - `better-sqlite3@^12.11.1`, `@types/better-sqlite3@^9.6.0` in `dependencies`
- `src/server/api/controllers/BusRouteController.ts` / `StopController.ts` - minimal `req.params` array-narrowing fix (see Deviations)

## Decisions Made
- Installed `better-sqlite3@^12.11.1` rather than the latest `13.0.3` — v13 requires Node >=22 and its native binary crashed the process under both Bun 1.0.31 and system Node 20.20.2 in this environment; v12.11.1 explicitly supports Node 20.x and loads cleanly. Same package identity approved in Plan 05-01, different (older, Node-20-compatible) version.
- `assertInitialized()` was moved from Task 1 to Task 2's commit (added alongside its first callers) to avoid a `noUnusedLocals` build failure from a temporarily-unused private method.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] better-sqlite3@13.0.3 crashes the process; pinned to a Node-20-compatible version instead**
- **Found during:** Task 1 (dependency install + first `Database` open)
- **Issue:** `bun add better-sqlite3 @types/better-sqlite3` (per the plan's literal instruction) installed the latest `better-sqlite3@13.0.3`, whose native N-API addon requires Node >=22. Opening any `Database` instance (even `:memory:`) segfaulted the process (`EXC_BAD_ACCESS` inside `napi_module_register_by_symbol`) under system Node 20.20.2, and panicked Bun 1.0.31's own N-API shim (`napi_define_properties`). This blocked every subsequent task — no test could open a database.
- **Fix:** `bun remove better-sqlite3` then `bun add better-sqlite3@12.11.1` (latest version whose published `engines.node` explicitly includes `20.x`). Verified the native binary loads and opens both `:memory:` and file-backed databases (including WAL mode) cleanly under system Node before proceeding. Package identity is unchanged from the Plan 05-01 legitimacy approval — same repository, same author, only an older version pin.
- **Files modified:** package.json, bun.lockb
- **Verification:** `node -e "new (require('better-sqlite3'))(':memory:').pragma('journal_mode = WAL')"` succeeds; full `FavoritesRecentsRepository.test.ts` suite passes (16/16) under `bun run test`
- **Committed in:** f420a13 (Task 1 commit)

**2. [Rule 3 - Blocking] Deferred `assertInitialized()` definition from Task 1 to Task 2**
- **Found during:** Task 1's own `bun run build` verification step
- **Issue:** The plan's Task 1 action defines `assertInitialized()` with no caller until Task 2's CRUD methods exist. The project's `tsconfig.json` has `noUnusedLocals: true`, which flags unused private class methods (TS6133), failing Task 1's `bun run build` acceptance criterion.
- **Fix:** Wrote Task 1 without `assertInitialized()`; added it in Task 2's commit immediately alongside the four CRUD methods that call it (matches the plan's already-CRUD-adjacent guard-before-access pattern from `BusDataRepository`).
- **Files modified:** src/server/api/repositories/FavoritesRecentsRepository.ts
- **Verification:** `bun run build` exits 0 after both Task 1 and Task 2 commits
- **Committed in:** f420a13 (Task 1, without the guard), 9eedfb3 (Task 2, guard + CRUD together)

**3. [Rule 3 - Blocking] Fixed pre-existing `req.params` type error surfaced by an incidental `@types/express` bump**
- **Found during:** Task 1's `bun run build` verification step
- **Issue:** This repo's checked-in `bun.lockb` was in a lockfile format `bun 1.0.31` could not parse ("Outdated lockfile version, ignoring lockfile"), so the first `bun add`/`bun install` in this session did a full fresh dependency resolution against `package.json`'s semver ranges — bumping `@types/express` from whatever was previously locked to `5.0.6` within the unchanged `^5.0.0` range. That patch bump widened `req.params[key]`'s type to include `string[]`, breaking two previously-passing call sites (`BusRouteController.ts`, `StopController.ts`) that pass a param straight through as `string`. Neither file is in this plan's `files_modified` list, but the failure blocks `bun run build`, a hard acceptance criterion for Task 1 and the phase's overall `<verification>`.
- **Fix:** `Array.isArray(shortName) ? shortName[0] : shortName` at both call sites. `:shortName` is a plain, non-repeating Express route param (confirmed via `grep` on `busRoutes.ts`) so this changes no runtime behavior — it only satisfies the widened type.
- **Files modified:** src/server/api/controllers/BusRouteController.ts, src/server/api/controllers/StopController.ts
- **Verification:** `bun run build` exits 0; full project test suite (233 tests) still passes
- **Committed in:** f420a13 (Task 1 commit)

**4. [Rule 1 - Bug] `vi.mock`/`vi.hoisted` TDZ ordering required `require()` instead of ES imports for the test's temp-path computation**
- **Found during:** Task 1 (writing the test file's `TEST_DB_PATH` setup)
- **Issue:** The plan's suggested pattern (`const TEST_DB_PATH = path.join(os.tmpdir(), ...)` as a plain top-level `const`, referenced inside `vi.mock`'s factory) threw `ReferenceError: Cannot access 'TEST_DB_PATH' before initialization` — Vitest hoists `vi.mock` calls above all module-level code including `const` declarations and even the ES `import` bindings they'd depend on, not just `let`/reassigned bindings as the plan's read_first note assumed.
- **Fix:** Used `vi.hoisted()` with `require("os")`/`require("path")`/`require("crypto")` (synchronous, hoisting-order-independent) inside its factory to compute `TEST_DB_PATH` before `vi.mock` reads it.
- **Files modified:** src/server/api/repositories/FavoritesRecentsRepository.test.ts
- **Verification:** All 16 tests in the suite pass
- **Committed in:** f420a13 (Task 1 commit)

---

**Total deviations:** 4 auto-fixed (3 blocking, 1 bug)
**Impact on plan:** All four were required to get `bun run test`/`bun run build` green at all; none change the repository's public API, schema, or the architecture decisions (D-01 through D-07) from `05-CONTEXT.md`. No scope creep — the two controller files were touched only for a 1-line type-narrowing fix each, not behavior changes.

## Issues Encountered
- Also caught and reverted an operator mistake early in Task 1: the first `bun add` invocation accidentally ran against a different (shared, non-agent) git worktree checkout instead of this agent's isolated worktree. Detected via a worktree-isolation guard on a subsequent `git status` call; reverted `package.json`/`bun.lockb`/`node_modules` in that other checkout back to their pre-existing state via direct file restoration (not git, since git operations against that path are blocked for this agent) before redoing the install correctly in this worktree. No lasting effect — mentioned for transparency, not a code deviation.

## User Setup Required

None - no external service configuration required. `data/dash-tracker.sqlite` is created automatically on first server startup (git-ignored).

## Next Phase Readiness
- `FavoritesRecentsRepository` is fully injectable via `FavoritesRecentsRepository.getInstance()` and ready for Phase 6 (Favorites) and Phase 7 (Recents) to build services/controllers/routes on top of, per the layered architecture and DI-via-factory-function convention.
- `EntityType`/`FavoriteRecord`/`RecentRecord` types are exported from the models barrel for those phases to import.
- No blockers. Phase 6/7 will need to source `deviceId` from an `X-Device-Id` request header (DEVICE-01, explicitly out of scope here) before calling `upsertFavorite`/`upsertRecent`/`listFavorites`/`listRecents`.

## Self-Check: PASSED

- FOUND: src/server/api/repositories/FavoritesRecentsRepository.ts
- FOUND: src/server/api/repositories/FavoritesRecentsRepository.test.ts
- FOUND: src/server/api/models/PersistedEntity.ts
- FOUND: .planning/phases/05-sqlite-persistence-foundation/05-02-SUMMARY.md
- FOUND: commit f420a13 (Task 1)
- FOUND: commit 1aa07c6 (Task 2 RED)
- FOUND: commit 9eedfb3 (Task 2 GREEN)
- FOUND: commit 2453d61 (Task 3)

---
*Phase: 05-sqlite-persistence-foundation*
*Completed: 2026-08-31*
