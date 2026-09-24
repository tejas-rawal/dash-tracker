---
phase: "11"
slug: "nearby-stop-predictions"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-09-24"
---

# Phase 11 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Public HTTP client → `GET /api/v1/predictions/nearby` | Unauthenticated client supplies `lat`/`lng`/`radius`/`number`; qs parser may deliver arrays/objects | Untrusted query strings; rider location (privacy-sensitive) |
| `NearbyPredictionService` → DASH/Swiftly `predictions-near-location` | Outbound call via shared axios instance whose default `Authorization` header is `DASH_API_KEY` | API key (secret); validated coordinates |
| DASH/Swiftly response → `NearbyPredictionService` | Semi-trusted upstream JSON, not Zod-validated (D-18) | Arrival predictions (integrity-sensitive) |
| `NearbyPredictionController` → public HTTP client | 500 path echoes `error.message` as `details` | Error text (low sensitivity) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-11-01 | Information Disclosure | axios catch in NearbyPredictionService | high | mitigate | `UpstreamApiError` built from `error.message` only (`NearbyPredictionService.ts:104-109`); negative test with `super-secret-key` asserts absent from message and logs | closed |
| T-11-02 | Information Disclosure (privacy) | upstream-call `logger.info` | medium | mitigate | Log names path + meters only (`NearbyPredictionService.ts:100`); test asserts no lat/lng in logged output | closed |
| T-11-03 | Tampering | upstream body shape | medium | mitigate | Ordered guard in `parseDashResponse` (`NearbyPredictionService.ts:112-127`) raises `UpstreamApiError` → 502 | closed |
| T-11-04 | Tampering / DoS | malformed upstream entries | medium | mitigate | `isValidNearbyEntry` drops bad entries with one warn (`NearbyPredictionService.ts:41-57,132-134`) | closed |
| T-11-05 | Tampering (injection) | lat/lng → upstream URL | medium | mitigate | `parseStrictNumber` in controller + `URLSearchParams` from `String(number)` (`NearbyPredictionService.ts:87`) | closed |
| T-11-06 | Denial of Service | upstream hang (no axios timeout) | low | accept | See Accepted Risks AR-11-01 | closed |
| T-11-07 | Information Disclosure | 502 `details` echo axios message | low | accept | See Accepted Risks AR-11-02 | closed |
| T-11-08 | Spoofing | unauthenticated endpoint | low | accept | See Accepted Risks AR-11-03 | closed |
| T-11-09 | Repudiation (log injection) | `logger.warn` echoes upstream stopId/routeShortName | low | accept | See Accepted Risks AR-11-04 | closed |
| T-11-10 | Denial of Service (quota) | `radius` / `number` params | medium | mitigate | `MAX_RADIUS_MILES = 1`, `MAX_PREDICTIONS_PER_DESTINATION = 10`; out-of-range → 400 before upstream (`NearbyPredictionController.ts:10-35`); live UAT confirmed radius=5 → 400 | closed |
| T-11-11 | Tampering (param smuggling) | array/object query params | medium | mitigate | `parseStrictNumber` rejects non-strings (`NearbyPredictionController.ts:15-16`) | closed |
| T-11-12 | Tampering (silent wrong location) | blank params | medium | mitigate | Blank/whitespace rejected before `Number()` (`NearbyPredictionController.ts:16`); live UAT confirmed `lat=` → 400 | closed |
| T-11-13 | Denial of Service | no per-client rate limiting | low | accept | See Accepted Risks AR-11-05 | closed |
| T-11-14 | Denial of Service | non-object prediction element failing whole request | medium | mitigate | Element-level validation drops only the owning entry (`NearbyPredictionService.ts:26-57`) | closed |
| T-11-15 | Tampering (arrival integrity) | incomplete prediction served as arrival | medium | mitigate | `isValidPrediction` requires finite `min`/`sec`/`time`, string `tripId`/`vehicleId`, no coercion (`NearbyPredictionService.ts:26-33`) | closed |
| T-11-16 | Information Disclosure | 500 path echoes `error.message` (WR-02) | low | accept | See Accepted Risks AR-11-06 | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-11-01 | T-11-06 | Pre-existing: shared axios client sets no timeout across all four upstream integrations; changing it alters existing endpoints (out of scope per CONTEXT). Node keeps serving other sockets. | 11-01-PLAN threat model | 2026-09-24 |
| AR-11-02 | T-11-07 | Matches existing 502 convention in PredictionService/VehicleService; axios messages never include headers or the key. | 11-01-PLAN threat model | 2026-09-24 |
| AR-11-03 | T-11-08 | Public transit data; every dash-tracker endpoint is unauthenticated by design. | 11-01-PLAN threat model | 2026-09-24 |
| AR-11-04 | T-11-09 | Values come from the trusted agency API, are short strings, and go to the Console transport only. | 11-01-PLAN threat model | 2026-09-24 |
| AR-11-05 | T-11-13 | Pre-existing across all endpoints; radius/number caps bound per-request upstream cost. | 11-02-PLAN threat model | 2026-09-24 |
| AR-11-06 | T-11-16 | Only known trigger (CR-01 TypeError) removed in 11-03; remaining messages carry no secrets or coordinates. Shared controller error helper (WR-02/IN-04) recommended as a follow-up quick task. | 11-03-PLAN threat model | 2026-09-24 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-24 | 16 | 16 | 0 | /gsd-secure-phase (L1 grep-depth; auditor skipped per short-circuit — register authored at plan time, threats_open 0) |

Evidence: mitigation code located by grep in `NearbyPredictionService.ts` / `NearbyPredictionController.ts`; the covering suites (NearbyPredictionService, NearbyPredictionController, predictionRoutes — 129 tests) pass; live UAT (11-UAT.md) confirmed 400s on blank lat and radius=5.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-24
