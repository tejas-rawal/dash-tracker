---
status: testing
phase: 17-monorepo-restructure
source: [17-VERIFICATION.md]
started: 2026-10-23T17:46:48Z
updated: 2026-10-23T17:46:48Z
---

## Current Test

number: 1
name: Server boot from apps/server (start-server, root dev:server, restart on change, Ctrl-C stop)
expected: |
  health/live 200 from both; SQLite under apps/server/data/; nodemon restart on touch; no orphans after Ctrl-C
awaiting: user response

## Tests

### 1. Server boot from apps/server (start-server, root dev:server, restart on change, Ctrl-C stop)
expected: health/live 200 from both; SQLite under apps/server/data/; nodemon restart on touch; no orphans after Ctrl-C
result: [pending]

### 2. Fresh Superset workspace: setup, run, stop
expected: frozen install; apps/server/.env written, no root env file; run serves 200; stop leaves no bun/nodemon/ts-node and frees the port
result: [pending]

### 3. One-time move of the local env file and data/ into apps/server (this worktree and the main checkout)
expected: After the move, `bun run dev:server` boots, and existing favorites and recents are still there.
result: [pending]

### 4. Push the branch, open the Phase 17 PR, and confirm all 4 CI jobs pass
expected: Every job's "Verify Bun pin and clean install" step prints "packageManager Bun: 1.3.14, installed Bun: 1.3.14" with an empty porcelain status. test:coverage passes, and Codecov uploads ./apps/server/coverage/clover.xml.
result: [pending]

### 5. Merge the Phase 17 PR with a merge commit, never a squash (prohibition, D-01)
expected: Rename commit 0be937b is reachable from main, and `git log --follow -- apps/server/src/app.ts` on main still lists b904b99
result: [pending]

### 6. Review the two test-tier prohibitions (install gates and coverage gate not weakened)
expected: Accept the grep and diff evidence in 17-VERIFICATION.md, or require a wired enforcement test
result: [pending]

### 7. Decide on the 3 backstop truths: atomic move under interruption, test-file order independence, fan-out order independence
expected: Accept the circumstantial evidence, or ask for held-out or property tests
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
