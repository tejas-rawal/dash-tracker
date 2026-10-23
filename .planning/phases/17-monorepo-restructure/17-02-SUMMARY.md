---
phase: 17-monorepo-restructure
plan: 02
subsystem: infra
tags: [bun, workspaces, monorepo, git-mv, vitest, coverage-v8, typescript, lockfile]

# Dependency graph
requires:
  - phase: 17-01
    provides: "Bun 1.3.14 pin, bunfig.toml install gates, bun.lock as the only lockfile, approval of @vitest/coverage-v8@3.2.6"
provides:
  - "Server lives in apps/server (pure 123-file rename commit; --follow and blame reach past it)"
  - "Bun workspace root (workspaces apps/*) with fan-out build/test/test:coverage/typecheck, one root Biome lint, and dev:server"
  - "@dash-tracker/server workspace with cwd-relative scripts; .env, data/, coverage/ and dist/ resolve under apps/server"
  - "Exact-pinned dependency specifiers equal to bun.lock; @vitest/coverage-v8 3.2.6 = vitest 3.2.6"
  - "typecheck covers source and all 53 test files via apps/server/tsconfig.typecheck.json"
  - "Hermetic test env: TRUST_PROXY_HOPS pinned in src/test/setup.ts"
affects: [17-03, phase-18-tooling, phase-19-mobile, phase-19-ci]

# Actuals (#2632) — chars/4 over the realized diff (rename-detected; renames contribute no content)
actuals:
  tokens: 14790
  tasks: 3
  commits: 7
plan_head_before: b2d7886d98559fc1ea4180c8f0bffcb120f360a0
plan_head_after: 055f9677a90aec93e55273a7b0503a8bd7f781cf

# Tech tracking
tech-stack:
  added: ["Bun workspaces (apps/*)", "@vitest/coverage-v8 3.2.6 (was 2.1.5)"]
  patterns:
    - "Root scripts fan out with bun run --filter './apps/*' <script>; workspace scripts run with cwd = the workspace"
    - "Lint runs once at the root (biome check .) and covers every workspace; workspaces have no lint script"
    - "Type-check-only tsconfig (extends tsconfig.json, noEmit, tests included) keeps build output free of tests"
    - "Every dependency specifier is exact and equal to the version bun.lock resolves"

key-files:
  created:
    - package.json
    - apps/server/tsconfig.typecheck.json
  modified:
    - apps/server/package.json
    - apps/server/vitest.config.mts
    - apps/server/src/test/setup.ts
    - apps/server/src/api/middleware/streamConcurrencyCap.test.ts
    - apps/server/src/api/repositories/BusDataRepository.test.ts
    - apps/server/src/api/repositories/FavoritesRecentsRepository.test.ts
    - apps/server/src/api/services/NearbyPredictionService.test.ts
    - bun.lock
    - .github/workflows/ci.yml
  moved:
    - "src/server/** -> apps/server/src/** (119 files)"
    - "package.json, tsconfig.json, vitest.config.mts, .env.example -> apps/server/"
  deleted:
    - apps/server/src/.eslintrc
    - apps/server/src/.eslintignore
    - apps/server/src/README.md

key-decisions:
  - "Root owns @biomejs/biome 1.9.4 (exact), since the root runs the single Biome lint; the workspace no longer lists it"
  - "typecheck uses a separate tsconfig.typecheck.json instead of widening tsconfig.json, so build keeps excluding tests from dist"
  - "The streamConcurrencyCap 'never claims a slot' hang under coverage load is deferred: it predates the move and its fix lives in src/test/streamClient.ts, outside this plan's allowed test-file set"
  - "The root dev:server stays for humans (Ctrl-C); bun run --filter drops SIGTERM and orphans nodemon, so automated runners call dev-server from apps/server (D-13 amendment, plan 17-03)"

patterns-established:
  - "Rename-only commit first, wiring second: the new root package.json first appears in the commit after the rename, so git pairs every move as R100"
  - "Lockfile regenerations are gated by 17-lockfile-drift.cjs (DRIFT none) before commit"

requirements-completed: [MONO-01, MONO-02, MONO-03, MONO-04, MONO-05, TOOL-05, TOOL-11]

coverage:
  - id: D1
    description: "Server moved to apps/server in a pure rename commit; history follows the move"
    requirement: MONO-02
    verification:
      - kind: other
        ref: "Task 1 verify 1 (R100 gate) -> '123 renames, 0 problems'"
        status: pass
      - kind: other
        ref: "Task 1 verify 2 (parent/--follow/blame) -> 'history follows the move'; git log --follow lists 14 commits incl. b904b99; blame 10 distinct commits, none the rename"
        status: pass
    human_judgment: false
  - id: D2
    description: "Bun workspace root fans out test/test:coverage/build/typecheck to apps/server and fails when the workspace fails"
    requirement: MONO-01
    verification:
      - kind: other
        ref: "bun run test (root) -> Tests 853 passed (853), exactly one '@dash-tracker/server test: Exited with code 0'"
        status: pass
      - kind: other
        ref: "Task 3 verify 5 -> 'all four root fan-out scripts propagate workspace failures'"
        status: pass
    human_judgment: false
  - id: D3
    description: "853 tests and >=80% coverage from the root and from apps/server, identical All files rows, no mixed-versions warning"
    requirement: MONO-03
    verification:
      - kind: unit
        ref: "bun run test:coverage and bun run --cwd apps/server test:coverage -> Tests 853 passed (853); All files 98.67 / 96.75 / 98.34 / 98.67 in both"
        status: pass
    human_judgment: false
  - id: D4
    description: "build, start-server and dev-server work from apps/server; .env/.env.example, data/, Vitest config and Codecov path resolve under apps/server"
    requirement: MONO-04
    verification:
      - kind: other
        ref: "Task 3 verify 2 -> 'build and typecheck ok' (apps/server/dist/app.js, no *.test.js, no root dist/)"
        status: pass
      - kind: other
        ref: "start-server smoke on :3917 -> {\"status\":\"ok\"}, apps/server/data/dash-tracker.sqlite created, no root data/, port freed after SIGINT"
        status: pass
      - kind: other
        ref: "dev:server smoke on :3918 -> {\"status\":\"ok\"}, 'restarting due to changes' after touch, no nodemon or listener after SIGINT"
        status: pass
      - kind: other
        ref: "test -f apps/server/.env.example && git check-ignore -q apps/server/.env && git check-ignore -q apps/server/data/x; grep apps/server/coverage/clover.xml .github/workflows/ci.yml"
        status: pass
    human_judgment: false
  - id: D5
    description: "Exact specifiers equal to bun.lock; coverage-v8 = vitest 3.2.6; lockfile drift limited to coverage-v8's closure; frozen install clean and hoisted"
    requirement: MONO-05
    verification:
      - kind: other
        ref: "exact-pin checker -> 'checked 22 specifiers, 0 mismatches'"
        status: pass
      - kind: other
        ref: "17-lockfile-drift.cjs (wiring, no closure root) -> DRIFT none; (pins, closure @vitest/coverage-v8) -> DRIFT none, 8 intended names"
        status: pass
      - kind: other
        ref: "bun install --frozen-lockfile -> no changes; no node_modules/.bun; git status clean outside .planning"
        status: pass
    human_judgment: false
  - id: D6
    description: "Only the root package.json carries packageManager bun@1.3.14"
    requirement: TOOL-05
    verification:
      - kind: other
        ref: "root package.json acceptance check (AC_ROOT_OK); wiring-commit apps/server/package.json check (no packageManager) -> AC_SERVER_OK"
        status: pass
    human_judgment: false
  - id: D7
    description: "@vitest/coverage-v8 resolves to 3.2.6, equal to vitest"
    requirement: TOOL-11
    verification:
      - kind: other
        ref: "node -e require versions -> 'vitest 3.2.6 coverage-v8 3.2.6'; no 'mixed versions' in the root coverage log"
        status: pass
    human_judgment: false
  - id: D8
    description: "typecheck covers all 53 test files and fails on an injected test-file error; the 6 latent errors are fixed in a test-only commit that keeps the 4 files at 210 tests"
    verification:
      - kind: other
        ref: "Task 2 verify 7 -> 'typecheck covers all 53 test files and fails on an injected test-file error' (TS2322 in BusRoute.test.ts)"
        status: pass
      - kind: unit
        ref: "4 type-fixed files -> Tests 210 passed (210), same as before the fix"
        status: pass
    human_judgment: false
  - id: D9
    description: "Tests are hermetic against a local TRUST_PROXY_HOPS"
    verification:
      - kind: unit
        ref: "TRUST_PROXY_HOPS=1 bun run --cwd apps/server test -- rateLimit/trustProxy/streamCap/environment tests -> Test Files 4 passed (4); without the pin rateLimit.test.ts failed 1/19"
        status: pass
    human_judgment: false
  - id: D10
    description: "One root Biome run lints apps/server: 0 errors, the pre-move 36 warnings, nothing under dist/coverage"
    verification:
      - kind: other
        ref: "Task 3 verify 6 -> 'Found 36 warnings.' and 'one Biome run covers apps/server'"
        status: pass
    human_judgment: false
  - id: D11
    description: "better-sqlite3 loads from apps/server; bun pm untrusted lists neither better-sqlite3 nor esbuild"
    verification:
      - kind: other
        ref: "Task 3 verify 7 -> '{ x: 1 }' and 'native module loads; default trust list intact' (only @biomejs/biome postinstall blocked)"
        status: pass
    human_judgment: false

# Metrics
duration: 8min
completed: 2026-10-23
status: complete
---

# Phase 17 Plan 02: Server Moved to apps/server as a Bun Workspace Summary

**The server now lives in `apps/server` (`@dash-tracker/server`). It arrived through a pure 123-file rename commit, so `git log --follow` and `git blame` reach past the move. A Bun workspace root fans `test`, `test:coverage`, `build` and `typecheck` out to it and runs one Biome lint. Every dependency is pinned to the version `bun.lock` resolves, `@vitest/coverage-v8` is 3.2.6 (equal to vitest), `typecheck` now covers all 53 test files, and all 853 tests pass with 98.67% statement coverage from both the root and `apps/server`.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-23T17:16:05Z
- **Completed:** 2026-10-23T17:24:04Z
- **Tasks:** 3
- **Files modified:** 127 in the diff (123 renames, 1 new root package.json, 1 new tsconfig.typecheck.json, 3 deletions, plus content edits to moved files, bun.lock and ci.yml)

## Accomplishments

- **Rename-only commit `0be937b`:** 123 R100 renames and nothing else. That is the 119 files of `src/server`, including the three empty `.gitkeep` files, plus `package.json`, `tsconfig.json`, `vitest.config.mts` and `.env.example`.
- **Workspace wiring `91b9930`:**
  - New root `package.json`: `dash-tracker`, private, `bun@1.3.14`, `workspaces: ["apps/*"]`, Biome 1.9.4.
  - `@dash-tracker/server` gets cwd-relative `start-server` and `dev-server` scripts.
  - Vitest `setupFiles` and coverage excludes are re-rooted under apps/server.
  - Codecov uploads `./apps/server/coverage/clover.xml`.
  - `bun.lock` gained only the workspace entry.
- **Exact pins `4af1356`:**
  - 15 caret ranges replaced with the versions bun.lock resolves (zod 3.25.76).
  - `@vitest/coverage-v8` 2.1.5 → 3.2.6.
  - Lockfile changes stay inside coverage-v8's closure.
- **Hermetic tests `65c1572`:** `src/test/setup.ts` pins `TRUST_PROXY_HOPS = "0"`.
- **Test-only type fixes `b05ddf6`:** the 6 latent errors are gone (5 unused imports, 1 fixture cast through `unknown`), and the 4 files still run 210 tests.
- **Typecheck covers tests `538f85b`:** `typecheck` runs `tsc -p tsconfig.typecheck.json`, which covers all 53 test files. `build` still compiles from `tsconfig.json`.
- **Cleanup `055f967`:** the Sails-era `.eslintrc` and `.eslintignore` and the 9-line stub README are deleted.

## Verification Evidence

### Rename gate and history (Task 1)

```
123 renames, 0 problems
history follows the move
```

`git log --follow -- apps/server/src/app.ts` lists 14 commits, including b904b99. `git blame` attributes lines to 10 distinct commits, none of them the rename commit. The rename commit's tree has no root `package.json`; the wiring commit (whose parent is the rename commit) has one.

### Drift checker, wiring step (rename commit → wiring, no closure root)

```
workspace entries:
  @dash-tracker/server: [] -> [workspace:apps/server]
intended (closure of none):
  none
DRIFT:
  none
```

`bun.lock` stays `configVersion: 0`, and `node_modules` stays hoisted (no `node_modules/.bun`).

### Drift checker, pin step (wiring → pins, closure `@vitest/coverage-v8`)

```
workspace entries:
  none
intended (closure of @vitest/coverage-v8):
  @bcoe/v8-coverage: [0.2.3] -> [1.0.2]
  @jridgewell/trace-mapping: [0.3.25,0.3.9] -> [0.3.25,0.3.31,0.3.9]
  @vitest/coverage-v8: [2.1.5] -> [3.2.6]
  ast-v8-to-istanbul: [] -> [0.3.12]
  js-tokens: [9.0.1] -> [10.0.0,9.0.1]
  magic-string: [0.30.12,0.30.21] -> [0.30.21]
  std-env: [3.10.0,3.8.0] -> [3.10.0]
  tinyrainbow: [1.2.0,2.0.0] -> [2.0.0]
DRIFT:
  none
```

These are exactly the eight names, at exactly the versions, in the planning-time list. No newer in-range release appeared.

Exact-pin checker: `checked 22 specifiers, 0 mismatches` (baseline: 15). Versions: `vitest 3.2.6 coverage-v8 3.2.6`.

### Coverage, root vs apps/server

```
root:        All files          |   98.67 |    96.75 |   98.34 |   98.67 |
apps/server: All files          |   98.67 |    96.75 |   98.34 |   98.67 |
```

Both runs report `Tests  853 passed (853)`, and the root log has no `Running mixed versions is not supported` line. Pre-move figures (coverage-v8 2.1.5) were 98.78 / 96.48 / 97.85 / 98.78. The planned flagged assumption covers this shift: the gate is ≥80% on every metric with identical root and workspace rows.

Root `bun run test` printed `Tests 853 passed (853)` with exactly one `@dash-tracker/server test: Exited with code 0` line. `bun run --cwd apps/server test` printed the same count.

### Typecheck proof (Task 2)

```
typecheck covers all 53 test files and fails on an injected test-file error
@dash-tracker/server typecheck: src/api/models/BusRoute.test.ts(154,14): error TS2322: Type 'string' is not assignable to type 'number'.
```

The 4 type-fixed files run `Tests  210 passed (210)`, the same as the pre-fix baseline. `tsc -p tsconfig.json --listFilesOnly` lists 0 test files, so build output stays test-free.

### Hermetic env (Task 2)

- Before the pin, `TRUST_PROXY_HOPS=1 bun run --cwd apps/server test -- src/api/routes/rateLimit.test.ts` failed "with the default TRUST_PROXY_HOPS=0 a forged X-Forwarded-For does not escape the limit" (1 failed, 18 passed).
- After the pin, the rateLimit/trustProxy/streamCap/environment set reports `Test Files  4 passed (4)` with `TRUST_PROXY_HOPS=1` exported.

### Smokes (Task 3)

| Smoke | Result |
|-------|--------|
| `bun run build` + `bun run typecheck` (root) | `build and typecheck ok`. `apps/server/dist/app.js` exists, with no `*.test.js` and no root `dist/` |
| `start-server` from apps/server (:3917, inline env, `DB_PATH=data/dash-tracker.sqlite`, no `apps/server/data` beforehand) | `{"status":"ok"}`. Created `apps/server/data/dash-tracker.sqlite`, with no root `data/`. SIGINT → "Server is gracefully shutting down", port freed |
| `dev:server` from the root (:3918) | `{"status":"ok"}`. `[nodemon] restarting due to changes...` after `touch apps/server/src/app.ts`. SIGINT → no nodemon process, no listener |
| SIGTERM probe through `dev:server` (:3919) | bun exits, but **nodemon is orphaned** (cleaned up afterwards). This confirms the planning-time finding |
| Failure propagation | `all four root fan-out scripts propagate workspace failures` |
| `better-sqlite3` from apps/server | `{ x: 1 }`. `native module loads; default trust list intact` |
| Final `bun install --frozen-lockfile` | no changes, hoisted, `git status --porcelain -- . ':!.planning'` empty |

### Lint tail

```
Diagnostics not shown: 16.
Checked 122 files in 64ms. No fixes applied.
Found 36 warnings.
one Biome run covers apps/server
```

There are diagnostics under `./apps/server/src/`, none under `apps/server/dist` or `apps/server/coverage`, and 0 errors.

### `bun pm untrusted`

```
./node_modules/@biomejs/biome @1.9.4
 » [postinstall]: node scripts/postinstall.js
```

Neither better-sqlite3 nor esbuild is listed. Only Biome's postinstall is blocked, as it was before this phase.

## Task Commits

1. **Task 1: Rename-only commit, then workspace wiring (tracer)**
   - `0be937b`: refactor(17-02): move server to apps/server (rename only)
   - `91b9930`: build(17-02): wire Bun workspace root and @dash-tracker/server
2. **Task 2: Pins, coverage-v8, hermetic env, typecheck covers tests**
   - `4af1356`: build(17-02): pin exact dependency versions and align @vitest/coverage-v8 with vitest 3.2.6
   - `65c1572`: test(17-02): pin TRUST_PROXY_HOPS in test setup so a local env file cannot leak into tests
   - `b05ddf6`: test(17-02): fix the six latent type errors in server test files
   - `538f85b`: build(17-02): type-check server test files in typecheck
   - No `test(17-02): give the 62-request rate-limit test room under coverage load` commit, because the upstreamRateLimit 62-request test never timed out in any of the 10 coverage runs.
3. **Task 3: Cleanup and runtime proofs**
   - `055f967`: chore(17-02): remove ESLint leftovers and the stub server README

**Plan metadata:** the docs commit for this SUMMARY, deferred-items.md and the WINDOWS.md entry, plus the STATE/ROADMAP/REQUIREMENTS update.

## Files Created/Modified

- `package.json` (new root): workspace root, Bun pin, Biome lint/format scripts, fan-out scripts, `dev:server`, devDependency `@biomejs/biome` 1.9.4.
- `apps/server/package.json` (moved, then edited):
  - `@dash-tracker/server`, with no `packageManager` and no lint/format scripts;
  - `start-server`/`dev-server` on `src/app.ts`;
  - `typecheck` = `tsc -p tsconfig.typecheck.json`;
  - exact pins, and coverage-v8 3.2.6.
- `apps/server/tsconfig.typecheck.json` (new): `extends ./tsconfig.json`, `noEmit`, `exclude` `["node_modules", "dist", "coverage"]`.
- `apps/server/vitest.config.mts` (moved, then edited): `setupFiles: ["src/test/setup.ts"]`; excludes are `src/test/**`, `src/app.ts` and `src/config/**`. Thresholds are unchanged at 80/80/80/80.
- `apps/server/tsconfig.json`, `apps/server/.env.example`: moved, no edits.
- `apps/server/src/test/setup.ts`: `process.env.TRUST_PROXY_HOPS = "0";`.
- 4 test files: unused imports removed, the hoisting comment reworded, and the fixture cast goes through `unknown`.
- `bun.lock`: the `apps/server` workspace section and the coverage-v8 3.2.6 closure.
- `.github/workflows/ci.yml`: Codecov `files: ./apps/server/coverage/clover.xml`.
- Deleted: `apps/server/src/.eslintrc`, `apps/server/src/.eslintignore`, `apps/server/src/README.md`.

## Decisions Made

- **Biome is owned by the root** at exactly 1.9.4. The root runs the one lint, so the workspace no longer lists it, and the resolved version is unchanged.
- **Typecheck uses a separate config.** Widening `tsconfig.json` would put `*.test.js` into `dist/`. With a separate file, `build` and `typecheck` each check exactly what they should.
- **The streamConcurrencyCap hang is deferred, not fixed.** See Issues Encountered.
- **The root `dev:server` stays human-only.** `--filter` drops SIGTERM (confirmed by the probe above). Automated runners use `cd apps/server && exec bun run dev-server` (D-13 amendment, plan 17-03).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The stub README's path in the plan was wrong**
- **Found during:** Task 3
- **Issue:** The plan names `apps/server/README.md`, but the 9-line stub lived at `src/server/README.md`, so the rename put it at `apps/server/src/README.md`. `apps/server/README.md` never existed.
- **Fix:** Deleted the stub at its real path, `apps/server/src/README.md`. Its content matches the plan's description exactly ("API server", empty Links, "v0.1.0"). The "leftovers gone" verify was also run against `apps/server/src/README.md`.
- **Files modified:** apps/server/src/README.md (deleted)
- **Verification:** `leftovers gone`; `git ls-files apps/server | grep -i readme` prints nothing.
- **Committed in:** `055f967`

**2. [Rule 3 - Blocking] The Task 2 coverage verify grepped the wrong window**
- **Found during:** Task 2, verify 4
- **Issue:** `... | tail -n 25 | grep 'Tests +853 passed'` cannot match on a coverage run. The coverage table follows the `Tests` line, which therefore sits about 70 lines from the end (line 373 of 442). The root run exited 0 with 853 passed, but the verify reported failure.
- **Fix:** Ran the same assertions (853 from both locations, no mixed-versions line, identical `All files` rows) by grepping the full logs instead of the last 25 lines. Product code is unchanged.
- **Files modified:** none
- **Verification:** The adjusted verify exited 0 and printed both 853 lines and the identical `All files` row.
- **Committed in:** n/a

**3. [Rule 3 - Blocking] The start/dev smoke verifies signalled the wrong PID**
- **Found during:** Task 3, start-server smoke
- **Issue:** The plan's command backgrounds a whole `! lsof ... && env ... bun run ...` list, so `$!` is the subshell running that list, not `bun`. `kill -INT $BP` hit the exiting subshell, and bun plus the server kept listening on :3917, so the verify reported RC=1. Health had returned `{"status":"ok"}`, and the SQLite file landed in `apps/server/data/`.
- **Fix:** Sent SIGINT straight to the leftover bun PID, which forwarded it ("Server is gracefully shutting down"). Then re-ran both smokes from a fresh state (removed the git-ignored `apps/server/data/`) with the port check as its own statement and `bun ...` backgrounded alone, so `$!` is bun. Both passed with every original assertion.
- **Files modified:** none
- **Verification:** start smoke RC=0, dev smoke RC=0, and no nodemon, ts-node or bun process left afterwards.
- **Committed in:** n/a

### Out-of-scope discovery (logged, not fixed)

- `streamConcurrencyCap.test.ts` › "never claims a slot for a connect the shared bucket rejects" hung past its existing 15 s timeout in 1 of 8 root coverage runs. Details are under Issues Encountered. It is logged to `deferred-items.md` and `.planning/WINDOWS.md`.

---

**Total deviations:** 3 auto-fixed (all Rule 3: one plan path error, two verify-harness defects), plus 1 deferred out-of-scope flake.
**Impact on plan:** No product or scope change. Every acceptance criterion holds as written. The two harness defects affect only how the evidence was gathered.

## Issues Encountered

**Pre-existing hang in streamConcurrencyCap.test.ts under coverage load.**
- **What happened:** Across 10 coverage runs (8 from the root, plus the official root and apps/server pair), root run 3 failed one test. "never claims a slot for a connect the shared bucket rejects" hit `Test timed out in 15000ms`. The file passed 5 of 5 times on its own, and the other 9 coverage runs passed 853/853.
- **Why it is a hang:** Its sibling tests finish in 10–100 ms, so 15 s means the test waited forever rather than ran slowly.
- **Likely cause:** `connectStream` in `src/test/streamClient.ts` swallows request errors, so a socket error before the response leaves `opened` unresolved.
- **Why it was not fixed here:**
  - The test and helper date from Phase 16.
  - Removing an unused import in this plan cannot change their behavior.
  - The fix belongs in `src/test/streamClient.ts`, which is outside the test files this plan may change (D-06 amendment).
- **Not the planned flake:** The planned upstreamRateLimit 62-request test never timed out, so its file is untouched.
- **Where it is logged:** `.planning/phases/17-monorepo-restructure/deferred-items.md` and `.planning/WINDOWS.md`.

## Manual step: move your local env file and data/ (one time)

Workspace scripts now run with cwd = `apps/server`, so `dotenv` reads `apps/server/.env` and the default `DB_PATH` resolves to `apps/server/data/`. This checkout still has its env file at the repo root. The executor did not touch it: the secret guard blocks moving it from the shell, and D-14 makes the move a manual step. Each developer must, once:

1. move the root `.env` to `apps/server/.env`;
2. move the root `data/` directory, if any, to `apps/server/data/`.

Both destinations are git-ignored (`git check-ignore -q apps/server/.env` and `apps/server/data/x` pass). Until you move the env file, `bun run dev:server` and `start-server` will fail env validation unless the DASH_* variables are set another way.

## Follow-ups for Phase 18

- **`bun run --filter` does not forward SIGTERM.** On SIGTERM, `bun run dev:server` exits and leaves nodemon and the server orphaned (re-confirmed by this plan's :3919 probe). Humans stop the root `dev:server` with Ctrl-C (SIGINT works). Automated runners call `dev-server` from `apps/server` (plan 17-03). Re-check this once Phase 18 swaps ts-node/nodemon for tsx.
- **Biome's postinstall is blocked.** `bun pm untrusted` lists `@biomejs/biome@1.9.4 » [postinstall]`, as it did before this phase. TOOL-07 (explicit `trustedDependencies`) should decide it, together with the Biome 2 upgrade.

## User Setup Required

None for external services. The one-time local env file and `data/` move is described above.

## Next Phase Readiness

- Plan 17-03 can proceed: docs, the Superset config, and the REQUIREMENTS/ROADMAP rewording for D-04.
- D-01 still stands. The phase PR must merge with a merge commit, or the rename commit `0be937b` and the history it preserves are lost from `main`.
- Watch for the deferred streamConcurrencyCap hang in CI coverage runs. A rerun clears it, but the fix belongs in Phase 18 or a quick task.

---
*Phase: 17-monorepo-restructure*
*Completed: 2026-10-23*

## Self-Check: PASSED

- Files exist: package.json, apps/server/package.json, apps/server/vitest.config.mts, apps/server/tsconfig.json, apps/server/tsconfig.typecheck.json, apps/server/.env.example, apps/server/src/test/setup.ts, bun.lock, .github/workflows/ci.yml. The three deleted files are confirmed absent and untracked.
- Commits are ancestors of HEAD: 0be937b, 91b9930, 4af1356, 65c1572, b05ddf6, 538f85b, 055f967. The measured count for b2d7886..HEAD is 7.
- Every task's acceptance criteria and the plan-level verification were run on the final tree. All passed, with the harness adjustments noted under Deviations.
