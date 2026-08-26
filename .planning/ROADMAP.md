# Roadmap: dash-tracker (Tooling Cleanup)

## Overview

This milestone consolidates dash-tracker's dev tooling onto a single lint-and-format tool. Phase 1 makes Biome the sole source of truth — Prettier, its config, and its plugin are fully removed, and `package.json` scripts are rewired to the single-tool flow. Phase 2 then applies that new formatter across the entire codebase in one dedicated commit, proving the migration is complete and behavior-neutral (build and tests unaffected).

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Consolidate Lint & Format Tooling** - Biome becomes the sole lint/format tool; Prettier and its config/plugin are fully removed; `package.json` scripts are rewired accordingly (completed 2026-08-26)
- [ ] **Phase 2: Full-Repo Reformat** - The entire codebase is reformatted under Biome with zero outstanding diffs, landed as its own isolated commit

## Phase Details

### Phase 1: Consolidate Lint & Format Tooling

**Goal**: Biome is the only tool a contributor or CI needs to run for linting and formatting — Prettier is gone, and the scripts reflect that.
**Depends on**: Nothing (first phase)
**Requirements**: TOOL-01, TOOL-02, TOOL-03
**Success Criteria** (what must be TRUE):

  1. `package.json` `lint`/`lint:fix`/`format`/`format:write` scripts all invoke Biome (`biome check` / `biome check --write`) — no `prettier` invocation remains anywhere in scripts
  2. `package.json` has no `prettier` field and no `prettier` / `@jonahsnider/prettier-config` / `prettier-plugin-packagejson` entries in `dependencies` or `devDependencies`; lockfile(s) reflect the removal
  3. No Prettier config or ignore files remain in the repo (`.prettierrc`, `.prettierignore`), and no other checked-in tooling file (e.g. editor settings) still names Prettier as the active formatter
  4. `biome.json`'s formatter settings (line width, indent, quote style) match what Prettier previously enforced, so the switch changes tooling, not the intended style

**Plans**: 1/1 plans executed

Plans:

- [x] 01-01-PLAN.md — Remove Prettier (dependency, config, plugin, editor references) and update package.json scripts to the Biome-only flow

### Phase 2: Full-Repo Reformat

**Goal**: The whole codebase conforms to the new Biome-only formatter, with the resulting diff isolated in a single, purely cosmetic commit.
**Depends on**: Phase 1
**Requirements**: TOOL-04
**Success Criteria** (what must be TRUE):

  1. Running `biome check --write .` (or `bun run format:write`) a second time in succession reports zero remaining changes — the reformat is idempotent and complete
  2. `bun run format` (Biome-backed check) exits 0 against the full repository with no reported diffs
  3. The mass reformat is committed on its own, containing only formatting changes and no functional/logic edits — separate from the Phase 1 tooling/config commit
  4. `bun run build` and `bun run test` both still pass unchanged after the reformat, confirming the change was purely cosmetic

**Plans**: 1 plan

Plans:

- [ ] 02-01-PLAN.md — Run Biome formatter across the full repo and land the resulting diff as an isolated commit

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Consolidate Lint & Format Tooling | 1/1 | Complete    | 2026-08-26 |
| 2. Full-Repo Reformat | 0/1 | Not started | - |
