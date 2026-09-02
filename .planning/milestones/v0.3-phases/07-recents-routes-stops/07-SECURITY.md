---
phase: "07"
slug: "recents-routes-stops"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-09-02"
---

# Phase 07 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Client -> Recents HTTP API (`GET /api/v1/recents`) | Untrusted `X-Device-Id` header, validated by the reused `requireDeviceId` middleware | deviceId |
| Client -> Predictions HTTP API (`GET /api/v1/predictions`) | Untrusted, now-optional `X-Device-Id` header now acts as an unvalidated *write* trigger, not merely a read scope | deviceId (write trigger) |
| `PredictionService` -> `FavoritesRecentsRepository` (SQLite, fire-and-forget write) | Every prediction lookup carrying a device id is now a write path into `recents`, triggered automatically | deviceId / entityType / entityId |
| `RecentsController`/`RecentsService` -> `BusDataRepository` (existing, untouched) | Internal, already-trusted in-memory read boundary, reused for hydration | route/stop entity data |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-07-01 | Spoofing | `X-Device-Id` header on `/api/v1/predictions`, now triggering an automatic persistence write | medium | accept | Same root-cause acceptance as Phase 6's T-06-01, extended to recents; higher severity since the write fires passively on every prediction GET. No mitigation added this phase; `PERS-05` (v2 real accounts) is the tracked long-term fix. | open — below high threshold (non-blocking) |
| T-07-02 | Tampering / Injection | `upsertRecent`'s eviction `DELETE` and existing insert path in `FavoritesRecentsRepository.ts` | high | mitigate | Verified: eviction statement uses named bound parameters (`@deviceId`) exclusively (`FavoritesRecentsRepository.ts:102-103`); `entityType` constrained by the `EntityType` union type upstream and DB `CHECK` constraint | closed |
| T-07-03 | Denial of Service | Fire-and-forget recents write + eviction `DELETE` on every prediction lookup carrying a device id | low | accept | Verified: write is async, non-blocking, `.catch()`-guarded, never delays the primary response (`PredictionService.ts:122`); reuses Phase 5's WAL mode + 5s busy_timeout; per-device row growth bounded at 5 by eviction logic | open — below high threshold (non-blocking) |
| T-07-04 | Information Disclosure | `GET /api/v1/recents` scoped by `X-Device-Id`, same disclosure profile as Favorites | low | accept | Same root cause/disposition as Phase 6's T-06-03; `listRecents` scopes strictly by `WHERE device_id = ?`, inherited unmodified from Phase 5 | open — below high threshold (non-blocking) |

*Status: open · closed · open — below {block_on} threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-07-01 | T-07-01 | Device id remains an unauthenticated, non-secret identifier; recents-write side effect inherits the same acceptance as Favorites, at a bumped severity since it now fires passively | Tejas Rawal (via plan-time disposition) | 2026-09-01 |
| AR-07-02 | T-07-03 | Fire-and-forget write is async, non-blocking, and row growth is bounded at 5 per device by eviction logic | Tejas Rawal (via plan-time disposition) | 2026-09-01 |
| AR-07-03 | T-07-04 | Same root cause as Phase 6's AR-06-02 — cross-device read risk exists only if device id is known to the wrong actor | Tejas Rawal (via plan-time disposition) | 2026-09-01 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-02 | 4 | 1 | 3 (all below block threshold) | Retroactive /gsd-secure-phase, grep-depth (ASVS L1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-02
