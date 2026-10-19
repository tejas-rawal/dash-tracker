---
phase: "15"
slug: "alert-nearby-data-hygiene"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-19"
---

# Phase 15 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Verified retroactively on 2026-10-19, after the v0.6 milestone close, against the code at `20dc3b6`. The `/gsd-ship v0.6` security gate found no SECURITY.md for this phase. The register is the union of the `<threat_model>` blocks in plans 15-01, 15-02 and 15-03, which were all written at plan time. No SUMMARY recorded threat flags.

**ID note:** plan 15-03 reused the IDs T-15-08 to T-15-14, which plan 15-02 had already used for different threats. To keep IDs unique, this register numbers 15-03's threats T-15-15 to T-15-21 and gives each one's plan-local ID in its Component cell.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| DASH alerts feed → `ServiceAlertService.fetchAlerts()` | Upstream JSON (authenticated, over TLS) is semi-trusted: list shapes, element and id types, and dates can be wrong, stale or soft-deleted | Alert records (public agency data) |
| `ServiceAlertRepository` → public route/stop/nearby responses | Whatever ingestion stores is served to anonymous riders; a failed poll keeps serving the previous snapshot | Alert summaries |
| DASH `predictions-near-location` → `NearbyPredictionService` | Upstream JSON is semi-trusted: any display field can be missing or mistyped | Route/stop/destination names, ids, predictions |
| Services → Winston logs | Upstream-derived alert ids and stop/route strings reach the log stream; rider coordinates must not | Ids, field names |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-15-01 | Tampering (rider-facing data) | `fetchAlerts()` ingestion | medium | mitigate | `isDeleted` drops any non-null `deletedAt` (`ServiceAlertService.ts:59-61`), checked before parsing (`:203-205`) | closed |
| T-15-02 | Denial of Service | Alert poll via `fetchAlerts()` | medium | mitigate | A malformed date drops only its own alert with `continue` (`:206-210`); `isParseableDate` (`:63-65`) replaces the throwing date path, so one bad record no longer freezes every alert update | closed |
| T-15-03 | Tampering (fail-open window) | `deriveActiveWindow` / `isAlertActive` | medium | mitigate | `findMalformedBound` rejects any present bound that is not a parseable date string, for start and end (`:89-101`), and `parseAlert` drops the alert before mapping (`:165-168`) | closed |
| T-15-04 | Information Disclosure | Warn line, `ServiceAlert` model, summaries | low | mitigate | The warn carries only the alert id and the malformed part (`:208`); `ServiceAlert` has no deletion field, since `deletedAt` exists only on the DASH-shaped `DashAlertEntity` (`ServiceAlert.ts:6-16,47`) | closed |
| T-15-05 | Denial of Service (log volume) | Malformed-date warn | low | accept | See AR-15-01 | closed |
| T-15-06 | Tampering (log injection, CWE-117) | Warn line interpolating upstream alert id | low | accept | See AR-15-02 | closed |
| T-15-07 | Denial of Service | `findMalformedBound` on very large `activePeriods` arrays | low | accept | See AR-15-03 | closed |
| T-15-08 | Tampering (rider-facing data) | `isValidNearbyEntry` | medium | mitigate | Requires non-empty `routeId`/`routeName`/`routeShortName`/`stopId`/`stopName`, a finite `stopCode`, and non-empty destination `directionId`/`headsign` (`NearbyPredictionService.ts:46-66`) | closed |
| T-15-09 | Information Disclosure | Drop warn in `filterValidEntries` | low | mitigate | The warn is built only from `stopId` and `routeShortName` via `describeEntry` (`:73-78,143`), with no rider coordinates | closed |
| T-15-10 | Denial of Service | Mapping a malformed entry | low | mitigate | `filterValidEntries` runs before `groupByStop` (`:183`), so a bad entry is dropped on its own and valid entries are still returned | closed |
| T-15-11 | Tampering | `agencyKey` in the response envelope | low | mitigate | `parseDashResponse` rejects a non-string `agencyKey` with `UpstreamApiError` (502) (`:131-134`) | closed |
| T-15-12 | Denial of Service (log volume) | One warn per dropped nearby entry | low | accept | See AR-15-04 | closed |
| T-15-15 | Denial of Service (alert freshness) | `fetchAlerts()` per-entity mapping (15-03 plan-local T-15-08) | medium | mitigate | `readRecordList` checks both lists before use (`ServiceAlertService.ts:76-86`), and `parseAlert` drops only the offending alert (`:157-163`); lists are typed `unknown` on the model (`ServiceAlert.ts:43-44`), so unchecked reads don't compile | closed |
| T-15-16 | Tampering (stale snapshot) | Failed poll keeping soft-deleted alerts (15-03 plan-local T-15-09) | medium | mitigate | A structurally malformed alert no longer fails the poll (`:206-210`), so an alert DASH deletes in the same poll is still removed (`:203-205`) | closed |
| T-15-17 | Tampering (fail-open window) | `isPlainRecord` / `readRecordList` (15-03 plan-local T-15-10) | low | mitigate | Arrays, null and primitives are not records (`:69-71`); a present non-list returns `undefined` (malformed), never `[]` (`:76-86`), so a garbage list cannot collapse into an always-active window | closed |
| T-15-18 | Tampering (type confusion) | `informedRouteIds` / `informedStopIds` (15-03 plan-local T-15-11) | low | mitigate | Only `typeof id === "string"` values enter the lists (`:136,139`) | closed |
| T-15-19 | Information Disclosure | Structural-drop warn line (15-03 plan-local T-15-12) | low | mitigate | The warn carries only the alert id and the list name (`"activePeriods list"` / `"informedEntities list"`, `:159,163,208`), with no raw value | closed |
| T-15-20 | Denial of Service (log volume) | Structural-drop warn (15-03 plan-local T-15-13) | low | accept | See AR-15-05 | closed |
| T-15-21 | Tampering (log injection, CWE-117) | Warn line interpolating upstream alert id (15-03 plan-local T-15-14) | low | accept | See AR-15-02 (same risk as T-15-06) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-15-01 | T-15-05 | One warn line per bad alert per 5-minute poll (D-04), bounded by feed size | Plan 15-01 threat model | 2026-10-07 |
| AR-15-02 | T-15-06, T-15-21 | The alert id comes from the authenticated DASH feed over TLS; this is the same pattern as VehicleService's dropped-vehicle warn (review IN-01) | Plans 15-01 and 15-03 threat models | 2026-10-07 |
| AR-15-03 | T-15-07 | A linear scan, the same order as the existing `deriveActiveWindow` work; feed size is DASH-controlled. The related `Math.min`/`Math.max` spread overflow at ~130k periods (review WR-04) is tracked as tech debt in STATE.md | Plan 15-01 threat model | 2026-10-07 |
| AR-15-04 | T-15-12 | Bounded by the upstream entry count per request and by the 60/min per-IP limiter on `/predictions/nearby` (`predictionRoutes.ts:26`) | Plan 15-02 threat model | 2026-10-07 |
| AR-15-05 | T-15-20 | One line per bad alert per 5-minute poll, bounded by feed size (same acceptance as T-15-05 / D-04) | Plan 15-03 threat model | 2026-10-07 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-19 | 21 | 21 | 0 | /gsd-secure-phase 15 (orchestrator, ASVS L1 grep-depth; auditor skipped per short-circuit rule: register authored at plan time, threats_open 0) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-19
