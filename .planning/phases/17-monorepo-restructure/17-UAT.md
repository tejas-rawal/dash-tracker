---
status: testing
phase: 17-monorepo-restructure
source: [17-VERIFICATION.md]
started: 2026-10-23T17:46:48Z
updated: 2026-11-04T12:30:00Z
---

## Current Test

number: 5
name: Merge the Phase 17 PR with a merge commit, never a squash (prohibition, D-01)
expected: |
  Rename commit 0be937b is reachable from main, and `git log --follow -- apps/server/src/app.ts` on main still lists b904b99
awaiting: user response

## Tests

### 1. Server boot from apps/server (start-server, root dev:server, restart on change, Ctrl-C stop)
expected: health/live 200 from both; SQLite under apps/server/data/; nodemon restart on touch; no orphans after Ctrl-C
result: pass
note: "Run by Claude at user's request after moving the root env file into apps/server: start-server and root dev:server both live 200, SQLite at apps/server/data/dash-tracker.sqlite, nodemon restarted on touch of src/app.ts, SIGINT to the process group left no ts-node/nodemon and freed port 3000"

### 2. Fresh Superset workspace: setup, run, stop
expected: frozen install; apps/server/.env written, no root env file; run serves 200; stop leaves no bun/nodemon/ts-node and frees the port
result: skipped
reason: "User skipped for now. Real Superset runner not exercised (CLI session expired). Hand-run of the config.json setup/run in a throwaway worktree: frozen install ok, apps/server/.env written with no root env file, live 200, SIGTERM and SIGINT leave no orphans and free the port; SIGHUP leaves bun run, nodemon and ts-node running on port 3000 (likely the bun run wrapper) - matters if Superset's stop closes the terminal"

### 3. One-time move of the local env file and data/ into apps/server (this worktree and the main checkout)
expected: After the move, `bun run dev:server` boots, and existing favorites and recents are still there.
result: pass
note: "Verified by Claude. This worktree: root env file moved into apps/server, dev:server boots (Test 1); no root data/ existed, apps/server/data/dash-tracker.sqlite has 0 favorites and 0 recents, so there was no prior data to carry over. Main checkout (main @ b904b99, pre-monorepo): only .env.example, no env file, no data/, nothing to move."

### 4. Push the branch, open the Phase 17 PR, and confirm all 4 CI jobs pass
expected: Every job's "Verify Bun pin and clean install" step prints "packageManager Bun: 1.3.14, installed Bun: 1.3.14" with an empty porcelain status. test:coverage passes, and Codecov uploads ./apps/server/coverage/clover.xml.
result: pass
note: "Verified by Claude on PR #17, CI run 40558783754 (user re-enabled the manually disabled CI workflow and added the CODECOV_TOKEN secret; failed job re-run). All 4 jobs pass; each prints 'packageManager Bun: 1.3.14, installed Bun: 1.3.14' and passes the porcelain check; test:coverage passes (53 files, 853 tests, 98.67% lines / 96.75% branches); Codecov found and uploaded apps/server/coverage/clover.xml."

### 5. Merge the Phase 17 PR with a merge commit, never a squash (prohibition, D-01)
expected: Rename commit 0be937b is reachable from main, and `git log --follow -- apps/server/src/app.ts` on main still lists b904b99
result: [pending]

### 6. Review the two test-tier prohibitions (install gates and coverage gate not weakened)
expected: Accept the grep and diff evidence in 17-VERIFICATION.md, or require a wired enforcement test
result: pass

### 7. Decide on the 3 backstop truths: atomic move under interruption, test-file order independence, fan-out order independence
expected: Accept the circumstantial evidence, or ask for held-out or property tests
result: pass
note: "Truth 20 checked directly: vitest --sequence.shuffle.files with seeds 1234, 98765, 42 passes 853/853 each time. Truths 19 and 21 accepted on circumstantial evidence (single rename commit 0be937b with 123 R100 entries; apps/ holds only server)."

## Summary

total: 7
passed: 5
issues: 0
pending: 1
skipped: 1
blocked: 0

## Gaps

## Deferred Follow-Ups

- test: 7
  idea: "apps/server/src/api/routes/healthRoutes.test.ts is order-dependent within the file: vitest --sequence.shuffle.tests (seeds 1234, 98765, 42) fails 1-2 'before the first successful route/stop load' tests because the BusDataRepository singleton is never reset between tests. Pre-existing since v0.6 (b904b99), not a Phase 17 regression; normal CI order passes."
  deferred_at: 2026-11-04
