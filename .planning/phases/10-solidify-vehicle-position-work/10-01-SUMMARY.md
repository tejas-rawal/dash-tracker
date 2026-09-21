---
phase: 10-solidify-vehicle-position-work
plan: 01
subsystem: api
tags: [express, vitest, typescript, dash-api, vehicle-positions]

# Dependency graph
requires:
  - phase: quick-260915-fc8
    provides: GET /api/v1/vehicles endpoint (VehicleService/VehicleController/vehicleRoutes) built without a verified live payload
provides:
  - DashVehicle/VehiclePosition types matching DASH's real nested loc shape, confirmed against a live SFMTA payload
  - VehicleService factory-DI'd on BusDataRepository, with route-short-name validation (404 on unknown route)
  - Coordinate-drop safety net for malformed per-vehicle lat/lon
affects: [vehicle-positions, dash-integration, api-contract]

# Actuals (#2632)
actuals:
  tokens: 4871
  tasks: 2
  commits: 4

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Coupled type+service TDD refactor: RED-phase test fixtures reference not-yet-existing model fields; vitest's --typecheck flag only checks *-d.ts files by default, so .test.ts fixtures transpile and run without blocking on type errors during RED"

key-files:
  created: []
  modified:
    - src/server/api/models/Vehicle.ts
    - src/server/api/services/VehicleService.ts
    - src/server/api/routes/vehicleRoutes.ts
    - src/server/api/services/VehicleService.test.ts
    - src/server/api/controllers/VehicleController.test.ts
    - .gitignore

key-decisions:
  - "D-08: DashVehicle/VehiclePosition mirror DASH's real nested loc: {lat,lon,heading,speed,time} shape instead of the previously-assumed flat fields"
  - "D-09: tripId removed entirely from both DashVehicle and VehiclePosition — never appears in the non-verbose payload"
  - "D-10: vehicleType added to both types, sourced from DASH's per-vehicle field"
  - "D-04: createVehicleService now takes BusDataRepository via factory DI; getVehiclePositions validates an explicit route filter via repository.getRouteByShortName before any upstream fetch, throwing NotFoundError (404) for an unmatched short name"
  - "D-05: mapToVehiclePositions drops any vehicle with NaN lat/lon, logs via logger.warn naming the vehicle id, and never fails the whole request for one malformed entry"

patterns-established:
  - "VehicleService now follows the same factory-DI pattern as every other service (createBusRouteService(repository, ...)) — no more zero-dependency outlier"

requirements-completed: [D-04, D-05, D-08, D-09, D-10]

coverage:
  - id: D1
    description: "GET /api/v1/vehicles maps DASH's nested loc.{lat,lon,heading,speed,time} onto flat VehiclePosition fields, converting loc.time (Unix seconds) to an ISO-8601 lastUpdated string"
    requirement: D-08
    verification:
      - kind: unit
        ref: "src/server/api/services/VehicleService.test.ts#VehicleService > getVehiclePositions > maps DashVehicle[] to VehiclePosition[]"
        status: pass
    human_judgment: false
  - id: D2
    description: "tripId is fully removed from DashVehicle and VehiclePosition; vehicleType is added to both, sourced from DASH's per-vehicle field"
    requirement: D-09
    verification:
      - kind: unit
        ref: "src/server/api/services/VehicleService.test.ts#VehicleService > getVehiclePositions > maps DashVehicle[] to VehiclePosition[]"
        status: pass
      - kind: other
        ref: "grep -c tripId src/server/api/models/Vehicle.ts == 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "An unknown route short name causes VehicleService to throw NotFoundError, validated via BusDataRepository.getRouteByShortName before any upstream DASH fetch, and the controller maps it to a 404 JSON body end-to-end"
    requirement: D-04
    verification:
      - kind: unit
        ref: "src/server/api/services/VehicleService.test.ts#VehicleService > route validation > rejects with NotFoundError when the route short name is unknown"
        status: pass
      - kind: unit
        ref: "src/server/api/controllers/VehicleController.test.ts#VehicleController > getVehiclePositions > responds with 404 and a Not Found body when the service throws NotFoundError"
        status: pass
    human_judgment: false
  - id: D4
    description: "Vehicles with NaN lat or lon are dropped from the mapped response (never included, never fail the whole request), each drop logged via logger.warn naming the vehicle's id, valid vehicles in the same response unaffected"
    requirement: D-05
    verification:
      - kind: unit
        ref: "src/server/api/services/VehicleService.test.ts#VehicleService > coordinate filtering > drops only the malformed vehicle among several, preserving order of the rest"
        status: pass
    human_judgment: false
  - id: D5
    description: "Live curl spot-check of GET /api/v1/vehicles against a running server (valid route returns lat/lon/heading/speed/vehicleType/lastUpdated with no tripId; unknown route returns 404)"
    verification: []
    human_judgment: true
    rationale: "No DASH_API_KEY is available in this worktree (required env var, Zod-validated at startup, crash on missing) — same pre-existing environment limitation flagged in STATE.md's Quick 260915-fc8 blocker. A human with real DASH credentials should perform this spot-check before relying on the endpoint in production."

duration: ~15min
completed: 2026-09-21
status: complete
---

# Phase 10 Plan 01: Solidify Vehicle Position Work Summary

**DashVehicle/VehiclePosition now mirror DASH's real nested `loc` payload, `tripId` is gone, `vehicleType` is exposed, an unknown route 404s via repository-backed validation, and malformed per-vehicle coordinates are dropped instead of corrupting the response.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2 (both `tracer`/`auto`, `tdd="true"`)
- **Files modified:** 6 (5 source/test + `.gitignore`)
- **Commits:** 4 (RED/GREEN per task, no REFACTOR needed)

## Accomplishments

- `DashVehicle`/`VehiclePosition` corrected to mirror DASH's actual nested `loc: {lat, lon, heading, speed, time}` shape, verified against the live SFMTA payload captured in `10-CONTEXT.md` (D-08)
- `tripId` removed entirely from both types — confirmed it never appears in the non-verbose payload (D-09)
- `vehicleType` added to both types, sourced from DASH's real per-vehicle field (D-10)
- `VehicleService` now takes `BusDataRepository` via factory DI (matching every other service in the codebase) and validates an explicit `route` filter against `repository.getRouteByShortName` before any upstream fetch, throwing `NotFoundError` (404) for an unmatched short name (D-04)
- `mapToVehiclePositions` drops any vehicle with NaN `lat`/`lon`, logs via `logger.warn` naming the vehicle's id, and never fails the whole request for one malformed entry — valid vehicles in the same response are unaffected (D-05)
- All six no-op decisions (D-01, D-02, D-03, D-06, D-07, D-11) honored — no code touched caching/SSE, GTFS-RT protobuf, multi-route filtering, staleness thresholds, Zod validation, or `verbose=true` fields

## Task Commits

Each task followed the full RED-GREEN cycle (no REFACTOR commit — implementations were minimal and needed no cleanup):

1. **Task 1: End-to-end vehicle-position correctness (loc-flattening, vehicleType, tripId removal, route-validation 404s)**
   - `test(10-01)`: `2f9c735` — RED: 4 targeted assertion failures against current production code
   - `feat(10-01)`: `b393957` — GREEN: all 18 targeted tests pass
2. **Task 2: Drop vehicles with malformed coordinates**
   - `test(10-01)`: `634e337` — RED: 3 targeted assertion failures against current production code
   - `feat(10-01)`: `0b4353b` — GREEN: all 15 VehicleService tests pass

**Plan metadata:** SUMMARY commit (this file), pending

_Both tasks were coupled type+service+test changes (`tdd="true"`), so each RED phase updated test fixtures to the target shape before touching any production code, then GREEN implemented the model/service changes to match._

## Files Created/Modified

- `src/server/api/models/Vehicle.ts` — `DashVehicle`/`VehiclePosition` restructured: nested `loc` object, `vehicleType` added, `tripId` removed, `lastUpdated` retyped `number` → `string` (ISO-8601)
- `src/server/api/services/VehicleService.ts` — `createVehicleService(repository: BusDataRepository)`; `mapToVehiclePositions` reads `loc.*`, converts `loc.time` → ISO `lastUpdated`, filters NaN coordinates; `getVehiclePositions` validates `route` via the repository before any upstream fetch
- `src/server/api/routes/vehicleRoutes.ts` — wires `BusDataRepository.getInstance()` into `createVehicleService`
- `src/server/api/services/VehicleService.test.ts` — `makeMockRepo` helper, DI'd call sites, loc-nested `makeDashVehicle` fixture (verified SFMTA payload values), new `route validation` and `coordinate filtering` describe blocks (7 new tests total)
- `src/server/api/controllers/VehicleController.test.ts` — new 404/`NotFoundError` end-to-end mapping test (no production change needed — existing `resolveErrorStatus`/`resolveErrorBody` already handled it)
- `.gitignore` — added `bun.lockb` (legacy binary lockfile bun 1.0.31 writes alongside the tracked text `bun.lock`; unrelated generated artifact from the environment-setup `bun install`, not part of this plan's scope)

## Decisions Made

None beyond the plan's own locked decisions (D-04, D-05, D-08, D-09, D-10) — implemented exactly as specified in `10-CONTEXT.md`. No new architectural decisions required during execution.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed dependencies before tests could run**
- **Found during:** Environment setup, before Task 1
- **Issue:** `node_modules/` did not exist in this fresh worktree; `bun run test` would fail immediately
- **Fix:** Ran `bun install`, then `bun pm trust @biomejs/biome` to unblock its postinstall (an already-declared, already-approved devDependency's own native-binary fetch — not a new/unvetted package)
- **Files modified:** none committed (see note below — `bun install`'s package.json reformatting was reverted, not kept)
- **Verification:** `bun run test` runs successfully afterward
- **Committed in:** not committed — `bun install`/`bun pm trust` are local environment setup, not plan-scoped source changes

**2. [Rule 1 - Bug] Reverted unwanted package.json reformatting from `bun install`**
- **Found during:** Pre-commit review after environment setup
- **Issue:** `bun install` (bun 1.0.31) rewrote `package.json` from 4-space to 2-space indentation and auto-added a `trustedDependencies` field — violates the project's Biome-enforced 4-space convention and is out of this plan's scope
- **Fix:** `git checkout -- package.json` to discard the reformatting; the already-completed postinstall for the current `node_modules/` was unaffected
- **Files modified:** `package.json` (reverted, net no change committed)
- **Committed in:** N/A (reverted before staging)

**3. [Rule 3 - Blocking] Added `bun.lockb` to `.gitignore`**
- **Found during:** Pre-commit review after environment setup
- **Issue:** `bun install` created an untracked `bun.lockb` (legacy binary lockfile format) alongside the already-tracked text `bun.lock` and `package-lock.json` — a generated artifact of this bun version, not part of the project's lockfile strategy
- **Fix:** Added `bun.lockb` to `.gitignore` rather than committing it
- **Files modified:** `.gitignore`
- **Committed in:** `2f9c735` (Task 1 RED commit)

**4. [Rule 1 - Bug] Fixed a test-isolation bug in my own RED-phase test**
- **Found during:** Task 1 GREEN verification
- **Issue:** The "rejects with NotFoundError when the route short name is unknown" test asserted `expect(mockAxiosGet).not.toHaveBeenCalled()`, but the shared `mockAxiosGet` spy carries call history from earlier tests in the same file (no `beforeEach` reset exists anywhere in this test file — a pre-existing pattern, not something I introduced)
- **Fix:** Added `mockAxiosGet.mockClear()` to that test's Arrange step
- **Files modified:** `src/server/api/services/VehicleService.test.ts`
- **Verification:** Test passes correctly afterward, confirming axios.get is never called during route-validation short-circuit
- **Committed in:** `b393957` (Task 1 GREEN commit)

---

**Total deviations:** 4 (2 environment-setup housekeeping, 1 auto-fixed reformatting revert, 1 test-isolation bug fix). No production-code deviations from the plan's specified behavior — `Vehicle.ts`, `VehicleService.ts`, and `vehicleRoutes.ts` were implemented exactly as the plan's `<action>` blocks specified.
**Impact on plan:** None of the four affect the plan's delivered behavior. All are either local environment setup or my own RED-phase test-authoring correction.

## Issues Encountered

- **`gsd_run check tdd-red-evidence` is not vitest-compatible in this project.** The tool parses Node's built-in `--test` TAP summary format (`# tests N` / `# pass N` / `# fail N` trailer lines via `parseNodeTestSummary`). Vitest's `--reporter tap` output uses nested TAP subtests (`describe`/`it` hierarchy) with no such trailer line — confirmed via a manual probe run before RED. Running the check against vitest's TAP output would always classify as `zero_tests_discovered` (INVALID_RED) regardless of actual test outcome, since `parseNodeTestSummary` never matches a `# tests` line in vitest's format. I did not run the automated check for either RED phase; instead I performed the equivalent manual verification the check exists to enforce — for each RED run, confirmed (a) nonzero exit, (b) the specific named target test(s) failed on a genuine assertion (visible in `toMatchObject`/`toThrow` diffs, not a crash/import/type error), and (c) no unrelated tests failed. Both RED phases met this bar (see the `test(10-01)` commit messages for the specific failure counts and reasons). This is a project-level tooling gap (vitest vs. Node-test-runner TAP format), not a regression in this plan's work — flagged here for a future fix to `check tdd-red-evidence` or a vitest-emitting adapter.
- **Manual curl spot-check from the plan's `<verification>` block could not be performed.** No `DASH_API_KEY` is available in this worktree (required env var, Zod-validated at startup with a hard crash on missing/invalid — `src/server/config/environment.ts`), and no `.env` file exists here (only `.env.example`). This is the same pre-existing environment limitation already flagged in `STATE.md`'s Quick 260915-fc8 blocker entry, not a new gap introduced by this plan. All other `<verification>` items (both targeted test files, full suite, `bun run build`) ran and passed. See coverage deliverable D5 above — flagged for human verification with real credentials.

## TDD Gate Compliance

Both tasks followed the full RED → GREEN cycle with correctly-scoped commits:

| Task | RED | GREEN | REFACTOR | Status |
|------|-----|-------|----------|--------|
| Task 1 (tracer) | `2f9c735` | `b393957` | — (not needed) | Pass |
| Task 2 (auto) | `634e337` | `0b4353b` | — (not needed) | Pass |

RED evidence for both phases was verified manually (target test genuinely failed on an assertion, no crashes, no unrelated failures) rather than via `gsd_run check tdd-red-evidence`, due to the vitest/Node-test-runner TAP-format incompatibility documented above under Issues Encountered.

**Tracer feedback gate (Task 1, #3299):** `workflow.human_verify_mode` is `end-of-phase` (default), auto-mode was not active (`workflow.auto_advance: false`, `_auto_chain_active: false`), and Task 1's `<verify>` contains only `<automated>` — so per precedence row 3, the tracer's verify command was re-run end-to-end after GREEN (`bun run test -- VehicleService.test.ts VehicleController.test.ts`, 18/18 pass) and execution continued directly to Task 2 with no checkpoint.

## User Setup Required

None — no external service configuration required. (A human with real DASH API credentials should perform the live curl spot-check described in coverage deliverable D5 before relying on `GET /api/v1/vehicles` in production, but this requires no new setup beyond credentials the project already expects.)

## Next Phase Readiness

- `GET /api/v1/vehicles` is now field-verified against a real DASH payload, route-validated, and coordinate-safe — the "unverified against a live payload" risk flagged in `STATE.md`'s Quick 260915-fc8 blocker is resolved for the field-shape and validation concerns this plan addressed (D-04, D-05, D-08, D-09, D-10)
- The remaining part of that blocker entry — actually exercising the endpoint against a live DASH API key — is still open; recommend closing it via the D5 coverage item above (human spot-check with real credentials) before the next milestone treats vehicle positions as production-verified end-to-end
- `verbose=true` fields (D-11) remain deliberately deferred to a future phase, as does GTFS-RT protobuf (D-01), SSE/streaming (D-02), multi-route filtering (D-03), staleness thresholds (D-06), and Zod validation (D-07) — none of these were touched, matching the plan's no-op decisions
- No blockers for phase completion; this was the only plan in Phase 10 Wave 1

---
*Phase: 10-solidify-vehicle-position-work*
*Completed: 2026-09-21*
