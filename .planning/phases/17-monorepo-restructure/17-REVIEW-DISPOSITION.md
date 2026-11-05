---
phase: 17
review: 17-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "Root `--filter` scripts hide output in a terminal, including dev-server logs, test failures and tsc errors"
  - id: WR-02
    severity: warning
    disposition: open
    title: "CI never runs `typecheck`, so the new test type-checking is not enforced"
  - id: WR-03
    severity: warning
    disposition: open
    title: "CI does not install the Node version in `.node-version`"
  - id: WR-04
    severity: warning
    disposition: open
    title: "The CI workflow has no `permissions` block, and its actions use tags that can move"
  - id: WR-05
    severity: warning
    disposition: open
    title: "`@dash-tracker/server` advertises entry points the build never produces"
  - id: WR-06
    severity: warning
    disposition: open
    title: "The exact pin locks Express 5 types onto the Express 4 runtime"
  - id: WR-07
    severity: warning
    disposition: open
    title: "The Superset setup hardcodes one user's home directory"
  - id: WR-08
    severity: warning
    disposition: open
    title: "A stream-cap test can hang under full-suite load, and CI has no retry"
  - id: IN-01
    severity: info
    disposition: open
    title: "Unused dev dependencies were re-pinned instead of removed"
  - id: IN-02
    severity: info
    disposition: open
    title: "The fixture factory's double cast hides drift in the default fixture"
  - id: IN-03
    severity: info
    disposition: open
    title: "Test setup pins every env var except `DB_PATH`"
  - id: IN-04
    severity: info
    disposition: open
    title: "CI repeats the same steps four times, and two jobs are identical"
  - id: IN-05
    severity: info
    disposition: open
    title: "`lint:fix` uses a deprecated Biome flag"
  - id: IN-06
    severity: info
    disposition: open
    title: "The README's new monorepo section sits beside a stack description that contradicts it"
  - id: IN-07
    severity: info
    disposition: open
    title: "Build and type-check scope has small gaps"
open: 15
total: 15
recorded: 2026-10-23T17:39:31.032Z
---

# Phase 17: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| WR-05 | warning | open | - |
| WR-06 | warning | open | - |
| WR-07 | warning | open | - |
| WR-08 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-06 | info | open | - |
| IN-07 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
