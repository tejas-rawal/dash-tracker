---
phase: 18-server-toolchain-cors
plan: 01
subsystem: infra
tags: [node24, bun, trustedDependencies, better-sqlite3, github-actions, setup-node, supply-chain]

requires:
  - phase: 17-monorepo-restructure
    provides: "Bun workspace monorepo with frozen-lockfile CI, hoisted linker, 7-day minimumReleaseAge, lockfile drift checker"
provides:
  - ".node-version pins Node 24.22.2 LTS (ABI 137), resolved by proto locally and actions/setup-node@v7 in CI"
  - "Root trustedDependencies = @biomejs/biome, better-sqlite3, esbuild; bun pm untrusted is empty"
  - "CI: Setup Node before every install, Node/Bun pin + trust-list + clean-tree verify step, dist boot smoke in the build job"
  - "Biome 1.9.4 lint baseline (36 warnings) for plan 18-03"
  - "Human approval of @types/node@24.19.2 and @biomejs/biome@2.5.15 for plans 18-02 and 18-03"
affects: [18-02, 18-03, 18-04, 18-05, 18-06, ci, native-modules]

actuals:
  tokens: 3337
  tasks: 3
  commits: 2
plan_head_before: e7ebe83a304cc27b8ce04a688a0d6299ca5387df
plan_head_after: a7abcaefaca83eeef751ab4b674d1371c1bce415

tech-stack:
  added: ["Node 24.22.2 LTS (runtime pin)", "actions/setup-node@v7 (CI)"]
  patterns:
    - "Explicit lifecycle-script trust list: trustedDependencies holds exactly what bun pm untrusted reports, each entry with an install/postinstall script"
    - "CI verify step right after the frozen install asserts Node pin, Bun pin, empty bun pm untrusted and clean git tree"
    - "Build job boots dist/app.js against an unreachable DASH and probes /api/v1/health/live so a native ABI break fails CI"

key-files:
  created: []
  modified:
    - .node-version
    - package.json
    - bun.lock
    - .github/workflows/ci.yml
    - .claude/CLAUDE.md
    - AGENTS.md

key-decisions:
  - "Node pinned to 24.22.2 (newest 24.x LTS older than 7 days on 2026-11-10, ABI 137)"
  - "trustedDependencies = [@biomejs/biome, better-sqlite3, esbuild]; the declared list replaces Bun's default trust list"
  - "No setup-node cache input: its auto cache covers only npm/yarn/pnpm and the repo's packageManager is bun"
  - "Boot smoke lives in the existing build job and uses dummy DASH settings (DASH_API_KEY: smoke, base URL 127.0.0.1:9)"
  - "Package legitimacy for @types/node@24.19.2 and @biomejs/biome@2.5.15 approved by the user (SUS too-new verdicts come from newest publishes, not the pinned versions)"

patterns-established:
  - "Trust-list contract: a later bump that adds a lifecycle script reappears in bun pm untrusted and must be decided again, never auto-added"

requirements-completed: [TOOL-06, TOOL-07]

coverage:
  - id: D1
    description: ".node-version pins Node 24.22.2 and node --version prints v24.22.2 at the root and in apps/server"
    requirement: TOOL-06
    verification:
      - kind: other
        ref: "test \"$(cat .node-version)\" = 24.22.2 && node --version (root and apps/server) -> node pin ok"
        status: pass
    human_judgment: false
  - id: D2
    description: "better-sqlite3 builds and loads on ABI 137 after a clean frozen reinstall; trustedDependencies declared and bun pm untrusted empty"
    requirement: TOOL-07
    verification:
      - kind: other
        ref: "rm -rf node_modules && bun install --frozen-lockfile; node -e require('better-sqlite3') -> better-sqlite3 loads on ABI 137, sqlite 3.53.2"
        status: pass
      - kind: other
        ref: "bun pm untrusted -> Found 0 untrusted dependencies with scripts."
        status: pass
    human_judgment: false
  - id: D3
    description: "Full server suite, coverage, typecheck, build and lint green on Node 24.22.2; dist boots and stops cleanly"
    verification:
      - kind: unit
        ref: "bun run test -> Tests 853 passed (853)"
        status: pass
      - kind: unit
        ref: "bun run test:coverage -> 98.67/96.75/98.34/98.67"
        status: pass
      - kind: other
        ref: "dist boot smoke -> health/live {\"status\":\"ok\"}, SIGTERM exit 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every CI job sets up Node from .node-version before bun install, verifies pins/trust list/clean tree, and the build job smoke-boots dist"
    requirement: TOOL-06
    verification:
      - kind: other
        ref: "ruby YAML structural check -> ci ok: 4 jobs"
        status: pass
      - kind: other
        ref: "extracted Boot smoke test script run locally -> ci boot smoke script ok"
        status: pass
    human_judgment: true
    rationale: "The new workflow has not run on GitHub Actions yet; setup-node@v7 behavior on the hosted runner is only confirmed by a real CI run"
  - id: D5
    description: "Package legitimacy of @types/node@24.19.2 and @biomejs/biome@2.5.15 approved before plans 18-02 and 18-03 install them"
    verification:
      - kind: manual_procedural
        ref: "Task 3 blocking-human checkpoint, user answered: approved"
        status: pass
    human_judgment: false

duration: 3min active (checkpoint wait 2026-11-10 to 2026-11-12)
completed: 2026-11-12
status: complete
---

# Phase 18 Plan 01: Node 24 Pin, Trust List and CI Node Setup Summary

**Node 24.22.2 LTS pinned in `.node-version` and set up by actions/setup-node@v7 before every CI install, with an explicit `trustedDependencies` list (biome, better-sqlite3, esbuild) leaving `bun pm untrusted` empty, better-sqlite3 rebuilt and loading on ABI 137, and a CI boot smoke of `dist/app.js`.**

## Performance

- **Duration:** about 3 min of execution (2026-11-10T20:18:16Z to the Task 2 commit at 20:20:43Z), then the blocking-human legitimacy checkpoint, closed 2026-11-12
- **Started:** 2026-11-10T20:18:16Z
- **Completed:** 2026-11-12T18:23:51Z
- **Tasks:** 3 (2 auto/tracer + 1 blocking-human checkpoint)
- **Files modified:** 6

## Accomplishments

- `.node-version` is the single line `24.22.2`; `node --version` prints `v24.22.2` at the repo root and in `apps/server` (after `proto install node 24.22.2`).
- Root `package.json` declares `trustedDependencies`, and `bun pm untrusted` prints `Found 0 untrusted dependencies with scripts.` on the first try.
- A clean frozen reinstall left `bun.lock` unchanged, kept the hoisted layout (no `node_modules/.bun`) and rebuilt better-sqlite3: `better-sqlite3 loads on ABI 137, sqlite 3.53.2`.
- All four CI jobs run `Setup Node` (actions/setup-node@v7, `node-version-file: .node-version`) before `bun install --frozen-lockfile`. The step after the install checks the Node pin, the Bun pin, `bun pm untrusted` and a clean tree. The build job boots `apps/server/dist/app.js` and probes `/api/v1/health/live`.
- The user approved the SUS-rated packages that plans 18-02 and 18-03 install.

## Task Commits

1. **Task 1: Node 24.22.2 pin, explicit trust list, clean reinstall, native load, full suite, dist boot** - `7c2fb88` (build)
2. **Task 2: CI sets Node up from .node-version before every install, checks the pins and trust list, smoke-boots the build** - `a7abcae` (ci)
3. **Task 3: Package-legitimacy gate** - no commit (human approval, recorded below)

## Files Created/Modified

- `.node-version` - `20` → `24.22.2`
- `package.json` - adds `trustedDependencies` after `workspaces`
- `bun.lock` - gains only a 5-line `trustedDependencies` block; no resolved version changed
- `.github/workflows/ci.yml` - `Setup Node` in all 4 jobs, renamed verify step `Verify Bun and Node pins, trust list and clean install`, `Boot smoke test` in the build job
- `.claude/CLAUDE.md`, `AGENTS.md` - Node 24.22.2 LTS stack line; Install bullet notes Node from `.node-version` and the `bun pm untrusted` contract

## Node and trust list

- `node --version`: `v24.22.2` (root and `apps/server`)
- `trustedDependencies` (final, in order):
  - `@biomejs/biome` - its 1.9.4 postinstall was the one package `bun pm untrusted` reported as blocked at HEAD
  - `better-sqlite3` - its `install` script builds or fetches the native binary; Bun's default list trusted it, and a declared list replaces that default
  - `esbuild` - postinstall pulled in via tsx and vitest; it ran only through Bun's default list before
  - Each entry has an install/postinstall script (checked by the Task 1 verify).
- `bun pm untrusted`: `Found 0 untrusted dependencies with scripts.` (first try, no extra entries needed)
- Lockfile drift (`17-lockfile-drift.cjs` HEAD `bun.lock` vs new): `DRIFT: none`
- Native load: `better-sqlite3 loads on ABI 137, sqlite 3.53.2`
- esbuild `transformSync` ok; `biome --version` → `Version: 1.9.4`

## Gates on Node 24.22.2

- `bun run test`: `Tests 853 passed (853)`; `bun run test:coverage`: 853 passed, 98.67% statements / 96.75% branches / 98.34% functions / 98.67% lines
- `bun run typecheck` and `bun run build` exit 0
- Boot smoke (local): health/live → `{"status":"ok"}`; SIGTERM → exit 0 after `Server is gracefully shutting down`
- `streamConcurrencyCap.test.ts` hang occurrences: none in 3 suite runs

### Biome 1.9.4 lint baseline (D-11, for plan 18-03)

`Found 36 warnings.` and 0 errors:

| Rule | Count | Locations |
|------|-------|-----------|
| lint/style/useFilenamingConvention | 30 | various |
| lint/style/useNamingConvention | 1 | `config/axios.ts:8` |
| lint/style/useThrowOnlyError | 2 | `BusRouteController.test.ts:152,268` |
| suppressions/unused | 3 | `BusRouteController.test.ts:150,266`; `vitest.config.mts:5` |

### CI checks (Task 2)

- Ruby structural check: `ci ok: 4 jobs`
- Extracted `Boot smoke test` script run locally: `ci boot smoke script ok`
- Docs check: `docs ok`
- No `pull_request_target`; 4 `--frozen-lockfile` installs; `timeout-minutes: 5` on all 4 jobs
- No cache input on setup-node (auto cache is npm/yarn/pnpm only); `package-manager-cache: false` was not needed locally
- The updated workflow has not run on GitHub Actions yet

## Package legitimacy

User answer (2026-11-12), verbatim:

```
approved
```

Fresh seam run (2026-11-10, `gsd-tools query package-legitimacy check --ecosystem npm ...`):

| Package | Verdict | Detail |
|---------|---------|--------|
| @types/node | SUS (too-new) | Newest publish 2026-10-28. Pinned 24.19.2 published 2026-10-09, repo DefinitelyTyped, no postinstall. Depends on `undici-types` `>=7.24.0 <7.24.7` → 7.24.6 (published 2026-03-25) |
| @biomejs/biome | SUS (too-new) | Newest publish 2026-11-06. Pinned 2.5.15 published 2026-09-30, repo biomejs/biome, no scripts; `@biomejs/cli-*` pinned 2.5.15 |
| undici-types | SUS (too-new) | Newest publish 2026-11-05 (resolved 7.24.6 is from 2026-03-25) |
| tsx | OK | |
| typescript | OK | |
| @tsconfig/node24 | OK | |
| esbuild | OK | Has a postinstall (`node install.js`) |
| cors | OK | |
| @types/cors | OK | |

No package rated SLOP. With this approval, plan 18-02 Task 2 may install `@types/node@24.19.2` and plan 18-03 Task 1 may install `@biomejs/biome@2.5.15`. Nothing was installed in this plan.

## Decisions Made

- Node 24.22.2: newest Node 24 LTS patch older than 7 days on 2026-11-10 (released 2026-10-27, modules 137).
- `trustedDependencies` holds exactly the three packages above. It replaces Bun's default list, so better-sqlite3 and esbuild had to be named explicitly.
- No setup-node cache input (bun is not a supported auto-cache manager).
- The boot smoke sits in the existing build job, which already holds `dist/`, and uses dummy DASH values only.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. `.planning/STATE.md`, `.planning/config.json` and `.planning/milestone.lock` had uncommitted changes from before the plan; the plan left `config.json` and `milestone.lock` untouched and uncommitted.

## User Setup Required

None. Locally, `proto install node 24.22.2` is needed once if proto has not installed that version yet.

## Next Phase Readiness

- Ready for 18-02 (TypeScript toolchain and `@types/node@24.19.2`) and 18-03 (Biome 2.5.15 against the 36-warning baseline). Both legitimacy gates are approved.
- Watch the first GitHub Actions run of the updated workflow: setup-node@v7 with a bun `packageManager` field, and the build job's `Boot smoke test`.

---
*Phase: 18-server-toolchain-cors*
*Completed: 2026-11-12*

## Self-Check: PASSED

All 6 modified files and the SUMMARY exist; commits 7c2fb88 and a7abcae are ancestors of HEAD.
