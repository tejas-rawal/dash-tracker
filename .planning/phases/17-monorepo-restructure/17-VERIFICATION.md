---
phase: 17-monorepo-restructure
verified: 2026-10-23T17:44:42Z
status: human_needed
score: 15/21 must-haves verified
covered_files:
  - ".claude/CLAUDE.md"
  - ".github/workflows/ci.yml"
  - ".gitignore"
  - ".planning/phases/17-monorepo-restructure/17-01-PLAN.md"
  - ".planning/phases/17-monorepo-restructure/17-01-SUMMARY.md"
  - ".planning/phases/17-monorepo-restructure/17-02-PLAN.md"
  - ".planning/phases/17-monorepo-restructure/17-02-SUMMARY.md"
  - ".planning/phases/17-monorepo-restructure/17-03-PLAN.md"
  - ".planning/phases/17-monorepo-restructure/17-03-SUMMARY.md"
  - ".superset/config.json"
  - "AGENTS.md"
  - "README.md"
  - "apps/server/.env.example"
  - "apps/server/package.json"
  - "apps/server/src/api/middleware/streamConcurrencyCap.test.ts"
  - "apps/server/src/api/repositories/BusDataRepository.test.ts"
  - "apps/server/src/api/repositories/FavoritesRecentsRepository.test.ts"
  - "apps/server/src/api/services/NearbyPredictionService.test.ts"
  - "apps/server/src/app.ts"
  - "apps/server/src/config/environment.ts"
  - "apps/server/src/test/setup.ts"
  - "apps/server/tsconfig.json"
  - "apps/server/tsconfig.typecheck.json"
  - "apps/server/vitest.config.mts"
  - "bun.lock"
  - "bunfig.toml"
  - "package.json"
covered_digest: "v3:sha256:e0aecc794589ed0cc1328bcfb81a2bb16050bc9b1d43acfe37f998476042abf8"
behavior_unverified: 2
overrides_applied: 0
deferred:
  - truth: "MONO-01: the root Bun workspace contains apps/mobile, and the root scripts fan out to it"
    addressed_in: "Phase 19"
    evidence: "Phase 19 (App Foundation & Route List) covers APP-01 'An Expo SDK 58 app in apps/mobile'. Its success criterion 5 says 'The root scripts now fan out to apps/mobile as well.' The workspace glob apps/* already picks it up, and apps/ holds only server today."
  - truth: "CI type-checks every workspace, including the newly type-checked test files (review WR-02)"
    addressed_in: "Phase 19"
    evidence: "Phase 19 success criterion 5: 'For each workspace it runs lint, type-check and tests with coverage.'"
  - truth: "CI sets up Node from .node-version (review WR-03)"
    addressed_in: "Phase 18"
    evidence: "TOOL-06: '.node-version pins a Node 24 LTS release, and every CI job sets up Node from it before bun install.'"
behavior_unverified_items:
  - truth: "start-server and dev-server work from apps/server: GET /api/v1/health/live answers 200, the default DB_PATH creates apps/server/data/dash-tracker.sqlite, dev-server restarts on a source change and stops on SIGINT"
    test: "After moving the root env file into apps/server, run `bun run --cwd apps/server start-server`, then `bun run dev:server` from the root. Curl /api/v1/health/live, touch apps/server/src/app.ts, then press Ctrl-C."
    expected: "Both answer 200. The SQLite file is under apps/server/data/ and no data/ appears at the root. nodemon logs a restart. After Ctrl-C, no nodemon, ts-node or listener is left."
    why_human: "The verifier may not start servers. Every static and cwd link is verified, but boot, restart and signal cleanup are runtime behavior that no test in the suite exercises."
  - truth: "A fresh Superset worktree sets up from .superset/config.json and runs the server from apps/server; SIGTERM or SIGINT to the run command leaves no orphaned bun, nodemon or ts-node process"
    test: "Create a new Superset workspace from this branch, wait for setup, start the run command, open /api/v1/health/live, then stop the run from Superset."
    expected: "Setup installs frozen and writes apps/server/.env (no root env file). The run answers 200. After the stop, `pgrep -fl 'nodemon|ts-node'` lists nothing from that workspace and the port is free."
    why_human: "This needs the real Superset workspace runner and its signal delivery. The 17-03 SUMMARY's simulated-worktree output is the executor's claim, not something the verifier ran."
human_verification:
  - test: "Server boot from apps/server (start-server, root dev:server, restart on change, Ctrl-C stop)"
    expected: "health/live 200 from both; SQLite under apps/server/data/; nodemon restart on touch; no orphans after Ctrl-C"
    why_human: "Verifier constraint: no server starts. Runtime boot and signal cleanup are not covered by any test."
  - test: "Fresh Superset workspace: setup, run, stop"
    expected: "frozen install; apps/server/.env written, no root env file; run serves 200; stop leaves no bun/nodemon/ts-node and frees the port"
    why_human: "Needs the real Superset UI and runner"
  - test: "One-time move of the local env file and data/ into apps/server (this worktree and the main checkout)"
    expected: "This worktree still has a root env file and no apps/server/.env. After the move, `bun run dev:server` boots, and existing favorites and recents are still there."
    why_human: "Secret file. The verifier may not read or move it, and only the user knows which data/ to keep."
  - test: "Push the branch, open the Phase 17 PR, and confirm all 4 CI jobs pass"
    expected: "Every job's 'Verify Bun pin and clean install' step prints 'packageManager Bun: 1.3.14, installed Bun: 1.3.14' with an empty porcelain status. test:coverage passes, and Codecov uploads ./apps/server/coverage/clover.xml."
    why_human: "The branch has no upstream and CI has never run on it. The workflow is only verified structurally."
  - test: "Merge the Phase 17 PR with a merge commit, never a squash (prohibition, D-01)"
    expected: "Rename commit 0be937b is reachable from main, and `git log --follow -- apps/server/src/app.ts` on main still lists b904b99"
    why_human: "Judgment-tier prohibition about a future action. It needs explicit human resolution."
  - test: "Review the two test-tier prohibitions (flagged: unverified-prohibition, human review recommended)"
    expected: "Accept the grep and diff evidence below, or require a wired enforcement test"
    why_human: "Test-tier prohibitions with no wired enforcement test fail closed to 'flagged', never green"
  - test: "Decide on the 3 non-inferable (backstop) truths: atomic move under interruption, test-file order independence, fan-out order independence"
    expected: "Accept the circumstantial evidence, or ask for held-out or property tests"
    why_human: "Backstop truths need explicit behavioral evidence; presence and wiring never qualify (insufficient_spec)"
---

# Phase 17: Monorepo Restructure Verification Report

**Phase Goal:** The repo is a Bun-workspaces monorepo with the backend in `apps/server`, installed by one Bun version from one lockfile. The server behaves exactly as before from its new location, and every moved file keeps its history.
**Verified:** 2026-10-23T17:44:42Z
**Status:** human_needed
**Re-verification:** No (initial verification)

## Goal Achievement

Everything that can be checked without starting a server, running CI or opening Superset is in place, and I confirmed it by running the checks myself. Runtime boot, real CI, the Superset workspace and the merge policy remain for a human.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | **SC1**: The move commit is rename-only, and `git log --follow` and blame reach past it | ✓ VERIFIED | `0be937b`: `git show -M --name-status` gives 123 `R100` and 0 other entries, including the 3 `.gitkeep` files. Its tree has no root `package.json`, which first appears in its direct child `91b9930`. `git log --follow apps/server/src/app.ts` gives 14 commits, including b904b99. Blame attributes lines to 10 distinct commits, none of them the rename. All 120 moved files still present have at least 2 commits of history. The 3 deleted ones (.eslintrc, .eslintignore, stub README) were removed on purpose in `055f967`. |
| 2 | **SC2a**: 853 tests pass and coverage stays ≥80%, from the root and from `apps/server`, with coverage-v8 = vitest = 3.2.6 | ✓ VERIFIED | Root `bun run test:coverage`: exit 0, 53 files, `Tests 853 passed (853)`, no type errors, `All files 98.67 / 96.76 / 98.34 / 98.67`, no "mixed versions" line. In `apps/server`, `vitest list --typecheck` enumerates 853, and the single test BusRoute.test.ts passes (12). A probe confirmed that the root `--filter` runs the workspace script with cwd = the workspace, so both entry points run the same command. Installed versions: `@vitest/coverage-v8` 3.2.6 and vitest 3.2.6. |
| 3 | **SC2b**: `build` works from `apps/server`, which holds `.env.example`, the Vitest config and the `.env`/`data/` resolution | ✓ VERIFIED | Root `bun run build`: exit 0. It emits `apps/server/dist/app.js` with 0 `*.test.js` and no root `dist/`. `apps/server/.env.example`, `vitest.config.mts` and `tsconfig*.json` all exist. `environment.ts` calls `dotenv.config()` (cwd-relative), and `DB_PATH` defaults to `data/dash-tracker.sqlite`, so both resolve under `apps/server` via the workspace cwd. `apps/server/.env` and `apps/server/data/` are git-ignored. |
| 4 | **SC2c**: `start-server` and `dev-server` boot and serve from `apps/server` (dev restart, SIGINT stop) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | The scripts point at `src/app.ts` (`ts-node`, `nodemon --exec ts-node`), and the cwd wiring is proven. I did not boot the server (verifier constraint). The 17-02 SUMMARY claims smokes on :3917 and :3918. See Human Verification 1. |
| 5 | **SC3**: Root fan-out scripts, failure propagation, and a single Biome lint covering every workspace | ✓ VERIFIED | Root `build`, `test`, `test:coverage` and `typecheck` are `bun run --filter './apps/*' …`. Failure propagates: `bun run test -- src/no/such/file.test.ts` exits 1 (zero files never passes), and `bun run typecheck -- --project missing.json` exits 1 with TS5058. `bun run lint` (`biome check .`) exits 0 with `Checked 122 files`, `Found 36 warnings.` (the pre-move count), 19 diagnostics under `apps/server/src` and none under dist or coverage. |
| 6 | **SC4a**: `bun.lock` is the only lockfile, the bunfig gates are in place, and a frozen install under 1.3.14 leaves the tree clean (locally) | ✓ VERIFIED | `git ls-files` lists only `bun.lock`. There is no `package-lock.json` or `bun.lockb` on disk, and `bun.lockb` is ignored (.gitignore:142). `bunfig.toml` has `linker = "hoisted"`, `exact = true` and `minimumReleaseAge = 604800`, with no excludes. `bun install --frozen-lockfile` reports `bun install v1.3.14 … (no changes)`, `git status --porcelain` shows only the pre-existing untracked `.planning/milestone.lock`, and there is no `node_modules/.bun`. |
| 7 | **SC4b**: A frozen install leaves the tree clean in every CI job | ? UNCERTAIN | The workflow is structurally correct: all 4 jobs have `bun-version-file: package.json`, `--frozen-lockfile`, and the `Verify Bun pin and clean install` step right after the install. But the branch has no upstream, so CI has never run. See Human Verification 4. |
| 8 | **SC5a**: CLAUDE.md, AGENTS.md, README and the Codecov upload use the new paths | ✓ VERIFIED | `git grep -e src/server -e 1.0.31` over .claude, AGENTS.md, README.md, .github, .superset, the package.json files and the configs finds nothing. Codecov `files: ./apps/server/coverage/clover.xml`, and that file exists after the coverage run. Both CLAUDE.md and AGENTS.md list all 14 mounted endpoints, which I cross-checked against the `router.*` calls. README has the layout section and the "One-time move" note. |
| 9 | **SC5b**: A fresh Superset worktree sets up and runs the server from `apps/server`, with no orphans on SIGTERM or SIGINT | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `.superset/config.json` setup is `bun install --frozen-lockfile`, then `[ -f apps/server/.env ] \|\| (cd apps/server && …setup.sh)`. Its run is `cd apps/server && exec bun run dev-server`. The signal and orphan behavior was not exercised by the verifier. See Human Verification 2. |
| 10 | **TOOL-05**: `packageManager` is `bun@1.3.14` (root only), Bun resolves to 1.3.14, and CI reads the pin and asserts it on plain `pull_request` | ✓ VERIFIED | The root `package.json` has `"packageManager": "bun@1.3.14"`, and `apps/server/package.json` has none. `bun --version` prints 1.3.14 at the root, in `apps/server` and in `apps/server/src/api`. ci.yml has `on: push: [main]` plus a plain `pull_request:` (no `_target`), and every job compares `bun --version` with the `packageManager` version. |
| 11 | **MONO-05/D-09/D-10**: Every specifier is exact and equal to the bun.lock resolution, with no drift outside coverage-v8's closure | ✓ VERIFIED | Neither package.json has a `^` or `~`, and zod `3.25.76` matches the lock. Running `17-lockfile-drift.cjs` on 8b9f457's bun.lock against HEAD with closure root `@vitest/coverage-v8` gives `DRIFT: none`. The only changes are the 8 expected closure names plus the new workspace entry. |
| 12 | `typecheck` covers all 53 test files, `build` excludes them, and the test type-fix commit changed no test behavior | ✓ VERIFIED | `tsc -p tsconfig.typecheck.json --listFilesOnly` includes 53 `*.test.ts` files (53 tracked), while `tsconfig.json` includes 0. Root typecheck exits 0. `b05ddf6` touches exactly the 4 named files: 5 unused imports removed, one cast changed to `as unknown as`, one comment reworded. No `.skip`, `.only` or `.todo` was added anywhere in the phase diff. |
| 13 | Hermetic test env: `TRUST_PROXY_HOPS` is pinned, so the shell cannot leak into tests | ✓ VERIFIED | `setup.ts` sets `TRUST_PROXY_HOPS = "0"` unconditionally. `TRUST_PROXY_HOPS=1 bun run test -- src/api/middleware/upstreamRateLimit.test.ts` passes 10/10. |
| 14 | better-sqlite3 loads from `apps/server`, the install stays hoisted, and the default trust list is intact | ✓ VERIFIED | `node -e` in `apps/server` gives `{ x: 1 }`. `bun pm untrusted` lists only `@biomejs/biome` postinstall (as before), and neither better-sqlite3 nor esbuild. No `trustedDependencies` is declared. |
| 15 | Workspace scripts read only `apps/server/.env`, never a root env file | ✓ VERIFIED | A scratch probe with Bun 1.3.14 put a `ROOT_ONLY_PROBE` in a root `.env`. It was `undefined` in the workspace script run via `--filter`, via `--cwd`, and from inside the workspace. `dotenv.config()` is cwd-relative and the workspace cwd is `apps/server`. |
| 16 | Superset setup installs before its env step, and re-running it leaves an existing `apps/server/.env` untouched | ✓ VERIFIED | The setup array order is install first, then the env step. The `[ -f apps/server/.env ] \|\|` guard makes the env step a no-op when the file exists, and that is enforced by the command itself, not by convention. |
| 17 | **TOOL-11**: The coverage-v8 3.2.6 install was legitimacy-gated by a human | ✓ VERIFIED | 17-01-SUMMARY.md line 178: `**User's answer (verbatim):** \`approved\``. The install landed later, in `4af1356`. |
| 18 | MONO-01 and ROADMAP SC3 carry the D-04 wording (lint is one root Biome run) | ✓ VERIFIED | REQUIREMENTS.md:13 and ROADMAP.md:107 both say "runs Biome once from the root and covers every workspace". |
| 19 | (backstop) An interrupted move leaves either the pre-move tree or the complete rename commit | ? insufficient_spec | Circumstantial: one atomic commit with 123 R100 entries, and every later commit is built on it. No behavioral evidence. See Human Verification 7. |
| 20 | (backstop) Server tests pass regardless of test-file order | ? insufficient_spec | Circumstantial: setup.ts pins the env, and Vitest isolates per file by default. No shuffled run was performed. |
| 21 | (backstop) Root fan-out does not depend on workspace order | ? insufficient_spec | Circumstantial: `apps/` contains only `server`, so order is moot today. |

**Score:** 15/21 truths verified (2 present but behavior-unverified, 1 uncertain, 3 insufficient_spec)

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | MONO-01's `apps/mobile` member and root fan-out to it | Phase 19 | APP-01, plus SC5: "The root scripts now fan out to `apps/mobile` as well" |
| 2 | CI runs `typecheck` (review WR-02) | Phase 19 | SC5: "For each workspace it runs lint, type-check and tests with coverage" |
| 3 | CI sets up Node from `.node-version` (review WR-03) | Phase 18 | TOOL-06 |

Note: REQUIREMENTS.md marks MONO-01 `[x]` even though the `apps/mobile` clause is only satisfied structurally (`workspaces: ["apps/*"]`). The traceability table should reflect that the clause completes in Phase 19.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `bunfig.toml` | hoisted, exact, 7-day age gate | ✓ VERIFIED | Has all 3 keys and no excludes |
| `package.json` (root) | workspace root, pin, fan-out, single lint | ✓ VERIFIED | `workspaces: ["apps/*"]`, `bun@1.3.14`, 4 `--filter` scripts, `dev:server` |
| `apps/server/package.json` | `@dash-tracker/server`, exact deps | ✓ VERIFIED | All specifiers exact, no `packageManager` |
| `apps/server/vitest.config.mts` | setup and coverage re-rooted | ✓ VERIFIED | `setupFiles: ["src/test/setup.ts"]`, thresholds 80×4 |
| `apps/server/tsconfig.typecheck.json` | extends, noEmit, includes tests | ✓ VERIFIED | Wired from the `typecheck` script |
| `apps/server/src/test/setup.ts` | `TRUST_PROXY_HOPS` pin | ✓ VERIFIED | Wired through `setupFiles` |
| `bun.lock` | single lockfile with the workspace | ✓ VERIFIED | Has an `"apps/server"` workspace entry, `configVersion: 0` |
| `.github/workflows/ci.yml` | pinned Bun, clean-tree check, PR trigger, Codecov path | ✓ VERIFIED (static) | Never executed (see truth 7) |
| `.gitignore` | `bun.lockb` ignored | ✓ VERIFIED | Line 142 |
| `.superset/config.json` | frozen setup, `exec` run from `apps/server` | ✓ VERIFIED (static) | Hardcoded home path, see WR-07 |
| `.claude/CLAUDE.md`, `AGENTS.md`, `README.md` | new layout, 14 endpoints, one-time move | ✓ VERIFIED | No stale paths |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| ci.yml | package.json | `bun-version-file: package.json` | WIRED | In all 4 jobs |
| bunfig.toml | bun.lock | frozen install honors hoisted/exact | WIRED | Frozen install: no changes, no `node_modules/.bun` |
| package.json (root) | apps/server/package.json | `bun run --filter './apps/*'` | WIRED | cwd = workspace (probe), and exit codes propagate |
| apps/server/package.json | tsconfig.typecheck.json | `tsc -p tsconfig.typecheck.json` | WIRED | 53 test files in the program |
| vitest.config.mts | src/test/setup.ts | `setupFiles` | WIRED | The TRUST_PROXY_HOPS=1 run passes |
| ci.yml | apps/server/coverage/clover.xml | codecov `files` | WIRED | The file is produced at that path |
| environment.ts | apps/server/.env | `dotenv.config()` with workspace cwd | WIRED | Root `.env` leak probe negative |
| .superset/config.json | apps/server/package.json | `cd apps/server && exec bun run dev-server` | WIRED (static) | Runtime signal behavior needs a human |

### Data-Flow Trace (Level 4)

Not applicable. This is a restructure and tooling phase that renders no dynamic data. The behavioral parity of the server code is covered by the 853-test suite, and the move changed no source files apart from 4 test files and setup.ts.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Root tests and coverage | `bun run test:coverage` | 853/853, 98.67/96.76/98.34/98.67, exit 0 | ✓ PASS |
| apps/server enumerates the suite | `vitest list --typecheck` (in apps/server) | 853 | ✓ PASS |
| Single test from apps/server | `bun run test -- src/api/models/BusRoute.test.ts` | 12 passed | ✓ PASS |
| Zero-file run fails at the root | `bun run test -- src/no/such/file.test.ts` | exit 1 | ✓ PASS |
| Typecheck failure propagates | `bun run typecheck -- --project missing.json` | exit 1, TS5058 | ✓ PASS |
| Typecheck clean | `bun run typecheck` | exit 0 | ✓ PASS |
| Build | `bun run build` | exit 0, dist/app.js, 0 test.js | ✓ PASS |
| Lint | `bun run lint` | exit 0, 36 warnings, 0 errors | ✓ PASS |
| Frozen install | `bun install --frozen-lockfile` | v1.3.14, no changes, tree clean | ✓ PASS |
| Lockfile drift | `17-lockfile-drift.cjs <8b9f457 lock> bun.lock @vitest/coverage-v8` | DRIFT: none | ✓ PASS |
| Hermetic env | `TRUST_PROXY_HOPS=1 bun run test -- …upstreamRateLimit.test.ts` | 10 passed | ✓ PASS |
| Native module | `node -e "new (require('better-sqlite3'))(':memory:')…"` | `{ x: 1 }` | ✓ PASS |
| Server boot / dev restart / signals | (not run) | verifier constraint | ? SKIP → human |

### Probe Execution

No `scripts/*/tests/probe-*.sh` exist, and none are declared by the phase. Step 7c is not applicable.

### Prohibitions

| Prohibition | Tier | Disposition | Evidence |
|-------------|------|-------------|----------|
| No weakening of supply-chain gates (no `minimumReleaseAgeExcludes`, no bun.lock deletion, every CI and Superset install frozen) | test | **flagged: unverified-prohibition, human review recommended** | `git grep minimumReleaseAgeExcludes` finds nothing. bun.lock is present in every commit of 8b9f457..HEAD. All 5 `bun install` occurrences (4 CI, 1 Superset) use `--frozen-lockfile`. No wired enforcement test exists, so this fails closed to flagged. |
| No weakening of the quality gate (thresholds 80×4, same covered files, no `.skip`/`.only`/`.todo`) | test | **flagged: unverified-prohibition, human review recommended** | Thresholds unchanged. The re-rooted include/exclude yields the identical 51-file covered set before and after. No added skip, only or todo. No wired enforcement test exists. |
| The rename commit must not be squashed away (merge commit, D-01) | judgment | human resolution required | A future action at merge time (Human Verification 5) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MONO-01 | 17-02, 17-03 | Bun workspace; fan-out scripts; single root Biome lint | ✓ SATISFIED (apps/mobile deferred to Phase 19) | Truths 5 and 18 |
| MONO-02 | 17-02 | Pure `git mv` in its own commit; history kept | ✓ SATISFIED | Truth 1 |
| MONO-03 | 17-02 | 853 tests and ≥80% coverage from root and apps/server; build/start/dev from the new location | ? NEEDS HUMAN (start-server and dev-server boot) | Truths 2 and 3 verified; truth 4 is human |
| MONO-04 | 17-02, 17-03 | .env/.env.example, data/, Vitest config, Superset, docs and Codecov all under apps/server | ? NEEDS HUMAN (Superset runtime) | Truths 3, 8, 15 and 16 verified; truth 9 is human |
| MONO-05 | 17-01, 17-02 | bun.lock is the only lockfile; bunfig gates | ✓ SATISFIED | Truths 6 and 11 |
| TOOL-05 | 17-01, 17-02 | bun@1.3.14 locally and in every CI job | ? NEEDS HUMAN (CI never run) | Truth 10 verified statically; truth 7 is human |
| TOOL-11 | 17-01, 17-02 | coverage-v8 = vitest 3.2.6 | ✓ SATISFIED | Truths 2 and 17 |

No orphaned requirements. All 7 Phase 17 IDs in REQUIREMENTS.md are claimed by at least one plan.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (phase-modified files) | - | TBD/FIXME/XXX, TODO/HACK/PLACEHOLDER | none found | - |
| `apps/server/src/api/services/NearbyPredictionService.test.ts` | 451 | stale comment `src/server/config/axios.test.ts` | ℹ️ Info | Comment only. It should read `src/config/axios.test.ts`. |
| `package.json` | 11-15 | `bun run --filter` elides output to 10 lines in a TTY (review WR-01) | ⚠️ Warning | Root `dev:server`, `test` and `typecheck` hide logs and failures interactively. CI is not affected. The goal is met, but the developer experience is degraded. |
| `.superset/config.json` | 4 | absolute `/Users/trawal/...` setup script (WR-07) | ⚠️ Warning | Works only for this user and host |
| `apps/server/src/api/middleware/streamConcurrencyCap.test.ts` | 327-346 | intermittent hang, 1 in 8 coverage runs (WR-08, deferred-items.md) | ⚠️ Warning | Pre-existing (Phase 16). Can flake CI. Did not occur in this verification's run. |
| `apps/server/package.json` | 12-13, 29 | `main`/`exports`/`types` point at a nonexistent `dist/index.*` (WR-05) | ⚠️ Warning | Pre-existing fields, now meaningful in a workspace package |
| `apps/server/package.json` | 32 | `@types/express` 5.0.0 on express 4.21.2 (WR-06) | ⚠️ Warning | Pre-existing mismatch, now exact-pinned. No behavior change. |

No blockers.

### Human Verification Required

#### 1. Server boot from apps/server
**Test:** After item 3, run `bun run --cwd apps/server start-server`, then `bun run dev:server` from the root. Curl `/api/v1/health/live`, touch `apps/server/src/app.ts`, then press Ctrl-C.
**Expected:** 200 from both. SQLite under `apps/server/data/` with no root `data/`. nodemon restarts on the touch. No nodemon, ts-node or listener left after Ctrl-C.
**Why human:** The verifier may not start servers, and no test covers boot or signal cleanup.

#### 2. Fresh Superset workspace
**Test:** Create a workspace from this branch, let setup run, start the run command, hit health/live, then stop the run from Superset.
**Expected:** Frozen install. `apps/server/.env` is written (no root env file). The run answers 200. The stop leaves no bun, nodemon or ts-node process and frees the port.
**Why human:** This needs the real Superset runner.

#### 3. One-time local env and data move
**Test:** This worktree still has a root env file and no `apps/server/.env`. Move the env file (and any `data/`) into `apps/server/` here and in the main checkout.
**Expected:** `bun run dev:server` boots, and favorites and recents survive.
**Why human:** Secret file, and a user-owned data decision.

#### 4. CI on the PR
**Test:** Push and open the Phase 17 PR.
**Expected:** All 4 jobs are green. Each "Verify Bun pin and clean install" step prints 1.3.14/1.3.14 with an empty status, and Codecov uploads `./apps/server/coverage/clover.xml`.
**Why human:** CI has never run on this branch.

#### 5. Merge with a merge commit (D-01)
**Expected:** `0be937b` is reachable from main, and `--follow` history survives.
**Why human:** A future action; judgment-tier prohibition.

#### 6. The two flagged test-tier prohibitions
**Expected:** Accept the grep and diff evidence in the Prohibitions table, or request enforcement tests.

#### 7. The three backstop truths (19-21)
**Expected:** Accept the circumstantial evidence, or request explicit tests (for example a shuffled Vitest run with `--sequence.shuffle`).

### Gaps Summary

There are no gaps. Every automatable part of the goal checks out:
- the rename-only commit and full per-file history;
- the workspace root, with fan-out and failure propagation;
- one Bun version, one lockfile, and no drift;
- 853/853 tests at 98.67% statement coverage;
- typecheck over all 53 test files;
- the build;
- docs and the Codecov path.

What remains is runtime and process confirmation that the verifier cannot perform: server boot and signals, the Superset workspace, the first CI run, the local env move, and the merge policy. The review warnings (WR-01 TTY elision, WR-07 hardcoded path, WR-08 flaky test) are advisory and do not block the goal. WR-02 and WR-03 are scheduled in Phases 19 and 18.

---

_Verified: 2026-10-23T17:44:42Z_
_Verifier: Claude (gsd-verifier)_
