---
phase: 03-stop-discovery
plan: 01
subsystem: stop-discovery-api
tags: [express, rest-api, stop-discovery, tracer]
status: complete

dependency-graph:
  requires: []
  provides:
    - "GET /api/v1/routes/:shortName/stops endpoint"
    - "StopService/StopController pair (new concern, distinct from BusRouteService/BusRouteController)"
    - "RouteDirectionStops response type"
  affects:
    - "src/server/api/routes/busRoutes.ts (new nested route added)"

tech-stack:
  added: []
  patterns:
    - "Factory-function DI (createStopService(repository), createStopController(service)) mirroring createBusRouteService/createBusRouteController"
    - "resolveErrorStatus/resolveErrorBody controller error-mapping pair mirroring PredictionController"
    - "API-response-shape models kept separate from domain models (StopDiscovery.ts, per Prediction.ts convention)"

key-files:
  created:
    - src/server/api/models/StopDiscovery.ts
    - src/server/api/services/StopService.ts
    - src/server/api/services/StopService.test.ts
    - src/server/api/controllers/StopController.ts
    - src/server/api/controllers/StopController.test.ts
  modified:
    - src/server/api/models/index.ts
    - src/server/api/routes/busRoutes.ts
    - src/server/api/routes/busRoutes.test.ts

decisions:
  - "Followed CONTEXT.md D-03: StopService/StopController implemented as a new, distinct pair rather than folded into BusRouteService/BusRouteController"
  - "Followed CONTEXT.md D-04: response groups stops by direction (route.directions.map), never calling BusRoute.getAllStops() which dedupes/flattens across directions"

metrics:
  duration: "~35 min"
  completed: 2026-08-26

actuals:
  tokens: 4665
  tasks: 2
  commits: 3
---

# Phase 3 Plan 01: Stops-for-a-Route Endpoint Summary

Stood up a new `StopService`/`StopController` pair and wired `GET /api/v1/routes/:shortName/stops`, returning the ordered, per-direction list of stops for a route — proving the full routes → controllers → services → repository path end-to-end for stop discovery (STOP-01), grouped by `RouteDirection` rather than deduped into a flat list.

## What Was Built

- **`src/server/api/models/StopDiscovery.ts`** — `RouteDirectionStops` interface (`{ directionId, title, stops }`), a response-shape type kept separate from domain models, following the existing `Prediction.ts` convention. Barrel-exported from `src/server/api/models/index.ts`.
- **`src/server/api/services/StopService.ts`** — `createStopService(repository)` factory exposing `getStopsForRoute(shortName)`. Looks up the route via `repository.getRouteByShortName`, throws `NotFoundError` on a miss (mirroring `BusRouteService.getAgencyRoute`), then maps `route.directions` directly to `{ directionId, title, stops }` per direction — deliberately not using `BusRoute.getAllStops()`, which dedupes/flattens across directions (CONTEXT D-04).
- **`src/server/api/controllers/StopController.ts`** — `createStopController(service)` factory with a synchronous `getStopsForRoute` `RequestHandler` (no upstream calls in this phase, so no `async`/`await`), following `PredictionController`'s `resolveErrorStatus`/`resolveErrorBody` pattern trimmed to only the `NotFoundError` → 404 case (no `UpstreamApiError` case needed here).
- **`src/server/api/routes/busRoutes.ts`** — added `createStopService`/`createStopController` wiring and a new `router.get("/:shortName/stops", stopController.getStopsForRoute)` route, appended after the two existing routes without reordering or modifying them.
- **Test coverage** — `StopService.test.ts` (7 tests) and `StopController.test.ts` (5 tests) cover the grouped-by-direction happy path, `NotFoundError` propagation/message, empty-direction inclusion, shared-stop-across-directions (no dedup), real stop-sequence-order preservation, and zero-directions routes. `busRoutes.test.ts` gained a new `GET /api/v1/routes/:shortName/stops` describe block (13 tests total in the file, up from 11) covering 200/404/param-passthrough plus the empty-direction and shared-stop edge cases at the integration level — the two pre-existing describe blocks (`GET /all`, `GET /:shortName`) were left untouched and still pass unmodified, proving no regression.

## Deviations from Plan

### Auto-fixed Issues

**1. [Setup — not a Rule 1-4 code deviation] Worktree branch was missing 6 commits from `main`, including the plan file itself**
- **Found during:** Initial file discovery (Read tool returned "File does not exist" for `03-01-PLAN.md`)
- **Issue:** This worktree's branch (`worktree-agent-a3d2b3db0fbaffa96`) was created from an older point on `main` (commit `c2b7eaf`) before the planning session that produced `03-01-PLAN.md`, `03-CONTEXT.md`, `REQUIREMENTS.md`, and an updated `ROADMAP.md`/`PROJECT.md`/`STATE.md` (commits through `504970c`, "docs(03): create phase plan"). The worktree branch was a strict ancestor of `main` with zero divergence.
- **Fix:** Ran `git merge --ff-only main` inside the worktree — a pure fast-forward (no merge commit, no conflicts possible) that brought in the missing `.planning/` docs needed to execute this plan.
- **Files affected:** `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`, `.planning/phases/03-stop-discovery/{03-01-PLAN.md,03-02-PLAN.md,03-CONTEXT.md,03-DISCUSSION-LOG.md}` (all newly present, no working-tree changes to source code).
- **Commit:** fast-forward, no new commit hash (HEAD moved from `c2b7eaf` to `504970c`).

**2. [Setup] `03-PATTERNS.md` was untracked on `main`, so it wasn't carried by the merge**
- **Found during:** Same discovery pass — `03-PATTERNS.md` is referenced in the plan's `<context>` block but was still untracked (uncommitted) in the main checkout, so `git merge` couldn't pick it up.
- **Fix:** Read the file's content directly from the main checkout's working tree (outside the worktree, via the Read tool) and wrote an identical copy into this worktree, then committed it as its own docs commit so Plan 03-02 (which shares this pattern map) has it available too.
- **Files affected:** `.planning/phases/03-stop-discovery/03-PATTERNS.md` (new file, worktree-only).
- **Commit:** `730602e`

No code-level (Rule 1-4) deviations occurred — the Task 1 implementation was correct on the first pass, and Task 2's edge-case tests passed without surfacing any defect requiring a production-code fix.

## Auth Gates

None encountered.

## Verification

- `bun run test -- src/server/api/services/StopService.test.ts src/server/api/controllers/StopController.test.ts src/server/api/routes/busRoutes.test.ts` — 20/20 passed (Task 1 scope)
- `bun run test -- src/server/api/services/StopService.test.ts src/server/api/routes/busRoutes.test.ts` — 20/20 passed (Task 2 scope, includes new edge-case tests)
- `bun run test` (full suite) — 158/158 passed, 13 test files, no regressions
- `bun run lint` — exits 0 (17 pre-existing-style Biome warnings only, same `useFilenamingConvention`/`useThrowOnlyError` categories already present repo-wide before this plan; no new error-level findings)
- `grep -c "getAllStops" src/server/api/services/StopService.ts` → `0` (confirms `route.getAllStops()` was not used)
- `grep -c "router.get(\"/:shortName/stops\"" src/server/api/routes/busRoutes.ts` → `1`

## Known Stubs

None — this plan implements a complete, working endpoint with no placeholder data paths.

## Self-Check: PASSED

- FOUND: src/server/api/models/StopDiscovery.ts
- FOUND: src/server/api/services/StopService.ts
- FOUND: src/server/api/services/StopService.test.ts
- FOUND: src/server/api/controllers/StopController.ts
- FOUND: src/server/api/controllers/StopController.test.ts
- FOUND: commit 1321542 (feat(03-01): end-to-end stops-by-route endpoint, grouped by direction)
- FOUND: commit 730602e (docs(03): restore pattern map missing from worktree branch)
- FOUND: commit 5359415 (test(03-01): harden STOP-01 edge cases — adjacency, ordering, empty direction)
