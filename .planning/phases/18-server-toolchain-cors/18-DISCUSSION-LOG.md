# Phase 18: Server Toolchain & CORS - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-10
**Phase:** 18-server-toolchain-cors
**Mode:** `--auto` (yolo chain from `/gsd-verify-work 17`). No questions were asked; each area took the recommended option.
**Areas discussed:** Order of work, Node 24 + native module, tsx swap, TypeScript 6, Biome 2.5, createApp + CORS mount, CORS_ALLOWED_ORIGINS validation, Route colors

[--auto] Selected all gray areas: Order of work, Node 24 + native module, tsx swap, TypeScript 6, Biome 2.5, createApp + CORS mount, CORS_ALLOWED_ORIGINS validation, Route colors.

---

## Order of work

| Option | Description | Selected |
|--------|-------------|----------|
| Toolchain first, then CORS; one bump per commit; own PR, merge commit | CORS written on TS 6 / Biome 2; bisectable; blame-ignore SHA survives | ✓ |
| CORS first, then toolchain | CORS code would be reformatted and re-typed by the later bumps | |
| One combined toolchain commit | Loses bisectability between Node, tsx, TS and Biome | |

**User's choice:** [auto] Q: "In what order do the toolchain and CORS land?" → Selected: "Toolchain first, then CORS…" (recommended default)

## Node 24 + native module

| Option | Description | Selected |
|--------|-------------|----------|
| Full 24.x.y pin ≥7 days old, setup-node before install, trustedDependencies incl. currently-blocked packages, CI boot smoke | Meets TOOL-06/07 and keeps the release-age policy | ✓ |
| Major-only `24` pin | CI and local can drift onto different patches | |

**User's choice:** [auto] → Selected the first option (recommended default)

## tsx swap

| Option | Description | Selected |
|--------|-------------|----------|
| Keep script names, swap commands (`tsx watch` / `tsx`), move `@types/*` to devDependencies | Root `dev:server` and Superset config unchanged | ✓ |
| Rename scripts (`dev`, `start`) | Churns root scripts, Superset config and docs for no gain | |

**User's choice:** [auto] → Selected the first option (recommended default)

## TypeScript 6

| Option | Description | Selected |
|--------|-------------|----------|
| Extend `@tsconfig/node24`, override to CommonJS if needed, explicit `types: ["node"]`, keep strictness | Meets TOOL-09 and keeps `dist/` CommonJS | ✓ |
| Switch to ESM (`"type": "module"`) | A behavior change and out of scope | |

**User's choice:** [auto] → Selected the first option (recommended default)

## Biome 2.5

| Option | Description | Selected |
|--------|-------------|----------|
| migrate commit → reformat commit → blame-ignore commit; Biome 1.9.4 warning count as baseline; new rules fixed or disabled with a reason | Matches TOOL-10 and success criterion 3 | ✓ |
| Migrate and reformat in one commit | Fails TOOL-10's separate-commits requirement | |

**User's choice:** [auto] → Selected the first option (recommended default)

## createApp + CORS mount

| Option | Description | Selected |
|--------|-------------|----------|
| `createApp()` shared by app.ts and tests; `cors` package app-level after trust proxy, before routers; `exposedHeaders: Retry-After`; no credentials | Tests see real wiring; preflight never spends a token | ✓ |
| Hand-rolled CORS headers | Reimplements a well-maintained library (CLAUDE.md principle) | |
| CORS per route | Misses the 404s and is easy to forget on new routes | |

**User's choice:** [auto] → Selected the first option (recommended default)

## CORS_ALLOWED_ORIGINS validation

| Option | Description | Selected |
|--------|-------------|----------|
| Optional, empty default; each entry must equal its own `URL.origin` (http/https); crash on bad entry; pinned in test setup | Satisfies CORS-01 exactly | ✓ |
| Required variable | Forces native-only deployments to set a meaningless value (research conflict 6) | |

**User's choice:** [auto] → Selected the first option (recommended default)

## Route colors

| Option | Description | Selected |
|--------|-------------|----------|
| Payload captured; colors present → pass `color`/`textColor` through as DASH sends them; a malformed or missing color omits the field, never fails the load | Live evidence: 12/12 routes carry both | ✓ |
| Close CORS-05 as N/A | Contradicted by the captured payload | |
| Normalize to `#rrggbb` | Changes DASH's form; the app can prefix it | |

**User's choice:** [auto] → Selected the first option (recommended default). Evidence: `18-dash-routes-payload.txt`.

---

## Claude's Discretion

- Exact package and Node versions (research picks them, subject to the 7-day gate)
- CI boot smoke as its own job or a step
- CORS options file name and location

## Deferred Ideas

- streamConcurrencyCap.test.ts coverage-load hang (quick-task candidate)
- healthRoutes.test.ts test-order dependence (backlog 999.1)
- SIGHUP survival through the `bun run` wrapper
