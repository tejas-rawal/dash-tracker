---
phase: 06-favorites-routes-stops
verified: 2026-08-31T19:28:32Z
status: passed
score: 12/12 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 6: Favorites (Routes & Stops) Verification Report

**Phase Goal:** Riders, identified by an anonymous device ID, can favorite and unfavorite any route or stop and retrieve their full favorites as a single combined, type-tagged, hydrated list — fully self-contained, without touching any existing v0.2 code path.
**Verified:** 2026-08-31T19:28:32Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ROADMAP SC #1 — Client can favorite a route/stop by ID scoped to `X-Device-Id`; repeat favorite is a no-op success | ✓ VERIFIED | `FavoritesController.favorite` → `FavoritesService.addFavorite` → `FavoritesRecentsRepository.upsertFavorite` uses `INSERT ... ON CONFLICT (device_id, entity_type, entity_id) DO UPDATE SET favorited_at = @favoritedAt` (repo:67-75) — no duplicate row, no error. `favoriteRoutes.test.ts` + `FavoritesService.test.ts` exercise 200 success paths. |
| 2 | ROADMAP SC #2 — Client can unfavorite; unfavoriting a non-favorited entity is a no-op success, not 404 | ✓ VERIFIED | `deleteFavorite` (repo:77-82) is a plain `DELETE ... WHERE device_id = ? AND entity_type = ? AND entity_id = ?` with **no rows-affected check**, so a never-favorited entity resolves without error. `favoriteRoutes.test.ts` asserts 200 `{success:true}` for both a favorited and never-favorited `route-1`. |
| 3 | ROADMAP SC #3 — Combined, type-tagged (`entityType`), hydrated (full entity, not bare ID), DESC-ordered, uncapped list | ✓ VERIFIED | `FavoritesService.listFavorites` maps each `FavoriteRecord` through `resolveEntity` (→ `BusDataRepository.getRouteById`/`getStopById`, full `BusRoute`/`BusStop` objects) into `{entityType, favoritedAt, entity}`; repository query is `ORDER BY favorited_at DESC` (repo:84-91), unmodified by the service (no re-sort/no slice). Tests: `FavoritesService.test.ts` — DESC-order-preserved-across-mixed-types test, silently-omits-unresolved-entity test, 100-record no-cap test all present and passing. |
| 4 | ROADMAP SC #4 — Missing/empty `X-Device-Id` rejected 400, never a shared-bucket fallback | ✓ VERIFIED | `requireDeviceId` middleware mounted via `router.use(requireDeviceId)` before all three routes (`favoriteRoutes.ts:14`); rejects `undefined` and `value.trim().length === 0` (covers missing, empty-string, and whitespace-only, including tab). `requireDeviceId.test.ts` covers missing/empty/space/tab/array-valued header; `favoriteRoutes.test.ts` confirms 400 at the route level for all three verbs. |
| 5 | ROADMAP SC #5 — All existing v0.2 endpoints continue to respond exactly as before; favorites is purely additive | ✓ VERIFIED | `git log 6a8e56c^..HEAD` (Phase 6's commit range) touches zero files outside the favorites-specific file set — no phase-06 commit modifies `BusDataRepository.ts`, `StopController.ts`, `BusRouteController.ts`, `StopService.ts`, `BusRouteService.ts`, `PredictionService.ts`, `PredictionController.ts`, or `PredictionStreamController.ts`. (A diff against `main` does show 2-line changes in `BusRouteController.ts`/`StopController.ts`, but `git log` confirms these landed in Phase 5 commit `f420a13`, before Phase 6 began — not introduced by this phase.) Full suite (284/284, including all pre-existing v0.2 route/controller/service tests) passes unchanged. |
| 6 | Favoriting an unknown entityId returns 404; invalid `entityType` returns 400 (FAV-01/02) | ✓ VERIFIED | `FavoritesService.addFavorite` throws `NotFoundError` when `resolveEntity` returns `undefined`; `FavoritesController.favorite` maps `NotFoundError` → 404 via `resolveErrorStatus`. Controller rejects `entityType !== "route" && entityType !== "stop"` with 400 before calling the service. `FavoritesController.test.ts`/`FavoritesService.test.ts` assert both. |
| 7 | `DELETE /:entityType/:entityId` with an invalid entityType path segment returns 400 (FAV-03/04) | ✓ VERIFIED | `unfavorite` handler applies the identical `entityType !== "route" && entityType !== "stop"` check before calling `service.removeFavorite`. `favoriteRoutes.test.ts` — "responds with 400 for an invalid entityType path segment" (`vehicle/x`). |
| 8 | 25 concurrent upsert/delete favorite calls to the same device+entity complete without SQLITE_BUSY (DEVICE-01 concurrency edge) | ✓ VERIFIED (behavioral) | `FavoritesRecentsRepository.test.ts` `describe("concurrency")` — "handles concurrent favorite/unfavorite writes to the same device+entity without throwing SQLITE_BUSY" ran directly (`vitest -t concurrent`): 3 tests passed, all 25 `Promise.allSettled` results `fulfilled`. WAL mode + `busy_timeout = 5000` (repo:41-42) back this. |
| 9 | `GET /api/v1/favorites` on an empty list returns 200 `[]`, never 404 | ✓ VERIFIED | `listFavorites` handler calls `res.json(result)` unconditionally — no special-casing of an empty array, matching `getAllRoutes`'s array-return pattern. `favoriteRoutes.test.ts` — "responds with 200 and [] for a mocked empty listFavorites result". |
| 10 | `favoritedAt` values pass through verbatim, no reformatting | ✓ VERIFIED | Source inspection: `listFavorites` service method spreads `record.favoritedAt` directly into `HydratedFavorite.favoritedAt` — no `Number()`/`Math.round`/`Date` parsing between the repository read and the assembled object. |
| 11 | Whitespace-only `X-Device-Id` treated identically to missing (DEVICE-01 adjacency edge) | ✓ VERIFIED | `requireDeviceId.ts:6` — `value.trim().length === 0` check covers space and tab; `requireDeviceId.test.ts` has explicit single-space and tab-character test cases, both asserting 400. |
| 12 | Routes/predictions/SSE endpoints and `BusDataRepository` untouched by this plan (protected-file check) | ✓ VERIFIED | `git log 6a8e56c^..HEAD -- <protected file list>` returns empty — no commit in this phase's range touches any protected file. |

**Score:** 12/12 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/server/api/middleware/requireDeviceId.ts` | `requireDeviceId: RequestHandler` | ✓ VERIFIED | Exists, substantive, wired (`favoriteRoutes.ts:14`) |
| `src/server/api/routes/favoriteRoutes.ts` | Router with POST/DELETE/GET + `requireDeviceId` | ✓ VERIFIED | `export default router` present; automated tool flagged "Missing export: default (Router)" — false positive (grep matched the literal parenthetical annotation text from PLAN frontmatter, not a real gap); manually confirmed `export default router;` at line 20 |
| `src/server/api/controllers/FavoritesController.ts` | `favorite`/`unfavorite`/`listFavorites` handlers | ✓ VERIFIED | All three exported and implemented |
| `src/server/api/services/FavoritesService.ts` | `addFavorite`/`removeFavorite`/`listFavorites` | ✓ VERIFIED | All three exported and implemented, DI over both repositories |
| `src/server/api/repositories/FavoritesRecentsRepository.ts` | `deleteFavorite` added | ✓ VERIFIED | Present at line 77; automated tool false positive same as above (parenthetical text mismatch), manually confirmed class exported unchanged |
| `src/server/api/models/PersistedEntity.ts` | `HydratedFavorite` type | ✓ VERIFIED | Present at line 20; automated tool false positive same as above, manually confirmed |

Note: `gsd_run query verify.artifacts` reported 3/6 "Missing export" issues. All three are grep-tool false positives caused by the tool matching the full PLAN-frontmatter `exports` string (which includes parenthetical commentary like `"default (Router)"` or `"FavoritesRecentsRepository (extended, same export)"`) rather than the actual symbol name. Manual `Read` of each file confirms all real exports (`export default router`, `export class FavoritesRecentsRepository`, `export interface HydratedFavorite`) are present.

### Key Link Verification

| From | To | Via | Status |
|------|-----|-----|--------|
| `routes/index.ts` | `favoriteRoutes.ts` | `router.use("/favorites", favoriteRoutes)` | ✓ WIRED |
| `favoriteRoutes.ts` | `requireDeviceId.ts` | `router.use(requireDeviceId)` before all 3 endpoints | ✓ WIRED |
| `FavoritesController.ts` | `FavoritesService.ts` | `service.addFavorite/removeFavorite/listFavorites` | ✓ WIRED |
| `FavoritesService.ts` | `FavoritesRecentsRepository.ts` | `favoritesRepository.upsertFavorite/deleteFavorite/listFavorites` | ✓ WIRED |
| `FavoritesService.ts` | `BusDataRepository.ts` | `busDataRepository.getRouteById/getStopById` | ✓ WIRED |

All 5/5 key links verified via `gsd_run query verify.key-links` (pattern match against actual source) and confirmed manually via source reading.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite passes (284 tests, incl. all pre-existing v0.2 tests) | `bun run test` | 22 files / 284 tests passed, 0 typecheck errors | ✓ PASS |
| Build compiles cleanly | `bun run build` | `rm -rf dist && tsc` — no output, exit 0 | ✓ PASS |
| 25-way concurrent favorite/unfavorite writes never throw SQLITE_BUSY | `vitest -t concurrent` (single named-test run) | 3 concurrency tests passed, all `Promise.allSettled` results `fulfilled` | ✓ PASS |
| No debt markers (TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER) in phase-06 files | grep across 6 favorites-scoped files | No matches | ✓ PASS |
| Phase-06 commits don't touch protected v0.2 files | `git log 6a8e56c^..HEAD -- <protected files>` | Empty | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|--------------|--------|----------|
| FAV-01 | 06-01 | Favorite a route, idempotent | ✓ SATISFIED | `addFavorite` + upsert-with-ON-CONFLICT; tests pass |
| FAV-02 | 06-01 | Favorite a stop, idempotent | ✓ SATISFIED | Same path, `entityType: "stop"` branch tested |
| FAV-03 | 06-01 | Unfavorite a route, idempotent no-op | ✓ SATISFIED | `deleteFavorite` no-rows-check; tests pass |
| FAV-04 | 06-01 | Unfavorite a stop, idempotent no-op | ✓ SATISFIED | Same path, `entityType: "stop"` |
| FAV-05 | 06-01 | Combined, type-tagged, hydrated, DESC, uncapped list | ✓ SATISFIED | `listFavorites` service + repo ORDER BY; 100-record and mixed-type tests pass |
| DEVICE-01 | 06-01 | X-Device-Id required, 400 on missing/empty, no shared-bucket fallback | ✓ SATISFIED | `requireDeviceId` middleware mounted on all 3 routes; 6 test cases incl. whitespace/tab/array |

No orphaned requirements — REQUIREMENTS.md maps exactly FAV-01..05 and DEVICE-01 to Phase 6, all present in the 06-01-PLAN.md `requirements` frontmatter and marked `[x]` complete in REQUIREMENTS.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `FavoritesController.ts` | 41-47 | `entityId` validated after `.trim()` but the untrimmed value is passed to `service.addFavorite` (Code Review WR-01) | ⚠️ Warning | Edge case only: a whitespace-padded `entityId` (e.g. `" route-1 "`) passes the 400 check but then 404s instead of resolving against the trimmed id. Does not affect the core SC #1 scenario (normal, unpadded IDs favorite correctly and idempotently, confirmed by passing tests). |
| `FavoritesController.ts` | 54-66 | `unfavorite` has no equivalent `entityId` non-empty/trim validation, unlike `favorite` (Code Review WR-03) | ⚠️ Warning | A whitespace-only `entityId` path segment silently no-ops to 200 rather than being rejected 400. This is an inconsistency with `favorite`'s stricter validation, but the resulting behavior (200 success, not 404) still satisfies SC #2's "no-op success, not a 404" contract — it does not violate the roadmap success criterion. |
| `FavoritesController.ts` | 24-27 | `resolveDeviceId`'s `as string` type assertion has no runtime guard if called without `requireDeviceId` in front (Code Review WR-02) | ⚠️ Warning | Currently unreachable in production — `favoriteRoutes.ts` unconditionally mounts `requireDeviceId` via `router.use()` before all three handlers. Theoretical risk only if a future refactor reorders route mounting. |
| `FavoritesRecentsRepository.ts` | 93-110 | `upsertRecent`/`listRecents`/`RecentRecord` implemented but unwired to any service/controller/route (Code Review IN-01) | ℹ️ Info | Out of Phase 6 scope — explicitly deferred to Phase 7 (Recents) per `PROJECT.md` roadmap. Not a Phase 6 gap. |

None of these are blockers. WR-01/WR-02/WR-03 are legitimate code-quality/robustness findings on edge cases outside the 5 roadmap success criteria's core scenarios — they do not cause any success criterion to fail. Recommend addressing them in a follow-up cleanup pass or at the start of Phase 7 (which will mirror this controller pattern for Recents and would otherwise propagate the same three inconsistencies).

### Human Verification Required

None. All must-haves are verifiable via automated tests, source inspection, and a single behavioral test run (concurrency). No visual, real-time, or external-service-dependent behavior in this phase's scope.

### Gaps Summary

No gaps. All 5 ROADMAP Phase 6 success criteria are observably true in the codebase: favoriting/unfavoriting are idempotent no-ops in the expected directions, listing returns a combined hydrated DESC-ordered uncapped array, `X-Device-Id` is strictly enforced with no shared-bucket fallback, and the phase's own commit range touches zero pre-existing v0.2 files. Full test suite (284/284) and build pass. Three code-review warnings (WR-01/02/03) exist on validation-consistency edge cases but do not undermine any of the five contracted success criteria — recorded as follow-up cleanup items, not phase-blocking gaps.

---

_Verified: 2026-08-31T19:28:32Z_
_Verifier: Claude (gsd-verifier)_
