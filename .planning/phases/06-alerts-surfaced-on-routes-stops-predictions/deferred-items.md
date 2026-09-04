# Deferred Items — Phase 6

Out-of-scope issues discovered during execution, not fixed per the SCOPE BOUNDARY rule
(only issues directly caused by the current task's changes are auto-fixed).

## 06-01

- **`bun run lint` fails on `.planning/config.json` (pre-existing, unrelated to this plan).**
  `biome check .` scans the whole repo (no `.planning` entry in `biome.json`'s `files.ignore`),
  and `.planning/config.json`'s existing formatting doesn't match Biome's JSON formatter output.
  Confirmed via `git show HEAD:.planning/config.json` diffed against the working copy — byte-identical,
  untouched by this plan. Pre-dates Phase 6. All source files touched by 06-01 are lint-clean
  (verified individually with `biome check --write` against just the plan's file list).
  Not fixed here — reformatting `.planning/config.json` or adding a `biome.json` ignore entry is
  outside this plan's `files_modified` list and is a project-tooling decision, not a route-alerts
  concern.
