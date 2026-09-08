---
phase: "05"
slug: "sqlite-persistence-foundation"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-09-02"
---

# Phase 05 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Developer machine -> npm registry | `bun add` fetches and runs install-time build/download logic (better-sqlite3 compiles or downloads a prebuilt native binary) | native binary / install scripts |
| App process -> local SQLite file (`environment.database.path`) | Server process is sole writer/reader; no HTTP surface yet in this phase | device-scoped favorites/recents rows |
| Future callers (Phase 6/7 services) -> FavoritesRecentsRepository public methods | `deviceId`/`entityType`/`entityId` treated as untrusted at the repository boundary, anticipating Phase 6's unvalidated `X-Device-Id` header | deviceId / entityType / entityId |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-05-SC | Tampering | `bun add better-sqlite3 @types/better-sqlite3` (supply-chain / native install script) | high | mitigate | Package Legitimacy Gate blocking-human checkpoint required sign-off before install; approved (see commit `d10dd9d`, `05-01-PLAN.md`) | closed |
| T-05-01 | Tampering / Injection | `FavoritesRecentsRepository` SQL construction (upsertFavorite/listFavorites/upsertRecent/listRecents) | high | mitigate | Verified: all statements use `better-sqlite3` prepared statements with bound params (`?`/`@deviceId`) — no string-concatenated SQL (`src/server/api/repositories/FavoritesRecentsRepository.ts:71,80,87,97,102,111`) | closed |
| T-05-02 | Information Disclosure | listFavorites/listRecents cross-device leakage | high | mitigate | Verified: every read filters `WHERE device_id = ?` (`FavoritesRecentsRepository.ts:88,112`); concurrency tests assert no cross-device leakage | closed |
| T-05-03 | Tampering | `DB_PATH` env var (file-path handling) | medium | mitigate | Verified: Zod-validated (`z.string().min(1)`) with fixed repo-relative default (`src/server/config/environment.ts:17`); operator-supplied config, no client-facing path-traversal surface | closed |
| T-05-04 | Denial of Service | Synchronous better-sqlite3 calls blocking the Node event loop | low | accept | Below `security_block_on: high` threshold; deliberate driver choice (locked decision D-01), sub-millisecond per-call cost for scalar-column writes | open — below high threshold (non-blocking) |
| T-05-05 | Repudiation | No audit trail beyond the row itself | low | accept | Below `security_block_on: high` threshold; out of scope for Phase 5 persistence plumbing; `favorited_at`/`viewed_at` timestamps are the minimal trail needed | open — below high threshold (non-blocking) |

*Status: open · closed · open — below {block_on} threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-05-01 | T-05-04 | Synchronous SQLite I/O blocks the event loop per call; accepted given scalar-column payload sizes and existing locked decision D-01 | Tejas Rawal (via plan-time disposition) | 2026-08-31 |
| AR-05-02 | T-05-05 | No row-level audit trail beyond timestamps; out of scope for persistence-plumbing phase | Tejas Rawal (via plan-time disposition) | 2026-08-31 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-02 | 6 | 4 | 2 (both below block threshold) | Retroactive /gsd-secure-phase, grep-depth (ASVS L1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-02
