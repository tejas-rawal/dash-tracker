# Phase 12 Deferred Items

## Deferred Items

- `bun run lint` fails on a Biome formatter diff in `.superset/config.json` (the `setup` array would collapse onto one line)
  status: resolved
  **Found during:** 12-03 plan-level verification
  **What:** Pre-existing since commit `f386498` (Superset workspace setup/run config, #13). Not touched by any Phase 12 plan, so it's out of scope for 12-03. Fix with `bunx biome check --write .superset/config.json`, or add `.superset` to `biome.json` `files.ignore`.
  **Resolved:** 2026-10-13. Fixed by commit 9be1043 ("chore: format .superset/config.json to satisfy Biome", quick task 4, 2026-09-29); bunx biome check .superset/config.json reports no fixes and bun run lint exits 0.
