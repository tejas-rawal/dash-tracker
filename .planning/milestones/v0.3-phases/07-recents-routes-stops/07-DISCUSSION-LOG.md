# Phase 7: Recents (Routes & Stops) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-31
**Phase:** 7-Recents (Routes & Stops)
**Areas discussed:** Device ID requirement on predictions, Fire-and-forget logging, Cap-at-5 eviction, Recents list endpoint shape

---

## Device ID on the prediction endpoint

| Option | Description | Selected |
|--------|-------------|----------|
| Required (400 if missing) | Mount `requireDeviceId` on the predictions router too — consistent with favorites but breaking to the existing prediction endpoint contract. | |
| Optional (skip logging silently) | Predictions endpoint stays as-is; if `X-Device-Id` is absent, the recent-logging side effect is just skipped, no 400, no error. | ✓ |

**User's choice:** Optional (skip logging silently)
**Notes:** Preserves the existing prediction endpoint's contract for clients that don't send the header.

---

## Fire-and-forget logging

| Option | Description | Selected |
|--------|-------------|----------|
| Fire-and-forget after building the result | Call recents-logging without awaiting, `.catch()` logs a warning, return result immediately. | ✓ |
| Awaited but caught | Await inside try/catch, swallow errors, then return — but still adds latency per lookup. | |

**User's choice:** Fire-and-forget after building the result
**Notes:** Recommended option chosen — matches success criterion 5 (never delays or breaks the response, even on persistence failure).

---

## Cap-at-5 eviction

| Option | Description | Selected |
|--------|-------------|----------|
| Inside the repository upsert call | After upserting, the repository runs a DELETE keeping only the 5 most-recent rows per device_id, atomically. | ✓ |
| In the service layer, as a separate step | Service calls upsert then a separate trim/evict method — two round-trips, easier to forget for future callers. | |

**User's choice:** Inside the repository upsert call
**Notes:** Recommended option chosen — callers never need to think about the cap.

---

## Recents list endpoint shape

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror Favorites exactly, move on | `GET /api/v1/recents` returns combined, hydrated, type-tagged list, same shape as favorites but `viewedAt` instead of `favoritedAt`. | ✓ |
| I want to discuss something specific | Raise a specific point before writing context. | |

**User's choice:** Mirror Favorites exactly, move on
**Notes:** No further gray areas — confirmed direct mirror of the Phase 6 Favorites pattern.

---

## Claude's Discretion

- Exact TypeScript types/interfaces (reusing `RecentRecord` from Phase 5), service/controller method names, and test structure.
- Whether the fire-and-forget call logs the route entity, the stop entity, or both in a single call vs two separate calls.

## Deferred Ideas

None — discussion stayed within phase scope.
