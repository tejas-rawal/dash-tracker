---
phase: 18-server-toolchain-cors
plan: 02
subsystem: infra
tags: [tsx, typescript6, tsconfig-node24, types-node, commonjs, signals, superset]

requires:
  - phase: 18-server-toolchain-cors
    provides: "18-01: Node 24.22.2 pin, trustedDependencies (esbuild covered), lint baseline 36 warnings, approval of @types/node@24.19.2"
provides:
  - "dev-server = tsx watch src/app.ts, start-server = tsx src/app.ts; nodemon and ts-node removed"
  - "Every @types/* package in devDependencies"
  - "TypeScript 6.0.3 on @tsconfig/node24 24.0.5 with @types/node 24.19.2"
  - "apps/server/tsconfig.json: extends @tsconfig/node24, module commonjs, moduleResolution bundler, types [node], target es2024 inherited"
  - "Signal handling under tsx re-proven: root Ctrl-C, SIGTERM to bun, SIGINT to start-server's group, Superset terminal dispose"
affects: [18-03, 18-04, 18-05, 18-06, 19-mobile, ci]

actuals:
  tokens: 11651
  tasks: 2
  commits: 2
plan_head_before: 24fa1487700a9c15bf00e83dfb63fb705469f4c5
plan_head_after: 12479ca94229c63a0272bdef4868715281013d90

tech-stack:
  added: ["tsx 4.23.15 (esbuild 0.28.2)", "typescript 6.0.3", "@tsconfig/node24 24.0.5", "@types/node 24.19.2 (undici-types 7.24.6)"]
  patterns:
    - "Server tsconfig extends the @tsconfig/node24 base and overrides only module/moduleResolution (commonjs/bundler) plus an explicit types list"
    - "Signal checks run the server in its own process group via perl setpgrp with SIGINT restored, against dummy DASH settings and a scratch DB_PATH"

key-files:
  created: []
  modified:
    - apps/server/package.json
    - bun.lock
    - apps/server/tsconfig.json
    - .claude/CLAUDE.md
    - AGENTS.md

key-decisions:
  - "module commonjs + moduleResolution bundler over the base's nodenext/node16: keeps CommonJS emit, and nodenext would break typecheck on the extensionless dynamic imports in environment.test.ts"
  - "types: [\"node\"] is explicit in tsconfig.json and inherited by tsconfig.typecheck.json; no vitest/globals needed since every test imports from vitest"
  - "target es2024 comes from the base; no class depends on assignment semantics for fields, so define semantics change nothing"

patterns-established:
  - "Toolchain bump order D-01 held: one commit per step (tsx, then TypeScript 6), every gate green after each"

requirements-completed: [TOOL-08, TOOL-09]

coverage:
  - id: D1
    description: "dev-server runs under tsx watch and start-server under tsx; nodemon and ts-node removed from package.json and node_modules; tsx 4.23.15; @types in devDependencies; .superset/config.json and root dev:server unchanged"
    requirement: TOOL-08
    verification:
      - kind: other
        ref: "Task 1 verify 1 (package.json/node_modules/bun pm untrusted check) -> runtime swap ok"
        status: pass
    human_judgment: false
  - id: D2
    description: "Root dev:server restarts on touch of src/app.ts and Ctrl-C (SIGINT to the group) leaves no process and a free port"
    requirement: TOOL-08
    verification:
      - kind: e2e
        ref: "Task 1 verify 2 -> starts=2 leftover=0 port_listening_rc=1; root dev-server restart and Ctrl-C ok (run 3 times: before commit, tracer gate, on the TS 6 tsconfig)"
        status: pass
    human_judgment: false
  - id: D3
    description: "dev-server stops on SIGTERM to bun alone and start-server on SIGINT to its group, both logging the graceful shutdown with no leftover process and a free port"
    requirement: TOOL-08
    verification:
      - kind: e2e
        ref: "Task 1 verify 3 -> leftover=0 port_rc=1 graceful_rc=0 for both; graceful signals ok (run 3 times)"
        status: pass
    human_judgment: false
  - id: D4
    description: "TypeScript 6.0.3 with tsconfig extending @tsconfig/node24: showConfig module commonjs, moduleResolution bundler, target es2024, types [node], all strictness flags true, typecheck config matching"
    requirement: TOOL-09
    verification:
      - kind: other
        ref: "Task 2 verify 1 -> tsconfig ok; ts6 config ok"
        status: pass
    human_judgment: false
  - id: D5
    description: "build emits CommonJS to dist/ with no test files, and the build program holds no test-only @types"
    requirement: TOOL-09
    verification:
      - kind: other
        ref: "Task 2 verify 2 -> commonjs emit; emit and types ok"
        status: pass
    human_judgment: false
  - id: D6
    description: "Full suite, coverage, typecheck, lint baseline, @types/node 24.19.2 and empty untrusted list on the final toolchain; dist boots on Node 24.22.2"
    requirement: TOOL-09
    verification:
      - kind: unit
        ref: "bun run test:coverage -> Tests 853 passed (853), 98.68/96.79/98.42/98.68"
        status: pass
      - kind: other
        ref: "bun run lint -> Found 36 warnings.; bun pm untrusted -> Found 0; @types/node 24.19.2"
        status: pass
      - kind: other
        ref: "Task 2 verify 4 -> {\"status\":\"ok\"} boot smoke ok"
        status: pass
    human_judgment: false
  - id: D7
    description: "Phase 17 UAT 2 repeated on the final toolchain: fresh Superset workspace setup, Run command under tsx watch, terminal dispose leaves nothing behind"
    requirement: TOOL-08
    verification:
      - kind: manual_procedural
        ref: "superset ws create --local (branch uat-18-02-superset @ 12479ca) -> setup frozen install 304 packages + env file created; superset terminals create 'cd apps/server && exec bun run dev-server' -> health/live 200 after 3s; superset terminals close -> disposed, no tsx/bun/node left, port 3000 free"
        status: pass
    human_judgment: true
    rationale: "Plan marks this a human-check. Claude ran it through the Superset CLI (terminals close = dispose), as Phase 17 UAT 2 was run; the user may accept the CLI evidence or repeat the dispose from the desktop UI"

duration: 6min
completed: 2026-11-12
status: complete
---

# Phase 18 Plan 02: tsx Runtime and TypeScript 6 on @tsconfig/node24 Summary

**The server now runs under tsx 4.23.15 (`tsx watch` for dev) with ts-node and nodemon gone, and it compiles with TypeScript 6.0.3 on `@tsconfig/node24`. The emit is still CommonJS to `dist/`, `types: ["node"]` keeps test @types out of the build, and every strictness flag is unchanged.**

## Performance

- **Duration:** about 6 min
- **Started:** 2026-11-12T18:27:00Z
- **Completed:** 2026-11-12T18:33:00Z
- **Tasks:** 2 of 2
- **Files modified:** 5

## Accomplishments

- `start-server` is `tsx src/app.ts` and `dev-server` is `tsx watch src/app.ts`. The script names are unchanged, so the root `dev:server` and `.superset/config.json` were not edited.
- nodemon 3.1.9 and ts-node 10.9.2 are removed. tsx went from 4.19.2 to 4.23.15, which pulls in esbuild 0.28.2 (its postinstall runs under 18-01's `esbuild` trust entry). `@types/better-sqlite3`, `@types/express` and `@types/winston` moved to devDependencies.
- TypeScript went from 5.7.3 to 6.0.3, `@tsconfig/node20` 20.1.4 was replaced by `@tsconfig/node24` 24.0.5, and `@types/node` went from 20.17.6 to 24.19.2.
- `apps/server/tsconfig.json` extends `@tsconfig/node24/tsconfig.json`. Its own `module: commonjs` and `moduleResolution: bundler` override the base, `types: ["node"]` is explicit, and `target` is inherited as es2024. `tsconfig.typecheck.json` is unchanged.
- No TS 6 errors in source or tests. The TS2883 from the planning scratch tree did not show up in the real tree.

## Signal checks (D-07)

All checks below ran three times: before the Task 1 commit, at the tracer gate after the commit, and on the TS 6 tsconfig before the Task 2 commit. Every run passed.

- **Root `bun run dev:server`:** `starts=2 leftover=0 port_listening_rc=1`, then `root dev-server restart and Ctrl-C ok`.
  - **`touch apps/server/src/app.ts` triggered the restart.** No real edit was needed, and `src/app.ts` was never modified.
  - tsx's restart runs `app.ts`'s graceful shutdown. The log shows `[tsx] change in ./src/app.ts Restarting...`, then `Server is gracefully shutting down`, then a second `Server is running on port 3918`.
- **From `apps/server`:**
  - `dev-server` with SIGTERM sent to the bun process alone: `leftover=0 port_rc=1 graceful_rc=0`.
  - `start-server` with SIGINT sent to its group: `leftover=0 port_rc=1 graceful_rc=0`.
  - Result: `graceful signals ok`. Both logs end with `FavoritesRecentsRepository connection closed`, then `Server is gracefully shutting down`.
- **Superset (repeat of Phase 17 UAT 2, the `<human-check>`):** Claude ran this through the Superset CLI. The workspace was `uat-18-02-superset`, created with `superset ws create --local` from scratch branch `uat-18-02-superset` at 12479ca.
  - Setup terminal: `bun install --frozen-lockfile` installed 304 packages on Node v24.22.2, the setup script wrote `apps/server/.env`, and `git status` stayed clean.
  - Run command (`cd apps/server && exec bun run dev-server`) in a Superset terminal: health/live returned `{"status":"ok"}` (200) after 3 s. The process tree was bun 3913, then `tsx watch src/app.ts` 4001, then the app node 4072, all in process group 3913.
  - `superset terminals close` reported `disposed`. Afterwards no process from that workspace remained (`pgrep -fl 'tsx watch src/app.ts'` matched nothing from it) and port 3000 was free.
  - Cleanup: the workspace was deleted with `superset ws delete --local`, its worktree directory is gone, and the scratch branch was deleted. It was never pushed.
- The SIGHUP gap is noted, not required (D-07), and was not tested.

## TypeScript 6 results

- `./node_modules/.bin/tsc --version`: `Version 6.0.3`
- `tsc --showConfig`:
  - `tsconfig.json`: `{"module":"commonjs","moduleResolution":"bundler","target":"es2024","types":["node"],"lib":["es2024","esnext.array","esnext.collection","esnext.error","es2025.iterator","es2025.promise"]}`
  - `tsconfig.typecheck.json`: `{"module":"commonjs","moduleResolution":"bundler","target":"es2024","types":["node"],"noEmit":true}`
  - All 7 strictness flags are `true`. Output: `tsconfig ok` and `ts6 config ok`.
- Build program `@types` (`--listFilesOnly`): better-sqlite3, body-parser, connect, express, express-serve-static-core, http-errors, mime, node, qs, range-parser, send, serve-static, triple-beam. There is no supertest, chai or superagent, so this matches the planning probe exactly. Output: `emit and types ok`.
- First 6 lines of `apps/server/dist/app.js`:

```
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
```

- TS 6 errors found: none. There was no TS2729 (class-field define semantics) and no TS2883, so no fix commit was needed.
- Dist boot smoke on Node v24.22.2: `{"status":"ok"} boot smoke ok`. On SIGTERM it exited 0 after logging the graceful shutdown.

## Gates

| Gate | After Task 1 (875d8b8) | After Task 2 (12479ca) |
|------|------------------------|------------------------|
| `bun run test` | Tests 853 passed (853) | Tests 853 passed (853) |
| `bun run test:coverage` | not run | 853 passed; 98.68% stmts / 96.79% branches / 98.42% funcs / 98.68% lines |
| `bun run typecheck` / `build` | exit 0 / exit 0 | exit 0 / exit 0 |
| `bun run lint` | Found 36 warnings. | Found 36 warnings. |
| `bun pm untrusted` | Found 0 | Found 0 |
| Frozen install leaves `bun.lock` unchanged | yes | yes |

- `streamConcurrencyCap.test.ts` hangs: none in 3 suite runs.

## Task Commits

1. **Task 1: tsx runtime, ts-node and nodemon removed, @types in devDependencies** - `875d8b8` (build)
2. **Task 2: TypeScript 6.0.3 on @tsconfig/node24 with CommonJS emit** - `12479ca` (build)

## Files Created/Modified

- `apps/server/package.json`:
  - Scripts now run tsx.
  - devDependencies: tsx 4.23.15, typescript 6.0.3, @tsconfig/node24 24.0.5, @types/node 24.19.2, plus the three @types packages moved from dependencies.
  - Removed: nodemon, ts-node and @tsconfig/node20.
- `bun.lock`: the workspace section and the packages match the new set: esbuild 0.28.2 and undici-types 7.24.6 added, and ts-node's tree removed.
- `apps/server/tsconfig.json`: adds `extends`, sets `module` to commonjs and `moduleResolution` to bundler, adds `types: ["node"]`, and removes `target`. Every other option and comment is unchanged.
- `.claude/CLAUDE.md`, `AGENTS.md`:
  - The dev server line now reads "tsx watch, restarts when a file it imports changes", and the start line reads "tsx".
  - The stack line names TypeScript 6.0.3.
  - The build line reads `(es2024 from @tsconfig/node24, CommonJS, strict mode; explicit types: ["node"])`.

## Decisions Made

- I followed the plan's override, `module: commonjs` with `moduleResolution: bundler`. The real tree confirmed the planning probe: 0 errors, and the emit is CommonJS.
- `@tsconfig/strictest` was left alone, as the plan said.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The Task 2 coverage verify's `tail -n 25` window cannot reach the Tests line**
- **Found during:** Task 2, verify 3
- **Issue:** `bun run test:coverage 2>&1 | tail -n 25 | grep -E 'Tests +853 passed'` fails. Vitest prints the coverage table (about 70 lines) after the `Tests  853 passed (853)` line, which sits at line 1272 of 1341. The command exits 0 and the tests pass. The window is simply too small, and it would be at HEAD too.
- **Fix:** I ran the same assertions over the full log: `grep -E 'Tests +853 passed \(853\)'` on the saved output, coverage exit code 0 (thresholds met), lint `Found 36 warnings.`, `@types/node 24.19.2`, and `bun pm untrusted` Found 0. Everything passed. No code changed.
- **Files modified:** none
- **Committed in:** n/a (verification only)

**2. [Rule 3 - Blocking] Clean frozen reinstall to drop stale hoisted packages**
- **Found during:** Task 2, step 1
- **Issue:** After `bun remove`, `node_modules/@tsconfig/node10`, `node12`, `node14` and `node16` (from ts-node's old tree) were still on disk, although `bun.lock` no longer lists them. Checks run on that tree would not show what a clean install produces.
- **Fix:** I ran `rm -rf node_modules apps/server/node_modules && bun install --frozen-lockfile`. It installed 304 packages, only `node24` and `strictest` remain under `@tsconfig`, better-sqlite3 loads, and the untrusted list is empty. All later checks ran on this clean tree.
- **Files modified:** none (node_modules only)
- **Committed in:** n/a

---

**Total deviations:** 2 auto-fixed (2 blocking: one verify-command window, one stale node_modules)
**Impact on plan:** None on the deliverables. The planned checks all ran and passed.

## Issues Encountered

None. `.planning/config.json` and `.planning/milestone.lock` were already modified or untracked before this plan started. They were left as they were and are not committed.

## Flagged assumption (TOOL-08)

`tsx watch` restarts when a file in the import graph changes. An edit to `apps/server/.env` alone does not trigger a restart; restart the dev server by hand to pick it up. This is already worded in the docs ("restarts when a file it imports changes").

## User Setup Required

None. Locally, if a developer's `node_modules` still has ts-node-era leftovers, `rm -rf node_modules && bun install --frozen-lockfile` cleans them up. This is optional, because nothing references those packages.

## Next Phase Readiness

- Ready for 18-03 (Biome 2.5.15). The lint baseline is unchanged at 36 warnings, and the Biome legitimacy gate is approved.
- CORS plans (18-04 onward) will be written on TypeScript 6 with es2024 output.

---
*Phase: 18-server-toolchain-cors*
*Completed: 2026-11-12*

## Self-Check: PASSED

All 5 modified files exist. Commits 875d8b8 and 12479ca are ancestors of HEAD. `git rev-list --count 24fa148..HEAD` = 2. No stubs or placeholders in the changed files.
