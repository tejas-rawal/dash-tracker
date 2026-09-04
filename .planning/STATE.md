---
gsd_state_version: 1.0
milestone: v0.4
milestone_name: Service Alerts
current_phase: 06
current_phase_name: Alerts Surfaced on Routes, Stops & Predictions
status: executing
stopped_at: Phase 6 context gathered
last_updated: "2026-09-04T21:22:30.130Z"
last_activity: 2026-09-04
last_activity_desc: Phase 05 complete, transitioned to Phase 6
state_head: ab14a35d0ca17a4aeb77e1e680e95f242c8add8a
progress:
  total_phases: 2
  completed_phases: 1
  total_plans: 8
  completed_plans: 6
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-04)

**Core value:** Riders can always see accurate, near-real-time arrival predictions for their stop.
**Current focus:** Phase 6 — Alerts Surfaced on Routes, Stops & Predictions

## Current Position

Phase: 06 (Alerts Surfaced on Routes, Stops & Predictions) — READY TO EXECUTE
Plan: Not started
Status: Ready to execute
Last activity: 2026-09-04 — Phase 05 complete, transitioned to Phase 6

## Performance Metrics

**Velocity:**

- Total plans completed (v0.2): 0
- Average duration: - min
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 (v0.1) | 1 | - | - |
| 2 (v0.1) | 1 | - | - |
| 3 (v0.2) | 2 | - | - |
| 4 (v0.2) | TBD | - | - |
| 04 | 1 | - | - |
| 5 (v0.4) | TBD | - | - |
| 6 (v0.4) | TBD | - | - |
| 05 | 6 | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 04 P01 | 8min | 3 tasks | 11 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v0.2: Use Server-Sent Events (not WebSocket) for live predictions, with REST retained as fallback
- v0.2: Server runs one shared 30s upstream poll per subscribed stop, stopping when idle, resuming on new subscriber
- v0.2: Repo will eventually house both backend and Expo/React Native frontend (monorepo); frontend itself deferred
- [Phase 3] Stop discovery lives in a new `StopController`/`StopService` pair, kept separate from `BusRouteController`/`BusRouteService`
- [Phase 3] `GET /:shortName/stops` groups stops by direction (not a deduped flat list) — locked public contract, iterate `route.directions` directly
- [Phase 5] Request `?format=json` explicitly from DASH/Swiftly's `gtfs-rt-alerts/v2` endpoint — it defaults to protobuf-binary otherwise
- [Phase 5] Live alert payload is a flat, custom Swiftly/Alexandria JSON format (bare top-level array, camelCase, ISO-8601 dates) — not the nested GTFS-RT-protobuf-derived `{entities:[...]}` shape early rounds assumed from an auto-generated doc example

### Pending Todos

None yet.

### Blockers/Concerns

- ⚠️ [Phase 1, v0.1] `lint:fix` uses Biome's deprecated `--apply-unsafe` flag (should become `--write --unsafe` per Biome 1.9.4); non-blocking, not yet addressed.
- ⚠️ [Phase 3] Code review (archived: `.planning/milestones/v0.2-phases/03-stop-discovery/03-REVIEW.md`) flagged 2 non-blocking edge cases: empty-string `lat`/`lng` query params coerce to `0` instead of 400ing in `StopController`; `StopService.getNearbyStops` doesn't lower-bound `count` if called directly (not reachable via the controller today). Neither blocks Phase 3 completion.
- ⚠️ [Phase 4, v0.2] Residual WR-05 from the 3-iteration code-review fix cycle (archived: `.planning/milestones/v0.2-phases/04-live-predictions-via-sse/04-REVIEW.md`): `PredictionStreamController`'s initial SSE write is guarded only against synchronous throws — a mid-write client-socket error surfaces asynchronously via an `'error'` event with no handler anywhere in `src/server`. Non-blocking, doesn't violate any LIVE-01..05 requirement.
- ⚠️ [v0.2] An unrelated, pre-existing uncommitted fix to `BusDataRepository.ts` (dedupe `initialize()`/`refreshData()` load paths) was swept into the v0.2 execution history by the automated code-review-fix pipeline (commit `b52c130`) — correct fix, but out of Phase 3/4 scope and not explicitly approved before landing. Flagged to the user; left in place.
- ⚠️ [Phase 5, v0.4] The confirmed live DASH alert payload (G-05-5) includes `deletedAt`/`deletedBy` fields that `ServiceAlertService`/`ServiceAlertRepository` currently ignore entirely. If the DASH admin tool soft-deletes alerts instead of removing them from the feed, a deleted-but-still-time-active alert could still surface via `getActiveAlerts()`. Not addressed — out of scope for G-05-5 (response-shape parsing only). Consider before Phase 6 exposes alerts publicly.

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

Last session: 2026-09-04T18:28:33.684Z
Stopped at: Phase 6 context gathered
Resume file: .planning/phases/06-alerts-surfaced-on-routes-stops-predictions/06-CONTEXT.md

## Operator Next Steps

- `/gsd-discuss-phase 6` — gather context and clarify approach for Phase 6
- `/gsd-plan-phase 6` — skip discussion, plan directly
