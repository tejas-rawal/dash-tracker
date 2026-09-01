---
gsd_state_version: 1.0
milestone: v0.3
milestone_name: Favorited & Recent Routes
status: Awaiting next milestone
stopped_at: Phase 07 complete — all phases complete
last_updated: "2026-09-01T14:31:28.549Z"
last_activity: 2026-09-01
last_activity_desc: Milestone v0.3 completed and archived
state_head: a2946c4f1259fcf83e9b7c9fac71ae91ba9887b6
progress:
  total_phases: 3
  completed_phases: 3
  total_plans: 4
  completed_plans: 4
  percent: 100
current_phase: 07
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-01)

**Core value:** Riders can always see accurate, near-real-time arrival predictions for their stop.
**Current focus:** v0.3 shipped and tagged — planning next milestone via `/gsd-new-milestone`

## Current Position

Phase: Milestone v0.3 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-09-01 — Milestone v0.3 completed and archived

## Performance Metrics

**Velocity:**

- Total plans completed (v0.3): 0
- Average duration: - min
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 (v0.1) | 1 | - | - |
| 2 (v0.1) | 1 | - | - |
| 3 (v0.2) | 2 | - | - |
| 4 (v0.2) | 1 | 8min | 8min |
| 5 (v0.3) | TBD | - | - |
| 6 (v0.3) | TBD | - | - |
| 7 (v0.3) | TBD | - | - |
| 05 | 2 | - | - |
| 06 | 1 | - | - |
| 07 | 1 | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 04 P01 | 8min | 3 tasks | 11 files |
| Phase 05 P02 | 45min | 3 tasks | 12 files |
| Phase 06 P01 | 8min | 3 tasks | 12 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v0.3, Phase 6] Favorites/recents identity is an anonymous device ID sent via `X-Device-Id` header, no auth system — device ID becomes a natural foreign key if real accounts are added later
- [v0.3, Phase 5/6] Favorites/recents persisted in SQLite behind a new repository, isolated from the existing `BusDataRepository` — zero ops, fits existing repository-pattern architecture
- [v0.3, Phase 6] Unfavorite is a plain SQL DELETE with no rows-affected check; repository upsert uses `INSERT ... ON CONFLICT DO UPDATE` — makes both favorite-an-already-favorited and unfavorite-a-non-favorite true no-op successes, no read-then-write race
- [v0.3, Phase 7] Recents are auto-logged on any prediction/stop lookup rather than requiring a dedicated "log view" call — reflects actual usage automatically
- [v0.3, Phase 7] Route recents are persisted keyed by the route's internal `id` (resolved from the client-supplied short name at write time), not the short name — matches the id-keyed lookup `resolveEntity`/`getRouteById` already uses; caught as a pre-ship BLOCKER (CR-01) in code review after route recents silently failed to hydrate
- v0.2: Use Server-Sent Events (not WebSocket) for live predictions, with REST retained as fallback
- v0.2: Server runs one shared 30s upstream poll per subscribed stop, stopping when idle, resuming on new subscriber
- [Phase 05]: Installed better-sqlite3@^12.11.1 (not latest 13.0.3): v13 requires Node >=22 and its native binary crashed under both Bun 1.0.31 and system Node 20.20.2 in this environment

### Pending Todos

None yet.

### Blockers/Concerns

- ⚠️ [Phase 1, v0.1] `lint:fix` uses Biome's deprecated `--apply-unsafe` flag (should become `--write --unsafe` per Biome 1.9.4); non-blocking, not yet addressed.
- ⚠️ [Phase 3] Code review (archived: `.planning/milestones/v0.2-phases/03-stop-discovery/03-REVIEW.md`) flagged 2 non-blocking edge cases: empty-string `lat`/`lng` query params coerce to `0` instead of 400ing in `StopController`; `StopService.getNearbyStops` doesn't lower-bound `count` if called directly (not reachable via the controller today). Neither blocks Phase 3 completion.
- ⚠️ [Phase 4, v0.2] Residual WR-05 from the 3-iteration code-review fix cycle (archived: `.planning/milestones/v0.2-phases/04-live-predictions-via-sse/04-REVIEW.md`): `PredictionStreamController`'s initial SSE write is guarded only against synchronous throws — a mid-write client-socket error surfaces asynchronously via an `'error'` event with no handler anywhere in `src/server`. Non-blocking, doesn't violate any LIVE-01..05 requirement.
- ⚠️ [v0.2] An unrelated, pre-existing uncommitted fix to `BusDataRepository.ts` (dedupe `initialize()`/`refreshData()` load paths) was swept into the v0.2 execution history by the automated code-review-fix pipeline (commit `b52c130`) — correct fix, but out of Phase 3/4 scope and not explicitly approved before landing. Flagged to the user; left in place.
- ⚠️ [Phase 6, v0.3] `FavoritesController.unfavorite` doesn't validate `entityId` the way `favorite` does, and `favorite`'s `entityId` is trim-validated but the untrimmed value is what's persisted/looked up — both whitespace-padded-id edge cases (WR-01/WR-03, `.planning/phases/06-favorites-routes-stops/06-REVIEW.md`). Non-blocking, doesn't violate any FAV-01..05/DEVICE-01 requirement.
- ⚠️ [Phase 7, v0.3] `RecentsController.resolveDeviceId` unsafely casts the device-id header to `string` with no in-controller guard; its `NotFoundError`→404 branch is unreachable; device-id header parsing is duplicated across 4 files; the recents cap (`5`) is a magic number in a SQL string; `resolveEntity` is duplicated verbatim between `RecentsService`/`FavoritesService` (WR-02/WR-03/IN-01/IN-02/IN-03, `.planning/phases/07-recents-routes-stops/07-REVIEW.md`). Non-blocking, doesn't violate any RECENT-01..06 requirement.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260827-j3c | Discard current changes to CLAUDE.md, add Engineering Principles section, remove Core Value/Constraints sections from CLAUDE.md and AGENTS.md | 2026-08-27 | fd24325 | [260827-j3c-discard-current-changes-to-claude-md-add](./quick/260827-j3c-discard-current-changes-to-claude-md-add/) |
| 260827-jaa | Consolidate root CLAUDE.md and .claude/CLAUDE.md into a single canonical .claude/CLAUDE.md; delete root CLAUDE.md | 2026-08-27 | 09f054c | [260827-jaa-consolidate-root-claude-md-and-claude-cl](./quick/260827-jaa-consolidate-root-claude-md-and-claude-cl/) |

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| Requirement | LIVE-06: Bidirectional WebSocket support for switching subscribed stop without reconnecting | Deferred to v2 | Roadmap creation | v0.2 |
| Requirement | LIVE-07: Client-configurable poll/update interval | Deferred to v2 | Roadmap creation | v0.2 |

## Session Continuity

Last session: 2026-09-01
Stopped at: Phase 07 complete, all v0.3 phases complete — ready to close milestone
Resume file: None

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
