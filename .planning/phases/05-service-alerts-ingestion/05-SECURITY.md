---
phase: "05"
slug: "service-alerts-ingestion"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-09-04"
---

# Phase 05 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| DASH/Swiftly `gtfs-rt-alerts/v2` API → `ServiceAlertService` | Untrusted external upstream HTTP response (network-controlled body, encoding, and field shape) crosses into the app's fetch/parse/mapping layer | Alert text, route/stop IDs, cause/effect codes, active-window timestamps |
| `ServiceAlertPollService` (boot-triggered `setInterval`) → Node process lifecycle | An unhandled poll-tick error must never propagate out of the interval callback and crash the process | None — control flow only |
| `ServiceAlertRepository` (in-memory) → future Phase 6 consumers | `headerText`/`descriptionText`/`cause`/`effect`/`url` are raw passthrough strings that will eventually be serialized into JSON API responses | Public transit alert text (no PII) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-05-01 | Tampering | `ServiceAlertService.fetchFromDashApi()` | high | mitigate | Body-shape guard (`ServiceAlertService.ts:42`) rejects `null`/non-object bodies; accepts array-rooted or `{entities:[...]}`-enveloped bodies (confirmed live shape, G-05-5); string bodies get a try/catch `JSON.parse` fallback (line 34-39). Every poll tick runs inside `ServiceAlertPollService`'s try/catch, so a malformed/malicious payload can never crash the process. Verified in code (ServiceAlertService.ts:34-50) and by 23/23 passing tests in ServiceAlertService.test.ts, including explicit null/non-object-primitive rejection tests (WR-01) and array-rooted acceptance tests (G-05-5). | closed |
| T-05-07 | Tampering | `ServiceAlertService.fetchAlerts()` (entity/entities field) | medium | mitigate | Field read corrected to match confirmed live shape (`response.entities`, plural) — verified at ServiceAlertService.ts:104. A malformed `entities` array still fails loud via `UpstreamApiError` (per-entity WR-02 guards, `isValidDashAlertEntity`, retained). | closed |
| T-05-12 | Tampering | `ServiceAlertService.fetchFromDashApi()` guard normalization | high | mitigate | Widened guard to accept array-rooted bodies without weakening rejection of `null`/non-object primitives — regression tests lock in both behaviors (ServiceAlertService.test.ts, WR-01 + G-05-5 cases), and the accepted shape was confirmed via a human-reported live capture rather than assumed. | closed |
| T-05-13 | Information Disclosure | Temporary `SERVICE-ALERTS-SHAPE-DIAG` diagnostic log | low | mitigate | Temporary diagnostic log added in 05-06 Task 1 to confirm live body shape, scoped to non-sensitive public alert data, removed by Task 3 before the plan completed — verified absent from current `ServiceAlertService.ts` (no `SERVICE-ALERTS-SHAPE-DIAG` match). | closed |
| T-05-02 | Denial of Service | `ServiceAlertPollService` poll loop / DASH API payload size | low | accept | Feed size is bounded by the transit agency's real-world alert volume, not user-controlled input; polling is fixed at a 5-minute interval, never caller-triggered — no request-amplification vector. | closed |
| T-05-03 | Information Disclosure | `ServiceAlert.headerText`/`descriptionText`/`cause`/`effect`/`url` (raw passthrough) | low | accept | This phase is ingestion-only with no HTTP output surface. When Phase 6 embeds these fields into JSON responses, `JSON.stringify` escapes string content by construction — no HTML/script injection risk at this boundary. | closed |
| T-05-04 | Repudiation | Poll fetch/apply logging | low | accept | Matches existing logging posture for `BusDataRepository`/`PredictionStreamService` (Winston info/error only); no audit-trail requirement exists elsewhere in this codebase. | closed |
| T-05-05 | Elevation of Privilege | N/A — no auth boundary crossed in this phase | low | accept | Alerts fetch reuses the existing pre-configured DASH API key/axios instance; no new credential or privilege boundary introduced. | closed |
| T-05-06 | Tampering | `ServiceAlertService.buildDashApiUrl()` | low | accept | Endpoint path is a compile-time constant built only from server-side config (`environment.dashApi.agency`), not request-derived or user-controlled input. | closed |
| T-05-08 | Tampering | `DashAlertsApiResponse` type/field coupling | low | accept | `entities` field name is sourced from a confirmed live-response capture (G-05-5), not an unverified schema. WR-02 per-entity guards still fail loud on genuinely malformed entities rather than silently accepting garbage. | closed |
| T-05-09 | Information Disclosure | `fetchFromDashApi()`'s error messages | low | accept | Distinguishing the parse-failure message from the shape-guard message is a diagnosability improvement, not new attack surface — both remain generic, carry no upstream response content, and are logged server-side only. | closed |
| T-05-11 | Tampering | Retained `JSON.parse` string-body fallback | low | accept | Kept intentionally as a safety net if the upstream ever ignores `format=json` and reverts to protobuf-binary — the fallback's catch block still throws `UpstreamApiError` rather than accepting garbage silently. | closed |

*Status: open · closed · open — below {block_on} threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-05-01 | T-05-02 | DoS surface bounded by real-world alert volume and fixed poll interval, not user input | Phase plan (05-01) | 2026-09-01 |
| AR-05-02 | T-05-03 | No HTTP output surface this phase; `JSON.stringify` escaping covers the eventual Phase 6 surface | Phase plan (05-01) | 2026-09-01 |
| AR-05-03 | T-05-04 | Matches existing codebase logging posture; no audit-trail requirement exists | Phase plan (05-01) | 2026-09-01 |
| AR-05-04 | T-05-05 | No new credential/privilege boundary introduced | Phase plan (05-01) | 2026-09-01 |
| AR-05-05 | T-05-06 | Endpoint path built only from server-side config, not user input | Phase plan (05-02) | 2026-09-02 |
| AR-05-06 | T-05-08 | Field name sourced from confirmed live capture; per-entity guards remain a safety net | Phase plan (05-03) | 2026-09-02 |
| AR-05-07 | T-05-09 | Diagnosability-only change; no response content leaked in error messages | Phase plan (05-04) | 2026-09-03 |
| AR-05-08 | T-05-11 | Retained fallback is a safety net for a format-negotiation failure, not new attack surface | Phase plan (05-05) | 2026-09-03 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-04 | 12 | 12 | 0 | /gsd-secure-phase (L1 grep-depth, register authored at plan time — direct code/test verification, no auditor subagent spawned per short-circuit rule) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-04
