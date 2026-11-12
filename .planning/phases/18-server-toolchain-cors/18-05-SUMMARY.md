---
phase: 18-server-toolchain-cors
plan: 05
subsystem: api
tags: [route-colors, dash, repository, coercion, express]

requires:
  - phase: 18-server-toolchain-cors
    provides: "18-02: es2024 target (declared class fields exist as own properties, so an unset color serializes as absent); 18-03: Biome 2.5.15 with the 36-warning baseline"
provides:
  - "Optional color/textColor on BusRoute, carried exactly as DASH sends them"
  - "parseHexColor(value: unknown): string | undefined in BusDataRepository.ts: exactly 6 hex digits, never throws"
  - "color/textColor in /routes/all, /routes/:shortName and the route entities in favorites and recents"
  - "makeApiRoute(id, shortName, directions, overrides) in BusDataRepository.test.ts"
affects: [19, frontend, route-list, badges]

actuals:
  tokens: 3940
  tasks: 2
  commits: 2
plan_head_before: 33d69d8d5f49c578d478ac8d6170e0c67ca9f3af
plan_head_after: ca81f1bc3722b0d0475c6e58c5f765a32f6a9cb3

tech-stack:
  added: []
  patterns:
    - "Optional display fields from DASH: read as unknown, pass through a pure never-throwing filter, omit when invalid, so one bad field never rejects the atomic load"

key-files:
  created:
    - apps/server/src/api/routes/routeColors.test.ts
  modified:
    - apps/server/src/api/models/BusRoute.ts
    - apps/server/src/api/repositories/BusDataRepository.ts
    - apps/server/src/api/repositories/BusDataRepository.test.ts
    - apps/server/src/api/models/BusRoute.test.ts

key-decisions:
  - "Route colors pass through parseHexColor (/^[0-9a-fA-F]{6}$/): the exact DASH string or undefined; no # added, no case change, no default or computed textColor"
  - "Task 2 coercion tests passed on first run against Task 1's filter, so no fix(18-05) commit was needed; a temporary pass-through mutation of parseHexColor failed 12 of the 13 new repository rows, which shows the rows catch a missing filter"

patterns-established:
  - "Display-only DASH fields (like color/textColor) are coerced per field and never thrown on; identity fields (ids) still reject the load through requireId"

requirements-completed: [CORS-05]

coverage:
  - id: D1
    description: "DASH color/textColor reach /routes/all and /routes/:shortName exactly as sent (30: 006899/ffffff, 36B: eda0d3/ffffff)"
    requirement: CORS-05
    verification:
      - kind: integration
        ref: "apps/server/src/api/routes/routeColors.test.ts#serves each route's color and textColor exactly as DASH sent them on /routes/all and /routes/:shortName"
        status: pass
    human_judgment: false
  - id: D2
    description: "A missing or malformed color or textColor is dropped per field, never rejects load(), and leaves other routes and lastError untouched"
    requirement: CORS-05
    verification:
      - kind: unit
        ref: "apps/server/src/api/repositories/BusDataRepository.test.ts#load: route colors are optional display data (15 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Serialized BusRoute objects, plain and in the { ...route, alerts } copy, have color keys only when set"
    requirement: CORS-05
    verification:
      - kind: unit
        ref: "apps/server/src/api/models/BusRoute.test.ts#JSON serialization of route colors (4 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Live DASH payload evidence still shows a 6-hex color pair on all 12 routes"
    requirement: CORS-05
    verification:
      - kind: other
        ref: "grep -cE color/textColor pair over 18-dash-routes-payload.txt = 12"
        status: pass
    human_judgment: false

duration: 3min
completed: 2026-11-12
status: complete
---

# Phase 18 Plan 05: Route Colors Summary

**Route responses now carry DASH's own `color` and `textColor` (for example route 30: `006899`/`ffffff`). The values come through `RouteData` → a never-throwing 6-hex-digit filter → `BusRoute`. A malformed or missing value drops only that field and never fails the atomic load.**

## Performance

- **Duration:** about 3 min
- **Started:** 2026-11-12T18:49:09Z
- **Completed:** 2026-11-12T18:51:40Z
- **Tasks:** 2
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments

- `BusRoute` has optional `color` and `textColor` fields, assigned from the constructor data. When DASH has no valid value the field stays `undefined`, so JSON leaves the key out.
- `RouteData` reads `color` and `textColor` as `unknown`. `parseHexColor` returns the value unchanged only when it is a string of exactly 6 hex digits. Anything else becomes `undefined`, and the helper never throws. `createRoute` passes both fields through it.
- `/api/v1/routes/all` and `/api/v1/routes/:shortName` serve the colors through `attachAlerts`' `{ ...route, alerts }` spread. Favorites and recents serve the same repository `BusRoute` instance as `entity`, so they carry the colors too.
- Test count went from 872 to 892. That is 1 end-to-end route test, 15 repository coercion tests and 4 serialization tests. Coverage thresholds pass (all files 98.5% statements, 96.55% branches, 98.45% functions), `BusRoute.ts` is at 100%, typecheck and build are clean, and lint stays at `Found 36 warnings.`

## Evidence

### `/api/v1/routes/all` for the two test routes (fake DASH, routeColors.test.ts payload)

```json
[{"id":"30","longName":"Route 30 Long","shortName":"30","name":"Route 30","type":"3","color":"006899","textColor":"ffffff","directions":[{"id":"30-d1","title":"Northbound","stops":[{"id":"30-stop","name":"Stop 30","code":101,"lat":38.8,"lon":-77.1}],"headSigns":["Downtown"]}],"alerts":[]},{"id":"36B","longName":"Route 36B Long","shortName":"36B","name":"Route 36B","type":"3","color":"eda0d3","textColor":"ffffff","directions":[{"id":"36B-d1","title":"Northbound","stops":[{"id":"36B-stop","name":"Stop 36B","code":101,"lat":38.8,"lon":-77.1}],"headSigns":["Downtown"]}],"alerts":[]}]
```

I captured this from a throwaway copy of the test that logged the response body. The copy was deleted and never committed. `GET /api/v1/routes/36B` returned `color: "eda0d3"` and `textColor: "ffffff"`.

### Test count

- Before: 872 (after 18-04).
- After Task 1: `Tests 873 passed (873)` under `bun run test`.
- After Task 2: `Tests 892 passed (892)` under `bun run test:coverage`, exit 0.

### Payload evidence

`payload evidence: 12 of 12 routes carry colors`. The CORS-05 precondition still holds.

## Task Commits

1. **Task 1 (tracer): carry DASH route color and textColor into route responses**: `6c353b3` (feat)
2. **Task 2: route colors are dropped per field and never fail the load**: `ca81f1b` (test)

**Plan metadata:** the docs commit that follows this SUMMARY.

## TDD Gate Compliance

- Task 2 is `tdd="true"`, but its tests check the filter that Task 1 (the tracer) already shipped. The plan expects this: "They should pass against Task 1's filter; if any fails, fix `parseHexColor`." So the tests passed on their first run, which is an expected early GREEN rather than a RED. No `fix(18-05)` commit was needed. The `feat` commit (`6c353b3`) comes before the `test` commit (`ca81f1b`), the reverse of the RED → GREEN order, as the plan specified.
- **Semantic check in place of RED evidence:** I temporarily changed `parseHexColor` to return every value unchanged and reran both files. 12 of the 13 new repository rows failed: every malformed-value row, the field-independence row and the two-route row. The absent-key row passed because `undefined` passes through either way. I then restored the file with `git checkout` on that single file. The mutation was never committed, so no RED evidence file was written.
- **Filter fix needed after the coercion tests:** none.
- **REFACTOR:** none.

## Files Created/Modified

- `apps/server/src/api/models/BusRoute.ts`: optional `color`/`textColor` fields and constructor keys.
- `apps/server/src/api/repositories/BusDataRepository.ts`: `RouteData.color`/`textColor` as `unknown`, `parseHexColor`, and `createRoute` passing both fields through it.
- `apps/server/src/api/routes/routeColors.test.ts`: fake DASH → `load()` → `/routes/all` and `/routes/36B`.
- `apps/server/src/api/repositories/BusDataRepository.test.ts`: `makeApiRoute(..., overrides)` and `describe("load: route colors are optional display data")`.
- `apps/server/src/api/models/BusRoute.test.ts`: `describe("JSON serialization of route colors")`, covering both the instance and the `{ ...route, alerts: [] }` spread.

## Decisions Made

See `key-decisions` in the frontmatter. In short: the filter keeps the exact DASH string or drops it, and the coercion tests needed no filter fix.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Formatter reflowed the new test file**
- **Found during:** Task 1 lint gate
- **Issue:** Biome's formatter wanted the two-route array in `routeColors.test.ts` split across lines, so `bun run lint` reported 1 error alongside the 36 warnings.
- **Fix:** `biome format --write` on the new file.
- **Files modified:** apps/server/src/api/routes/routeColors.test.ts
- **Verification:** `bun run lint` exits 0 with `Found 36 warnings.`
- **Committed in:** 6c353b3

### Verify-command note (no code change)

- Task 2's coverage verify pipes `tail -n 25` into the count parser. The coverage table pushes the `Tests N passed` line out of that window, so the parser cannot match even when the run passes. This is the same known defect that 18-02, 18-03 and 18-04 hit. I ran the same assertion over the full output instead: `all 892 tests passed`, coverage exit 0, thresholds met.

---

**Total deviations:** 1 auto-fixed (formatting of my own new file) plus 1 verify-command defect, noted above.
**Impact on plan:** None on behavior. No scope change.

## Issues Encountered

- The `it.each` titles show string labels in quotes (for example `drops a color that is 'null' and keeps textColor`), because Vitest formats `$label` that way. This is cosmetic.
- The existing vite `Unrecognized target environment "es2024"` warning still appears in test output. It predates this plan and is out of scope.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- Phase 19's route list can draw badges from `color`/`textColor` on `/routes/all`. When either key is absent, it should fall back to a neutral badge.
- Plan 18-06 (the CORS response matrix) touches none of this plan's files.

---
*Phase: 18-server-toolchain-cors*
*Completed: 2026-11-12*

## Self-Check: PASSED

- FOUND: apps/server/src/api/routes/routeColors.test.ts (118 lines), apps/server/src/api/models/BusRoute.ts, apps/server/src/api/repositories/BusDataRepository.ts
- FOUND: 6c353b3, ca81f1b (both ancestors of HEAD; `check evaluation-scope --plan 18-05 --commits-only` resolves both)
- Acceptance criteria rerun: tracer verify prints `route colors tracer ok`, the coercion verify prints `color coercion tests ok`, the payload evidence prints 12 of 12, the full suite passes with 892 tests, and typecheck, build and lint (`Found 36 warnings.`) pass
