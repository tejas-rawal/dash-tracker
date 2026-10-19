---
phase: "13"
slug: "resilient-route-stop-data-lifecycle"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-15"
---

# Phase 13 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Verified retroactively on 2026-10-15, after the v0.6 milestone close, against the code at `c304626`. The `/gsd-ship v0.6` security gate found no SECURITY.md for this phase. The register is the union of the `<threat_model>` blocks in plans 13-01 to 13-07, which were all written at plan time. No SUMMARY recorded threat flags. Line references are to the current tree, which includes the later Phase 14–16 changes.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| API server to rider client | Every error body from route, stop, prediction, favorites, recents and nearby endpoints crosses here | Error `details` text (must not carry internals) |
| API server to log sink | 500 lines, loader warn lines and stream teardown lines leave the process | Error stack/message; must never carry `DASH_API_KEY`, rider lat/lng or `X-Device-Id` |
| DASH upstream to API server | Untrusted routes payload, which may be empty, malformed, failing or slow for long periods | Route/direction/stop records (public agency data) |
| Repository to readiness consumer | `getLoadState()` is serialized by Phase 14 readiness | `lastLoadedAt` / `lastFailedAt` / `lastError` (must be key-free) |
| Process supervisor to server | SIGTERM/SIGINT must end the process promptly | Signals |
| Rider client to SSE endpoint | Long-lived connections hold a socket and a shared per-stop poll | Stop id, prediction frames |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-13-01 | Information disclosure | 500 branch of `sendErrorResponse` | high | mitigate | Fixed body `{ error: "Request Failed", details: "An unexpected error occurred" }` (`errorResponse.ts:8,31`); thrown text never reaches the client | closed |
| T-13-02 | Information disclosure | 503 `details` | low | mitigate | `details` is the fixed `DataNotReadyError` text "Route and stop data is still loading" (`BusDataRepository.ts:258`), mapped at `errorResponse.ts:15-18` | closed |
| T-13-03 | Information disclosure | 500 log line | high | mitigate | One `logger.error` call with a single string built from stack/message or `String(error)` (`errorResponse.ts:29-30`), never the error object | closed |
| T-13-04 | Information disclosure | 500 log line context | medium | mitigate | No request URL or query is logged (`errorResponse.ts:26-30`), so `/stops/nearby` coordinates stay out of logs | closed |
| T-13-05 | Denial of service | Clients retrying while data is not ready | low | accept | See AR-13-01 | closed |
| T-13-06 | Information disclosure | 500s of BusRoute, Stop, Prediction controllers | high | mitigate | All three catch blocks call `sendErrorResponse`. 8 of 9 controllers use it; HealthController has no error path. No controller sends its own 500 | closed |
| T-13-07 | Denial of service | Route/stop reads before the first load | low | mitigate | `assertLoaded()` throws `DataNotReadyError` synchronously (`BusDataRepository.ts:256-259`), called by all 6 public getters, giving an immediate 503 with no upstream call | closed |
| T-13-08 | Information disclosure | `lastError` and `load()` rejection | high | mitigate | The catch stores and rethrows `error.message` only (`BusDataRepository.ts:92-98`); the original error object is never kept | closed |
| T-13-09 | Tampering | Upstream payload committed by `applyData` | high | mitigate | `applyData` runs only after `fetchAndProcessData` fully parses (`:89-90`); zero/null routes throw "DASH API returned no routes" (`:140`); any throw leaves the maps untouched | closed |
| T-13-10 | Denial of service | Requests during an in-flight load | medium | mitigate | Getters never await `load()` (sync `assertLoaded`, `:256-259`): before the first success they 503, and afterwards they serve the previous complete dataset | closed |
| T-13-11 | Repudiation | Failed loads with no trace | medium | mitigate | Every failure sets `lastFailedAt`/`lastError` (`:96-97`); the loader logs one warn per failed attempt (`BusDataRefreshService.ts:60-63`) | closed |
| T-13-12 | Information disclosure | 500s of Favorites, Recents, NearbyPrediction controllers | high | mitigate | All three use `sendErrorResponse` (same control as T-13-01); no local echoing mapper remains in any controller | closed |
| T-13-13 | Information disclosure | 500 log line on device-scoped and nearby endpoints | medium | mitigate | The helper logs only stack/message (`errorResponse.ts:29-30`): no URL (rider lat/lng) and no `X-Device-Id`; the controllers add no logging | closed |
| T-13-14 | Tampering | Hydration silently dropping favorites/recents | medium | mitigate | FavoritesService/RecentsService have no `catch`, so `DataNotReadyError` propagates as 503; `addFavorite` throws `NotFoundError` before `upsertFavorite` when the entity is unresolved (`FavoritesService.ts:23-27`) | closed |
| T-13-15 | Denial of service | Boot when DASH is unreachable | high | mitigate | `app.ts` opens SQLite (`:44`), then `listen` (`:46`), then `refreshService.start()` (`:49`); a DASH failure never exits the process | closed |
| T-13-16 | Denial of service | Retry pressure on DASH | medium | mitigate | Chained `setTimeout` (`BusDataRefreshService.ts:38`), so attempts never overlap; `computeRetryDelayMs` applies capped equal-jitter backoff until the first success, then `REFRESH_INTERVAL_MS` (hourly) (`:6,14,57,61`) | closed |
| T-13-17 | Information disclosure | Loader warn lines | high | mitigate | Only `error.message` is logged (`BusDataRefreshService.ts:60-63`); `load()` already rethrows message-only (T-13-08) | closed |
| T-13-18 | Denial of service | Shutdown blocked by background timers | medium | mitigate | `refreshService.stop()` and `serviceAlertPollService.stop()` run first in shutdown (`app.ts:55-56`); `stop()` sets `stopped` and clears the timer, blocking in-flight rescheduling (`BusDataRefreshService.ts:35,80-81`) | closed |
| T-13-19 | Denial of service | SQLite failure at boot | low | accept | See AR-13-02 (`app.ts:81-82` exits 1 before listen, by design) | closed |
| T-13-20 | Tampering | `fetchAndProcessData` / `createStop` / ids | high | mitigate | `requireId` on route/direction/stop ids (`BusDataRepository.ts:45-49,150,173,175`); `parseDashNumber` + `Number.isFinite` on code/lat/lon (`:33,220-228`); any throw rejects the whole load | closed |
| T-13-21 | Information disclosure | Validation messages in `lastError` / warn line | medium | mitigate | Messages carry only payload values and ids (`:49,225,228`), never request config; still stored/rethrown message-only (`:95-98`) | closed |
| T-13-22 | Denial of service | Over-strict validation holding every endpoint at 503 | medium | mitigate | Only the five named fields throw (`requireId` ×3 entity kinds, code, lat/lon); there are no other validation throws in the parse path | closed |
| T-13-23 | Repudiation | DASH values interpolated into `lastError` / log lines | low | accept | See AR-13-03 | closed |
| T-13-24 | Denial of service | Stranded SSE loops after a reload drops a stop | medium | mitigate | `poll()` treats `NotFoundError` as terminal (`PredictionStreamService.ts:77-78`); `endLoop` clears the interval and ends every subscriber once via `onEnd` (`:30-51`) | closed |
| T-13-25 | Denial of service | Ending streams on a transient upstream failure | medium | mitigate | Only `instanceof NotFoundError` ends a loop (`:77`); other errors are logged and polling continues (`:82`) | closed |
| T-13-26 | Tampering | Stale in-flight tick tearing down a newer loop | low | mitigate | Identity guard `loops.get(stopId) !== entry` makes `endLoop` a no-op for a replaced loop (`:32`) | closed |
| T-13-27 | Information disclosure | Teardown warn and onEnd-failure lines | low | mitigate | These lines carry only the stop id, a subscriber count and the message (`:45,51`), with no rider data and no key | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-13-01 | T-13-05 | `Retry-After: 5` is a hint only. The not-ready path is an in-memory check with no upstream call, so a retry burst costs nothing upstream. Per-IP limiting of live routes shipped in Phase 14 | Plan 13-01 threat model | 2026-10-01 |
| AR-13-02 | T-13-19 | By design (D-18), a broken favorites/recents database is fatal (exit 1 before listen), because the process cannot serve its own persisted data; a supervisor restarts it | Plan 13-05 threat model | 2026-10-01 |
| AR-13-03 | T-13-23 | DASH is the authenticated agency upstream over HTTPS; values were already interpolated before this phase, and Phase 14 readiness serializes `lastError` as JSON, which escapes control characters | Plan 13-06 threat model | 2026-10-01 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-15 | 27 | 27 | 0 | /gsd-secure-phase 13 (orchestrator, ASVS L1 grep-depth; auditor skipped per short-circuit rule: register authored at plan time, threats_open 0) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-15
