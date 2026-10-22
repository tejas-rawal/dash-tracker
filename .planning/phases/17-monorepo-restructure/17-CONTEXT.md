# Phase 17: Monorepo Restructure - Context

**Gathered:** 2026-10-22
**Status:** Ready for planning

<domain>
## Phase Boundary

The repo becomes a Bun-workspaces monorepo. The backend moves from `src/server/` to `apps/server/src/` with a pure `git mv`, and the repo is installed by Bun 1.3.14 from a single `bun.lock`. The server behaves exactly as before from its new location: 853 tests, ≥80% coverage on every metric (~98.8% statements), `build`, `start-server` and `dev-server`, run from the root and from `apps/server`. Every moved file keeps its history.

Requirements: MONO-01..05, TOOL-05, TOOL-11. No runtime, toolchain-version or behavior changes. Node 24, tsx, TS 6, Biome 2, CORS and `createApp()` all belong to Phase 18. `apps/mobile` doesn't exist until Phase 19.

</domain>

<decisions>
## Implementation Decisions

### Already locked (roadmap / STATE, not re-discussed)
- **D-01:** Phase 17 ships as its own PR and is merged with a merge commit, not a squash, so the rename-only commit reaches `main`. — **Reversibility:** one-way — after a squash merge, the pure-rename commit and the `--follow`/blame history are gone from `main` for good.
- **D-02:** Order of work: the Bun 1.3.14 pin and the single lockfile (TOOL-05, MONO-05) land first, because root fan-out needs Bun 1.3's `--filter`. Then comes the rename-only commit. Config and path fixes land in later commits. The rename commit must show 100% similarity in `git show --stat -M`.
- **D-03:** Layout is `git mv src/server apps/server/src`, which drops one level and changes no relative import. The old root `package.json`, `tsconfig.json`, `vitest.config.mts` and `.env.example` are `git mv`'d into `apps/server/`. A new root `package.json` is created.

### Lint and format scripts
- **D-04:** Root `lint` stays a single `biome check .` run against the one root `biome.json`. It covers every workspace plus root files. Workspaces get no `lint` script. Root fan-out (`bun run --filter './apps/*' <script>`) applies to `test`, `test:coverage`, `build` and `typecheck` only. **Reword MONO-01 and Phase 17 success criterion 3** in REQUIREMENTS.md/ROADMAP.md to say this (lint runs once from the root and covers every workspace).
- **D-05:** `format` / `format:write` stay at the root unchanged, duplicating `lint` / `lint:fix`. The CI `style` job keeps calling `format`. `lint:fix`'s deprecated `--apply-unsafe` flag is left for Phase 18 (TOOL-10).

### Phase 17 / 18 boundary
- **D-06:** The `createApp()` extraction (sharing middleware wiring between `app.ts` and `test/app.ts`) is **deferred to Phase 18**, together with CORS. Phase 17 makes no code changes to `src/`.
- **D-07:** CI changes in Phase 17:
  - Codecov `files` → `./apps/server/coverage/clover.xml`.
  - `oven-sh/setup-bun@v2` with `bun-version-file: package.json`, so every job runs the `packageManager` Bun (1.3.14).
  - A tree-clean check after `bun install --frozen-lockfile` in every job (e.g. `git diff --exit-code` / `git status --porcelain` empty). This proves success criterion 4.
  - A `pull_request` trigger next to `push: main`, so this PR's own CI proves the gate.
  - **Not** in Phase 17: Codecov flags (Phase 19 adds `server`/`mobile` together), setup-node and action-major bumps (Phase 18), the per-workspace matrix (Phase 19).
- **D-08:** `.eslintrc`, `.eslintignore` and the stub `README.md` move untouched in the rename commit. A later commit deletes both ESLint files and deals with the stub README (see Claude's Discretion).

### Dependency versions and lockfile
- **D-09:** In the config commit, every existing `^` range in the moved `apps/server/package.json` (and in any root deps) is rewritten to the **exact version `bun.lock` already resolves**. Nothing installed changes. This matches `bunfig.toml`'s `exact = true` from the start.
- **D-10:** **No lockfile drift.** Regenerating `bun.lock` for the workspace layout under Bun 1.3.14 must leave every resolved version identical, except the intended `@vitest/coverage-v8` 2.1.5 → 3.2.6 (TOOL-11). Any other resolved-version change is a defect to fix before committing. Verify with a before/after diff of resolved versions. Upgrades belong to Phase 18. Never delete `bun.lock` to resolve a problem.
- **D-11:** Dependency placement stays as it is: `@types/*`, `nodemon` and `ts-node` remain in `dependencies`. Phase 18 removes or moves them.

### Package names, scripts, docs
- **D-12:** The server package is `@dash-tracker/server` and the root package stays `dash-tracker` (private, `workspaces: ["apps/*"]`, `packageManager: "bun@1.3.14"`).
- **D-13:** `apps/server` keeps `build`, `start-server`, `dev-server`, `test` and `test:coverage` under their current names and adds `typecheck`. The root adds `dev:server` → `bun run --filter @dash-tracker/server dev-server`. Superset `run` uses `bun run dev:server`. Phase 19 adds `dev:mobile` beside it.
- **D-14:** CLAUDE.md, AGENTS.md and README are updated for:
  - every path and command in the workspace layout, including the "imports rooted at `src/server/`" line;
  - the end of the Bun 1.0.31 workaround text: `packageManager` is now 1.3.14 and `bun install --frozen-lockfile` uses it directly;
  - the **complete endpoint list**, adding stops, favorites/recents, nearby, the prediction stream and vehicles, which are missing today;
  - a one-time note that developers move their local `.env` and `data/` into `apps/server/` by hand. No migration script, per the "no backward compatibility" principle.

### Claude's Discretion
- The stub `src/server/README.md` (moved to `apps/server/README.md`) can be deleted or replaced with a short, real server README, whichever avoids duplicating the root README.
- The exact `typecheck` command for `apps/server` (e.g. `tsc --noEmit`), as long as it type-checks the server, tests included or covered by vitest `--typecheck`.
- The `vitest.config.mts` path rewrites (`setupFiles` → `src/test/setup.ts`, coverage excludes → `src/test/**`, `src/app.ts`, `src/config/**`), the `tsconfig.json` adjustments and `.gitignore` checks. Keep behavior identical.
- How to make `rateLimit.test.ts` (reads `TRUST_PROXY_HOPS` from the local `.env`, Phase 14 WR-04) pass reliably once `.env` lives in `apps/server`. Pinning the value in `test/setup.ts` is acceptable.
- Exact `.superset/config.json` shape. It must install with `bun install --frozen-lockfile` and run the existing external setup script from `apps/server`, so it writes `apps/server/.env`.
- How `trustedDependencies` / better-sqlite3's native build is handled under Bun 1.3.14 in this phase. It must build and load. TOOL-07 formally closes in Phase 18.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and acceptance
- `.planning/ROADMAP.md` § "Phase 17: Monorepo Restructure": goal, 5 success criteria, notes (merge-commit decision, `rateLimit.test.ts` `.env` caveat)
- `.planning/REQUIREMENTS.md`: MONO-01..05, TOOL-05, TOOL-11 (MONO-01 wording to be amended per D-04)
- `.planning/STATE.md` § Blockers/Concerns: Phase 17 items (merge policy resolved = D-01; Phase 13 endpoint-list gap = D-14; Phase 14 WR-04; Phase 15 `upstreamRateLimit.test.ts` flaky timeout under root coverage; Bun 1.0.31 `bunx` signal forwarding to re-check)

### Research (v0.7)
- `.planning/research/SUMMARY.md`: Phase 17 delivery outline, pitfalls 1–3
- `.planning/research/ARCHITECTURE.md`: target tree, root `package.json` / fan-out scripts, verified `--filter` behavior on 1.3.14 (root excluded, cwd = workspace), `.env`/`data/` relocation table, git history preservation, CI notes. Note: its `createApp()` placement in Phase 17 is overridden by D-06; its root `lint` shape matches D-04.
- `.planning/research/PITFALLS.md`: linker flip, lockfile drift, trustedDependencies, lost history / cwd-relative paths
- `.planning/research/STACK.md`: Bun 1.3.14 + `bunfig.toml` settings

### Project rules
- `.claude/CLAUDE.md` and `AGENTS.md`: conventions and engineering principles (no backward compat, simplest implementation). Both are also files this phase edits.

</canonical_refs>

<code_context>
## Existing Code Insights

### Current layout (pre-move)
- Root: `package.json` (`dash-tracker`, `packageManager: bun@1.0.31`, all server deps), `tsconfig.json` (`rootDir: ./src`, `include: src/**/*`), `vitest.config.mts` (`root` = config dir, `setupFiles: src/server/test/setup.ts`, coverage excludes `src/server/test/**`, `src/server/app.ts`, `src/server/config/**`), `biome.json`, `.env`/`.env.example`, `.node-version`, `bun.lock` (tracked), `bun.lockb` (untracked), `package-lock.json` (tracked, stale)
- `src/` holds only `server/`: `app.ts`, `api/`, `config/`, `test/` (`app.ts`, `setup.ts`, `streamClient.ts`), plus `.eslintrc`, `.eslintignore`, `README.md` (stub)

### Established Patterns
- `config/environment.ts` calls `dotenv.config()` (cwd `.env`), and `DB_PATH` defaults to the cwd-relative `data/dash-tracker.sqlite`. With workspace scripts running at cwd = `apps/server`, `.env` and `data/` move there with no code change.
- All imports are relative within the tree, so moving `src/server` → `apps/server/src` changes none of them.
- `tsconfig.json` with `rootDir: ./src` keeps working unchanged when moved to `apps/server/`.

### Integration Points
- `.github/workflows/ci.yml`: 4 jobs (build, lint, style, test), `push: main` only, `setup-bun@v2` with no version file, Codecov `./coverage/clover.xml`
- `.superset/config.json`: `setup: ["bun install", "[ -f .env ] || /Users/trawal/.superset/dash-tracker-setup.sh"]`, `run: ["bun run dev-server"]`. The external script writes `$(pwd)/.env`.
- `.gitignore`: the `.env`, `data/`, `coverage`, `dist` patterns are unanchored, so they still match under `apps/server`. Verify.

</code_context>

<specifics>
## Specific Ideas

- The gate is literal: `git show --stat -M` on the move commit shows only 100% renames, and `git log --follow` / `git blame` on a moved file reach past the move.
- Run the coverage gate from both the root and `apps/server`. Watch `upstreamRateLimit.test.ts`'s 5 s timeout under root-run coverage load (Phase 15 note), and raise that test's timeout if it flakes.

</specifics>

<deferred>
## Deferred Ideas

- `createApp()` extraction → Phase 18 (with CORS)
- Codecov `server` / `mobile` flags → Phase 19 (CI matrix)
- Dropping the duplicate `format` / `format:write` scripts: not planned; revisit if Phase 18's Biome 2 work makes them redundant
- Fixing `lint:fix`'s deprecated flag → Phase 18 (TOOL-10)

</deferred>

---

*Phase: 17-monorepo-restructure*
*Context gathered: 2026-10-22*
