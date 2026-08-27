---
phase: 04-live-predictions-via-sse
fixed_at: 2026-08-27T15:55:00Z
review_path: .planning/phases/04-live-predictions-via-sse/04-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 04: Code Review Fix Report

**Fixed at:** 2026-08-27T15:55:00Z
**Source review:** .planning/phases/04-live-predictions-via-sse/04-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (CR-01, CR-02, CR-03, WR-01, WR-02 — critical+warning scope; IN-01, IN-02 skipped as out of scope for this pass)
- Fixed: 5
- Skipped: 0

## Fixed Issues

### CR-01: Concurrent first-subscribers for the same new stop create duplicate, permanently-leaked poll loops

**Files modified:** `src/server/api/services/PredictionStreamService.ts`
**Commit:** `b4a2479`
**Applied fix:** Added a `pendingFirstFetch` map keyed by `stopId` (mirroring the `initializationPromise` pattern already used in `BusDataRepository`). `subscribe()` now shares the in-flight first fetch across concurrent first-subscribers for the same stop, and re-checks `loops.get(stopId)` after the awaited fetch resolves so a caller that raced past the shared fetch still joins the loop created by whichever caller won instead of creating a duplicate `setInterval`.

### CR-02: Disconnect cleanup handler registered after the initial fetch — a client that disconnects mid-subscribe leaks its loop forever

**Files modified:** `src/server/api/controllers/PredictionStreamController.ts`
**Commit:** `3931d58`
**Applied fix:** Registered a `req.on("close", () => { closed = true; })` listener before awaiting `streamService.subscribe(...)`. After the subscribe promise resolves, the handler checks `closed || req.destroyed` and calls `unsubscribe()` immediately (without ever writing SSE headers) if the client disconnected during the await window.

### CR-03: A single subscriber's failing write silently blocks delivery to every other subscriber of the same stop, and is misreported as an upstream failure

**Files modified:** `src/server/api/services/PredictionStreamService.ts`
**Commit:** `b4a2479` (same commit as CR-01 — both are localized, tightly-coupled changes within the same factory closure and were verified together)
**Applied fix:** Wrapped each `subscriber(result)` invocation inside `poll()`'s fan-out loop in its own try/catch, logging a distinct `Failed to deliver prediction update for stop {id}: {message}` message per failing subscriber instead of aborting the whole fan-out loop and misattributing the failure to the upstream fetch.

### WR-01: `resolveErrorBody`'s catch-all branch throws after headers may already be written

**Files modified:** `src/server/api/controllers/PredictionStreamController.ts`
**Commit:** `3931d58` (same commit as CR-02 — the two fixes touch the same function and were applied together)
**Applied fix:** Narrowed the try/catch to wrap only `streamService.subscribe(...)`; `res.writeHead(...)`, `send(initialPayload)`, and the cleanup `req.on("close", ...)` registration now run outside that try/catch. The catch block also guards with `if (res.headersSent) { return; }` before attempting to write a JSON error body, eliminating the `ERR_HTTP_HEADERS_SENT` double-fault path.

### WR-02: `PredictionStreamService.test.ts` and `PredictionStreamController.test.ts` do not cover the concurrency scenarios above

**Files modified:** `src/server/api/services/PredictionStreamService.test.ts`, `src/server/api/controllers/PredictionStreamController.test.ts`
**Commit:** `2964bea`
**Applied fix:** Added a service-level test that issues two `subscribe()` calls for the same brand-new stop without awaiting the first before starting the second (using a manually-controlled fetch promise), asserting the shared fetch is issued exactly once and only one loop/interval exists. Added a controller-level test that starts `getPredictionsStream`, triggers `close` while `streamService.subscribe(...)` is still pending (via a manually-controlled promise), then resolves the subscribe promise and asserts `unsubscribe()` was called with no headers/body ever written.

## Skipped Issues

None — all 5 in-scope findings (CR-01, CR-02, CR-03, WR-01, WR-02) were fixed. IN-01 and IN-02 were intentionally out of scope for this `critical+warning` pass per the fix-scope configuration and were not attempted.

## Verification

All three gates were run inside the isolated review-fix worktree (`.claude/worktrees/rf-04-63321-1787845549`, branch `gsd-reviewfix/04-63321`, fast-forwarded onto `main` on cleanup) after all 5 fixes were committed:

- **`bun run test`** — 17 test files, 215 tests, all passed (213 pre-existing + 2 new WR-02 regression tests). Vitest's `--typecheck` pass reported no type errors.
- **`bun run build`** — `tsc` compiled cleanly to `dist/` with no errors.
- **`bun run lint`** — Biome reported 19 warnings, all pre-existing filename-casing (`useFilenamingConvention`) and naming-convention (`useNamingConvention`) warnings unrelated to the fixed files; confirmed identical (19 warnings) when run against the pre-fix commit (`c0900b8`) via `git checkout c0900b8 -- .` inside the worktree. No new lint issues were introduced.

These results are reproducible from the fast-forwarded `main` branch in the primary checkout after cleanup, since the worktree's dependency tree was a symlink to the main checkout's already-installed `node_modules` (no separate install was performed).

---

_Fixed: 2026-08-27T15:55:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
