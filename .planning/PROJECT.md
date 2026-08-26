# dash-tracker

## What This Is

dash-tracker is a Node.js/Express REST API that proxies and structures data from the DASH public transit API (goswift.ly), exposing bus routes and arrival predictions through a layered architecture (routes → controllers → services → repositories). This milestone is not about new features — it's a dev-tooling cleanup to consolidate the lint/format toolchain before further feature work resumes.

## Core Value

A single, unambiguous command for linting and formatting — no redundant tools, no drift between what CI checks and what a contributor runs locally.

## Requirements

### Validated

- ✓ REST API proxies DASH transit API for bus routes and arrival predictions — existing
- ✓ Layered architecture (routes → controllers → services → repositories) with factory-function DI — existing
- ✓ TypeScript strict mode, compiled via `tsc` to `dist/` (ES2020, CommonJS) — existing
- ✓ Vitest test suite with 80% coverage thresholds — existing
- ✓ Biome is the sole tool for both linting and formatting (`biome check`/`biome check --write`) — Phase 1
- ✓ Prettier, `@jonahsnider/prettier-config`, and `prettier-plugin-packagejson` fully removed (dependency, config, scripts) — Phase 1
- ✓ `package.json` scripts (`lint`, `lint:fix`, `format`, `format:write`) updated to reflect the single-tool flow — Phase 1

### Active

- [ ] Full codebase reformatted under Biome's formatter with zero outstanding diffs, landed as its own commit separate from the config/dependency change

### Out of Scope

- New feature work (bus route/prediction endpoints, etc.) — deferred to a future milestone, scope not yet decided
- Replacing `tsc` as the build tool (e.g. with Vite/esbuild) — Vite is a frontend bundler/dev server and doesn't fit compiling this Node/Express backend; not part of this cleanup
- Replacing Vitest — it's a test runner only, unrelated to lint/format consolidation

## Context

- Existing codebase mapped in `.planning/codebase/` (STACK.md, ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, INTEGRATIONS.md, CONCERNS.md)
- Current toolchain redundancy: Biome (linting) + Prettier (formatting via `@jonahsnider/prettier-config`) run side by side even though Biome ships its own formatter — this is the actual problem being fixed
- Package manager is Bun; TypeScript target ES2020/CommonJS, strict mode fully enabled

## Constraints

- **Tooling**: Biome must remain the linter (existing `biome.json` config — 120 char line width, 4-space indent, `noDefaultExport` disabled) — no reason to replace it, only to stop pairing it with Prettier
- **Compatibility**: Build step (`tsc` → `dist/`) and test runner (Vitest) are out of scope and must keep working unchanged after the lint/format swap

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Drop Prettier, standardize on Biome for lint + format | Biome already includes a formatter; running Prettier alongside it is pure redundancy | Shipped Phase 1 |
| Keep `tsc` for build | Standard, dependency-free way to compile TS → CommonJS for a Node server; Vite is a frontend-oriented bundler and a poor fit here | Confirmed Phase 1 (build unaffected) |
| Land the mass reformat as its own commit | Keeps the tooling/config change reviewable separately from the resulting whitespace/style diff | Pending — Phase 2 |
| Leave `lint`/`lint:fix` scripts untouched in Phase 1 | They already invoked Biome and were the reference pattern for the new `format`/`format:write` scripts | Shipped Phase 1 — surfaced one follow-up: `lint:fix`'s `--apply-unsafe` flag is deprecated by Biome 1.9.4 in favor of `--write --unsafe` (non-blocking, logged in code review) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-26 after Phase 1*
