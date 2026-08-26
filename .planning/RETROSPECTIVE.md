# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v0.1 — Tooling Cleanup

**Shipped:** 2026-08-26
**Phases:** 2 | **Plans:** 2 | **Sessions:** 1 (planning across 2 days, execution same-day)

### What Was Built
- Biome established as the sole lint/format tool — Prettier, `@jonahsnider/prettier-config`, and `prettier-plugin-packagejson` fully removed from dependencies, config, and scripts
- Entire repository (29 tracked files) reformatted under Biome, landed as a single isolated, purely-cosmetic commit separate from the tooling/config change
- `bun run format`/`bun run lint` now exit 0 repo-wide (from 35 errors), with build and all 141 tests unchanged

### What Worked
- Splitting "swap the tool" (Phase 1) from "apply the tool repo-wide" (Phase 2) kept each commit reviewable and let Phase 2's diff be verified as purely cosmetic (idempotent second `--write`, byte-identical `biome.json`/`package.json`)
- Locking explicit prohibitions in the plan (`git add -u` only, never `-A`/`.`; no touching the 10-15 documented residual warnings) gave the executor a precise, checkable boundary — the independent verifier re-ran every check from scratch rather than trusting the SUMMARY, and it held up

### What Was Inefficient
- Three failed dispatch attempts before the reformat actually ran: the harness's native `Agent(isolation="worktree")` creates worktrees from `origin/main`, but local `main` was 28 commits ahead (all GSD planning commits were unpushed) — every worktree agent correctly halted on its `worktree_branch_check` rather than working against a stale tree
- The first fix attempt (`gsd_run worktree set-baseref` → `head`) didn't help, because that setting only affects GSD's own `orchestrator-worktree` creation path, not this project's `harness-worktree` isolation model — wasted a full dispatch cycle
- Forcing `workflow.use_worktrees=false` via `.planning/config.json` looked like the fix but nearly polluted the reformat commit, since `config.json` is itself one of Phase 2's `files_modified` targets; the working fix was `gsd_run query dispatch-isolation --force-isolation none` immediately before each dispatch, which writes to an untracked run-scoped sentinel instead
- Orchestrator bookkeeping (`state.begin-phase`, the config edit) run *before* dispatch collided with the plan's strict "clean git status" precondition — right order is: leave STATE.md/ROADMAP.md untouched until after the plan's own commit, exactly as the executor's own instructions already say

### Patterns Established
- When a phase's precondition requires a clean git tree before a formatter runs, do the orchestrator's own state/config bookkeeping *after* plan execution, not before
- Prefer `gsd_run query dispatch-isolation --force-isolation <mode>` over editing `.planning/config.json` when forcing isolation off for a single dispatch — it doesn't touch a tracked file that might be in the plan's own scope

### Key Lessons
1. If local `main` carries commits not yet on `origin/main`, harness-managed worktree isolation (`isolation="worktree"`) will silently check out a stale base — push before relying on isolated parallel dispatch, or expect `worktree_branch_check` halts
2. A plan's `files_modified` list can include `.planning/config.json` itself; never mutate that file for orchestration purposes (e.g. isolation toggles) while such a plan is in flight — use the isolation sentinel (untracked, `.gsd/`) instead
3. Biome can surface a handful of additional `suppressions/unused` warnings only once a file is already formatted (14-15 vs. the 10 originally counted pre-reformat) — this is expected, not a regression, as long as the acceptance criterion is a threshold ("at least N") rather than an exact count

### Cost Observations
- Sessions: 1
- Notable: three wasted executor dispatches (2 worktree halts + 1 precondition halt) before the actual reformat task ran — all diagnostic/config-fixing overhead, no wasted source-file edits

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v0.1 | 1 | 2 | First milestone — established Biome-only tooling baseline |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|---------------------|
| v0.1 | 141 | (80% threshold enforced, not separately measured this milestone) | 0 (Prettier removed, no new deps added) |

### Top Lessons (Verified Across Milestones)

1. Keep local `main` pushed to `origin` when the runtime's worktree isolation bases off the remote branch — otherwise isolated dispatch fails closed on every attempt
