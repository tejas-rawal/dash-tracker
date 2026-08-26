# Phase 2: Full-Repo Reformat - Context

**Gathered:** 2026-08-26
**Status:** Ready for planning

<domain>
## Phase Boundary

The entire codebase is run through Biome's formatter (established in Phase 1) so that `bun run format`/`bun run lint` (both `biome check .`) exit 0 across the full repo, with zero remaining diffs on a second run. The resulting diff lands as its own isolated commit containing only formatting changes — no functional/logic edits, no file renames, no biome.json rule changes. Build (`tsc`) and tests (Vitest) must still pass unchanged afterward.

</domain>

<decisions>
## Implementation Decisions

### Fix command
- **D-01:** Use `biome check . --write` (safe fixes only — no `--unsafe`). Verified directly: safe fixes alone already bring the repo to 0 errors and a clean, idempotent second run. `--unsafe` was tested too and produces an identical end state in this repo, so it adds no value while nominally touching a riskier fix path. Using only `--write` keeps the diff unambiguously "formatting only," matching Phase 2 success criterion 3 as cleanly as possible.

### Residual warnings — leave untouched
- **D-02:** After `--write`, 10 warnings remain (not errors) and do not block `bun run format`/`lint` from exiting 0. These are explicitly **out of scope** for this phase:
  - `src/server/config/axios.ts:7:45` — `lint/style/useNamingConvention` flags `baseURL` for consecutive uppercase letters. This is Axios's own config option name (`axios.create({ baseURL })`) — it cannot be renamed without breaking the Axios integration. Do not touch.
  - 8 test files (`BusRoute.test.ts`, `BusStop.test.ts`, `RouteDirection.test.ts`, `BusRouteController.test.ts`, `PredictionController.test.ts`, `BusRouteService.test.ts`, `BusDataRepository.test.ts`, `PredictionService.test.ts`) — `lint/style/useFilenamingConvention` wants kebab/camel/snake case instead of the project's established `PascalCase.test.ts` convention (documented in `.claude/CLAUDE.md` naming patterns). Do not rename files.
  - `src/server/api/controllers/BusRouteController.test.ts:151,242` — `lint/style/useThrowOnlyError` + matching `suppressions/unused` warnings on intentional non-Error throw test cases. Do not edit.
  - **Reversibility:** reversible — leaving these alone changes nothing; they can be revisited in a future phase without any migration cost.
- Do not modify `biome.json` rules in this phase to silence these warnings — that's a tooling-config change, not "apply the formatter," and belongs to a separate decision if ever pursued.

### Commit scope
- **D-03:** The reformat commit stages only Biome-touched source/config files. The two currently-untracked planning docs in the working tree (`CLAUDE.md`, `.planning/phases/01-consolidate-lint-format-tooling/01-PATTERNS.md`) are unrelated to formatting and must be excluded from this commit — left for the user to commit separately on their own terms.

### Claude's Discretion
- Exact commit message wording for the isolated reformat commit (must make clear it's Biome-formatter-only, no logic changes).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & scope
- `.planning/REQUIREMENTS.md` — TOOL-04 (this phase's requirement)
- `.planning/ROADMAP.md` — Phase 2 success criteria
- `.planning/PROJECT.md` — Core value, constraints (Biome stays linter; `tsc`/Vitest out of scope)

### Prior phase context
- `.planning/phases/01-consolidate-lint-format-tooling/01-CONTEXT.md` — Phase 1 decisions (Biome-only tooling, `biome.json` formatter settings locked to 120/4-space/double-quote)
- `.planning/phases/01-consolidate-lint-format-tooling/01-VERIFICATION.md` — confirms the 35-error/10-warning baseline is pre-existing legacy formatting debt, explicitly deferred to this phase; also flagged (and since resolved) a stray uncommitted diff that predated this discussion

### Files this phase touches
- All Biome-checked source/config files reported by `biome check . --write` (~30 files observed: `src/server/**/*.ts`, `tsconfig.json`, `vitest.config.mts`, `.planning/config.json`) — formatting-only changes
- No changes to `biome.json`, no file renames, no `package.json` script changes (those are locked from Phase 1)

No external ADRs/specs beyond the milestone docs above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Verified via direct inspection (safe to reuse by researcher/planner)
- `biome check . --write` (safe-only) reduces the repo from 35 errors/10 warnings to **0 errors/10 warnings**, and a second `--write` run reports no further fixes — the idempotency success criterion is already satisfied by this single command.
- `biome check .` (i.e. `bun run format` / `bun run lint`, which are currently identical scripts) exits 0 after that single `--write` pass — confirmed by direct exit-code check.
- `--unsafe` was tested and produces an identical resulting diff/state in this repo — no additional value, so it's excluded per D-01.
- The working tree was returned to its pre-investigation clean state (`git checkout -- .`) after this testing — no leftover formatting changes from this discussion session.

### Integration points
- `.github/workflows/ci.yml` has separate `lint` and `style` jobs that currently run the same underlying command (`biome check .`) — both will pass once this phase's commit lands, no CI YAML changes needed.

</code_context>

<specifics>
## Specific Ideas

No particular UI/UX references — this is a pure formatting phase. The commit should read clearly as "ran the formatter, nothing else."

</specifics>

<deferred>
## Deferred Ideas

- Silencing the 10 residual Biome warnings (axios.ts naming, test-file naming convention, useThrowOnlyError in tests) via `biome.json` rule overrides or code changes — explicitly deferred, not part of this phase (see D-02). Future phase if ever prioritized.
- `lint:fix`'s deprecated `--apply-unsafe` flag (should become `--write --unsafe` per Biome 1.9.4) — flagged in Phase 1 as non-blocking; still not touched here since script wiring is locked from Phase 1 and this phase doesn't need `--unsafe` anyway.

### Reviewed Todos (not folded)
None — discussion stayed within phase scope.

</deferred>

---

*Phase: 2-Full-Repo Reformat*
*Context gathered: 2026-08-26*
