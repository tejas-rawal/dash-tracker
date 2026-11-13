---
status: testing
phase: 18-server-toolchain-cors
source: [18-VERIFICATION.md]
started: 2026-11-13T19:07:35Z
updated: 2026-11-13T19:07:35Z
---

## Current Test

number: 1
name: Cold Start Smoke Test
expected: |
  Kill any running server. Start the server from scratch on Node 24.22.2 under tsx. It boots without errors, opens SQLite under apps/server/data/, loads routes/stops from DASH, and health/live returns 200; /routes/all carries color/textColor.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server. Start the server from scratch on Node 24.22.2 under tsx. It boots without errors, opens SQLite under apps/server/data/, loads routes/stops from DASH, and health/live returns 200; /routes/all carries color/textColor.
result: [pending]

### 2. dev-server restart and signal cleanup under tsx
expected: Root dev:server restarts after touching apps/server/src/app.ts; Ctrl-C, start-server + SIGINT and dev-server + SIGTERM each log "Server is gracefully shutting down", leave no tsx/node process and free the port.
result: [pending]

### 3. Superset terminal dispose (harvested 18-02 human-check)
expected: Fresh Superset workspace from this branch: frozen install succeeds on Node 24.22.2; Run serves health/live 200; disposing the terminal from Superset leaves no tsx watch process and frees port 3000.
result: [pending]

### 4. First CI run of the updated workflow
expected: Push the branch; all 4 GitHub Actions jobs pass; the verify step shows v24.22.2, Bun 1.3.14, 0 untrusted packages and a clean tree after a fresh frozen install; the Build job's boot smoke gets 200 and exits 0 on SIGTERM.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
