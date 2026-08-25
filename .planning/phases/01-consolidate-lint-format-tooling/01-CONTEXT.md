# Phase 1: Consolidate Lint & Format Tooling - Context

**Gathered:** 2026-08-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Biome becomes the sole lint/format tool for dash-tracker. Prettier, its config (`.prettierrc`, `.prettierignore`), and its plugin (`prettier-plugin-packagejson`) are fully removed — from dependencies, from `package.json` scripts, and from any other checked-in tooling file that currently names Prettier as the active formatter. `biome.json`'s formatter settings must continue to match what Prettier previously enforced (120 char line width, 4-space indent, double quotes) so this is a tooling swap, not a style change. Applying the new formatter across the full repo is out of scope — that's Phase 2.

</domain>

<decisions>
## Implementation Decisions

### package.json formatting ownership
- **D-01:** Biome will format `package.json` going forward. Remove the `**/package.json` entry from `biome.json`'s `files.ignore` list so `biome check --write` covers it like every other file — closing the gap left by dropping `prettier-plugin-packagejson`.

### Editor/tooling config cleanup
- **D-02:** `.vscode/settings.json`'s global `editor.defaultFormatter` changes from `esbenp.prettier-vscode` to `biomejs.biome` (the per-language overrides for js/ts/json already point at Biome and can stay, or be simplified now that the global default matches).
- **D-03:** `.vscode/extensions.json` drops `esbenp.prettier-vscode` from `recommendations` — no checked-in file should still recommend/reference the Prettier extension.

### Lockfile handling
- **D-04:** Both `bun.lockb` and `package-lock.json` get updated to reflect the Prettier dependency removal (`prettier`, `@jonahsnider/prettier-config`, `prettier-plugin-packagejson`) — `package-lock.json` is kept for npm compatibility per CLAUDE.md and shouldn't be left stale/inconsistent with `package.json`.

### Claude's Discretion
- Whether to simplify `.vscode/settings.json`'s per-language formatter overrides (js/ts/json → biomejs.biome) now that the global default is also Biome, or leave them as explicit redundancy. Either is fine as long as Prettier is gone from the file.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & scope
- `.planning/REQUIREMENTS.md` — TOOL-01, TOOL-02, TOOL-03 (this phase's requirements)
- `.planning/ROADMAP.md` — Phase 1 success criteria
- `.planning/PROJECT.md` — Core value and constraints (Biome stays linter, `tsc`/Vitest out of scope)

### Files this phase touches
- `package.json` — scripts (`lint`, `lint:fix`, `format`, `format:write`), `prettier` field, `dependencies`/`devDependencies`
- `biome.json` — formatter settings (verify they match old Prettier config), `files.ignore` (remove `**/package.json`)
- `.prettierrc`, `.prettierignore` — delete
- `.vscode/settings.json` — `editor.defaultFormatter` global default
- `.vscode/extensions.json` — `recommendations` list
- `bun.lockb`, `package-lock.json` — regenerate after dependency removal

No external ADRs/specs beyond the milestone docs above — requirements fully captured in REQUIREMENTS.md and this file.

</canonical_refs>

<code_context>
## Existing Code Insights

### Current state (confirmed via direct inspection)
- `package.json` scripts: `"format": "prettier --check ."`, `"format:write": "prettier --check . --write"` (note: `format:write` currently runs `--check --write` together, not just `--write`) — both need rewiring to `biome check .` / `biome check . --write`.
- `package.json` has a top-level `"prettier": "@jonahsnider/prettier-config"` field to remove.
- `devDependencies` to remove: `prettier`, `@jonahsnider/prettier-config`, `prettier-plugin-packagejson`.
- `.prettierrc` only sets `{"plugins": ["prettier-plugin-packagejson"]}` — actual style rules come from `@jonahsnider/prettier-config`. Researcher should confirm that config's line-width/indent/quote settings match `biome.json`'s current formatter block (120/4-space/double-quote) before deleting it, per Phase 1 success criterion #4.
- `.prettierignore` ends with a "Biome can format these" block that already carves out `**/package.json` as the one file Prettier (not Biome) owns — this is the exact gap D-01 closes.

### Integration points
- `.github/workflows/ci.yml` has a `style` job that runs `bun run format` — no direct Prettier references in CI, so rewiring the script is sufficient; no CI YAML changes needed.
- `.vscode/settings.json` already has Biome as the per-language formatter for js/ts/json/jsonc; only the global fallback and `extensions.json` still reference Prettier.

</code_context>

<specifics>
## Specific Ideas

No particular UI/UX references — this is a pure tooling/config phase. The guiding principle from PROJECT.md: "no redundant tools, no drift between what CI checks and what a contributor runs locally."

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 1-Consolidate Lint & Format Tooling*
*Context gathered: 2026-08-25*
