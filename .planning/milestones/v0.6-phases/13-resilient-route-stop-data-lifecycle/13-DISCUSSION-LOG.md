# Phase 13: Resilient Route/Stop Data Lifecycle - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-30
**Phase:** 13-resilient-route-stop-data-lifecycle
**Areas discussed:** 503 gating mechanism, Boot retry backoff, Refresh cadence & 'good load', Lifecycle ownership

---

## 503 gating mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Typed error | `DataNotReadyError` from `assertInitialized()`, 503 branch in controller mappers | ✓ |
| Router middleware | Readiness middleware in front of data-dependent routers | |
| Both | Middleware plus typed error safety net | |

| Option | Description | Selected |
|--------|-------------|----------|
| Body + Retry-After | `{ error, message }` plus `Retry-After` header | ✓ |
| Body only | No header | |

| Option | Description | Selected |
|--------|-------------|----------|
| Follow its lookups | SSE returns 503 only if stop validation reads the repo | ✓ |
| Always gate SSE | Reject all streams until loaded | |

| Option | Description | Selected |
|--------|-------------|----------|
| Extract shared helper | One error-response helper for all controllers (closes WR-02/IN-04) | ✓ |
| Add branch per controller | Keep duplicated mappers | |

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed short value | Constant ~5s | ✓ |
| Next retry time | Seconds until scheduler's next attempt | |
| You decide | Planner picks | |

**User's choice:** All recommended options.

---

## Boot retry backoff

| Option | Description | Selected |
|--------|-------------|----------|
| Exponential, capped | 1s doubling to 60s cap, jitter | ✓ |
| Exponential, lower cap | ~30s cap | |
| You decide | Planner picks | |

| Option | Description | Selected |
|--------|-------------|----------|
| Retry forever | Never give up | ✓ |
| Give up after N attempts | Stop or exit after a limit | |

| Option | Description | Selected |
|--------|-------------|----------|
| Module constants | Named constants like `POLL_INTERVAL_MS` | ✓ |
| Zod env vars | `BOOT_RETRY_*` env vars | |

| Option | Description | Selected |
|--------|-------------|----------|
| warn + next delay | One warn per attempt, info on success | ✓ |
| error each attempt | Error level every failure | |

**User's choice:** All recommended options.

---

## Refresh cadence & 'good load'

| Option | Description | Selected |
|--------|-------------|----------|
| Every hour | 24 bulk calls/day | ✓ |
| Every 15 minutes | 4× the calls | |
| Every 24 hours | Minimal load | |

| Option | Description | Selected |
|--------|-------------|----------|
| Treat as failure | Empty route list rejected, last good data kept | ✓ |
| Accept it | Apply empty dataset | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep all-or-nothing | Malformed stop fails whole attempt | ✓ |
| Drop bad stop + warn | Skip malformed stop | |

**Notes:** The user wanted to clarify the malformed-stop question: keep all-or-nothing, but surface that the load failed and the data wasn't refreshed. A follow-up asked which channel:

| Option | Description | Selected |
|--------|-------------|----------|
| Header on data responses | `X-Data-Loaded-At` on every data response | |
| Readiness endpoint only | Record failure state; Phase 14 readiness exposes it | ✓ |
| Field in response bodies | `dataLoadedAt`/`stale` in JSON (breaking) | |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, record last failure | `lastFailedAt` + message-only `lastError`, cleared on success | ✓ |
| lastLoadedAt only | Success timestamp only | |

| Option | Description | Selected |
|--------|-------------|----------|
| Chained setTimeout | No overlap; same loop as boot backoff | ✓ |
| setInterval, no guard | Alert-poll pattern | |

---

## Lifecycle ownership

| Option | Description | Selected |
|--------|-------------|----------|
| Separate refresh service | `createBusDataRefreshService(repository)` with start/stop | ✓ |
| Inside BusDataRepository | Repository owns timers | |

| Option | Description | Selected |
|--------|-------------|----------|
| One getLoadState() snapshot | `{ lastLoadedAt?, lastFailedAt?, lastError? }` | ✓ |
| Separate getters | `isReady()`, `getLastLoadedAt()`, `getLastFailure()` | |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, add stop() | Alert poll stopped on shutdown too | ✓ |
| No, route/stop only | Leave alert poll alone | |

| Option | Description | Selected |
|--------|-------------|----------|
| Still fatal, before listen | Await SQLite init, exit 1 on failure | ✓ |
| Also background / non-fatal | Favorites/recents 503 until DB ready | |

**User's choice:** All recommended options.

---

## Claude's Discretion

- Jitter formula, exact Retry-After seconds, shared error helper name/location, test timer strategy, `DataNotReadyError` message text.

## Deferred Ideas

- Per-response data-freshness header/body field for the rider app.
- Per-stop drop-and-warn for malformed upstream stops.
