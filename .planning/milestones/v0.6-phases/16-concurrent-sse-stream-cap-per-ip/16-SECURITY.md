---
phase: "16"
slug: "concurrent-sse-stream-cap-per-ip"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-12"
---

# Phase 16 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Anonymous client → GET /api/v1/predictions/stream | Untrusted callers choose how many connections to open and when to drop them | Connection count, query params (stop/route) |
| Reverse proxy → Express (`req.ip`) | Client address comes from the socket, or from trusted hops' X-Forwarded-For only when TRUST_PROXY_HOPS > 0 | Client IP (the cap key) |
| Stream route → DASH (via PredictionStreamService) | Each distinct open stop drives a 30 s upstream poll against the shared DASH quota | Upstream request volume |
| Middleware → Winston logs | Client key and request path reach the log stream | Client IP / IPv6 /56, path (no query string) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-16-01 | Denial of Service | /predictions/stream held-open connections | high | mitigate | `streamConcurrencyCap.ts:37-46` rejects the 6th stream with 429; claim lands synchronously before `next()` (`:48`). Tests: "rejects the 6th open stream…", "admits exactly 5 of 8 connects fired at once…"; live UAT test 1 against DASH | closed |
| T-16-02 | Denial of Service (self-lockout) | slot release | medium | mitigate | `res.on("close", release)` (`:68`) with `released` guard (`:56-67`); `res.destroyed` connects claim nothing (`:28-30`). Tests: shutdown force-close, pending disconnect, already-closed connection, release-once rows; live UAT freed a slot immediately | closed |
| T-16-03 | Spoofing (key rotation) | key derivation | medium | mitigate | Key is `ipKeyGenerator(req.ip)` (`:34`); `TRUST_PROXY_HOPS` is integer-only (`environment.ts:26-30`), applied via `app.set("trust proxy", …)` (`app.ts:17`). Test: "keys clients exactly as the shared bucket does"; live log showed `::/56` key | closed |
| T-16-04 | Denial of Service (memory growth) | `openStreams` map | low | mitigate | Entry deleted at count 0 (`:62-66`). Test: "releases each claim once, never below zero, and forgets an idle client" | closed |
| T-16-05 | Information Disclosure | cap warn line | low | mitigate | Warn logs only key + `req.baseUrl + req.path` (`:40-42`). Test: "logs every rejection once, with the path and none of the query string" | closed |
| T-16-06 | Denial of Service (log volume) | warn per rejection | low | accept | Bucket runs before the cap (`predictionRoutes.ts:25`), so warns are bounded at 60/IP/min. See AR-16-01 | closed |
| T-16-07 | Denial of Service (shared IP) | cap size 5 | low | accept | Riders behind one NAT / IPv6 /56 share 5 streams; REST fallback stays available. See AR-16-02 | closed |
| T-16-08 | Denial of Service (distributed sources) | per-instance in-memory cap | low | accept | Per IP, per process by design; shared store out of scope (UPST-03). See AR-16-03 | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-16-01 | T-16-06 | Every rejected connect already spent a hit in the 60/min bucket, so warn volume is bounded at 60 per IP per minute (D-12) | Plan 16-01 threat model | 2026-10-12 |
| AR-16-02 | T-16-07 | Shared-address riders share 5 concurrent streams and the client must not auto-retry on 429; same trade-off the 60/min bucket makes (D-01) | Tejas Rawal (UAT test 2 sign-off) | 2026-10-12 |
| AR-16-03 | T-16-08 | Cap is per IP and per process; distributed abuse and a shared store are out of scope (CONTEXT boundary, UPST-03) | Plan 16-01 threat model | 2026-10-12 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-12 | 8 | 8 | 0 | Claude (gsd-secure-phase, ASVS L1 short-circuit; 20/20 cap tests pass) |

Deploy-time follow-up (not a blocking threat): T-16-03's mitigation depends on production `TRUST_PROXY_HOPS` matching the real proxy hop count — tracked in `.planning/DEPLOY-CHECKLIST.md` (moved out of 16-UAT on 2026-10-13: not deployed yet).

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-12
