---
phase: 03-stop-discovery
plan: 02
subsystem: stop-discovery-api
tags: [express, rest-api, stop-discovery, haversine, geo]

requires:
  - phase: 03-stop-discovery (plan 01)
    provides: "StopService/StopController pair, StopDiscovery.ts models, factory-DI wiring"
provides:
  - "GET /api/v1/stops/nearby endpoint (STOP-02)"
  - "haversineDistanceMiles pure distance utility (src/server/api/services/distance.ts)"
  - "NearbySearchOptions/NearbyStop response types"
  - "StopService.getNearbyStops / StopController.getNearbyStops"
affects: []

actuals:
  tokens: 8434
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Pure-function geo utility module (distance.ts) with no external geo library, per CONTEXT.md D-08 discretion"
    - "Options-object service signature (getNearbyStops(lat, lng, options?)) mirroring PredictionService's options pattern"
    - "Local parseXParam helpers (parseCoordinateParam/parsePositiveFloatParam/parseCountParam) extending PredictionController's parseNumberParam convention"

key-files:
  created:
    - src/server/api/services/distance.ts
    - src/server/api/services/distance.test.ts
    - src/server/api/routes/stopRoutes.ts
    - src/server/api/routes/stopRoutes.test.ts
  modified:
    - src/server/api/models/StopDiscovery.ts
    - src/server/api/services/StopService.ts
    - src/server/api/services/StopService.test.ts
    - src/server/api/controllers/StopController.ts
    - src/server/api/controllers/StopController.test.ts
    - src/server/api/routes/index.ts

key-decisions:
  - "Followed CONTEXT.md D-05/D-06/D-07: radius in miles, default 0.5mi/10 results, hard cap 50 regardless of requested count"
  - "Followed CONTEXT.md D-08: haversine implemented as a new, dependency-free src/server/api/services/distance.ts module (no geo library added), consistent with the pattern map's 'no analog found' note"
  - "Rounding contract: haversineDistanceMiles rounds to 2 decimal places internally, so the same rounded value is used for both the response distance field and the radius-filter/sort comparisons — no float-mismatch between what's filtered and what's displayed"

requirements-completed: [STOP-02]

coverage:
  - id: D1
    description: "GET /api/v1/stops/nearby returns 200 with distance-sorted, radius-and-count-bounded stops for a given lat/lng, defaulting to 0.5mi/10 results and hard-capped at 50"
    requirement: STOP-02
    verification:
      - kind: unit
        ref: "src/server/api/services/StopService.test.ts#getNearbyStops (20 tests: defaults, sorting, radius exclusion, cap boundaries, empty results, rounding)"
        status: pass
      - kind: integration
        ref: "src/server/api/routes/stopRoutes.test.ts#GET /api/v1/stops/nearby (6 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Invalid/missing lat, lng, radius, or count query params return typed 400 responses naming the offending parameter"
    requirement: STOP-02
    verification:
      - kind: unit
        ref: "src/server/api/controllers/StopController.test.ts#getNearbyStops (19 tests, 11 invalid-parameter cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "haversineDistanceMiles pure function computes correct, symmetric, 2-decimal-rounded great-circle distance"
    verification:
      - kind: unit
        ref: "src/server/api/services/distance.test.ts (4 tests)"
        status: pass
    human_judgment: false

duration: ~20min
completed: 2026-08-26
status: complete
---

# Phase 3 Plan 02: Nearby-Stops Endpoint Summary

Added a haversine-based `GET /api/v1/stops/nearby?lat=&lng=&radius=&count=` endpoint on top of the `StopService`/`StopController` pair from Plan 03-01, returning stops sorted by ascending distance (miles), defaulting to a 0.5-mile radius and 10 results, hard-capped at 50 regardless of the requested count, with typed 400s for invalid/missing/out-of-range coordinate, radius, or count input.

## Performance

- **Duration:** ~20 min
- **Tasks:** 2
- **Files modified:** 10 (4 created, 6 modified)

## Accomplishments
- `haversineDistanceMiles` — new dependency-free geo utility (`src/server/api/services/distance.ts`) computing great-circle distance in miles, rounded to exactly 2 decimal places, with a symmetric/identical-points-return-zero contract
- `StopService.getNearbyStops(lat, lng, options?)` — maps `repository.getAllStops()` into distance-annotated `NearbyStop` objects, filters by radius (default 0.5mi), sorts ascending, and hard-caps at 50 results (D-07) regardless of requested count
- `StopController.getNearbyStops` — validates `lat` ([-90,90]), `lng` ([-180,180]), optional `radius` (positive float), optional `count` (positive integer) via new local parsing helpers mirroring `PredictionController.parseNumberParam`; returns `{ error: "Bad Request", details: "<param>..." }` 400s naming the offending parameter
- New top-level `stopRoutes.ts` router (`GET /nearby`) mounted at `/stops` in `routes/index.ts`, replacing the pre-existing placeholder comment
- Full test coverage: 4 distance tests, 20 `StopService.getNearbyStops` tests (defaults, sorting, radius exclusion, at-cap/over-cap boundaries, default-count, default-radius boundary, empty results, rounding contract), 19 `StopController.getNearbyStops` tests (11 invalid-parameter cases + success/passthrough), 6 `stopRoutes` integration tests including the count-over-cap-still-200 case

## Task Commits

Each task was committed atomically:

1. **Task 1: Nearby-stops endpoint — haversine distance, query validation, and route wiring** - `3856acb` (feat)
2. **Task 2: Harden STOP-02 boundary/precision cases** - `b2dfc66` (test)

**Plan metadata:** commit follows this SUMMARY

## Files Created/Modified
- `src/server/api/services/distance.ts` - `haversineDistanceMiles(a, b)` pure function + `GeoPoint` type
- `src/server/api/services/distance.test.ts` - 4 tests (identity, known-distance, precision, symmetry)
- `src/server/api/models/StopDiscovery.ts` - added `NearbySearchOptions`, `NearbyStop` types alongside `RouteDirectionStops`
- `src/server/api/services/StopService.ts` - added `getNearbyStops` with `DEFAULT_RADIUS_MILES`/`DEFAULT_COUNT`/`MAX_COUNT` constants
- `src/server/api/services/StopService.test.ts` - 20 new tests in a `getNearbyStops` describe block
- `src/server/api/controllers/StopController.ts` - added `getNearbyStops` handler + `parseCoordinateParam`/`parsePositiveFloatParam`/`parseCountParam` helpers
- `src/server/api/controllers/StopController.test.ts` - 19 new tests in a `getNearbyStops` describe block
- `src/server/api/routes/stopRoutes.ts` - new top-level router, `GET /nearby`
- `src/server/api/routes/stopRoutes.test.ts` - 6 supertest integration tests
- `src/server/api/routes/index.ts` - mounted `stopRoutes` at `/stops`, replacing the placeholder comment

## Decisions Made
- Rounding is applied once, inside `haversineDistanceMiles`, so the same 2-decimal value is used for both the response `distance` field and the internal radius-filter/sort comparisons — avoids any float-precision mismatch between what's filtered/sorted and what's displayed (Claude's discretion per CONTEXT.md).
- `getNearbyStops`'s options parameter passes `radius: undefined, count: undefined` through to the service when the query omits them, matching the existing `PredictionController` convention of letting the service own default resolution rather than the controller.

## Deviations from Plan

### Auto-fixed Issues

**1. [Setup — not a Rule 1-4 code deviation] Worktree branch was missing all of Plan 03-01's work**
- **Found during:** Initial file discovery — `03-02-PLAN.md`, `StopService.ts`, `StopController.ts` etc. did not exist in the worktree
- **Issue:** This worktree's branch (`worktree-agent-a42767898a4dac263`) was created from an old point on `main` (commit `c2b7eaf`, the v0.1 retrospective), before Phase 3 planning (Plan 03-01's merge at `dfdf5c0`) landed on `main`
- **Fix:** Ran `git merge main --ff-only` — a pure fast-forward with zero divergence, bringing in all Plan 03-01 source files, `.planning/` docs, and `03-PATTERNS.md`
- **Files affected:** All of `.planning/` phase 3 docs, `StopService.ts`, `StopController.ts`, `StopDiscovery.ts`, `busRoutes.ts` (Plan 03-01 outputs), no working-tree changes needed
- **Commit:** fast-forward, no new commit hash (HEAD moved from `c2b7eaf` to `dfdf5c0`)

**2. [Rule — formatting/import-order, auto-fixed by tooling] Biome format/organizeImports errors on first `bun run lint`**
- **Found during:** Task 1, after writing `distance.ts` and extending `StopService.test.ts`
- **Issue:** `distance.ts`'s multi-line `const haversine = ...` expression exceeded Biome's single-line preference (fit within 120 chars once joined), and the new `haversineDistanceMiles` import in `StopService.test.ts` was not alphabetically ordered relative to the existing `createStopService` import
- **Fix:** Ran `biome check --write` (safe auto-fix) on both files
- **Files modified:** `src/server/api/services/distance.ts`, `src/server/api/services/StopService.test.ts`
- **Verification:** `bun run lint` returned to 0 errors / 17 warnings (same pre-existing warning count documented in PROJECT.md and the 03-01 Summary)
- **Committed in:** `3856acb` (Task 1 commit)

**3. [Not a defect — coverage overlap noted] Task 2's controller/route-level requirements were already satisfied by Task 1's tests**
- **Found during:** Task 2 planning read-through
- **Issue:** Task 2 asked for explicit `StopController.test.ts` invalid-parameter cases (`radius: "-1"`, `radius: "0"`, `count: "0"`, `count: "-5"`, `count: "abc"`, `lat: "95"`, `lat: "abc"`, `lng: "-200"`) and a `stopRoutes.test.ts` `count=51 → 200` integration case. Task 1 already wrote comprehensive tests covering every one of these cases (11 invalid-parameter tests in `StopController.test.ts`, plus the `count=51` case in `stopRoutes.test.ts`) as part of writing the initial implementation's test suite.
- **Fix:** No production-code fix needed — this is not a Rule 1-4 deviation. Task 2 added only the missing `StopService.test.ts` boundary/precision cases (at-cap, over-cap, default-count, default-radius boundary, rounding contract as a dedicated test) that Task 1 had not yet covered explicitly; no duplicate tests were added to `StopController.test.ts` or `stopRoutes.test.ts`.
- **Files affected:** `src/server/api/services/StopService.test.ts` only
- **Committed in:** `b2dfc66` (Task 2 commit)

---

**Total deviations:** 1 setup recovery (worktree fast-forward), 1 tooling auto-fix (Biome format/import-order), 1 scope-overlap note (no code change)
**Impact on plan:** No scope creep. All deviations are setup/tooling/documentation in nature; the plan's implementation and test requirements were fully met.

## Auth Gates

None encountered.

## Verification

- `bun run test -- src/server/api/services/distance.test.ts src/server/api/services/StopService.test.ts src/server/api/controllers/StopController.test.ts src/server/api/routes/stopRoutes.test.ts src/server/api/routes/busRoutes.test.ts` — 62/62 passed (regression-proof: Plan 03-01's `busRoutes.test.ts` unaffected)
- `bun run test` (full suite) — 195/195 passed, 15 test files, no regressions
- `bun run test:coverage` — `StopService.ts` 100%, `distance.ts` 100%, `StopController.ts` 97.59% stmts / 95.55% branch — all above the 80% threshold
- `bun run lint` — 0 errors, 17 warnings (identical pre-existing warning count to Plan 03-01, no new findings)
- `bun run build` — `tsc` compiles cleanly to `dist/`
- `grep -c "haversineDistanceMiles" src/server/api/services/StopService.ts` → `2` (import + call site)
- `grep -n "MAX_COUNT" src/server/api/services/StopService.ts` → present, value `50`

## Known Stubs

None — this plan implements a complete, working endpoint with no placeholder data paths.

## Next Phase Readiness

- STOP-01 and STOP-02 are both implemented, tested, and reachable through the running Express app — Phase 3 (Stop Discovery) is complete.
- Phase 4 (Live Predictions via SSE) can now build on the same `BusDataRepository`/stop-lookup foundation; no blockers identified.

## Self-Check: PASSED

- FOUND: src/server/api/services/distance.ts
- FOUND: src/server/api/services/distance.test.ts
- FOUND: src/server/api/routes/stopRoutes.ts
- FOUND: src/server/api/routes/stopRoutes.test.ts
- FOUND: commit 3856acb (feat(03-02): nearby-stops endpoint — haversine distance, query validation, route wiring)
- FOUND: commit b2dfc66 (test(03-02): harden STOP-02 boundary/precision cases for getNearbyStops)

---
*Phase: 03-stop-discovery*
*Completed: 2026-08-26*
