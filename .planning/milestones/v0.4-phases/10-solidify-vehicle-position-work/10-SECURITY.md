---
phase: "10"
slug: "solidify-vehicle-position-work"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-09-22"
---

# Phase 10 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Public HTTP client -> `GET /api/v1/vehicles` | Unauthenticated client supplies the `route` query param, which crosses into `VehicleController`/`VehicleService`; prior to this plan it was forwarded unvalidated straight into the outbound DASH request URL. | Client-supplied route short-name string |
| `VehicleService` -> DASH/Swiftly upstream API (`/real-time/{agency}/vehicles`) | Server trusts the upstream JSON response body (`DashVehiclesApiResponse`, including the nested `loc` object and `vehicleType`) with no runtime schema validation (D-07, locked no-op). | Vehicle position/telemetry data |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-10-01 | Tampering | DASH API response — per-vehicle loc.lat/loc.lon missing/NaN/malformed | medium | mitigate | `VehicleService.mapToVehiclePositions`'s `isValidCoordinate` filters out any vehicle where lat/lon/time is not a finite number (post-CR-01/CR-02 fix: `typeof value === "number" && Number.isFinite(value)`, catching missing/undefined/null, not just literal NaN), logs via `logger.warn` naming the vehicle id, rest of response unaffected. Verified in `10-VERIFICATION.md` truth #4 and #9. | closed |
| T-10-02 | Tampering / Injection | route query param forwarded into the outbound DASH API request URL (VehicleService's URL builder) | medium | mitigate | `VehicleService.getVehiclePositions` calls `repository.getRouteByShortName(options.route)` and throws `NotFoundError` before any upstream fetch when the value doesn't match a known route short name — closes off unvalidated pass-through to the upstream integration. Verified in `10-VERIFICATION.md` truth #3 and #8. | closed |
| T-10-03 | Information Disclosure | NotFoundError message echoes the client-supplied route value back in the 404 JSON body | low | accept | Reflects only data the client already sent in its own request; response is application/json, never rendered as HTML, so no reflected-XSS vector server-side; matches the existing `BusRouteService.getAgencyRoute` convention already shipped and accepted elsewhere in the codebase. | closed |
| T-10-04 | Tampering | DashVehiclesApiResponse trusted without runtime (Zod) schema validation | low | accept | D-07 (locked no-op decision): matches existing project-wide convention — PredictionService, ServiceAlertRepository, and BusRouteService all trust their Dash*-shaped types with no runtime validation; Zod is reserved for env validation only. D-05's coordinate-filtering (T-10-01) is the safety net for the security-relevant fields, not a substitute for full schema validation. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-10-01 | T-10-03 | Route-not-found message echoes client-supplied input in a JSON body only; no HTML rendering, no reflected-XSS vector; matches existing accepted `BusRouteService` convention. | 10-01-PLAN.md threat model (locked at plan time) | 2026-09-21 |
| R-10-02 | T-10-04 | No runtime (Zod) schema validation on the trusted DASH API response — matches project-wide convention across all other Dash*-shaped service integrations; D-07 locked no-op decision in 10-CONTEXT.md. | 10-01-PLAN.md threat model (locked at plan time) | 2026-09-21 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-22 | 4 | 4 | 0 | /gsd-secure-phase (L1 short-circuit — register authored at plan time, threats_open: 0, asvs_level: 1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-22
