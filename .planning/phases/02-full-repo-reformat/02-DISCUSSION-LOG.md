# Phase 2: Full-Repo Reformat - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-26
**Phase:** 2-Full-Repo Reformat
**Areas discussed:** Fix scope, Residual warnings, Commit scope

---

## Fix scope

| Option | Description | Selected |
|--------|-------------|----------|
| Safe fixes only | `biome check . --write` — reaches 0 errors already; keeps the diff strictly formatting-only, matching the "purely cosmetic" success criterion most cleanly. No `--unsafe` needed. | ✓ |
| Include --unsafe | `biome check . --write --unsafe` — same end state in this repo (tested identical), but touches the unsafe-fix code path for no benefit here. | |

**User's choice:** Safe fixes only (recommended option accepted).
**Notes:** Verified empirically before asking — `--write` alone drops the repo from 35 errors/10 warnings to 0 errors/10 warnings, idempotent on a second run. `--write --unsafe` was also tested and produced an identical resulting diff, so it added no value.

---

## Residual warnings

| Option | Description | Selected |
|--------|-------------|----------|
| Leave them | Out of scope — fixing them means renaming files or editing biome.json rules, which isn't "apply the formatter" and isn't purely cosmetic. Exit-0 criterion is already met. | ✓ |
| Also silence via biome.json | Add targeted rule overrides (e.g. disable useNamingConvention for baseURL, adjust useFilenamingConvention for test files) so `biome check` reports nothing at all, not even warnings. | |

**User's choice:** Leave them (recommended option accepted).
**Notes:** The 10 residual warnings after `--write` are: `axios.ts` baseURL naming (unfixable — it's Axios's own config key), 8 test files flagged for not using kebab/camel/snake case (conflicts with the project's documented PascalCase test-file convention), and 2 useThrowOnlyError + 2 suppressions/unused warnings on intentional non-Error-throw test cases. None block `bun run format`/`lint` from exiting 0.

---

## Commit scope

| Option | Description | Selected |
|--------|-------------|----------|
| Exclude them | Stage only Biome-touched source/config files for the reformat commit; leave CLAUDE.md/01-PATTERNS.md as separate untracked files for the user to commit on their own terms. | ✓ |
| Something else | Free-text alternative. | |

**User's choice:** Exclude them (recommended option accepted).
**Notes:** Two untracked planning docs (`CLAUDE.md`, `.planning/phases/01-consolidate-lint-format-tooling/01-PATTERNS.md`) were present in the working tree before this discussion began and are unrelated to formatting — they should not be swept into the isolated reformat commit.

## Claude's Discretion

- Exact commit message wording for the isolated reformat commit (must make clear it's Biome-formatter-only, no logic changes).

## Deferred Ideas

- Silencing the 10 residual Biome warnings via `biome.json` rule overrides or code changes — not part of this phase.
- `lint:fix`'s deprecated `--apply-unsafe` flag (Biome 1.9.4 wants `--write --unsafe`) — flagged in Phase 1 as non-blocking; still untouched since this phase doesn't need `--unsafe`.
