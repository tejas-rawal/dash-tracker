---
phase: 06-favorites-routes-stops
plan: 01
subsystem: api
tags: [express, sqlite, better-sqlite3, favorites, device-scoped, tdd]

requires:
  - phase: 05-sqlite-persistence-foundation
    provides: FavoritesRecentsRepository singleton with upsertFavorite/listFavorites, wired into app.ts startup
provides:
  - Anonymous device-scoped favorites HTTP API (POST/DELETE/GET /api/v1/favorites)
  - requireDeviceId middleware (reusable by Phase 7 Recents)
  - FavoritesService/FavoritesController pattern for Phase 7 to mirror
affects: [07-recents-routes-stops]

actuals:
  tokens: 11900
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "requireDeviceId Express middleware validating X-Device-Id presence/non-whitespace before controller runs"
    - "FavoritesService hydrates directly from BusDataRepository (not via BusRouteService/StopService)"
    - "Repository DELETE with no rows-affected check to make unfavorite-a-non-favorite a no-op success"

key-files:
  created:
    - src/server/api/middleware/requireDeviceId.ts
    - src/server/api/middleware/requireDeviceId.test.ts
    - src/server/api/services/FavoritesService.ts
    - src/server/api/services/FavoritesService.test.ts
    - src/server/api/controllers/FavoritesController.ts
    - src/server/api/controllers/FavoritesController.test.ts
    - src/server/api/routes/favoriteRoutes.ts
    - src/server/api/routes/favoriteRoutes.test.ts
  modified:
    - src/server/api/routes/index.ts
    - src/server/api/repositories/FavoritesRecentsRepository.ts
    - src/server/api/repositories/FavoritesRecentsRepository.test.ts
    - src/server/api/models/PersistedEntity.ts

key-decisions:
  - "Normalized Express 5's string | string[] typing for req.params values in unfavorite (Array.isArray check), matching the existing StopController pattern for query params"
  - "Ran bun install to populate an empty node_modules in this fresh worktree (Rule 3 blocker); reverted the resulting package.json/bun.lockb reformatting since it was purely a local install artifact unrelated to this plan's scope"

patterns-established:
  - "Device-scoped feature middleware lives in src/server/api/middleware/ (new directory), mounted only on the owning router"
  - "TDD RED/GREEN commit pairs per behavior slice within a single tracer+TDD plan"

requirements-completed: [FAV-01, FAV-02, FAV-03, FAV-04, FAV-05, DEVICE-01]

coverage:
  - id: D1
    description: "POST /api/v1/favorites favorites a route/stop scoped to X-Device-Id; idempotent on repeat; 404 on unknown entity; 400 on invalid entityType/entityId"
    requirement: "FAV-01"
    verification:
      - kind: unit
        ref: "src/server/api/services/FavoritesService.test.ts#addFavorite"
        status: pass
      - kind: integration
        ref: "src/server/api/routes/favoriteRoutes.test.ts#POST /api/v1/favorites"
        status: pass
    human_judgment: false
  - id: D2
    description: "DELETE /api/v1/favorites/:entityType/:entityId always returns 200 success, including for a never-favorited entity"
    requirement: "FAV-02"
    verification:
      - kind: unit
        ref: "src/server/api/repositories/FavoritesRecentsRepository.test.ts#deleteFavorite"
        status: pass
      - kind: integration
        ref: "src/server/api/routes/favoriteRoutes.test.ts#DELETE /api/v1/favorites/:entityType/:entityId"
        status: pass
    human_judgment: false
  - id: D3
    description: "25 concurrent upsertFavorite/deleteFavorite calls to the same device+entity complete without SQLITE_BUSY"
    requirement: "DEVICE-01"
    verification:
      - kind: integration
        ref: "src/server/api/repositories/FavoritesRecentsRepository.test.ts#concurrency > handles concurrent favorite/unfavorite writes"
        status: pass
    human_judgment: false
  - id: D4
    description: "GET /api/v1/favorites returns one combined, favoritedAt-DESC-ordered, uncapped, hydrated array; 200 [] when empty; silently skips unresolved entities"
    requirement: "FAV-03"
    verification:
      - kind: unit
        ref: "src/server/api/services/FavoritesService.test.ts#listFavorites"
        status: pass
      - kind: integration
        ref: "src/server/api/routes/favoriteRoutes.test.ts#GET /api/v1/favorites"
        status: pass
    human_judgment: false
  - id: D5
    description: "requireDeviceId rejects missing/empty/whitespace-only X-Device-Id with 400 before any handler runs, never a shared-bucket fallback"
    requirement: "DEVICE-01"
    verification:
      - kind: unit
        ref: "src/server/api/middleware/requireDeviceId.test.ts"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-08-31
status: complete
---

# Phase 6 Plan 1: Favorites (Routes & Stops) Summary

**Anonymous device-scoped Favorites HTTP API (POST/DELETE/GET /api/v1/favorites) with requireDeviceId middleware, entity hydration via BusDataRepository, and idempotent add/no-op-remove semantics**

## Performance

- **Duration:** 8 min
- **Started:** 2026-08-31T19:11:00Z
- **Completed:** 2026-08-31T19:17:18Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments
- End-to-end `POST /api/v1/favorites`: `requireDeviceId` middleware, `FavoritesService.addFavorite` (entity-existence check via `BusDataRepository`), `FavoritesController.favorite`, mounted at `/favorites` in `routes/index.ts`
- `DELETE /api/v1/favorites/:entityType/:entityId` unfavorite: repository `deleteFavorite` (plain SQL DELETE, no rows-affected check), service `removeFavorite`, controller `unfavorite` — always `200 {success:true}`, verified concurrency-safe (25 concurrent favorite/unfavorite writes, no SQLITE_BUSY)
- `GET /api/v1/favorites` list: `HydratedFavorite` model type, `FavoritesService.listFavorites` hydrating and silently skipping unresolved entities, preserving the repository's `favoritedAt DESC` order with no cap
- Full v0.3 favorites contract (FAV-01 through FAV-05, DEVICE-01) satisfied; existing v0.2 endpoints/tests untouched (verified via `git diff --stat` on the protected file set)

## Task Commits

Each task was committed atomically (Tasks 2 and 3 used the TDD RED/GREEN cycle per `tdd="true"`):

1. **Task 1: End-to-end "favorite a route"** — `6a8e56c` (feat)
2. **Task 2: Unfavorite — RED** — `a5a1486` (test)
3. **Task 2: Unfavorite — GREEN** — `286c835` (feat)
4. **Task 3: List favorites — RED** — `75f66c0` (test)
5. **Task 3: List favorites — GREEN** — `e9c9e16` (feat)

**Plan metadata:** (pending — committed after this SUMMARY)

_No REFACTOR commits were needed — GREEN implementations followed the pre-established StopController/StopService pattern directly with no cleanup pass required._

## Files Created/Modified
- `src/server/api/middleware/requireDeviceId.ts` - Express middleware rejecting missing/empty/whitespace-only `X-Device-Id`
- `src/server/api/middleware/requireDeviceId.test.ts` - Middleware unit tests (missing/empty/whitespace/array-valued header)
- `src/server/api/services/FavoritesService.ts` - `addFavorite`/`removeFavorite`/`listFavorites`, factory DI over both repositories
- `src/server/api/services/FavoritesService.test.ts` - Service unit tests for all three methods
- `src/server/api/controllers/FavoritesController.ts` - `favorite`/`unfavorite`/`listFavorites` request handlers, error mapping
- `src/server/api/controllers/FavoritesController.test.ts` - Controller unit tests for all three handlers
- `src/server/api/routes/favoriteRoutes.ts` - Router mounting `requireDeviceId` + POST/DELETE/GET `/favorites`
- `src/server/api/routes/favoriteRoutes.test.ts` - Supertest integration tests against the full app
- `src/server/api/routes/index.ts` - Mounts `favoriteRoutes` at `/favorites`
- `src/server/api/repositories/FavoritesRecentsRepository.ts` - Added `deleteFavorite` (plain DELETE, no rows-affected check)
- `src/server/api/repositories/FavoritesRecentsRepository.test.ts` - Added `deleteFavorite` and favorite/unfavorite concurrency tests
- `src/server/api/models/PersistedEntity.ts` - Added `HydratedFavorite` type

## Decisions Made
- Normalized Express 5's `string | string[]` typing for `req.params.entityType`/`entityId` in `unfavorite` (build failed without this — `@types/express@5.0.6`'s `ParamsDictionary` allows array values for wildcard-style routes), following the existing `Array.isArray` normalization pattern already used for query params in `StopController`.
- The worktree's `node_modules` was empty (fresh worktree, never had `bun install` run) — ran `bun install` to unblock test execution, then reverted the resulting `package.json`/`bun.lockb` reformatting (4-space → 2-space JSON indent, unrelated to this plan) since it was a local install artifact, not a plan-scoped change.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed TypeScript build error from Express 5's array-typed route params**
- **Found during:** Task 2 (Unfavorite — GREEN phase, `bun run build`)
- **Issue:** `FavoritesController.unfavorite` destructured `req.params` directly; `@types/express@5.0.6` types `ParamsDictionary` values as `string | string[]`, so passing `entityId`/`entityType` straight into `service.removeFavorite(deviceId, entityType, entityId)` failed `tsc` with `Argument of type 'string | string[]' is not assignable to parameter of type 'string'`.
- **Fix:** Normalized both params with `Array.isArray(raw) ? raw[0] : raw`, mirroring the existing `StopController.getStopsForRoute` pattern for `req.params.shortName`.
- **Files modified:** `src/server/api/controllers/FavoritesController.ts`
- **Verification:** `bun run build` clean; all 49 Task 2 tests still passing.
- **Committed in:** `286c835` (Task 2 GREEN commit)

**2. [Rule 3 - Blocking] Ran `bun install` to populate an empty worktree `node_modules`**
- **Found during:** Task 1 verification (`bun run test` failed to resolve `better-sqlite3`)
- **Issue:** This git worktree's `node_modules` was created but never populated (0 packages installed) — an environment gap, not a code issue, but blocking every test run.
- **Fix:** Ran `bun install` (also trusted `@biomejs/biome`'s blocked postinstall to fetch its native binary — a pre-existing project dependency, not a new/unverified package). Reverted the incidental `package.json`/`bun.lockb` reformatting that `bun install` produced (4-space → 2-space JSON indent), since that diff was unrelated to this plan's scope.
- **Files modified:** none committed (install-only; `package.json`/`bun.lockb` changes reverted via `git checkout --`)
- **Verification:** `bun run test`/`bun run build` succeed after install.
- **Committed in:** N/A (environment setup, not a code change)

---

**Total deviations:** 2 auto-fixed (1 blocking type-fix, 1 blocking environment-fix). **Impact on plan:** Both were necessary to complete the plan's verification steps; no scope creep — no unrelated packages were added or upgraded.

## Issues Encountered
None beyond the two auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 7 (Recents) can directly reuse `requireDeviceId` middleware and mirror the `FavoritesService`/`FavoritesController`/route pattern established here.
- Full test suite: 284/284 passing. Coverage: 96.43% stmts / 92.42% branch / 96.96% funcs / 96.43% lines (above the 80% threshold). `bun run build` clean. `bun run lint` clean for all plan-scoped files (only pre-existing, unrelated `*.test.ts` filename-convention warnings and one pre-existing `.planning/config.json` formatting note remain, neither introduced by this plan).
- No blockers.

---
*Phase: 06-favorites-routes-stops*
*Completed: 2026-08-31*
