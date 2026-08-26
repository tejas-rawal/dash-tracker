# dash-tracker

## What This Is

dash-tracker is a Node.js/Express REST API that proxies and structures data from the DASH public transit API (goswift.ly), exposing bus routes and arrival predictions through a layered architecture (routes → controllers → services → repositories). v0.1 shipped a dev-tooling cleanup: the lint/format toolchain is now Biome-only, and the whole repo conforms to it. Feature work resumes from a clean, single-tool baseline.

## Core Value

Riders can always see accurate, near-real-time arrival predictions for their stop.

## Current Milestone: v0.2 Real-Time Arrival Predictions

**Goal:** Give the future Expo/React Native app what it needs to show near-real-time bus arrivals for a selected stop — stop discovery plus a live-updating predictions feed.

**Target features:**
- Stop discovery endpoints (by route, and nearby by lat/lng with radius + count bound)
- Server-Sent Events endpoint streaming live predictions per stop, backed by one shared 30s upstream poll loop per subscribed stop (starts on first subscriber, stops when idle)
- Existing REST predictions endpoint retained as fallback/initial-load path
- `generatedAt` freshness timestamp added to REST and SSE prediction payloads

## Requirements

### Validated

- ✓ REST API proxies DASH transit API for bus routes and arrival predictions — existing
- ✓ Layered architecture (routes → controllers → services → repositories) with factory-function DI — existing
- ✓ TypeScript strict mode, compiled via `tsc` to `dist/` (ES2020, CommonJS) — existing
- ✓ Vitest test suite with 80% coverage thresholds — existing
- ✓ Biome is the sole tool for both linting and formatting (`biome check`/`biome check --write`) — v0.1
- ✓ Prettier, `@jonahsnider/prettier-config`, and `prettier-plugin-packagejson` fully removed (dependency, config, scripts) — v0.1
- ✓ `package.json` scripts (`lint`, `lint:fix`, `format`, `format:write`) updated to reflect the single-tool flow — v0.1
- ✓ Full codebase reformatted under Biome's formatter with zero outstanding diffs, landed as its own commit separate from the config/dependency change — v0.1

### Active

- [ ] Stop discovery: list stops for a given route
- [ ] Stop discovery: find nearby stops by lat/lng (radius + result-count bound)
- [ ] Live predictions via Server-Sent Events, subscribed per stop
- [ ] Shared per-stop upstream poll loop (30s), started on first subscriber and stopped when idle
- [ ] REST predictions endpoint retained as fallback/initial-load path
- [ ] `generatedAt` freshness timestamp added to REST and SSE prediction payloads

### Out of Scope

- The Expo/React Native frontend app itself — this repo is intended to eventually house both backend and frontend (monorepo, not separate repos), but the app is deferred to a future milestone
- Offline caching and countdown animation UI — client-side concerns that land with the future Expo milestone
- Replacing `tsc` as the build tool (e.g. with Vite/esbuild) — Vite is a frontend bundler/dev server and doesn't fit compiling this Node/Express backend; not part of this cleanup
- Replacing Vitest — it's a test runner only, unrelated to lint/format consolidation

## Context

- This repo is intended to eventually house both the backend API and the Expo/React Native frontend (monorepo by design, not separate repos) — the frontend itself is planned for a future milestone
- The Expo app will consume this API for near-real-time bus arrivals: 30-second refresh cadence, offline caching, and an animated countdown UI (client-side concerns, out of scope for this milestone)
- Existing codebase mapped in `.planning/codebase/` (STACK.md, ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, INTEGRATIONS.md, CONCERNS.md)
- Shipped v0.1: Biome is now the sole lint/format tool (Prettier fully removed) and the entire repo (29 tracked files) is reformatted to it — `bun run format`/`bun run lint` exit 0 repo-wide, 141/141 tests pass unchanged
- Package manager is Bun; TypeScript target ES2020/CommonJS, strict mode fully enabled
- Known tech debt: `lint:fix`'s `--apply-unsafe` flag is deprecated by Biome 1.9.4 in favor of `--write --unsafe` (non-blocking, flagged in Phase 1 code review); 15 pre-existing Biome warnings remain by design (Axios `baseURL` naming, `*.test.ts` filename convention, intentional non-Error throws in tests) — see 02-CONTEXT.md D-02

## Constraints

- **Tooling**: Biome must remain the linter (existing `biome.json` config — 120 char line width, 4-space indent, `noDefaultExport` disabled) — no reason to replace it, only to stop pairing it with Prettier
- **Compatibility**: Build step (`tsc` → `dist/`) and test runner (Vitest) are out of scope and must keep working unchanged after the lint/format swap

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Drop Prettier, standardize on Biome for lint + format | Biome already includes a formatter; running Prettier alongside it is pure redundancy | Shipped Phase 1 |
| Keep `tsc` for build | Standard, dependency-free way to compile TS → CommonJS for a Node server; Vite is a frontend-oriented bundler and a poor fit here | Confirmed Phase 1 (build unaffected) |
| Land the mass reformat as its own commit | Keeps the tooling/config change reviewable separately from the resulting whitespace/style diff | ✓ Shipped Phase 2 |
| Leave `lint`/`lint:fix` scripts untouched in Phase 1 | They already invoked Biome and were the reference pattern for the new `format`/`format:write` scripts | ✓ Shipped Phase 1 — surfaced one follow-up: `lint:fix`'s `--apply-unsafe` flag is deprecated by Biome 1.9.4 in favor of `--write --unsafe` (non-blocking, logged in code review) |
| Preserve the 15 pre-existing Biome warnings unchanged (no renames, no suppressions) during the Phase 2 reformat | Keeps the reformat purely cosmetic and scoped; fixing warnings is a separate, deliberate decision | ✓ Shipped Phase 2 |
| Replace Core Value with a product-level statement ("Riders can always see accurate, near-real-time arrival predictions for their stop") | The v0.1 Core Value ("single command for lint/format") was scoped to that tooling cleanup, not a lasting product value; v0.2 is the first feature milestone | — Pending |
| Use Server-Sent Events (not WebSocket) for live predictions, with REST retained as fallback | SSE is one-way push over plain HTTP — simplest fit for this Express app and easy for the future Expo client to consume; bidirectional messaging isn't needed yet | — Pending |
| Server runs one shared 30s upstream poll per subscribed stop, stopping when idle | Decouples client refresh cadence from per-client polling; protects upstream DASH API from being hammered by many simultaneous phone clients | — Pending |
| This repo will eventually house both backend and Expo/React Native frontend (monorepo) | User doesn't want to manage separate repos; frontend build itself deferred to a future milestone | — Pending |

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
*Last updated: 2026-08-26 after starting v0.2 milestone*
