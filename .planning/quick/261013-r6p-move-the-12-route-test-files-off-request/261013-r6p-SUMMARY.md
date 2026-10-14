---
quick_id: 261013-r6p
phase: quick-261013-r6p
plan: 01
status: complete
subsystem: testing
tags: [vitest, supertest, route-tests, test-isolation, deferred-items]
requires: []
provides:
  - One long-lived app server per route test file (12 files)
  - Resolved Phase 12 and Phase 14 deferred items
affects:
  - src/server/api/routes/*.test.ts
tech-stack:
  added: []
  patterns:
    - "Route tests start one app.listen(0) server in beforeAll (await 'listening') and close it in afterAll with closeAllConnections() then close()"
    - "Fake-DASH files name their servers dashServer/appServer and tear both down in one Promise.all"
key-files:
  created: []
  modified:
    - src/server/api/routes/dataNotReady.test.ts
    - src/server/api/routes/busRoutes.test.ts
    - src/server/api/routes/favoriteRoutes.test.ts
    - src/server/api/routes/recentRoutes.test.ts
    - src/server/api/routes/stopRoutes.test.ts
    - src/server/api/routes/healthRoutes.test.ts
    - src/server/api/routes/predictionRoutes.test.ts
    - src/server/api/routes/alertHygiene.test.ts
    - src/server/api/routes/dataBootRetry.test.ts
    - src/server/api/routes/dataReload.test.ts
    - src/server/api/routes/dataReloadStream.test.ts
    - src/server/api/routes/upstreamTimeout.test.ts
    - .planning/phases/12-bounded-upstream-calls-error-safety-nets/deferred-items.md
    - .planning/phases/14-health-checks-rate-limiting/deferred-items.md
decisions:
  - "The server start/stop hooks are inlined in each file, with no shared helper, so they match the existing rateLimit/trustProxy/streamCap copies"
  - "Files with several top-level describes use a module-level server and top-level hooks; files with one describe put them inside it"
metrics:
  duration: "~3 min"
  completed: 2026-10-13
  tasks: 3
  files: 14
plan_head_before: f2c437a6450e67bc50f2dc6c2f493f2e0ca34a94
actuals:
  tokens: 15500
  tasks: 3
  commits: 4
---

# Quick Task 261013-r6p: Route tests on one long-lived server per file Summary

All 12 route test files under `src/server/api/routes/` now send their requests to one `http.Server` per file. Each server is started once in `beforeAll` (the hook awaits `"listening"`) and closed once in `afterAll` (`closeAllConnections()`, then `close()`). Before this change, supertest got the bare Express app and started and stopped a new server for every request. Node 20's keep-alive agent could then reuse a pooled socket and land a request on a different server. The predictionRoutes stream tests used to start their own servers and now use the file's server. The Phase 12 and Phase 14 deferred items are marked resolved, with evidence.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Tracer: dataNotReady.test.ts on one server | 1562964 | dataNotReady.test.ts |
| 2 | Mocked-service route files + predictionRoutes stream tests | 385283e | busRoutes, favoriteRoutes, recentRoutes, stopRoutes, healthRoutes, predictionRoutes `.test.ts` |
| 3 (A/B) | Fake-DASH route files onto a long-lived appServer | b49d99a | alertHygiene, dataBootRetry, dataReload, dataReloadStream, upstreamTimeout `.test.ts` |
| 3 (C) | Resolve Phase 12 and Phase 14 deferred items | d87ba31 | two `deferred-items.md` files |

## Verification

- Scope re-grep at start matched the plan: the 12 route files plus the known false positive `middleware/upstreamRateLimit.test.ts`, which was left untouched.
- Per-group counts are unchanged: dataNotReady 8/8, the Task 2 group 81/81, the Task 3 group 14/14. Type checking reported no errors in each group.
- Full suite: `Test Files 53 passed (53)`, `Tests 853 passed (853)`, `Type Errors no errors`.
- `bun run test:coverage` exits 0 (98.78 / 96.48 / 97.85 / 98.78), so the known flaky upstreamRateLimit test did not need a re-run. `bun run lint` and `bun run build` both exit 0.
- No bare-app supertest call remains under `src/server/api/routes/`. Each of the 12 files has exactly one `listen(0)` and a `closeAllConnections()` teardown.
- `git diff --name-only f2c437a -- src/` lists exactly the 12 route test files.
- `gsd-tools audit-open --json` reports `deferred_items=0`.

## Deviations from Plan

**1. [Rule 1 - Bug] Updated a comment in predictionRoutes that no longer matched the code**
- **Found during:** Task 2
- **Issue:** The first stream test's comment said the 20 ms wait came "before closing the server", but that test no longer closes a server.
- **Fix:** Changed the comment to "before the next test". The wait itself is unchanged.
- **Commit:** 385283e

**2. [Formatting] Wrapped the one-line "why" comment onto two lines**
- The suggested comment was 158 characters, longer than the project's 120-character width, so it is wrapped onto two lines in each file. The wording is the same in every file.

Otherwise the plan was followed as written.

## Notes

- STATE.md and ROADMAP.md were not touched, as the quick-task constraints require. The orchestrator handles the docs commit for this SUMMARY.

## Self-Check: PASSED

- All 14 modified files exist. Commits 1562964, 385283e, b49d99a and d87ba31 are in `git log`.
