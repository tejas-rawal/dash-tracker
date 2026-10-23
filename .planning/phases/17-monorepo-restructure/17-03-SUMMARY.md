---
phase: 17-monorepo-restructure
plan: 03
subsystem: infra
tags: [superset, bun, workspaces, monorepo, docs, signals]

# Dependency graph
requires:
  - phase: 17-02
    provides: "Server in apps/server (@dash-tracker/server) with cwd-relative dev-server, root fan-out scripts, typecheck via tsconfig.typecheck.json, and the finding that bun run --filter drops SIGTERM"
provides:
  - "Superset worktrees install frozen, write apps/server/.env, and run the server with cd apps/server && exec bun run dev-server; SIGTERM and SIGINT to the run command leave no orphans"
  - "CLAUDE.md and AGENTS.md describe the workspace layout, Bun 1.3.14 commands, apps/server paths and the complete endpoint list"
  - "README section for the repository layout and local development, with the one-time move note"
  - "MONO-01 and Phase 17 success criterion 3 reworded per D-04 (fan-out for test/test:coverage/build/typecheck, one root Biome lint)"
affects: [phase-18-tooling, phase-19-mobile, gsd-ship]

# Actuals (#2632) — chars/4 over the realized diff
actuals:
  tokens: 6168
  tasks: 3
  commits: 3
plan_head_before: 7dd9fa2c604407347223a86bee0e4c6ed5877808
plan_head_after: 8c4e783d4370e21daa6ae812a3db3043ae5a19fb

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Automated runners exec the workspace script from its directory (cd apps/server && exec bun run dev-server) so stop signals reach bun; the root --filter script is for humans (Ctrl-C)"
    - "The external Superset setup script runs from apps/server, so the env file lands where dotenv looks; an existing file is never overwritten"
    - "AGENTS.md shared sections are copied verbatim from CLAUDE.md, so the two cannot drift"

key-files:
  created:
    - .planning/phases/17-monorepo-restructure/17-03-SUMMARY.md
  modified:
    - .superset/config.json
    - .claude/CLAUDE.md
    - AGENTS.md
    - README.md
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md

key-decisions:
  - "Superset run is cd apps/server && exec bun run dev-server (D-13 amendment); exec makes bun replace the shell so SIGTERM and SIGINT reach it under any /bin/sh"
  - "Docs describe the result, not the history: no old server-root path and no old Bun version appear anywhere in CLAUDE.md, AGENTS.md, README, .github or .superset"

patterns-established:
  - "Fresh-worktree simulation: detached temp worktree, committed setup run twice (idempotence by mtime), run command through sh -c, signal to the run PID only, survivor check before any safety-net kill"

requirements-completed: [MONO-04, MONO-01]

coverage:
  - id: D1
    description: "A fresh worktree sets up with the committed .superset/config.json (frozen install, apps/server/.env written, no root env file, idempotent re-run) and serves /api/v1/health/live through the run command"
    requirement: MONO-04
    verification:
      - kind: e2e
        ref: "Task 1 verify 1 (fresh-worktree simulation) -> 'setup ok and idempotent', {\"status\":\"ok\"} twice, exit 0 (run on a95509d and again on 8c4e783)"
        status: pass
      - kind: other
        ref: "Task 1 verify 2 -> 'superset config ok' and 'no stray worktree'"
        status: pass
    human_judgment: false
  - id: D2
    description: "SIGTERM and SIGINT to the Superset run command's PID stop bun, nodemon and ts-node and free port 3997 within 15 s"
    requirement: MONO-04
    verification:
      - kind: e2e
        ref: "Task 1 verify 1 -> 'SIGTERM: no orphans, port 3997 free' and 'SIGINT: no orphans, port 3997 free' (survivor check runs before any safety-net kill)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A real Superset workspace sets up, runs and stops cleanly from the Superset UI, whatever signal Superset sends"
    requirement: MONO-04
    verification: []
    human_judgment: true
    rationale: "The simulation reproduces a runner with sh -c and a direct signal; Superset's own runner and the signal it sends can only be observed in a real workspace (end-of-phase UAT item 1)"
  - id: D4
    description: "CLAUDE.md and AGENTS.md document the workspace layout, Bun 1.3.14 commands, fan-out, typecheck via tsconfig.typecheck.json, apps/server/.env and data/, the one-time move and the complete endpoint list, with no stale paths and GSD markers intact"
    requirement: MONO-04
    verification:
      - kind: other
        ref: "Task 2 verify 1 -> 'no old paths or old Bun pin'"
        status: pass
      - kind: other
        ref: "Task 2 verify 2 -> 'docs complete' (20 required strings in both files, setup.ts in CLAUDE.md)"
        status: pass
      - kind: other
        ref: "Task 2 verify 3 -> 'GSD markers intact'"
        status: pass
    human_judgment: false
  - id: D5
    description: "README has the repository layout and local development section with the one-time move and an AGENTS.md pointer; no stale path anywhere in .claude, AGENTS.md, README, .github or .superset"
    requirement: MONO-04
    verification:
      - kind: other
        ref: "Task 3 verify 1 -> 'README ok; no stale paths anywhere'"
        status: pass
    human_judgment: false
  - id: D6
    description: "MONO-01 and Phase 17 success criterion 3 say that test/test:coverage/build/typecheck fan out and lint runs Biome once from the root (D-04)"
    requirement: MONO-01
    verification:
      - kind: other
        ref: "Task 3 verify 2 -> 'D-04 wording in place'"
        status: pass
    human_judgment: false
  - id: D7
    description: "Developers' existing root env file and data/ keep working after the one-time manual move into apps/server"
    requirement: MONO-04
    verification: []
    human_judgment: true
    rationale: "The move is a manual step by design (D-14, no migration script) and touches a real secret file the executor may not read or move; end-of-phase UAT item 2"

# Metrics
duration: 4min
completed: 2026-10-23
status: complete
---

# Phase 17 Plan 03: Superset Worktrees and Docs on the apps/server Layout Summary

**Superset worktrees now install frozen, write `apps/server/.env`, and run the server through `cd apps/server && exec bun run dev-server`. A simulated fresh worktree showed that SIGTERM or SIGINT to that run command leaves no bun, nodemon or ts-node process and frees the port. CLAUDE.md, AGENTS.md and README describe the workspace layout, the Bun 1.3.14 commands, the complete endpoint list (14 endpoints) and the one-time move of a root env file and `data/`. MONO-01 and Phase 17 success criterion 3 now say that lint is one root Biome run (D-04).**

## Performance

- **Duration:** 4 min
- **Started:** 2026-10-23T17:27:39Z
- **Completed:** 2026-10-23T17:31:11Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- **`.superset/config.json`:**
  - `setup` is `bun install --frozen-lockfile`, followed by `[ -f apps/server/.env ] || (cd apps/server && /Users/trawal/.superset/dash-tracker-setup.sh)`.
  - `run` is `cd apps/server && exec bun run dev-server`.
  - The root `dev:server` script is unchanged (`bun run --filter @dash-tracker/server dev-server`), for humans.
- **CLAUDE.md and AGENTS.md:**
  - **Commands:** install on Bun 1.3.14 from `packageManager`; `dev:server`; build, typecheck and test fan out; lint and format run Biome once from the root; both single-test forms; `apps/server/.env` and `apps/server/data/`; the `One-time move:` note.
  - **Monorepo:** a new stack bullet. Zod 3.25.76 and `@vitest/coverage-v8` 3.2.6 are listed, and every path uses `apps/server/src/`.
  - **Endpoints:** the full list of 14, with the X-Device-Id note.
  - **Testing (CLAUDE.md only):** names `apps/server/src/test/setup.ts` and the `TRUST_PROXY_HOPS=0` pin.
- **README:** a new `## Repository layout and local development` section after the Project Overview, covering:
  - the layout;
  - prerequisites;
  - seven root commands;
  - local config;
  - the one-time move;
  - a pointer to AGENTS.md.
- **REQUIREMENTS.md and ROADMAP.md:** MONO-01 and success criterion 3 use the D-04 wording. The traceability row `| MONO-01 | Phase 17 |` is unchanged.

## Verification Evidence

### Fresh-worktree simulation (Task 1, verify 1)

The simulation ran on the Task 1 commit `a95509d` and again on the final HEAD `8c4e783`. Both runs produced identical output. The env file's content was never read or printed.

```
setup ok and idempotent
{"status":"ok"}
SIGTERM: no orphans, port 3997 free
{"status":"ok"}
SIGINT: no orphans, port 3997 free
EXIT=0
```

Verify 2 printed `superset config ok` and `no stray worktree`. Afterwards, `git worktree list` showed only the four checkouts that existed before. No nodemon or ts-node process was running, and port 3997 was free. The safety-net kill runs only after the survivor check, so these lines show that the signal alone stopped everything.

### Doc gates (Tasks 2 and 3)

| Gate | Result |
|------|--------|
| `git grep -e 'src/server' -e '1\.0\.31' -- .claude/CLAUDE.md AGENTS.md` | `no old paths or old Bun pin` |
| 20 required strings in both files, plus `apps/server/src/test/setup.ts` in CLAUDE.md | `docs complete` |
| GSD marker count vs the 17-02 rename commit | `GSD markers intact` |
| `grep -nE 'DASH_API_KEY=[^ ]'` in CLAUDE.md, AGENTS.md, README.md | nothing printed |
| No claim that tests are not type-checked | nothing printed |
| `git grep -e 'src/server' -e '1\.0\.31' -- .claude AGENTS.md README.md .github .superset` | exit 1, nothing printed (`README ok; no stale paths anywhere`) |
| `git grep 'coverage/clover' -- .github .claude AGENTS.md README.md` | only `.github/workflows/ci.yml:118: files: ./apps/server/coverage/clover.xml` |
| MONO-01 and success criterion 3 | `D-04 wording in place` |
| `bun run lint` | exit 0, `Found 36 warnings.` (the pre-existing set), 0 errors |

Both documented single-test commands run `src/api/models/BusRoute.test.ts` (12 tests passed), from the root with `--filter @dash-tracker/server` and from inside `apps/server`.

## Task Commits

1. **Task 1: Fresh Superset worktree end to end (tracer)** - `a95509d` (build)
2. **Task 2: CLAUDE.md and AGENTS.md describe the workspace** - `61ea337` (docs)
3. **Task 3: README dev section and D-04 wording** - `8c4e783` (docs)

**Plan metadata:** the docs commit for this SUMMARY and the STATE/ROADMAP/REQUIREMENTS update.

## Files Created/Modified

- `.superset/config.json`: frozen install, env setup from `apps/server`, and the exec'd run command (Biome-formatted).
- `.claude/CLAUDE.md`: Commands, Testing, Technology Stack, Conventions and Architecture rewritten for the workspace. All GSD markers are kept.
- `AGENTS.md`: the same Commands, Technology Stack, Conventions and Architecture content as CLAUDE.md, copied section by section. It has no Testing section.
- `README.md`: the new `## Repository layout and local development` section. The product-vision content is untouched.
- `.planning/REQUIREMENTS.md`: MONO-01 description (D-04).
- `.planning/ROADMAP.md`: Phase 17 success criterion 3 (D-04).

## Decisions Made

- **`exec` in the run command.** This is the planner's addition, which the plan says must stay. Bun replaces the shell, so a stop signal aimed at the run command's PID reaches bun under `/bin/sh` (bash on this machine), and bun forwards it to nodemon. Both signals were proven.
- **AGENTS.md is synced from CLAUDE.md, not retyped.** A small script copied each shared section body out of CLAUDE.md, so the two files hold the same text for Commands, Technology Stack, Conventions and Architecture.
- **Add-dependency guidance.** The docs now say to run `bun add <package>@<version>` with an exact version inside the workspace directory that uses it. The root `bunfig.toml` applies the exact-pin and 7-day release-age gates, so no flags are needed.

## Merge policy

**Merge policy (D-01):** the Phase 17 PR must be merged with a merge commit, never a squash. A squash would remove the rename-only commit `0be937b`, and with it the `git log --follow` and `git blame` history that reaches past the move. `/gsd-ship` must use a merge commit.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The SIGTERM orphan that 17-02 recorded for the root `dev:server` (`bun run --filter`) does not affect the Superset run command, which calls the workspace script without `--filter`. Humans still stop `bun run dev:server` with Ctrl-C. The follow-up to re-check `--filter` signal forwarding after the Phase 18 tsx swap still stands.

## End-of-phase UAT (human-check from Task 3)

1. Create a new Superset workspace from this branch. Confirm that:
   - setup finishes (`bun install --frozen-lockfile`, then `apps/server/.env` is written);
   - the run command (`cd apps/server && exec bun run dev-server`) starts the server;
   - `http://localhost:{PORT from apps/server/.env}/api/v1/health/live` returns 200.

   Then stop the run from Superset and confirm that `pgrep -fl 'nodemon|ts-node'` lists nothing from that workspace and the port no longer answers.
2. In your main checkout, move any root `.env` and `data/` into `apps/server/` (the one-time move). Confirm that `bun run dev:server` starts and that your existing favorites and recents are still there.
3. Confirm that the Phase 17 PR is merged with a merge commit, not a squash (D-01).

## User Setup Required

None for external services. The one-time move of the local env file and `data/` into `apps/server/` is UAT item 2 above. This checkout still has its env file at the repo root.

## Next Phase Readiness

- Phase 17's last plan is done. The phase is ready for verification and the end-of-phase UAT above.
- The deferred streamConcurrencyCap hang from 17-02 is still open in `deferred-items.md` and `.planning/WINDOWS.md`.

---
*Phase: 17-monorepo-restructure*
*Completed: 2026-10-23*

## Self-Check: PASSED

- Files exist: .superset/config.json, .claude/CLAUDE.md, AGENTS.md, README.md, .planning/REQUIREMENTS.md, .planning/ROADMAP.md.
- Commits are ancestors of HEAD: a95509d, 61ea337, 8c4e783. The measured count for 7dd9fa2..HEAD is 3.
- Every task's acceptance criteria and the plan-level verification were re-run on the final tree, and all passed.
