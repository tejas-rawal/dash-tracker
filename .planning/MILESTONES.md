# Milestones

## v0.1 Tooling Cleanup (Shipped: 2026-08-26)

**Phases completed:** 2 phases, 2 plans, 3 tasks

**Key accomplishments:**

- Biome is now the sole lint/format tool — Prettier, its plugin, and its config are fully removed from package.json, both lockfiles, and editor tooling, with format scripts rewired to `biome check .` / `biome check . --write`.
- Ran Biome's formatter (safe fixes only) across all 29 previously-unformatted tracked files, landing the result as a single isolated, purely-cosmetic commit that brings `bun run format`/`bun run lint` from 35 errors to 0 errors repo-wide.

---
