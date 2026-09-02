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

## Milestone: v0.2 — Real-Time Arrival Predictions

**Shipped:** 2026-08-27
**Phases:** 2 | **Plans:** 3 | **Sessions:** 1 (planning + execution same session)

### What Was Built
- Stop discovery: `GET /api/v1/routes/:shortName/stops` (grouped by direction) and `GET /api/v1/stops/nearby` (haversine distance, radius/count bounds, capped at 50)
- Live predictions: `GET /api/v1/predictions/stream?stop={id}` SSE endpoint backed by `PredictionStreamService`, one shared 30s upstream poll loop per subscribed stop, started on first subscriber and stopped when idle
- REST predictions endpoint kept fully independent as a fallback path; `generatedAt` freshness timestamp added to both REST and SSE payloads

### What Worked
- Pattern-mapping before planning (gsd-pattern-mapper) correctly identified `StopService`/`PredictionService` as the DI/factory analogs, so the planner didn't need to rediscover conventions from scratch
- The tracer-first task ordering (Task 1 = full production-quality SSE endpoint end-to-end, verified before expansion tasks) meant the hardest integration risk (shared poll loop lifecycle) was proven working before test-hardening and freshness-timestamp tasks were even started
- The 3-iteration code-review fix/re-review loop genuinely converged: Critical → Warning → Warning+Info, with each pass independently re-verifying the fix against source rather than trusting the fixer's own narrative — caught that a "fixed" issue (WR-01/WR-03) had reintroduced a narrower version of itself before it could ship

### What Was Inefficient
- The code-review auto-loop's max-iteration cap (3) was reached without fully converging to zero findings — the residual WR-05 (async socket-error path unguarded) is real but lower-severity, and stopping there was the right call, but it means "clean" review status was never achieved for this phase, only "acceptable residual risk"
- A pre-existing, unrelated uncommitted change to `BusDataRepository.ts` (dirty working-tree state that predated the session) got swept into the automated fix pipeline's worktree and committed to `main` without being flagged before the fact — only caught after the fact by inspecting `git log` diffs before merging. The fix itself was correct and matched the pre-existing diff exactly, but it was out of scope and not something the user had approved for this session
- Single-plan phases still went through the full worktree-isolation dispatch machinery (a hard guard blocked a plain non-worktree Agent() dispatch even with zero parallelism risk) — correct per policy, but added merge/cleanup overhead that pure sequential execution wouldn't have needed

### Patterns Established
- Spawn `gsd-code-reviewer` → `gsd-code-fixer` → re-review as a loop, stopping either on `status: clean` or a fixed iteration cap (3), and document whatever remains as residual risk in `VERIFICATION.md` rather than treating "some issues left" as a blocker when they don't violate the phase's stated requirements
- When merging a worktree-isolated executor's branch back to main, diff the merge range file-by-file before merging if the main working tree has any pre-existing uncommitted changes — don't assume dirty local state is unrelated just because the executor worked in isolation

### Key Lessons
1. An isolated executor/fixer worktree is isolated from *your* concurrent edits, but its `git commit`/fast-forward-to-main step can still pick up whatever was *already* uncommitted on `main` before it started — check `git status` and diff any pre-existing dirty files against the merge range, don't assume worktree isolation makes cross-contamination impossible
2. A code-review auto-fix loop that trends toward zero (Critical → Warning → Warning) but doesn't fully reach it is a legitimate stopping point, not a failure — cap it, document the residual, and let phase verification decide whether the residual violates any actual requirement
3. Pattern-mapping (gsd-pattern-mapper) before planning is cheap (~1-5 min subagent) and pays for itself by giving the planner concrete analog code to imitate instead of re-deriving DI/error-handling conventions per phase

### Cost Observations
- Sessions: 1
- Model mix: not tracked separately this milestone
- Notable: the code-review fix cycle (3 review passes + 2 fixer passes) was the single largest cost driver after initial execution — proportional to the severity of what it caught (3 Critical concurrency bugs), so worth it, but a phase with a cleaner first-pass implementation would have skipped 2 of the 3 iterations entirely

---

## Milestone: v0.3 — Favorited & Recent Routes

**Shipped:** 2026-09-01
**Phases:** 3 | **Plans:** 4

### What Was Built
- `FavoritesRecentsRepository`: a singleton, WAL-mode SQLite repository with atomic upsert CRUD for favorites and recents, covering both routes and stops through one entity-typed table per concern, wired into `app.ts`'s startup/shutdown lifecycle alongside `BusDataRepository`
- Anonymous device-scoped Favorites HTTP API (`POST`/`DELETE`/`GET /api/v1/favorites`) with a reusable `requireDeviceId` middleware, entity hydration via `BusDataRepository`, and idempotent add/no-op-remove semantics
- Fire-and-forget stop/route recents logging on every REST prediction lookup, cap-at-5 oldest-evicted-first eviction inside `upsertRecent`, and `GET /api/v1/recents` mirroring the Favorites pattern
- 313/313 tests passing at ship, all 13 v0.3 requirements (FAV-01..05, RECENT-01..06, DEVICE-01, PERSIST-01) delivered

### What Worked
- Sequencing the repository (Phase 5) before both feature phases meant Favorites (Phase 6) and Recents (Phase 7) could both build on one already-tested persistence layer instead of each inventing its own storage
- Phase 6's `requireDeviceId` middleware and `FavoritesService`/`FavoritesController` pattern was deliberately built to be mirrored by Phase 7 — Recents reused that shape directly, which kept Phase 7 fast and consistent
- A package-legitimacy checkpoint (05-01, better-sqlite3) run as its own plan before the real implementation plan (05-02) caught a real compatibility problem (v13 requires Node ≥22 and crashed under this environment's Bun/Node) before it could block the actual repository work

### What Was Inefficient
- Phase 7's code review caught a pre-ship BLOCKER (CR-01) that unit tests never would have: route recents were written keyed by the client-supplied route *short name* but read back via an id-keyed lookup, so every route recent silently vanished. Every layer was unit-tested against mocks in isolation, so no test exercised the real write→read round trip until review traced it manually
- The same root cause (id-keyed reads vs. short-name-keyed or unvalidated writes) also produced two lower-severity whitespace/validation edge cases in Phase 6 (WR-01/WR-03) — a recurring shape of bug across both feature phases, not a one-off
- `resolveEntity` ended up duplicated verbatim between `FavoritesService` and `RecentsService` (flagged IN-03) — the "mirror the pattern" approach that made Phase 7 fast also copied logic that should have been shared instead

### Patterns Established
- Run a dedicated package-legitimacy checkpoint plan before any phase that introduces a new native/compiled dependency (like `better-sqlite3`), separate from the implementation plan that consumes it
- When one phase's service/controller pair is explicitly designed as the template for a later phase, say so directly in the roadmap/plan (as Phase 6 did for Phase 7) — but budget a follow-up pass to extract genuinely shared logic (e.g. `resolveEntity`) into one place rather than leaving it duplicated
- For any entity keyed differently on write vs. read (e.g. short name vs. internal id), add an integration-level test that exercises the real write→read round trip — unit tests against mocks in isolation will not catch a key mismatch

### Key Lessons
1. Cross-cutting id/key mismatches between a write path and a read path are the kind of bug that isolated unit tests systematically miss — code review that traces a real data-flow path end-to-end (not just per-file) is what caught CR-01, and that's worth keeping as a standing review focus for any new persistence-backed feature
2. Mirroring a working pattern (Favorites → Recents) is a legitimate way to move fast on a second, structurally similar feature, but it trades near-term velocity for duplicated logic that should be flagged as tech debt immediately, not silently accepted
3. A cheap, isolated "will this dependency even run here" checkpoint plan before the real implementation plan is worth it for any new native/compiled package — the better-sqlite3 v13/Node-version incompatibility would have been far more expensive to discover mid-implementation

### Cost Observations
- Sessions: not tracked separately this milestone
- Notable: the Phase 7 code-review cycle catching CR-01 pre-ship was the milestone's highest-value single finding — a silent, total feature failure (route recents never hydrating) that no test suite green-lit

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v0.1 | 1 | 2 | First milestone — established Biome-only tooling baseline |
| v0.2 | 1 | 2 | First feature milestone — stop discovery + live SSE predictions; first milestone with a multi-iteration code-review fix cycle |
| v0.3 | not tracked | 3 | First milestone with persistence (SQLite); first milestone where code review caught a pre-ship BLOCKER (write/read key mismatch) that unit tests missed entirely |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|---------------------|
| v0.1 | 141 | (80% threshold enforced, not separately measured this milestone) | 0 (Prettier removed, no new deps added) |
| v0.2 | 217 | ~97% on new code (phase-level); 80% threshold enforced repo-wide | 0 (no new dependencies — SSE built on existing Express/`res.write`) |
| v0.3 | 313 | 80% threshold enforced repo-wide | 1 (`better-sqlite3`, vetted via a dedicated package-legitimacy checkpoint) |

### Top Lessons (Verified Across Milestones)

1. Keep local `main` pushed to `origin` when the runtime's worktree isolation bases off the remote branch — otherwise isolated dispatch fails closed on every attempt
2. Worktree isolation protects against *concurrent* edits, not against pre-existing dirty state on the branch it forks from — always check `git status` before merging an isolated agent's branch back
3. Unit tests run against mocks in isolation cannot catch a write-path/read-path key mismatch (e.g. short name vs. internal id) — only an end-to-end data-flow trace or a real round-trip integration test will, and this bit v0.3's Recents feature as a pre-ship BLOCKER (CR-01)
