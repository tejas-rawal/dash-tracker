---
phase: 01-consolidate-lint-format-tooling
plan: 01
subsystem: infra
tags: [biome, prettier, tooling, package.json, lockfile]

# Dependency graph
requires: []
provides:
  - Biome-only lint/format toolchain (package.json scripts, biome.json)
  - Regenerated bun.lockb / package-lock.json with Prettier removed
  - Prettier config files and editor references deleted
affects: [phase-02-full-codebase-reformat]

# Actuals (#2632)
actuals:
  tokens: 30346
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "biome check . / biome check . --write as the single lint+format entrypoint (mirrors existing lint/lint:fix)"

key-files:
  created: []
  modified:
    - package.json
    - biome.json
    - bun.lockb
    - package-lock.json
    - .vscode/settings.json
    - .vscode/extensions.json

key-decisions:
  - "Removed **/package.json from biome.json files.ignore (D-01) and applied biome format --write to package.json itself, since Task 1's own edit newly brought it into Biome's scope"
  - "Applied biome format --write to .vscode/settings.json and .vscode/extensions.json (Task 2's own files) for the same reason"
  - "Did NOT reformat src/*.ts, tsconfig.json, or vitest.config.mts — full codebase reformat is explicitly Phase 2 scope per PROJECT.md, and CLAUDE.md/CONTEXT.md decision D-mass-reformat requires it land as its own separate commit"

requirements-completed: [TOOL-01, TOOL-02, TOOL-03]

coverage:
  - id: D1
    description: "package.json/biome.json rewired to Biome-only lint/format toolchain; Prettier field, 3 devDependencies removed; lockfiles regenerated"
    requirement: "TOOL-01"
    verification:
      - kind: other
        ref: "node -e package.json/biome.json assertion script (Task 1 <verify>)"
        status: pass
      - kind: other
        ref: "grep -a -qi prettier bun.lockb / package-lock.json (Task 1 <verify>)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Prettier config/ignore files deleted; .vscode/settings.json and .vscode/extensions.json no longer reference Prettier"
    requirement: "TOOL-02"
    verification:
      - kind: other
        ref: "Task 2 <verify> node -e assertion script + test ! -f .prettierrc/.prettierignore"
        status: pass
    human_judgment: false
  - id: D3
    description: "package.json format/format:write scripts invoke Biome, mirroring the existing lint/lint:fix pattern"
    requirement: "TOOL-03"
    verification:
      - kind: other
        ref: "node -e package.json scripts assertion (Task 1 <verify>)"
        status: pass
    human_judgment: false
  - id: D4
    description: "bun run build and bun run test pass unaffected by the tooling swap"
    verification:
      - kind: other
        ref: "bun run build (tsc, exit 0)"
        status: pass
      - kind: unit
        ref: "bun run test (vitest --run --typecheck, 11 files / 141 tests, exit 0)"
        status: pass
    human_judgment: false
  - id: D5
    description: "bun run lint / bun run format exit 0 across the whole repository"
    verification: []
    human_judgment: true
    rationale: "bun run lint (biome check .) still fails on ~14 pre-existing, out-of-scope files (src/**/*.ts, tsconfig.json, vitest.config.mts) that were never Biome-formatted. Reformatting them is explicitly Phase 2 scope per PROJECT.md ('Applying the new formatter across the full repo is out of scope — that's Phase 2') and a separate landed commit per CONTEXT.md's decision. All files within this plan's <files_modified> scope (package.json, biome.json, .vscode/*.json) pass biome check cleanly. A human/verifier should confirm this scoping is acceptable rather than auto-passing a criterion this plan cannot satisfy without violating the phase boundary."

# Metrics
duration: 18min
completed: 2026-08-26
status: complete
---

# Phase 01 Plan 01: Consolidate Lint & Format Tooling Summary

**Biome is now the sole lint/format tool — Prettier, its plugin, and its config are fully removed from package.json, both lockfiles, and editor tooling, with format scripts rewired to `biome check .` / `biome check . --write`.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-08-26T09:00:00Z (approx.)
- **Completed:** 2026-08-26T09:17:19-04:00
- **Tasks:** 2
- **Files modified:** 8 (package.json, biome.json, bun.lockb, package-lock.json, .vscode/settings.json, .vscode/extensions.json, .prettierrc [deleted], .prettierignore [deleted])

## Accomplishments
- `package.json` `format`/`format:write` scripts now invoke `biome check .` / `biome check . --write` (previously `prettier --check .` / `prettier --check . --write`)
- Removed the top-level `"prettier": "@jonahsnider/prettier-config"` field and 3 devDependencies (`prettier`, `@jonahsnider/prettier-config`, `prettier-plugin-packagejson`)
- `biome.json`'s `files.ignore` no longer excludes `**/package.json`, so Biome now covers it like every other file (closes the gap left by dropping `prettier-plugin-packagejson`) — formatter block (120/4-space/double-quote) left byte-identical
- Regenerated `bun.lockb` (via `bun install`) and `package-lock.json` (via `npm install`); both confirmed free of any `prettier` reference
- Deleted `.prettierrc` and `.prettierignore` entirely
- `.vscode/settings.json`: global `editor.defaultFormatter` → `biomejs.biome`; removed the 6 now-redundant per-language override blocks
- `.vscode/extensions.json`: dropped `esbenp.prettier-vscode` from `recommendations`

## Task Commits

Each task was committed atomically:

1. **Task 1: Swap package.json + biome.json to Biome-only lint/format, regenerate lockfiles** - `5303bfa` (feat)
2. **Task 2: Remove Prettier config files and stale editor/tooling references** - `a2ede5a` (chore)

_Note: no TDD tasks in this plan (config/tooling only, `tdd="false"` on both tasks)._

## Files Created/Modified
- `package.json` - Removed `prettier` field and 3 devDependencies; rewired `format`/`format:write` to Biome; content reformatted to Biome's style (4-space/double-quote) since it's newly in scope
- `biome.json` - Removed `**/package.json` from `files.ignore`; formatter block unchanged (verified byte-identical)
- `bun.lockb` - Regenerated via `bun install`; no longer resolves the 3 removed packages
- `package-lock.json` - Regenerated via `npm install`; no longer resolves the 3 removed packages
- `.prettierrc` - Deleted
- `.prettierignore` - Deleted
- `.vscode/settings.json` - Global `editor.defaultFormatter` → `biomejs.biome`; removed 6 redundant per-language blocks; reformatted to Biome's style
- `.vscode/extensions.json` - Removed `esbenp.prettier-vscode` from `recommendations`; reformatted to Biome's style

## Decisions Made
- Since Task 1's own edit to `biome.json` newly brought `package.json` into Biome's lint/format scope (per D-01), and Task 2's edits to `.vscode/settings.json`/`.vscode/extensions.json` are those files' own content changes, applied `biome check --write` to exactly those 3 files so each task's own `<verify>`/`<acceptance_criteria>` (which chain `bun run lint`) could pass without touching any file outside the task's declared scope.
- Did NOT run a repo-wide `biome check --write` or touch any `src/**/*.ts`, `tsconfig.json`, or `vitest.config.mts` file — PROJECT.md explicitly scopes "Full codebase reformatted under Biome's formatter... landed as its own commit separate from the config/dependency change" to a future phase (Phase 2), and CONTEXT.md's phase boundary states "Applying the new formatter across the full repo is out of scope — that's Phase 2."

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing Bun 1.0.31 runtime via proto**
- **Found during:** Task 1 (`bun install` to regenerate `bun.lockb`)
- **Issue:** The worktree's `proto`-managed toolchain didn't have Bun 1.0.31 installed, so `bun install` failed immediately with `missing_tool`.
- **Fix:** Ran `proto install bun 1.0.31` (installing the pinned runtime itself, not a project package — outside the package-manager-install exclusion in Rule 3) to unblock the task.
- **Files modified:** None (toolchain-only, no repo files changed).
- **Verification:** `bun --version` reports `1.0.31`; `bun install` then completed successfully.
- **Committed in:** N/A (environment setup, not a repo change).

**2. [Rule 1/2 - In-scope fix] Applied Biome formatting to package.json, .vscode/settings.json, .vscode/extensions.json**
- **Found during:** Task 1 and Task 2 acceptance-criteria verification (`bun run lint` / `bun run format`)
- **Issue:** These 3 files were previously tab-indented (never run through `biome check --write`), so once brought into Biome's scope by this plan's own edits (D-01 for `package.json`; direct content edits for the `.vscode` files), `bun run lint` failed on them specifically.
- **Fix:** Ran `bunx biome check <file> --write` on exactly these 3 files (no others). Content was already correct per the plan's `<action>`; this only normalized indentation/quoting to match `biome.json`'s formatter settings.
- **Files modified:** `package.json`, `.vscode/settings.json`, `.vscode/extensions.json`
- **Verification:** Re-ran each task's full `<verify>` node-assertion scripts — all pass; `bunx biome check <file>` on each reports "No fixes applied" (clean).
- **Committed in:** `5303bfa` (package.json), `a2ede5a` (.vscode files)

---

**Total deviations:** 2 auto-fixed (1 blocking/toolchain, 1 in-scope formatting fix)
**Impact on plan:** Both were necessary for the plan's own tasks to pass their stated acceptance criteria. No scope creep — formatting was applied only to files each task itself edits/newly brings into Biome's scope, never to files outside `<files_modified>`.

## Issues Encountered

**`bun run lint` / `bun run format` still fail at the whole-repo level** (not a plan deviation, a scoping note): after both tasks, `bunx biome check .` still reports formatting violations on ~14 pre-existing files never touched by this plan — `src/server/api/controllers/*.ts` (+ `.test.ts`), `src/server/api/models/*.ts` (+ `.test.ts`), `src/server/api/errors/index.ts` (+ `.test.ts`), `src/server/api/repositories/index.ts`, `src/server/config/logger.ts`, `src/server/test/app.ts`, `src/server/test/setup.ts`, `tsconfig.json`, `vitest.config.mts`. All of these use tab indentation and were never run through a formatter matching `biome.json`'s declared style (4-space/double-quote). This is explicitly out of scope for this plan: PROJECT.md's Active requirements list "Full codebase reformatted under Biome's formatter with zero outstanding diffs, landed as its own commit separate from the config/dependency change" as a distinct requirement, and CONTEXT.md's `<domain>` section states "Applying the new formatter across the full repo is out of scope — that's Phase 2." Every file within this plan's own `<files_modified>` list passes `biome check` cleanly; `bun run build` and `bun run test` both pass with zero errors. Logged to `.planning/WINDOWS.md` (deviation, phase 01) for ship-gate visibility.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Biome-only toolchain is live and correctly configured; `package.json`, `biome.json`, both lockfiles, and editor tooling are Prettier-free.
- Phase 2 (full codebase reformat) can now run `bun run format:write` (or `biome check . --write`) across the whole repo as its own commit — the toolchain foundation it depends on is in place and verified.
- No blockers.

---
*Phase: 01-consolidate-lint-format-tooling*
*Completed: 2026-08-26*

## Self-Check: PASSED

- FOUND: `.planning/phases/01-consolidate-lint-format-tooling/01-01-SUMMARY.md`
- FOUND: `.prettierrc` removed (file does not exist)
- FOUND: `.prettierignore` removed (file does not exist)
- FOUND: commit `5303bfa` (Task 1)
- FOUND: commit `a2ede5a` (Task 2)
- FOUND: commit `d4f4e4c` (SUMMARY)
