---
schema_version: 1
open_count: 2
waived_count: 0
fixed_count: 0
total_count: 2
last_updated: 2026-09-02T01:00:52.929Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | deviation | package.json |  | Repo-wide bun run lint/format still fails on pre-existing tab-indented files (src/*.ts, tsconfig.json, vitest.config.mts) - full codebase reformat is explicitly deferred to Phase 2 per PROJECT.md | open |  | 2026-08-26T13:17:43.630Z |  |
| 2 | 05 | unrun-verify | src/server/api/services/ServiceAlertPollService.ts |  | Live boot check against real DASH/Swiftly API (G-05-1 human-check) not run by executor - requires human observation of server startup logs | open |  | 2026-09-02T01:00:52.929Z |  |

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
  },
  {
    "id": 2,
    "kind": "unrun-verify",
    "phase": "05",
    "file": "src/server/api/services/ServiceAlertPollService.ts",
    "line": null,
    "description": "Live boot check against real DASH/Swiftly API (G-05-1 human-check) not run by executor - requires human observation of server startup logs",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-02T01:00:52.929Z",
    "resolved_at": null
  }
]
````
