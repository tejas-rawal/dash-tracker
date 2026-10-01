---
phase: 13-resilient-route-stop-data-lifecycle
plan: 06
subsystem: api
tags: [repository, validation, dash-api, vitest, gap-closure]

# Dependency graph
requires:
  - phase: 13-03
    provides: "Atomic all-or-nothing load() with applyData as the single commit point, and getLoadState()"
  - phase: 13-05
    provides: "BusDataRefreshService one-warn-per-rejected-attempt contract"
provides:
  - "load() rejects payloads with an absent, null or non-finite stop code/lat/lon, or a route/direction/stop id that is not a non-empty string"
  - "parseDashNumber and requireId, private module-level helpers in BusDataRepository.ts"
  - "Malformed-field matrix, fail-closed, DASH-order, zero-value and tolerance tests"
  - "Real-app E2E step: a malformed refresh keeps /api/v1/routes/all deep-equal to the last good body"
  - "Architecture guidance in .claude/CLAUDE.md and AGENTS.md that describes the Phase 13 lifecycle"
affects: [phase-14-readiness, 13-07]

# Actuals (#2632)
actuals:
  tokens: 7443
  tasks: 3
  commits: 4
plan_head_before: 0f46cd18399708b49ef341f093b0393af3fe89a7

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Upstream payload fields typed as unknown until a validator narrows them (parseDashNumber + Number.isFinite, requireId)"
    - "Ids validated before their children, so a rejection names the first malformed item in DASH order"

key-files:
  created: []
  modified:
    - src/server/api/repositories/BusDataRepository.ts
    - src/server/api/repositories/BusDataRepository.test.ts
    - src/server/api/routes/dataReload.test.ts
    - .claude/CLAUDE.md
    - AGENTS.md

key-decisions:
  - "Hand-rolled finite and id checks rather than a Zod schema for the routes payload, so only the five fields the gap names are validated and no new field can hold every data endpoint at 503"
  - "Whitespace-only ids are rejected but valid ids are stored untrimmed"
  - "makeApiResponse in the repository test accepts unknown[], so malformed payloads need no casts"

patterns-established:
  - "Payload interfaces declare unknown for any field the server must validate, so TypeScript forces it through a check before it reaches a model"

requirements-completed: [DATA-02, DATA-03]

coverage:
  - id: D1
    description: "A refresh with a null stop code and no coordinates is rejected through the real bounded client: /routes/all stays 200 and deep-equal to the good body, /routes/3C is 404, lastLoadedAt does not move, lastError is the exact message, and nothing is logged"
    requirement: DATA-02
    verification:
      - kind: e2e
        ref: "src/server/api/routes/dataReload.test.ts#keeps serving the last good routes through failed reloads and records when data last loaded and why the latest attempt failed"
        status: pass
    human_judgment: false
  - id: D2
    description: "14 malformed-field rows (absent, null, empty, non-finite or boolean code/lat/lon; missing, empty, numeric or whitespace-only ids) each reject with their exact message, record lastFailedAt/lastError and keep the T1 dataset, with no logger call"
    requirement: DATA-03
    verification:
      - kind: unit
        ref: "src/server/api/repositories/BusDataRepository.test.ts#load: absent, null and non-finite fields fail the whole load"
        status: pass
    human_judgment: false
  - id: D3
    description: "Fail-closed structural rows (null route, null stop, non-list directions or stops) and DASH-order reporting (route id, then direction id, then each stop's id, code and coordinates)"
    requirement: DATA-02
    verification:
      - kind: unit
        ref: "src/server/api/repositories/BusDataRepository.test.ts#load: absent, null and non-finite fields fail the whole load"
        status: pass
    human_judgment: false
  - id: D4
    description: "No over-strictness: zero values (numbers or strings), numeric code/lat/lon, and null names, headSigns, stops or directions still load"
    verification:
      - kind: unit
        ref: "src/server/api/repositories/BusDataRepository.test.ts#load: legitimate values and optional fields still load"
        status: pass
    human_judgment: false
  - id: D5
    description: "The CLAUDE.md and AGENTS.md Architecture bullets describe the listen-first boot, the validated atomic load() with BusDataRefreshService, sendErrorResponse with 503 + Retry-After, and the generic 500. The two files match, and the GSD markers are intact"
    verification:
      - kind: other
        ref: "Task 3 verify commands: stale=0, markers=2, ARCH_BULLETS_MATCH count=5"
        status: pass
    human_judgment: false

# Metrics
duration: 5min
completed: 2026-10-01
status: complete
---

# Phase 13 Plan 06: Malformed Upstream Field Validation Summary

**`load()` now rejects any DASH routes payload where a stop's code, lat or lon is absent, null or not finite, or where a route, direction or stop id is not a non-empty string. The last good dataset keeps serving, `lastLoadedAt` stays put, and the failure is recorded in `lastFailedAt` and `lastError`. That closes gap truth 6 (WR-02).**

## Performance

- **Duration:** 5 min
- **Started:** 2026-10-01T18:31:37Z
- **Completed:** 2026-10-01T18:36:29Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- `createStop` now parses code, lat and lon through `parseDashNumber`, which returns NaN for anything that is not a number or a string, and then checks them with `Number.isFinite`. Before this, an absent or null value slipped past the NaN-only checks.
- `requireId` validates the route, direction and stop ids before their children are processed. A missing id can no longer be stored under the map key `"undefined"`, and a rejection names the first malformed item in DASH order.
- The real-app E2E step proves the full rider-visible outcome against the fake DASH. A malformed refresh is rejected, `/api/v1/routes/all` stays deep-equal to the good body, `/routes/3C` is 404, and nothing is logged by the repository.
- The 13-05 loader's one-warn-per-rejected-attempt contract now covers malformed refreshes, because `load()` rejects them. No loader change was needed.
- The Architecture section of `.claude/CLAUDE.md` and of `AGENTS.md` now describes the Phase 13 lifecycle (IN-05).

## Task Commits

1. **Task 1: Finite code/lat/lon validation, proven end-to-end through GET /api/v1/routes/all** - `930c076` (feat)
2. **Task 2: Id validation plus the malformed-field matrix (TDD)**
   - RED: `a324f74` (test)
   - GREEN: `9c63009` (feat)
3. **Task 3: Refresh the Architecture guidance in CLAUDE.md and AGENTS.md** - `9bcb333` (docs)

## Files Created/Modified
- `src/server/api/repositories/BusDataRepository.ts`:
  - Ids and stop number fields are typed `unknown`.
  - Adds `parseDashNumber` and `requireId`.
  - Each id is validated before its children.
  - The builders take a typed object param: `{ id, routeData, directions }`, `{ id, directionData, stops }` and `{ id, stopData }`.
- `src/server/api/repositories/BusDataRepository.test.ts`:
  - Adds the `omitKeys` and `makeApiStopWithout` factories.
  - `makeApiResponse` now accepts `unknown[]`.
  - Adds two describe blocks: 14 matrix rows, 4 fail-closed rows, 3 ordering tests and 6 tolerance/zero tests.
- `src/server/api/routes/dataReload.test.ts`: adds a new step 4 that sends a malformed payload (route-3 / stop-3). The later steps are renumbered to 5 and 6.
- `.claude/CLAUDE.md`, `AGENTS.md`: three Architecture bullets are rewritten, and the two files carry identical bullet text.

## Decisions Made
- I followed the plan's choice of hand-rolled checks over a Zod schema, so only the five fields named in the gap are validated (third prohibition, T-13-22).
- I added a small generic `omitKeys` helper beside `makeApiStopWithout`. It builds a copy without the named keys instead of using `delete`, which Biome's `noDelete` rule flags. The same helper builds the "route with no id" and "direction with no id" rows, so those rows really lack the key.

## Deviations from Plan

None. The plan was executed as written.

Two notes:
- Task 2's RED run had 7 failing tests: the 6 id rows and the direction-before-stops ordering test. The stop-field rows, structural rows and tolerance rows already passed, because Task 1 had already shipped the finite checks and the structural inputs already threw a TypeError. The tolerance rows lock in behavior that already worked.
- No existing test asserted that a now-rejected input loads, so I changed none of them.

## TDD Gate Compliance

- **RED:** `a324f74`, `test(13-06)`. The target test was "reports a direction's id before its stops". It failed on its assertion: it got the stop-code message instead of `Invalid direction id: 'undefined'`. `gsd-tools check tdd-red-evidence` returned `RED_EVIDENCE_OK` (target_test_failed).
  - The record came from `bunx vitest --run --reporter=tap-flat`. Vitest's TAP output has no node-style `# tests/# pass/# fail` footer, so I appended one, with counts taken from the TAP output's own ok/not-ok lines (82 tests, 75 pass, 7 fail).
- **GREEN:** `9c63009`, `feat(13-06)`. All 83 tests in the two files pass, and the full suite passes (657 tests).
- **REFACTOR:** not needed.
- Task 1 is a tracer task, not `tdd`. I still ran its E2E step before the fix: the payload was committed (`{ routeCount: 2, stopCount: 2 }`). After the fix it was rejected.

## Issues Encountered
None.

## Verification
- `bun run test:coverage`: 43 files and 657 tests passed, with no type errors. Coverage across all files is 98.67% statements, 96.22% branches and 98.4% functions, above the 80% thresholds.
- `bunx tsc --noEmit -p tsconfig.json`: exit 0.
- `bunx biome check` on all three TS files: exit 0. The one warning is the existing `useFilenamingConvention` warning on `BusDataRepository.test.ts`.
- Gap repro from VERIFICATION.md: a stop with no fields and a stop with null code/lat/lon are now rejected. The "a stop with no code" and "a stop with lat null and lon null" matrix rows cover them.
- Task 3: both files print `stale=0` with `dnr`, `loader`, `retry` and `helper` each at 1. The script prints `markers=2` and `ARCH_BULLETS_MATCH count=5`. The commit touches only the two guidance files, and no GSD marker line changed.

## User Setup Required
None. No external service configuration is required.

## Next Phase Readiness
- Gap truth 6 is closed. Phase 13 still needs plan 13-07 (WR-01, stranded SSE streams), then re-verification.
- Phase 14 readiness can rely on `lastLoadedAt` advancing only for validated loads. `lastError` now carries the id-bearing validation messages.
- Live-payload assumption (flagged in the plan): every live DASH stop has a code and coordinates, and every route, direction and stop has a non-empty string id. If DASH ever breaks this, every load fails visibly (one warn line plus `lastError`), and at boot the server stays at 503.

---
*Phase: 13-resilient-route-stop-data-lifecycle*
*Completed: 2026-10-01*
