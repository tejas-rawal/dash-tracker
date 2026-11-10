---
status: complete
phase: 17-monorepo-restructure
source: [17-VERIFICATION.md]
started: 2026-10-23T17:46:48Z
updated: 2026-11-10T16:51:00.391Z
---

## Current Test

[testing complete]

## Tests

### 1. Server boot from apps/server (start-server, root dev:server, restart on change, Ctrl-C stop)
expected: health/live 200 from both; SQLite under apps/server/data/; nodemon restart on touch; no orphans after Ctrl-C
result: pass
note: "Run by Claude at user's request after moving the root env file into apps/server: start-server and root dev:server both live 200, SQLite at apps/server/data/dash-tracker.sqlite, nodemon restarted on touch of src/app.ts, SIGINT to the process group left no ts-node/nodemon and freed port 3000"

### 2. Fresh Superset workspace: setup, run, stop
expected: frozen install; apps/server/.env written, no root env file; run serves 200; stop leaves no bun/nodemon/ts-node and frees the port
result: pass
note: "Verified by Claude 2026-11-10 in a real Superset workspace (uat-17-superset, created with superset ws create --local from main @ caffee2). Workspace Setup terminal: bun install --frozen-lockfile installed 343 packages, setup script created apps/server/.env, no root env file, clean git status. Run command (cd apps/server && exec bun run dev-server) in a Superset terminal: health/live 200 after 4s. superset terminals close disposed the terminal: no bun/nodemon/ts-node left and port 3000 free. The earlier hand-run SIGHUP orphan does not reproduce through Superset's terminal dispose."

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
result: pass
note: "Verified by Claude after merging PR #17 with gh pr merge --merge: main is merge commit caffee2 (parents b904b99, 1df28f2); git merge-base --is-ancestor 0be937b origin/main succeeds; git log --follow -- apps/server/src/app.ts on main lists 0be937b and b904b99 (14 commits)."

### 6. Review the two test-tier prohibitions (install gates and coverage gate not weakened)
expected: Accept the grep and diff evidence in 17-VERIFICATION.md, or require a wired enforcement test
result: pass

### 7. Decide on the 3 backstop truths: atomic move under interruption, test-file order independence, fan-out order independence
expected: Accept the circumstantial evidence, or ask for held-out or property tests
result: pass
note: "Truth 20 checked directly: vitest --sequence.shuffle.files with seeds 1234, 98765, 42 passes 853/853 each time. Truths 19 and 21 accepted on circumstantial evidence (single rename commit 0be937b with 123 R100 entries; apps/ holds only server)."

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

## Deferred Follow-Ups

- test: 7
  idea: "apps/server/src/api/routes/healthRoutes.test.ts is order-dependent within the file: vitest --sequence.shuffle.tests (seeds 1234, 98765, 42) fails 1-2 'before the first successful route/stop load' tests because the BusDataRepository singleton is never reset between tests. Pre-existing since v0.6 (b904b99), not a Phase 17 regression; normal CI order passes."
  deferred_at: 2026-11-04
