---
phase: 07-recents-routes-stops
plan: 01
subsystem: api
tags: [express, sqlite, better-sqlite3, recents, favorites, fire-and-forget]

# Dependency graph
requires:
  - phase: 05-sqlite-persistence-foundation
    provides: FavoritesRecentsRepository singleton with upsertRecent/listRecents on a recents table
  - phase: 06-favorites-routes-stops
    provides: requireDeviceId middleware, FavoritesService/FavoritesController/favoriteRoutes.ts pattern to mirror
provides:
  - Fire-and-forget stop/route recents auto-logging on every REST prediction lookup carrying an X-Device-Id
  - Cap-at-5 combined recents per device with oldest-evicted-first eviction inside FavoritesRecentsRepository.upsertRecent
  - GET /api/v1/recents combined hydrated recents list endpoint, device-scoped via requireDeviceId
affects: [08-*, any-future-phase-touching-predictions-or-recents]

# Actuals (#2632)
actuals:
  tokens: 12801
  tasks: 3
  commits: 5

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fire-and-forget side effect: build the response first, then invoke the write without awaiting it, chaining only a .catch() that logs a warning"
    - "Repository-owned cap enforcement: eviction DELETE runs inside upsertRecent itself so no caller has to think about the cap"

key-files:
  created:
    - src/server/api/services/RecentsService.ts
    - src/server/api/controllers/RecentsController.ts
    - src/server/api/routes/recentRoutes.ts
  modified:
    - src/server/api/models/Prediction.ts
    - src/server/api/models/PersistedEntity.ts
    - src/server/api/services/PredictionService.ts
    - src/server/api/controllers/PredictionController.ts
    - src/server/api/routes/predictionRoutes.ts
    - src/server/api/repositories/FavoritesRecentsRepository.ts
    - src/server/api/routes/index.ts

key-decisions:
  - "recordRecentView grew its routeId parameter incrementally across Task 1 (stop-only, 2-arg) and Task 2 (stop+route, 3-arg) instead of accepting an always-present-but-unused routeId param from Task 1 onward, to avoid tripping tsconfig's noUnusedParameters and breaking Task 1's own build verification"
  - "Eviction DELETE orders by viewed_at DESC, id DESC (not viewed_at DESC alone) so same-millisecond writes break ties by insertion order deterministically"

patterns-established:
  - "Recents HTTP surface (RecentsService/RecentsController/recentRoutes.ts) mirrors Favorites' listFavorites shape exactly, substituting viewedAt for favoritedAt"

requirements-completed: [RECENT-01, RECENT-02, RECENT-03, RECENT-04, RECENT-05, RECENT-06]

coverage:
  - id: D1
    description: "Every REST prediction lookup with a device id fire-and-forget-logs the viewed stop as a recent; SSE path is structurally incapable of triggering it"
    requirement: "RECENT-02, RECENT-06"
    verification:
      - kind: unit
        ref: "src/server/api/services/PredictionService.test.ts#logs a recent for the stop when a deviceId is provided"
        status: pass
      - kind: unit
        ref: "src/server/api/services/PredictionStreamService.test.ts#never supplies a second argument to getPredictionsForStop on the initial subscribe fetch or a subsequent poll tick"
        status: pass
    human_judgment: false
  - id: D2
    description: "An explicit route param on a prediction lookup also logs that route as a recent; an unfiltered stop-only lookup does not"
    requirement: "RECENT-01"
    verification:
      - kind: unit
        ref: "src/server/api/services/PredictionService.test.ts#logs both the stop and the route as recents when a deviceId and an explicit route are provided"
        status: pass
      - kind: unit
        ref: "src/server/api/services/PredictionService.test.ts#logs only the stop as a recent when a deviceId is provided without a route"
        status: pass
    human_judgment: false
  - id: D3
    description: "Recents are capped at 5 combined entries per device, oldest evicted first, bump-to-top on re-view, scoped per device"
    requirement: "RECENT-03, RECENT-04"
    verification:
      - kind: unit
        ref: "src/server/api/repositories/FavoritesRecentsRepository.test.ts#eviction > caps a device's recents at 5, evicting the oldest-written entry first"
        status: pass
      - kind: unit
        ref: "src/server/api/repositories/FavoritesRecentsRepository.test.ts#eviction > does not change the row count when re-upserting an existing top-5 recent"
        status: pass
      - kind: unit
        ref: "src/server/api/repositories/FavoritesRecentsRepository.test.ts#eviction > scopes eviction per device, leaving another device's 5 existing rows untouched"
        status: pass
    human_judgment: false
  - id: D4
    description: "The recents write never delays or breaks the primary prediction response, even on a rejected write"
    requirement: "RECENT-02"
    verification:
      - kind: unit
        ref: "src/server/api/services/PredictionService.test.ts#resolves the response even while the recents write is still pending"
        status: pass
      - kind: unit
        ref: "src/server/api/services/PredictionService.test.ts#resolves the response and logs a warning when the recents write rejects"
        status: pass
    human_judgment: false
  - id: D5
    description: "GET /api/v1/recents returns a combined, hydrated, viewedAt-DESC array, device-scoped, 200 [] when empty"
    requirement: "RECENT-05"
    verification:
      - kind: unit
        ref: "src/server/api/services/RecentsService.test.ts#listRecents"
        status: pass
      - kind: integration
        ref: "src/server/api/routes/recentRoutes.test.ts#GET /api/v1/recents"
        status: pass
    human_judgment: false

# Metrics
duration: ~20min
completed: 2026-08-31
status: complete
---

# Phase 7 Plan 01: Auto-Tracked Recents (Routes & Stops) Summary

**Fire-and-forget stop/route recents logging on every REST prediction lookup, cap-at-5 oldest-evicted-first eviction inside `FavoritesRecentsRepository.upsertRecent`, and a new `GET /api/v1/recents` endpoint mirroring the Favorites pattern**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-31T20:16Z (approx.)
- **Completed:** 2026-08-31T20:21Z (approx.)
- **Tasks:** 3
- **Files modified:** 18

## Accomplishments
- `PredictionService.getPredictionsForStop` fire-and-forget-logs the viewed stop (and, when an explicit `route` param is present, the route too) as a recent via `FavoritesRecentsRepository.upsertRecent`, guarded so a rejected write only logs a warning and never delays or breaks the response
- `PredictionController` resolves an optional `X-Device-Id` header without ever requiring it; `predictionRoutes.ts` never gained `requireDeviceId` middleware, preserving D-01
- `FavoritesRecentsRepository.upsertRecent` now enforces a hard cap of 5 combined recents per device via a follow-up `DELETE ... ORDER BY viewed_at DESC, id DESC LIMIT 5` after every insert/update, with the public signature unchanged
- New `GET /api/v1/recents` endpoint (`RecentsService`/`RecentsController`/`recentRoutes.ts`) returns a combined, hydrated, `viewedAt`-DESC array scoped by the required `X-Device-Id` header, mirroring `FavoritesService.listFavorites` exactly
- `PredictionStreamService`/`PredictionStreamController` received zero changes — confirmed via an empty `git diff --stat` and a regression test locking in the single-argument `getPredictionsForStop(stopId)` call shape on both the initial subscribe fetch and poll ticks

## Task Commits

Task 1 was `type="tracer"` (committed once, then verified end-to-end before Task 2 expanded on it). Tasks 2 and 3 were `tdd="true"` (RED test commit, then GREEN implementation commit):

1. **Task 1: End-to-end stop-recent auto-logging on a prediction lookup** - `91ef05f` (feat)
2. **Task 2 RED: failing tests for route-recent logging and cap-at-5 eviction** - `b9e5a2b` (test)
3. **Task 2 GREEN: route-recent logging and cap-at-5 eviction** - `682ba7f` (feat)
4. **Task 3 RED: failing tests for the recents list endpoint** - `fd9cee9` (test)
5. **Task 3 GREEN: GET /api/v1/recents endpoint** - `6c1517c` (feat)

_Note: Task 1 was type="tracer", not tdd — a single feat commit followed by the tracer feedback gate (re-running its `<verify>` end-to-end) before Task 2 expanded on it._

## Files Created/Modified
- `src/server/api/services/RecentsService.ts` - `listRecents(deviceId)` hydration logic, mirrors `FavoritesService.listFavorites`
- `src/server/api/controllers/RecentsController.ts` - `listRecents` RequestHandler, mirrors `FavoritesController`
- `src/server/api/routes/recentRoutes.ts` - Router mounting `requireDeviceId` + `GET /`, wired via factory DI
- `src/server/api/models/Prediction.ts` - `PredictionOptions` gains internal-only `deviceId?: string`
- `src/server/api/models/PersistedEntity.ts` - new `HydratedRecent` type, sibling to `HydratedFavorite`
- `src/server/api/services/PredictionService.ts` - `createPredictionService` takes a second `FavoritesRecentsRepository` param; `getPredictionsForStop` fire-and-forget-logs recents
- `src/server/api/controllers/PredictionController.ts` - `resolveOptionalDeviceId` helper, never 400s on absence
- `src/server/api/routes/predictionRoutes.ts` - `createPredictionService` call site gains `FavoritesRecentsRepository.getInstance()`
- `src/server/api/repositories/FavoritesRecentsRepository.ts` - `upsertRecent` gains cap-at-5 eviction DELETE
- `src/server/api/routes/index.ts` - mounts `recentRoutes` at `/recents`

## Decisions Made
- `recordRecentView`'s `routeId` parameter was introduced only in Task 2 (when it became used) rather than accepted-but-unused from Task 1, to avoid tripping `tsconfig.json`'s `noUnusedParameters: true` and breaking Task 1's own `bun run build` verification step. Observable behavior across both tasks matches the plan's acceptance criteria exactly; only this internal implementation detail differs from the plan's literal suggested signature.
- Eviction tie-breaking: `DELETE ... ORDER BY viewed_at DESC, id DESC LIMIT 5` instead of `viewed_at DESC` alone (see Deviations below).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree had never run `bun install`**
- **Found during:** Task 1, first test run
- **Issue:** `node_modules` in this worktree was empty (no `bun install` had ever run here), so `better-sqlite3` and all other dependencies failed to resolve, blocking every test run.
- **Fix:** Ran `bun install` and `bun pm trust @biomejs/biome` to restore a working `node_modules`. This modified `package.json` (reformatted to 2-space indent by `bun pm trust`, plus a `trustedDependencies` field) and `bun.lockb` as side effects — both were reverted via `git checkout -- package.json bun.lockb` since they were unrelated to this plan's scope and the reformatting used the wrong indent width for this repo. `node_modules` itself is gitignored, so the working install persists locally without being committed.
- **Files modified:** none tracked (node_modules is gitignored; package.json/bun.lockb reverted)
- **Verification:** `bun run test` and `bun run build` succeeded afterward
- **Committed in:** N/A (no tracked file changes)

**2. [Rule 1 - Bug] Cap-at-5 eviction was nondeterministic under same-millisecond writes**
- **Found during:** Task 3, full-suite verification (`bun run test` failed intermittently, though the isolated Task 2 file passed)
- **Issue:** `upsertRecent`'s eviction `DELETE ... ORDER BY viewed_at DESC LIMIT 5` broke ties on `viewed_at` (ISO string, millisecond resolution) arbitrarily when several rows were written within the same millisecond — a realistic scenario in tests and under any fast write burst — so "oldest evicted first" wasn't reliably guaranteed.
- **Fix:** Added `id DESC` as a secondary sort key (`ORDER BY viewed_at DESC, id DESC LIMIT 5`), using the `AUTOINCREMENT` primary key as a deterministic proxy for insertion order among timestamp ties.
- **Files modified:** `src/server/api/repositories/FavoritesRecentsRepository.ts`
- **Verification:** Ran the full suite and the repository test file in isolation 3x in a row with zero flakes after the fix (previously failed roughly 1 in 2 full-suite runs)
- **Committed in:** `6c1517c` (Task 3 GREEN commit)

---

**Total deviations:** 2 auto-fixed (1 blocking/environment, 1 bug)
**Impact on plan:** Both fixes were necessary for correctness and to unblock execution; no scope creep beyond the plan's stated deliverables.

## Issues Encountered
None beyond the two deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- v0.3 (Favorited & Recent Routes) milestone is now fully shipped: Phase 5 (SQLite persistence foundation), Phase 6 (Favorites), and Phase 7 (Recents) are all complete.
- `bun run test` (311/311), `bun run test:coverage` (96.55% stmts/91.46% branch/97.24% funcs/96.55% lines, all above the 80% threshold), `bun run build`, and `bun run lint` (0 new errors; only the same pre-existing filename-convention warnings the rest of the repo already carries) all pass.
- No blockers for milestone completion.

## Self-Check: PASSED

- FOUND: src/server/api/services/RecentsService.ts
- FOUND: src/server/api/controllers/RecentsController.ts
- FOUND: src/server/api/routes/recentRoutes.ts
- FOUND: .planning/phases/07-recents-routes-stops/07-01-SUMMARY.md
- FOUND commits: 91ef05f, b9e5a2b, 682ba7f, fd9cee9, 6c1517c, 09dc2d4

---
*Phase: 07-recents-routes-stops*
*Completed: 2026-08-31*
