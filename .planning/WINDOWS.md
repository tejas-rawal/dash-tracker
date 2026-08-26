---
schema_version: 1
open_count: 1
waived_count: 0
fixed_count: 0
total_count: 1
last_updated: 2026-08-26T13:17:43.630Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | deviation | package.json |  | Repo-wide bun run lint/format still fails on pre-existing tab-indented files (src/*.ts, tsconfig.json, vitest.config.mts) - full codebase reformat is explicitly deferred to Phase 2 per PROJECT.md | open |  | 2026-08-26T13:17:43.630Z |  |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "01",
    "file": "package.json",
    "line": null,
    "description": "Repo-wide bun run lint/format still fails on pre-existing tab-indented files (src/*.ts, tsconfig.json, vitest.config.mts) - full codebase reformat is explicitly deferred to Phase 2 per PROJECT.md",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-26T13:17:43.630Z",
    "resolved_at": null
  }
]
````
