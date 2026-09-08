---
phase: "06"
slug: "alerts-surfaced-on-routes-stops-predictions"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-09-08"
---

# Phase 06 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Public HTTP client -> route endpoints | Unauthenticated internet clients call `GET /api/v1/routes/all` / `GET /api/v1/routes/:shortName`; the server now returns embedded alert content it previously kept internal. | Public transit-service alert text (headerText/descriptionText/cause/effect/activePeriod) |
| Public HTTP client -> stop endpoints | Unauthenticated internet clients call `GET /api/v1/routes/:shortName/stops` / `GET /api/v1/stops/nearby`; the server now returns embedded alert content on a per-stop basis. | Same trimmed alert summary shape, per stop |
| DASH/Swiftly upstream -> ServiceAlertRepository | The server trusts upstream-sourced alert text/IDs (ingestion itself is unchanged, owned by Phase 5). | Alert records including `informedRouteIds`/`informedStopIds` |
| Route/alert ID matching (D-03) | `ServiceAlert.informedRouteIds`/`informedStopIds` (upstream-sourced) matched against internal `BusRoute.id`/`BusStop.id` (DASH `/info` API-sourced) inside `ServiceAlertRepository.getActiveAlertsForRoute`/`getActiveAlertsForStop`. | Internal ID correlation, no user-controlled input |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-06-01 | Tampering | `ServiceAlertRepository.getActiveAlertsForRoute` (ID matching) | low | accept | `informedRouteIds` and `BusRoute.id` both originate from the same trusted DASH/Swiftly system; no user-controlled input reaches the match; worst case is a display-only alert omitted or mismatched, no auth/integrity impact. | closed |
| T-06-02 | Information Disclosure | `GET /api/v1/routes/all`, `GET /api/v1/routes/:shortName` (alert embedding) | low | accept | Alert content is public transit-service information intended for riders; D-01 excludes `url`/`informedRouteIds`/`informedStopIds` from the response, limiting exposure to only what riders need. | closed |
| T-06-03 | Denial of Service | `BusRouteService.getAgencyRoutes` (O(routes x active-alerts) recompute per request) | medium | mitigate | Bounded by Phase 5's 5-minute-poll-refreshed in-memory alert set (no per-request upstream call, no unbounded growth); embedding is a single in-memory `.filter()`/`.includes()` pass, consistent with the existing per-request recompute pattern already used for predictions. | closed |
| T-06-04 | Tampering | `ServiceAlertRepository.getActiveAlertsForStop` (ID matching) | low | accept | Same rationale as T-06-01: `informedStopIds` and `BusStop.id` both originate from the trusted DASH/Swiftly system; no user-controlled input reaches the match. | closed |
| T-06-05 | Information Disclosure | `GET /api/v1/routes/:shortName/stops`, `GET /api/v1/stops/nearby` (alert embedding) | low | accept | Same rationale as T-06-02, applied per-stop instead of per-route — public transit-service information, trimmed per D-01. | closed |
| T-06-06 | Denial of Service | `StopService.getStopsForRoute`/`getNearbyStops` (O(stops x active-alerts) recompute per request) | medium | mitigate | Same mitigation as T-06-03: bounded by Phase 5's 5-minute-poll-refreshed in-memory alert set; embedding is attached inside the existing per-request `.map()` pass with no new network calls or unbounded loops. | closed |

*Status: open · closed · open — below {block_on} threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-06-01 | T-06-01 | ID matching trusts the same upstream source on both sides of the comparison; no user-controlled input, no auth/integrity impact even in worst case. | plan-time threat model (06-01-PLAN.md) | 2026-09-04 |
| AR-06-02 | T-06-02 | Alert content is public transit-service information; D-01 already trims sensitive fields (url/informedRouteIds/informedStopIds). | plan-time threat model (06-01-PLAN.md) | 2026-09-04 |
| AR-06-04 | T-06-04 | Same rationale as T-06-01, stop-side. | plan-time threat model (06-02-PLAN.md) | 2026-09-04 |
| AR-06-05 | T-06-05 | Same rationale as T-06-02, stop-side. | plan-time threat model (06-02-PLAN.md) | 2026-09-04 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-08 | 6 | 6 | 0 | /gsd-secure-phase (L1 grep-depth, register authored at plan time — short-circuit per ASVS L1 rule) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-08
