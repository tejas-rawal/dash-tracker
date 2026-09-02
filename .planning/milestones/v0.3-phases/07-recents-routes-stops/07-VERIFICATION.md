---
phase: 07-recents-routes-stops
verified: 2026-09-01T14:07:39Z
status: passed
score: 11/11 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 7: Auto-Tracked Recents (Routes & Stops) Verification Report

**Phase Goal:** Riders' real route and stop lookups are automatically tracked as recents — deduped, capped at 5, combined and type-tagged — as a side effect of prediction lookups, without ever slowing down or breaking the underlying prediction/stop response.
**Verified:** 2026-09-01T14:07:39Z
**Status:** passed
**Re-verification:** No — initial verification

## Context: Post-Review Fix Verified In Codebase

07-REVIEW.md flagged CR-01 (BLOCKER): `PredictionService.recordRecentView` was persisting the client-supplied route **short name** (e.g. `"1A"`) as the recent's `entityId`, but `RecentsService.resolveEntity` hydrates route recents via `BusDataRepository.getRouteById`, which is keyed by internal route **id** (e.g. `"route-1"`). This silently dropped every route recent from `GET /api/v1/recents`.

Verified directly against the current working tree (not the SUMMARY's claim): commit `6934ed4` is present on this branch, and `PredictionService.ts` now contains a `resolveRouteIdForRecent(routeShortName)` helper that calls `repository.getRouteByShortName(trimmed)?.id` before persisting the route recent (lines 31-37, 122), matching `RecentsService.resolveEntity`'s `getRouteById` lookup on the read side. An unresolvable or empty/whitespace route short name is skipped rather than persisted (also closes WR-01). Regression tests (`PredictionService.test.ts`) cover: resolved short name → internal id write, unresolvable short name → stop-only write, and whitespace-only route param → stop-only write with `getRouteByShortName` never called. Full suite (313/313) passes with this fix in place.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | RECENT-01: Explicit `route` param auto-logs the route as a recent (by resolved internal id); stop-only lookup never logs a route recent | ✓ VERIFIED | `PredictionService.ts:23-29,31-37,120-126`; `PredictionService.test.ts` "logs both the stop and the route (by internal route id)...", "logs only the stop as a recent when the route short name does not resolve...", "logs only the stop as a recent when the route query param is an empty or whitespace-only string" — all passing |
| 2 | RECENT-02: Every prediction lookup auto-logs its stop as a recent | ✓ VERIFIED | `PredictionService.ts:120-126` unconditional `upsertRecent(deviceId, "stop", stopId)` in `recordRecentView`; `PredictionService.test.ts` "logs a recent for the stop when a deviceId is provided" |
| 3 | RECENT-03: Re-viewing an already-recent route/stop bumps to top via upsert, not duplicate | ✓ VERIFIED | `FavoritesRecentsRepository.ts:96-100` `INSERT ... ON CONFLICT (device_id, entity_type, entity_id) DO UPDATE SET viewed_at = @viewedAt`; `FavoritesRecentsRepository.test.ts` "eviction > does not change the row count when re-upserting an existing top-5 recent" (real SQLite-backed test, not mocked) |
| 4 | RECENT-04: Combined recents list capped at 5 per device, oldest evicted first | ✓ VERIFIED | `FavoritesRecentsRepository.ts:101-105` `DELETE FROM recents WHERE device_id = @deviceId AND id NOT IN (... ORDER BY viewed_at DESC, id DESC LIMIT 5)` run on every `upsertRecent`; `FavoritesRecentsRepository.test.ts` "eviction" describe block — 6-write eviction, per-device scoping, re-upsert-preserves-count, all against a real SQLite instance |
| 5 | RECENT-05: `GET /api/v1/recents` returns one combined array, `{entityType, viewedAt, entity}`, hydrated, viewedAt-DESC | ✓ VERIFIED | `RecentsService.ts` `listRecents`; `recentRoutes.ts` mounts `GET /`; `recentRoutes.test.ts` "responds with 200 and the service's array body for a mixed route+stop result"; `RecentsService.test.ts` DESC-order and hydration tests |
| 6 | RECENT-05: zero recents → 200 `[]`; unresolvable entity silently skipped | ✓ VERIFIED | `RecentsService.ts:19-27` `.filter((entry): entry is HydratedRecent => entry !== undefined)`; `recentRoutes.test.ts` "responds with 200 and [] for a mocked empty listRecents result"; `RecentsService.test.ts` skip-unresolvable case |
| 7 | RECENT-06: Opening `/predictions/stream` never logs a recent — structurally impossible, not just runtime-gated | ✓ VERIFIED | `git diff --stat 91ef05f^ HEAD -- .../PredictionStreamService.ts .../PredictionStreamController.ts` is empty (zero changes across all of phase 7); both call sites still invoke `getPredictionsForStop(stopId)` single-arg; `PredictionStreamService.test.ts` "never supplies a second argument to getPredictionsForStop on the initial subscribe fetch or a subsequent poll tick" |
| 8 | Recents-logging side effect never delays or breaks the primary prediction response, even on rejection (backstop-tier — requires behavioral evidence) | ✓ VERIFIED | `PredictionService.test.ts` "resolves the response even while the recents write is still pending" — mocks `upsertRecent` to return a promise that never resolves (`new Promise(() => {})`) and asserts `getPredictionsForStop` still resolves with `success: true`; "resolves the response and logs a warning when the recents write rejects" — asserts `logger.warn` called once, no thrown error. Both passing against real fire-and-forget code (`.catch()`-guarded, never awaited at the call site, `PredictionService.ts:121-126`) |
| 9 | Missing/empty/whitespace `X-Device-Id` on `/predictions` still 200s, never 400s, never logs | ✓ VERIFIED | `PredictionController.ts:17-21` `resolveOptionalDeviceId` returns `undefined` on missing/blank header, never responds 400; `predictionRoutes.ts` has no `requireDeviceId` middleware; `PredictionController.test.ts` and `PredictionService.test.ts` "does not log a recent when deviceId is whitespace-only" |
| 10 | `GET /api/v1/recents` requires `X-Device-Id`; missing/empty → 400 | ✓ VERIFIED | `recentRoutes.ts:14` `router.use(requireDeviceId)`; `recentRoutes.test.ts` "responds with 400 when X-Device-Id header is missing" asserting exact body `{error:"Bad Request", details:"X-Device-Id header is required"}` |
| 11 | All existing v0.2 endpoints/SSE continue to respond as before — non-regression | ✓ VERIFIED | `bun run test` → 313/313 passing (full suite, run directly by verifier, not sourced from SUMMARY); `bun run build` exits 0; `git diff --stat 91ef05f^ HEAD` for `BusDataRepository.ts/.test.ts`, `StopController.ts`, `BusRouteController.ts`, `StopService.ts`, `BusRouteService.ts`, `PredictionStreamService.ts`, `PredictionStreamController.ts`, `requireDeviceId.ts` is empty across the entire phase |

**Score:** 11/11 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/server/api/services/RecentsService.ts` | `listRecents(deviceId)` hydration logic | ✓ VERIFIED | Exists, exports `RecentsService`/`createRecentsService`, imported by `recentRoutes.ts`, tested by `RecentsService.test.ts` (5 tests) |
| `src/server/api/controllers/RecentsController.ts` | `listRecents` RequestHandler | ✓ VERIFIED | Exists, exports `RecentsController`/`createRecentsController`, imported/used by `recentRoutes.ts`, tested by `RecentsController.test.ts` (4 tests) |
| `src/server/api/routes/recentRoutes.ts` | Router mounting `requireDeviceId` + `GET /` | ✓ VERIFIED | Exists, `router.use(requireDeviceId)` + `router.get("/", controller.listRecents)`, mounted in `routes/index.ts`, tested by `recentRoutes.test.ts` (3 tests, supertest) |
| `src/server/api/models/PersistedEntity.ts` | `HydratedRecent` type | ✓ VERIFIED | `export interface HydratedRecent { entityType; viewedAt; entity }` present, sibling to `HydratedFavorite` |
| `src/server/api/repositories/FavoritesRecentsRepository.ts` | `upsertRecent` extended with cap-at-5 eviction | ✓ VERIFIED | Signature unchanged (`upsertRecent(deviceId, entityType, entityId)`), eviction `DELETE` added after insert, exercised against real SQLite in `FavoritesRecentsRepository.test.ts` |
| `src/server/api/services/PredictionService.ts` | `createPredictionService` gains 2nd param; fire-and-forget logging | ✓ VERIFIED | `createPredictionService(repository, recentsRepository)`; `recordRecentView` + `resolveRouteIdForRecent` present and wired |
| `src/server/api/controllers/PredictionController.ts` | Resolves optional `X-Device-Id`, never 400s on absence | ✓ VERIFIED | `resolveOptionalDeviceId` present, `getPredictions` passes `deviceId` through |
| `src/server/api/models/Prediction.ts` | `PredictionOptions` gains optional `deviceId` | ✓ VERIFIED | `deviceId?: string` present per PredictionService.ts import/usage |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `routes/index.ts` | `routes/recentRoutes.ts` | `router.use("/recents", recentRoutes)` | ✓ WIRED | Confirmed present, line 14 |
| `recentRoutes.ts` | `middleware/requireDeviceId.ts` | `router.use(requireDeviceId)` | ✓ WIRED | Confirmed present, line 14 |
| `RecentsController.ts` | `RecentsService.ts` | `service.listRecents(...)` | ✓ WIRED | Confirmed, line 30 |
| `RecentsService.ts` | `FavoritesRecentsRepository.ts` | `recentsRepository.listRecents(deviceId)` | ✓ WIRED | Confirmed, line 20 |
| `predictionRoutes.ts` | `PredictionService.ts` | `createPredictionService(BusDataRepository.getInstance(), FavoritesRecentsRepository.getInstance())` | ✓ WIRED | Confirmed, line 8 |
| `PredictionService.ts` | `FavoritesRecentsRepository.ts` | `recentsRepository.upsertRecent(...)`, fire-and-forget, `.catch()`-guarded | ✓ WIRED | Confirmed, lines 24, 26, 122-125; never awaited at call site |
| `PredictionStreamService.ts` | `PredictionService.ts` | `getPredictionsForStop(stopId)` single-arg only | ✓ WIRED (structurally excluded) | Confirmed both call sites (lines 33, 77) pass only `stopId`; zero diff across phase 7 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite passes | `bun run test` (vitest --run --typecheck) | 25 files, 313/313 tests passed, "Type Errors: no errors" | ✓ PASS |
| Build compiles cleanly | `bun run build` (`rm -rf dist && tsc`) | exit 0, no `error TS` output | ✓ PASS |
| CR-01 fix present in working tree (not just claimed) | `git show 6934ed4` + `Read PredictionService.ts` | `resolveRouteIdForRecent` calls `repository.getRouteByShortName(trimmed)?.id`, matching `RecentsService`'s `getRouteById` read path | ✓ PASS |
| SSE path structurally unchanged across all of phase 7 | `git diff --stat 91ef05f^ HEAD -- PredictionStreamService.ts PredictionStreamController.ts` | empty | ✓ PASS |
| Non-regression files untouched across all of phase 7 | `git diff --stat 91ef05f^ HEAD -- BusDataRepository.ts BusDataRepository.test.ts StopController.ts BusRouteController.ts StopService.ts BusRouteService.ts requireDeviceId.ts` | empty | ✓ PASS |
| Lint failures are pre-existing, not phase-7 regressions | checked out repo at `91ef05f^` (pre-phase-7 commit) and ran `bun run lint` | same category of errors (filename-convention warnings) present before phase 7's commits | ✓ PASS (pre-existing, matches SUMMARY's own claim) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| RECENT-01 | 07-01 | Auto-log recent route on explicit `route` param | ✓ SATISFIED | Truth #1 above, fixed post-review (CR-01) |
| RECENT-02 | 07-01 | Auto-log recent stop on every prediction lookup | ✓ SATISFIED | Truth #2 above |
| RECENT-03 | 07-01 | Bump-to-top dedup (UPSERT) | ✓ SATISFIED | Truth #3 above |
| RECENT-04 | 07-01 | Cap at 5 combined, oldest evicted first | ✓ SATISFIED | Truth #4 above |
| RECENT-05 | 07-01 | Combined, type-tagged, hydrated recents list | ✓ SATISFIED | Truths #5, #6 above |
| RECENT-06 | 07-01 | SSE stream never logs a recent | ✓ SATISFIED | Truth #7 above |

No orphaned requirements — REQUIREMENTS.md's traceability table maps exactly RECENT-01 through RECENT-06 to Phase 7, and all six appear in the plan's `requirements` frontmatter.

### Anti-Patterns Found

None. Scanned all 10 files modified/created in this phase (`Prediction.ts`, `PersistedEntity.ts`, `PredictionService.ts`, `PredictionController.ts`, `predictionRoutes.ts`, `FavoritesRecentsRepository.ts`, `RecentsService.ts`, `RecentsController.ts`, `recentRoutes.ts`, `routes/index.ts`) for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER`/stub patterns — zero matches.

The code review (07-REVIEW.md) found one BLOCKER (CR-01) and three non-blocking warnings (WR-01 through WR-03) plus three info-level notes (IN-01 through IN-03). CR-01 is confirmed fixed in the current codebase (see Context section above). WR-02 (unsafe cast in `RecentsController.resolveDeviceId`, relies on route-mount-order for safety), WR-03 (dead `NotFoundError` branch), IN-01 (duplicated header-parsing logic), and IN-02/IN-03 (magic number, duplicated `resolveEntity`) remain open as non-blocking robustness/duplication notes — none of them affect goal achievement or observable behavior; they are legitimate future cleanup candidates, not gaps against RECENT-01 through RECENT-06.

### Human Verification Required

None. All must-haves are verifiable via automated tests (many exercised against a real SQLite instance, not just mocks) and static wiring checks; no visual, real-time-feel, or external-service-dependent behavior in this phase's scope.

### Gaps Summary

None. All 11 must-have truths verified, all 6 requirement IDs satisfied, all key links wired, the previously-found CR-01 blocker is confirmed fixed in the working tree (not merely claimed in SUMMARY.md), the full test suite passes (313/313), and the build compiles cleanly. Lint failures present in the repo are pre-existing (confirmed by checking out the pre-phase-7 commit and re-running lint) and unrelated to this phase's files.

---

_Verified: 2026-09-01T14:07:39Z_
_Verifier: Claude (gsd-verifier)_
