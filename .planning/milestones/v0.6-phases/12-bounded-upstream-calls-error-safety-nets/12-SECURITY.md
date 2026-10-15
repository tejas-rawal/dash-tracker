---
phase: "12"
slug: "bounded-upstream-calls-error-safety-nets"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-09-30"
---

# Phase 12 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| DASH upstream to API server | Untrusted network peer that can hang, trickle bytes, refuse connections or return 5xx; also called outside any request (boot load, 5-minute alert poll) | DASH responses; outbound requests carry `DASH_API_KEY` (secret) |
| API server to rider client | 502 `details` echo `UpstreamApiError.message`; nearby request URLs carry rider coordinates | Error text (public); rider lat/lng (personal) |
| Process environment to config | `DASH_API_TIMEOUT_MS` is operator-supplied and validated at startup | Config value (low) |
| Rider client socket to SSE response | Untrusted, frequently dropped mobile connection whose errors surface asynchronously | Prediction frames (public) |
| Per-stop poll to DASH upstream | Each live subscriber keeps a 30 s upstream poll alive | Upstream call volume |
| Async code paths to process-level events | Rejections/exceptions can carry arbitrary objects (including axios errors holding the key) into the log sink | Error objects (may contain secret) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-12-01 | Information disclosure | `toUpstreamApiError` in `src/server/config/axios.ts` | high | mitigate | Error built from message string only; axios error never attached. `axios.test.ts` asserts no config/request/response/cause and no key | closed |
| T-12-02 | Denial of service | Shared axios client | high | mitigate | Request interceptor sets `AbortSignal.timeout(timeoutMs)` per request (combined with any caller signal via `AbortSignal.any` since IN-01); trickle test in `axios.test.ts` | closed |
| T-12-03 | Information disclosure | `UpstreamApiError` message (nearby URL carries lat/lng) | medium | mitigate | Message from axios `error.message` or fixed text; `axios.test.ts` asserts no `38.8048`/`-77.0469`/path in wrapped error | closed |
| T-12-04 | Tampering | `DASH_API_TIMEOUT_MS` | low | mitigate | `z.coerce.number().int().positive().max(2_147_483_647)` in `environment.ts`; `environment.test.ts` covers abc/0/-1/1.5/empty/above-max | closed |
| T-12-05 | Denial of service | Deadline signal lifetime | medium | mitigate | Signal created inside the request interceptor, never on instance defaults; consecutive-call test | closed |
| T-12-06 | Denial of service | axios keeps abort listener until deadline | low | accept | See Accepted Risks Log | closed |
| T-12-07 | Information disclosure | Nearby 502 body and logs | medium | mitigate | Single URL-free wrap; nearby E2E in `upstreamTimeout.test.ts` asserts no coordinates or key in body/logs | closed |
| T-12-08 | Denial of service | Startup load and alert poll | high | mitigate | Same bounded client; E2E proves each rejects at deadline and logs | closed |
| T-12-09 | Information disclosure | 502 bodies for `/predictions`, `/predictions/nearby`, `/vehicles` | high | mitigate | Each E2E in `upstreamTimeout.test.ts` asserts no `test-api-key` in body or logger calls | closed |
| T-12-10 | Repudiation | Nearby-specific transport context dropped | low | accept | See Accepted Risks Log | closed |
| T-12-11 | Denial of service | `PredictionStreamController` SSE response | high | mitigate | `res.on("error")` registered before `subscribe` is awaited; controller tests cover established and pending-subscribe errors | closed |
| T-12-12 | Denial of service | Per-stop poll after socket error | medium | mitigate | Idempotent `cleanup` calls `unsubscribe()`; `PredictionStreamService` clears the interval when the last subscriber leaves; integration test | closed |
| T-12-13 | Information disclosure | SSE warn log line | low | mitigate | Logs only stop id and `error.message` | closed |
| T-12-14 | Denial of service | Log volume from client aborts | low | accept | See Accepted Risks Log | closed |
| T-12-15 | Information disclosure | Process error log lines in `processHandlers.ts` | high | mitigate | `describeReason` logs `stack ?? message` or `String(reason)` as a single string; `super-secret-key` fixture tests | closed |
| T-12-16 | Denial of service | Node 20 default unhandled-rejection crash | high | mitigate | `unhandledRejection` listener logs and keeps running; unit test asserts no `process.exit` | closed |
| T-12-17 | Tampering | Process state after escaping throw | medium | mitigate | `uncaughtException` logs then exits with code 1 (after log flush, 1 s fallback, per WR-02) | closed |
| T-12-18 | Repudiation | Final log line lost before stdout flush | low | accept | Accepted at plan time; since further reduced by WR-02 (exit waits for Winston `finish` and stdout drain) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-12-01 | T-12-06 | Listener retention bounded by `timeoutMs` (10 s default); timer is unref'd and a late abort is a no-op; a manual controller adds code without measurable benefit | Plan 12-01 threat model | 2026-09-29 |
| AR-12-02 | T-12-10 | Preceding `Fetching nearby predictions...` info log identifies the endpoint; 502 details still state what failed | Plan 12-02 threat model | 2026-09-29 |
| AR-12-03 | T-12-14 | One warn line per broken connection, bounded by connection count; warn level stays out of error alerting | Plan 12-03 threat model | 2026-09-29 |
| AR-12-04 | T-12-18 | Same log-then-exit pattern as init-failure path; residual risk further reduced by WR-02 flush-before-exit | Plan 12-04 threat model | 2026-09-29 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-30 | 18 | 18 | 0 | /gsd-secure-phase (L1 grep-depth, orchestrator; auditor skipped per short-circuit rule) |

Verified against the code after the code-review fixes (WR-01 to WR-05, IN-01 to IN-04). Full test suite: 561/561 passing.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-30
