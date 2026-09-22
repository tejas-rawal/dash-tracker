---
phase: 10-solidify-vehicle-position-work
verified: 2026-09-21T16:52:00Z
status: passed
score: 9/9 must-haves verified
covered_files:

  - .gitignore
  - .planning/phases/10-solidify-vehicle-position-work/10-01-PLAN.md
  - .planning/phases/10-solidify-vehicle-position-work/10-01-SUMMARY.md
  - .planning/phases/10-solidify-vehicle-position-work/10-CONTEXT.md
  - .planning/phases/10-solidify-vehicle-position-work/10-DISCUSSION-LOG.md
  - .planning/phases/10-solidify-vehicle-position-work/10-PATTERNS.md
  - .planning/phases/10-solidify-vehicle-position-work/10-REVIEW-FIX.md
  - .planning/phases/10-solidify-vehicle-position-work/10-REVIEW.md
  - src/server/api/controllers/VehicleController.test.ts
  - src/server/api/models/Vehicle.ts
  - src/server/api/routes/vehicleRoutes.ts
  - src/server/api/services/VehicleService.test.ts
  - src/server/api/services/VehicleService.ts

covered_digest: "v1:sha256:24fc0849b555017fade0b94ee94276454c3c34a40085057a0ef55af867c66202"
behavior_unverified: 0
overrides_applied: 0
human_verification:

  - test: "curl -s \"http://localhost:<PORT>/api/v1/vehicles?route=<known-short-name>\" against a running server with a real DASH_API_KEY; then curl the same endpoint with an unknown route short name."
    expected: "Valid route returns 200 with vehicle objects containing lat/lon/heading/speed/vehicleType/lastUpdated (ISO-8601) and no tripId key, matching the verified SFMTA payload shape in 10-CONTEXT.md. Unknown route returns 404 with { error: \"Not Found\", details: \"Route not found: <value>\" }."
    why_human: "No DASH_API_KEY is available in this worktree (required env var, Zod-validated at startup, hard crash on missing — src/server/config/environment.ts:13). Only .env.example exists, no .env. This is the same pre-existing environment limitation flagged in STATE.md's Quick 260915-fc8 blocker and explicitly carried forward as coverage item D5 in 10-01-SUMMARY.md. The verifier cannot start the server or reach the real DASH upstream to close this out programmatically."
---

# Phase 10: Solidify vehicle position work Verification Report

**Phase Goal:** Take the `GET /api/v1/vehicles` vertical slice from quick-task to production-solid: verified DASH field mapping, repository-backed route-filter validation, and safe handling of malformed per-vehicle data.
**Verified:** 2026-09-21T16:52:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `GET /api/v1/vehicles` returns lat/lon/heading/speed sourced from DASH's nested `loc` object, never a top-level field (D-08) | ✓ VERIFIED | `VehicleService.ts:52-64` `mapToVehiclePositions` reads `vehicle.loc.lat/lon/heading/speed`; `DashVehicle.loc` nested type in `Vehicle.ts:7-13`; test "maps DashVehicle[] to VehiclePosition[]" passes (24/24 targeted suite green). |
| 2 | `GET /api/v1/vehicles?route=<valid>` still filters to that route — unchanged happy path (D-03 no-op) | ✓ VERIFIED | Test "forwards the route param when provided" (`VehicleService.test.ts:72-85`) passes; `buildDashApiUrl` unchanged. |
| 3 | `GET /api/v1/vehicles?route=<unknown>` returns 404 via `NotFoundError`, validated against `BusDataRepository` (D-04) | ✓ VERIFIED | `VehicleService.ts:67-73` calls `repository.getRouteByShortName` before any fetch, throws `NotFoundError`; `vehicleRoutes.ts:6` wires `BusDataRepository.getInstance()`; controller test "responds with 404 and a Not Found body when the service throws NotFoundError" passes end-to-end. |
| 4 | Vehicles with missing/NaN lat or lon are excluded and logged via `logger.warn`, without failing the rest of the request (D-05) | ✓ VERIFIED | `VehicleService.ts:36-51` `isValidCoordinate` uses `typeof value === "number" && Number.isFinite(value)` — rejects `undefined`, `null`, strings, `NaN`, `±Infinity` (post-CR-01 fix, confirmed by direct code read, not just the review's claim). 4 pre-fix + 2 new tests (missing lat, null lon) all pass; "drops only the malformed vehicle among several" proves partial-failure isolation. |
| 5 | `DashVehicle`/`VehiclePosition` no longer expose `tripId` anywhere (D-09) | ✓ VERIFIED | `grep -rn "tripId" src/server/api/` shows zero matches in `Vehicle.ts`, `VehicleService.ts`, or route/controller files (remaining `tripId` hits are in the unrelated `Prediction.ts`/`PredictionService.ts` domain). |
| 6 | `VehiclePosition` exposes `vehicleType` sourced from DASH's per-vehicle field (D-10) | ✓ VERIFIED | `Vehicle.ts:14,36`, `VehicleService.ts:62` — `vehicleType: vehicle.vehicleType`; asserted in test `toMatchObject({..., vehicleType: "0"})`. |
| 7 | `VehiclePosition.lastUpdated` is an ISO-8601 string converted from `loc.time` (Unix seconds), matching `generatedAt`'s convention (D-08) | ✓ VERIFIED | `VehicleService.ts:63` `new Date(vehicle.loc.time * 1000).toISOString()`; test asserts exact value `new Date(1534287835 * 1000).toISOString()`. |
| 8 | `createVehicleService` takes `BusDataRepository` via factory-function DI; `VehicleService` never imports the repository singleton directly (D-04) | ✓ VERIFIED | `VehicleService.ts:16` `export function createVehicleService(repository: BusDataRepository)`; only `import type { BusDataRepository }` (type-only, no singleton import); `vehicleRoutes.ts:6` is the sole production construction site, passing `BusDataRepository.getInstance()`. |
| 9 | A malformed `loc.time` or missing `loc` object drops just that vehicle instead of crashing the whole request (CR-02 fix) | ✓ VERIFIED (directly observed) | `VehicleService.ts:44-46` filter also calls `isValidCoordinate(vehicle.loc?.time)`, and optional chaining (`vehicle.loc?.lat` etc.) guards a missing `loc` entirely — the `.map()` step (where `new Date(vehicle.loc.time * 1000).toISOString()` would throw on `NaN`) is unreachable for any vehicle that fails the filter. No committed test exercises this exact path (see Gaps below), so I wrote and ran a throwaway spot-check (3 cases: non-numeric `loc.time`, `loc` entirely missing, mixed good+bad batch) directly against the current code — all 3 passed, confirming no crash and correct partial-response behavior. Temp file was deleted after the run (not committed, `git status` confirmed clean). |

**Score:** 9/9 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/server/api/models/Vehicle.ts` | `DashVehicle`/`VehiclePosition` corrected shapes | ✓ VERIFIED | Nested `loc`, `vehicleType` added, `tripId` removed, `lastUpdated: string`. |
| `src/server/api/services/VehicleService.ts` | DI'd, loc-flattening, coordinate-safe mapping | ✓ VERIFIED | All behavior confirmed above; substantive (not a stub), fully wired. |
| `src/server/api/routes/vehicleRoutes.ts` | Wires `BusDataRepository.getInstance()` into `createVehicleService` | ✓ VERIFIED | Line 6, matches `busRoutes.ts`'s DI convention. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `vehicleRoutes.ts` | `createVehicleService` | `BusDataRepository.getInstance()` passed as sole constructor arg | ✓ WIRED | Confirmed by direct read; mirrors `busRoutes.ts`. |
| `VehicleService.getVehiclePositions` | `repository.getRouteByShortName` | Called before any DASH fetch when `options.route` is set | ✓ WIRED | `VehicleService.ts:68-72`; test confirms `axios.get` is never called on an unknown route. |
| `VehicleController` | `NotFoundError` → 404 | `resolveErrorStatus`/`resolveErrorBody` (pre-existing, unchanged) | ✓ WIRED | Controller test confirms 404 + `{ error: "Not Found", details: "Route not found: UNKNOWN" }`. |
| `src/server/api/routes/index.ts` | `vehicleRoutes` | `router.use("/vehicles", vehicleRoutes)` | ✓ WIRED | Confirms `GET /api/v1/vehicles` is actually mounted, not orphaned. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Targeted suite (VehicleService + VehicleController) | `bun run test -- src/server/api/services/VehicleService.test.ts src/server/api/controllers/VehicleController.test.ts` | 24/24 tests pass, no type errors | ✓ PASS |
| Full test suite (regression check) | `bun run test` | 31 files / 403 tests pass, no type errors | ✓ PASS |
| TypeScript build | `bun run build` | Exits 0, no compile errors | ✓ PASS |
| CR-02 invariant (malformed `loc.time`, missing `loc`, mixed batch) | Ad-hoc verifier-authored Vitest file, run once, deleted | 3/3 pass — no crash, correct partial response | ✓ PASS (see truth #9) |
| Live curl against real DASH API | Not runnable | No `DASH_API_KEY` in this worktree (only `.env.example`) | ? SKIP — routed to human verification |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| D-01 | Keep REST endpoint, no GTFS-RT protobuf switch (no-op) | ✓ SATISFIED | `grep -n "gtfs-rt\|protobuf"` → no matches. |
| D-02 | Stay REST-only, no caching/SSE (no-op) | ✓ SATISFIED | No caching/streaming code added. |
| D-03 | Single-route filtering only (no-op) | ✓ SATISFIED | `buildDashApiUrl` still takes one `route` string; no multi-route split logic. |
| D-04 | Repository-backed 404 route validation | ✓ SATISFIED | Truths #3, #8 above. |
| D-05 | Drop missing/NaN lat/lon, log, never fail whole request | ✓ SATISFIED | Truth #4 above (includes CR-01 fix). |
| D-06 | No staleness threshold (no-op) | ✓ SATISFIED | `grep -n "stale\|threshold"` → no matches. |
| D-07 | No Zod/runtime schema validation added (no-op) | ✓ SATISFIED | `grep -n "zod\|Zod"` in Vehicle.ts/VehicleService.ts → no matches. |
| D-08 | `loc`-nested field mapping, ISO `lastUpdated` | ✓ SATISFIED | Truths #1, #7 above. |
| D-09 | `tripId` removed | ✓ SATISFIED | Truth #5 above. |
| D-10 | `vehicleType` added | ✓ SATISFIED | Truth #6 above. |
| D-11 | No `verbose=true` fields added (no-op) | ✓ SATISFIED | `grep -n "verbose\|block\|headway\|nextStop\|previousVehicle\|schAdh\|serviceId\|offRoute"` → no matches. |

All PLAN-frontmatter requirement IDs (D-04, D-05, D-08, D-09, D-10) and all `10-CONTEXT.md` decisions (D-01 through D-11) are accounted for — no orphaned decisions.

### Code Review Fix Verification (CR-01, CR-02, WR-01)

The phase's SUMMARY.md and REVIEW-FIX.md claim two critical bugs were found and fixed after initial plan execution. I independently re-verified each against the current codebase state, not the reports' claims:

- **CR-01** (coordinate filter only caught literal `NaN`, not missing/null): confirmed fixed — `isValidCoordinate` at `VehicleService.ts:36-38` uses `typeof value === "number" && Number.isFinite(value)`, which correctly rejects `undefined`/`null`/strings, not just `NaN`. Backed by 2 new committed tests (missing lat, null lon), both passing.
- **CR-02** (malformed `loc.time`/missing `loc` crashed the whole request): confirmed fixed by direct code inspection — filter now also validates `vehicle.loc?.time`, and the `.map()` step (where the crash originated) only ever receives vehicles that passed the filter. No committed test covers this exact path (flagged below as a gap in test coverage, not a functional gap); I ran an ad-hoc 3-case spot-check directly against the current code confirming correct behavior (see truth #9).
- **WR-01** (test coverage gap that let CR-01 ship): confirmed fixed — two new test cases (`missing lat`, `null lon`) exist in the committed `VehicleService.test.ts` at lines 257-293.

Git log confirms all three fix commits are present and reachable on this branch: `61ea393` (CR-01), `13e783e` (CR-02), `1c36844` (WR-01), plus `c5f6d2b` (review-fix report doc).

### Anti-Patterns Found

None. Scanned all 6 phase-modified files (`Vehicle.ts`, `VehicleService.ts`, `vehicleRoutes.ts`, `VehicleService.test.ts`, `VehicleController.test.ts`, `VehicleController.ts`) for debt markers (TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER), stub patterns, and hardcoded-empty returns — zero matches.

**Minor gap (info, not blocking):** CR-02's fix (malformed `loc.time`, missing `loc` object) has no committed regression test — `10-REVIEW-FIX.md` itself flags this ("did not add a dedicated test for the `loc.time`/missing-`loc` case... that coverage is not committed"). The production code is correct (verified above, both by inspection and by my own ad-hoc runtime check), but a future refactor of `mapToVehiclePositions` could silently reintroduce this crash with no test to catch it. Recommend adding the 2-3 cases from my spot-check (non-numeric `loc.time`, missing `loc`, mixed batch) to the committed suite in a follow-up.

### Human Verification Required

### 1. Live DASH API spot-check

**Test:** `curl -s "http://localhost:<PORT>/api/v1/vehicles?route=<known-short-name>"` against a running server configured with a real `DASH_API_KEY`; then repeat with an unrecognized route short name.
**Expected:** Valid route returns 200 with vehicle objects containing `lat`/`lon`/`heading`/`speed`/`vehicleType`/`lastUpdated` (ISO-8601) and no `tripId` key — matching the verified SFMTA payload shape captured in `10-CONTEXT.md`. Unknown route returns 404 with `{ error: "Not Found", details: "Route not found: <value>" }`.
**Why human:** No `DASH_API_KEY` exists in this worktree (required env var, Zod-validated at startup, hard crash on missing — `src/server/config/environment.ts:13`); only `.env.example` is present, no `.env`. This is the same pre-existing environment limitation `STATE.md`'s Quick 260915-fc8 blocker entry already flagged, carried forward explicitly as coverage item D5 in `10-01-SUMMARY.md`. All field-shape and validation logic is proven correct against the verified live SFMTA payload sample and unit tests; only an actual live round-trip against the real upstream API remains unexercised.

### Gaps Summary

No gaps block the phase goal. All 8 original must-have truths plus the CR-01/CR-02/WR-01 code-review fixes are verified present, substantive, wired, and functionally correct (confirmed via direct code reading, the full 403-test suite, a clean `tsc` build, and an independent ad-hoc runtime spot-check of the one code path with no committed test). The only open item is the live-credentials curl spot-check against the real DASH upstream, which requires a human with a valid `DASH_API_KEY` — this was already known and flagged by the phase's own SUMMARY.md (coverage item D5) and cannot be closed by any automated verifier in this environment.

---

_Verified: 2026-09-21T16:52:00Z_
_Verifier: Claude (gsd-verifier)_
