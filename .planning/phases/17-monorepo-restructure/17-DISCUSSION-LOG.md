# Phase 17: Monorepo Restructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-22
**Phase:** 17-monorepo-restructure
**Areas discussed:** Lint fan-out, Phase 17 vs 18 edges, Existing version ranges, Scripts/names/docs

---

## Lint fan-out

| Option | Description | Selected |
|--------|-------------|----------|
| One root Biome run | Root `lint` stays `biome check .`; fan-out only for test/coverage/build/typecheck; reword MONO-01 + SC3 | ✓ |
| Fan out per workspace | Per-app `lint`, root `--filter` fan-out; root files need a second run | |
| Both | Root single run plus per-workspace `lint` scripts | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep format/format:write as-is | No command changes; Phase 18 revisits Biome scripts | ✓ |
| Drop the duplicates | Fewer scripts; CI `style` switches to `lint` | |

**User's choice:** One root Biome run; keep `format`/`format:write`.

---

## Phase 17 vs 18 edges

| Option | Description | Selected |
|--------|-------------|----------|
| createApp() in Phase 18 with CORS | Phase 17 stays layout-only | ✓ |
| createApp() in Phase 17 | Refactor in a follow-up commit after the move | |

CI scope (multi-select):

| Option | Description | Selected |
|--------|-------------|----------|
| Path & Bun-pin fixes | Codecov path, `bun-version-file: package.json` | ✓ |
| Tree-clean check | `git diff --exit-code` after frozen install | ✓ |
| pull_request trigger | PR CI proves the gate | ✓ |
| Codecov `server` flag | Add the flag now instead of in Phase 19 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Move, then delete in a follow-up commit | Rename commit stays 100% pure | ✓ |
| Delete before the move | Never appear under `apps/server` | |
| Leave them | Out of scope | |

**User's choice:** All recommended options; no Codecov flag yet.

---

## Existing version ranges

| Option | Description | Selected |
|--------|-------------|----------|
| Pin all to the locked versions now | Rewrite `^x` to the resolved exact version; nothing installed changes | ✓ |
| Leave the ranges for now | Phase 18 pins what it touches | |

| Option | Description | Selected |
|--------|-------------|----------|
| Zero drift except coverage-v8 | Any other resolved-version change is a defect | ✓ |
| Accept in-range drift | Re-resolve within carets if tests stay green | |

**User's choice:** Exact pins now; zero lockfile drift except `@vitest/coverage-v8` → 3.2.6.

---

## Scripts, names & docs

| Option | Description | Selected |
|--------|-------------|----------|
| @dash-tracker/server, root dash-tracker | Scoped, matches future `@dash-tracker/mobile` | ✓ |
| Plain `server` | Shorter, unscoped | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep names, add root dev:server | Superset run uses `bun run dev:server` | ✓ |
| Rename to dev/start now | Conventional names; renames in the move phase | |
| Keep names, no root aliases | Fewest scripts | |

| Option | Description | Selected |
|--------|-------------|----------|
| Paths/commands + endpoint list | Also complete the endpoint list and add a local `.env`/`data/` move note | ✓ |
| Paths and commands only | MONO-04 minimum | |

**User's choice:** All recommended options.

---

## Claude's Discretion

- Delete or replace the stub server README
- Exact `typecheck` command
- vitest/tsconfig/.gitignore path rewrites
- How to keep `rateLimit.test.ts` stable after `.env` moves
- `.superset/config.json` shape
- better-sqlite3 trust handling under Bun 1.3.14 (formally TOOL-07 in Phase 18)

## Deferred Ideas

- `createApp()` → Phase 18
- Codecov flags → Phase 19
- `lint:fix` deprecated flag → Phase 18
