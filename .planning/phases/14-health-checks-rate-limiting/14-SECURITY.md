---
phase: "14"
slug: "health-checks-rate-limiting"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-07"
---

# Phase 14 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| public client / load balancer → GET /api/v1/health/* | Unauthenticated probes; anyone can call them and the response is public | Load timestamps and data age (public, non-sensitive) |
| probe handler → BusDataRepository in-memory state | Read-only snapshot; must never trigger upstream I/O | In-memory load state (internal) |
| public client → /predictions, /predictions/nearby, /predictions/stream, /vehicles | Untrusted, unauthenticated traffic that triggers a live DASH call per request | Stop/route ids, rider coordinates (nearby) |
| server → DASH upstream (goswift.ly) | Each limited request may spend upstream quota and latency | DASH API key (secret), query params |
| npm registry → node_modules | Third-party package enters the runtime dependency tree | express-rate-limit 8.7.0 + transitive deps |
| client X-Forwarded-For → req.ip → rate-limit key | An untrusted header must not choose the key unless a trusted proxy appended it | Client IP (rate-limit key) |
| operator environment → TRUST_PROXY_HOPS → Express trust proxy | Deployment config deciding how many forwarding hops are believed | Integer hop count |
| public client → in-memory endpoints and probes | Must stay reachable regardless of the live-route limit (RATE-02) | Route/stop/favorites/recents data |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-14-01 | Information disclosure | HealthService.getReadiness / readiness body | medium | mitigate | `HealthService.ts:28` destructures only `lastLoadedAt`/`lastFailedAt`; `HealthService.test.ts` and `healthRoutes.test.ts` assert upstream error text is absent | closed |
| T-14-02 | Denial of service | readiness/liveness handlers | medium | mitigate | No DASH/axios/`load()` reference in the health service, controller or route; `healthRoutes.test.ts:36` spies `axios.get` to prove no upstream call | closed |
| T-14-03 | Tampering | intermediary caches in front of the probes | low | mitigate | `HealthController.ts:12,18` set `Cache-Control: no-store` | closed |
| T-14-04 | Information disclosure | public data age and load/failure timestamps | low | accept | See Accepted Risks Log AR-14-01 | closed |
| T-14-05 | Denial of service | probe flood (health endpoints unlimited per D-16) | low | accept | See Accepted Risks Log AR-14-02 | closed |
| T-14-06 | Denial of service | the four live-upstream routes | high | mitigate | `upstreamRateLimiter` on `predictionRoutes.ts:20,23,24` and `vehicleRoutes.ts:12`; `rateLimit.test.ts` real-app E2E; live UAT 2026-10-07 confirmed 429 from the 61st hit. Residual stream fan-out (review WR-02) scheduled as Phase 16 | closed |
| T-14-07 | Information disclosure | first-rejection warn line | medium | mitigate | `upstreamRateLimit.ts:38-40` logs only `${key}` and `${req.baseUrl}${req.path}`, never the query string | closed |
| T-14-08 | Denial of service | log volume under a flood | low | mitigate | `upstreamRateLimit.ts:37` warns only when `used === UPSTREAM_RATE_LIMIT + 1` (one line per key per window) | closed |
| T-14-09 | Information disclosure | library validation/store errors in logs | low | mitigate | `upstreamRateLimit.ts:25,28` log `express-rate-limit: ${messageOf(error)}` as one string | closed |
| T-14-10 | Spoofing | IPv6 address rotation inside one allocation | low | mitigate | No `keyGenerator`, `ipv6Subnet` or `store` override in `upstreamRateLimit.ts`; library default /56 grouping applies | closed |
| T-14-11 | Denial of service | many-IP or multi-instance bypass | low | accept | See Accepted Risks Log AR-14-03 | closed |
| T-14-SC | Tampering | express-rate-limit install (npm registry) | high | mitigate | Exact pin `"express-rate-limit": "8.7.0"` in `package.json:42`; integrity hash recorded in tracked `bun.lock:388`; legitimacy checkpoint ran in 14-02 Task 1 | closed |
| T-14-12 | Spoofing | req.ip resolution feeding upstreamRateLimiter | high | mitigate | `app.ts:17` sets `trust proxy` to the integer `trustProxyHops` (default 0); spoof tests in `rateLimit.test.ts` and `trustProxy.test.ts` pass | closed |
| T-14-13 | Tampering | TRUST_PROXY_HOPS value | medium | mitigate | `environment.ts:26-28` digits-only regex; no boolean `trust proxy` in src; `environment.test.ts` matrix passes | closed |
| T-14-14 | Spoofing | operator sets TRUST_PROXY_HOPS above the real proxy count | medium | mitigate | `.env.example:6` warns the value must equal the proxies the operator controls; default 0 (D-17) | closed |
| T-14-15 | Denial of service | in-memory endpoints and health probes | medium | mitigate | Limiter attached only to the four live handlers; `rateLimit.test.ts` RATE-02 E2E proves unlimited endpoints never 429 | closed |
| T-14-16 | Information disclosure | smoke and test logs | low | mitigate | 14-03 real-process smoke asserted `keyleaks=0` (recorded in 14-03-SUMMARY.md and 14-VERIFICATION.md); limiter warn carries only key and path | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-14-01 | T-14-04 | No rider data or secrets; an LB needs the data age to decide rotation, and D-03 makes it part of the contract | 14-01 plan threat model | 2026-10-07 |
| AR-14-02 | T-14-05 | Each probe is an O(1) in-memory response with no I/O and no logging; flooding costs no more than any static endpoint | 14-01 plan threat model | 2026-10-07 |
| AR-14-03 | T-14-11 | Shared/distributed store is Out of Scope in REQUIREMENTS (single-process deployment); per-IP in-memory limit is the chosen control | 14-02 plan threat model | 2026-10-07 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-07 | 17 | 17 | 0 | /gsd-secure-phase orchestrator (L1 grep-depth; plan-time register, auditor skipped per short-circuit rule) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-07
