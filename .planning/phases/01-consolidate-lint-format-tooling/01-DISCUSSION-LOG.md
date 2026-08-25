# Phase 1: Consolidate Lint & Format Tooling - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-25
**Phase:** 1-Consolidate Lint & Format Tooling
**Areas discussed:** package.json formatting ownership, Editor/tooling config cleanup, Lockfile handling

---

## package.json formatting ownership

| Option | Description | Selected |
|--------|-------------|----------|
| Let Biome format it | Remove the package.json ignore entry from biome.json so `biome check --write` formats/sorts it like everything else. | ✓ |
| Leave it unformatted by tooling | Keep package.json excluded from Biome — no tool enforces its formatting going forward. | |

**User's choice:** Let Biome format it
**Notes:** Closes the exact gap left by dropping `prettier-plugin-packagejson`; `biome.json` currently has `files.ignore: ["**/package.json"]` which needs to be removed.

---

## Editor/tooling config cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, fully switch editor config to Biome | Set the global default formatter to biomejs.biome and drop esbenp.prettier-vscode from extensions.json. | ✓ |
| Leave editor config alone | Only touch package.json/biome.json/prettier files — treat .vscode/* as out of scope. | |

**User's choice:** Yes, fully switch editor config to Biome
**Notes:** Matches the Phase 1 success criterion that no checked-in tooling file still names Prettier as the active formatter. `.vscode/settings.json`'s global `editor.defaultFormatter` is currently `esbenp.prettier-vscode`; `.vscode/extensions.json` recommends the Prettier extension.

---

## Lockfile handling

| Option | Description | Selected |
|--------|-------------|----------|
| Update both lockfiles | Keep package-lock.json in sync with the dependency removal. | ✓ |
| Only update bun.lockb | Bun is the actual package manager used day-to-day; leave package-lock.json as-is. | |

**User's choice:** Update both lockfiles
**Notes:** package-lock.json is kept for npm compatibility per CLAUDE.md and shouldn't drift from package.json after the dependency removal.

---

## Claude's Discretion

- Whether to simplify `.vscode/settings.json`'s per-language formatter overrides (js/ts/json → biomejs.biome) now that the global default is also Biome, or leave the explicit per-language entries in place. Either satisfies "no Prettier references remain."

## Deferred Ideas

None — discussion stayed within phase scope.
