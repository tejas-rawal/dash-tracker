---
phase: "06"
slug: "favorites-routes-stops"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-09-02"
---

# Phase 06 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Client -> Favorites HTTP API (`POST`/`DELETE`/`GET /api/v1/favorites`) | Untrusted request body (`entityType`, `entityId`), path params, and the `X-Device-Id` header cross into the server at `favoriteRoutes.ts` | entityType / entityId / deviceId |
| FavoritesController/Service -> `BusDataRepository` (existing, untouched) | Internal, already-trusted in-memory read boundary — reused for existence checks and hydration | route/stop entity data |
| FavoritesController/Service -> `FavoritesRecentsRepository` (SQLite, Phase 5) | Internal boundary; repository parameterizes all SQL, `deleteFavorite` follows the same pattern | deviceId / entityType / entityId |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-06-01 | Spoofing | `X-Device-Id` header (client-supplied, unauthenticated identity claim) | low | accept | Intentionally opaque, client-generated, non-secret identifier per REQUIREMENTS.md Out of Scope; anyone who knows/guesses a device id can read or mutate that device's favorites. Accepted for this milestone; `PERS-05` (v2, real accounts) is the tracked follow-up. | open — below high threshold (non-blocking) |
| T-06-02 | Tampering / Injection | `FavoritesController` body/params -> `FavoritesService` -> `FavoritesRecentsRepository.deleteFavorite`/lookups | high | mitigate | Verified: `deleteFavorite` uses the same prepared-statement pattern as `upsertFavorite`/`listFavorites` (`FavoritesRecentsRepository.ts:80`); controller strictly checks `entityType !== "route" && entityType !== "stop"` before any query (`FavoritesController.ts:33,60`); DB `CHECK (entity_type IN ('route','stop'))` is a second layer (`FavoritesRecentsRepository.ts:12`) | closed |
| T-06-03 | Information Disclosure | `GET /api/v1/favorites` returning another device's list if that device's id is known/guessed | low | accept | Same root cause/disposition as T-06-01; `listFavorites` correctly scopes by `WHERE device_id = ?` — residual risk is a known device id being used by the wrong actor, not a query-level leak. | open — below high threshold (non-blocking) |
| T-06-04 | Denial of Service | `POST /api/v1/favorites` with no per-device favorite-count cap (FAV-05 explicitly requires no cap) | low | accept | REQUIREMENTS.md Out of Scope explicitly excludes a favorites cap; no rate limiting in scope for this milestone. `UNIQUE(device_id, entity_type, entity_id)` bounds row growth to one row per distinct entity actually favorited. | open — below high threshold (non-blocking) |

*Status: open · closed · open — below {block_on} threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-06-01 | T-06-01 | Device id is an unauthenticated, non-secret client identifier by design for this milestone; real-account auth (PERS-05) is the tracked v2 follow-up | Tejas Rawal (via plan-time disposition) | 2026-08-31 |
| AR-06-02 | T-06-03 | Same root cause as AR-06-01 — cross-device read risk exists only if a device id is known to the wrong actor, not via query leakage | Tejas Rawal (via plan-time disposition) | 2026-08-31 |
| AR-06-03 | T-06-04 | No favorites cap is a deliberate requirement (FAV-05); DB uniqueness constraint bounds worst-case row growth | Tejas Rawal (via plan-time disposition) | 2026-08-31 |

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
