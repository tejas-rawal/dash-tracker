---
phase: 18
review: 18-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "Responses that vary by `Origin` omit `Vary: Origin` unless the origin is allowed, and the tests require the omission"
  - id: WR-02
    severity: warning
    disposition: open
    title: "The test for \"fails startup naming the entry\" cannot fail for the `*` cases"
  - id: IN-01
    severity: info
    disposition: open
    title: "The `moduleResolution: \"bundler\"` comment gives the wrong reason; Node-accurate `nodenext` already emits CommonJS here"
  - id: IN-02
    severity: info
    disposition: open
    title: "Preflight advertises methods no route implements and sets no `Access-Control-Max-Age`"
  - id: IN-03
    severity: info
    disposition: open
    title: "`.env.example` turns on a CORS origin when copied as-is"
  - id: IN-04
    severity: info
    disposition: open
    title: "`@tsconfig/strictest` is an unused devDependency"
  - id: IN-05
    severity: info
    disposition: open
    title: "No script runs the built server, and `start-server` no longer type-checks"
  - id: IN-06
    severity: info
    disposition: open
    title: "The verification block is copied into four CI jobs"
---

# Phase 18: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-06 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
