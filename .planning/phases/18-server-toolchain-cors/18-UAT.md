---
status: complete
phase: 18-server-toolchain-cors
source: [18-VERIFICATION.md]
started: 2026-11-13T19:07:35Z
updated: 2026-11-17T21:39:02.649Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server. Start the server from scratch on Node 24.22.2 under tsx. It boots without errors, opens SQLite under apps/server/data/, loads routes/stops from DASH, and health/live returns 200; /routes/all carries color/textColor.
result: pass
note: "Verified by Claude 2026-11-16: nothing running, port free, node v24.22.2; `bun run start-server` (tsx src/app.ts) from apps/server: health/live 200 after 2s, health/ready ready; SQLite at data/dash-tracker.sqlite; DASH load attempt 1: 12 routes, 533 stops; /routes/all 12 routes all with 6-hex color/textColor (30 006899/ffffff); SIGINT to the process group logged graceful shutdown, no leftovers, port free."

### 2. dev-server restart and signal cleanup under tsx
expected: Root dev:server restarts after touching apps/server/src/app.ts; Ctrl-C, start-server + SIGINT and dev-server + SIGTERM each log "Server is gracefully shutting down", leave no tsx/node process and free the port.
result: pass
note: "Verified by Claude 2026-11-17 on Node 24.22.2: root `bun run dev:server` live 200, restarted 2s after touch of apps/server/src/app.ts, 200 again, SIGINT to its process group left no tsx/node process and freed port 3000; `dev-server` + SIGTERM to the bun pid alone logged graceful shutdown, clean; `start-server` + SIGINT to its group logged graceful shutdown, clean (also passed in Test 1)."

### 3. Superset terminal dispose (harvested 18-02 human-check)
expected: Fresh Superset workspace from this branch: frozen install succeeds on Node 24.22.2; Run serves health/live 200; disposing the terminal from Superset leaves no tsx watch process and frees port 3000.
result: pass
note: "Verified by Claude 2026-11-17 in a real Paradev (formerly Superset) workspace via the CLI (paradev ws create --local, terminals create/close). The workspace forked from the pushed tip (73a38e8), so the throwaway branch was reset to local HEAD 4596e5e and node_modules deleted; frozen install in a workspace terminal: 307 packages, exit 0, Node v24.22.2, better-sqlite3 loads on ABI 137, bun pm untrusted 0, clean git status. Run `cd apps/server && exec bun run dev-server` in a Paradev terminal: health/live 200 after 4s (tsx watch on Node 24.22.2). terminals close disposed it: no tsx/node/esbuild left, port 3000 free. Workspace and branch deleted. Not repeated from the desktop UI."

### 4. First CI run of the updated workflow
expected: Push the branch; all 4 GitHub Actions jobs pass; the verify step shows v24.22.2, Bun 1.3.14, 0 untrusted packages and a clean tree after a fresh frozen install; the Build job's boot smoke gets 200 and exits 0 on SIGTERM.
result: pass
note: "Verified by Claude 2026-11-17 on PR #18, CI run 44181827294 (pull_request, head b76b7b4, after scrubbing the machine hostname from the unpushed 18-04 TDD evidence by rewriting local history, then pushing). All 4 jobs success. setup-node@v7 resolved .node-version as 24.22.2 (node v24.22.2) in each job; each verify step printed 'packageManager Bun: 1.3.14, installed Bun: 1.3.14' and 'Found 0 untrusted dependencies with scripts.' and passed its Node-version and clean-tree checks after a fresh frozen install. Build job boot smoke: dist/app.js health/live {\"status\":\"ok\"}, graceful shutdown on SIGTERM, server exit status 0. Tests 922 passed; Codecov upload queued."

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
