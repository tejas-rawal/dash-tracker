---
schema_version: 1
open_count: 4
waived_count: 0
fixed_count: 0
total_count: 4
last_updated: 2026-10-01T14:32:07.975Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | deviation | package.json |  | Repo-wide bun run lint/format still fails on pre-existing tab-indented files (src/*.ts, tsconfig.json, vitest.config.mts) - full codebase reformat is explicitly deferred to Phase 2 per PROJECT.md | open |  | 2026-08-26T13:17:43.630Z |  |
| 2 | 05 | unrun-verify | src/server/api/services/ServiceAlertPollService.ts |  | Live boot check against real DASH/Swiftly API (G-05-1 human-check) not run by executor - requires human observation of server startup logs | open |  | 2026-09-02T01:00:52.929Z |  |
| 3 | 13 | deviation | src/server/api/services/BusDataRefreshService.test.ts |  | 13-05: plan's adjacency spec (n=1..6) contradicts its locked equal-jitter formula at the 6->7 cap boundary; pinned n=1..5 plus a separate cap-boundary case | open |  | 2026-10-01T14:32:07.817Z |  |
| 4 | 13 | deviation | src/server/app.ts |  | 13-05: SIGTERM/SIGINT smokes run tsx directly; Bun 1.0.31 'bunx' does not forward signals to its child (exit 143, orphaned node processes) | open |  | 2026-10-01T14:32:07.975Z |  |

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
  },
  {
    "id": 3,
    "kind": "deviation",
    "phase": "13",
    "file": "src/server/api/services/BusDataRefreshService.test.ts",
    "line": null,
    "description": "13-05: plan's adjacency spec (n=1..6) contradicts its locked equal-jitter formula at the 6->7 cap boundary; pinned n=1..5 plus a separate cap-boundary case",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-01T14:32:07.817Z",
    "resolved_at": null,
    "milestone": "v0.6"
  },
  {
    "id": 4,
    "kind": "deviation",
    "phase": "13",
    "file": "src/server/app.ts",
    "line": null,
    "description": "13-05: SIGTERM/SIGINT smokes run tsx directly; Bun 1.0.31 'bunx' does not forward signals to its child (exit 143, orphaned node processes)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-01T14:32:07.975Z",
    "resolved_at": null,
    "milestone": "v0.6"
  }
]
````
