# Phase 12: Bounded Upstream Calls & Error Safety Nets - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-28
**Phase:** 12-bounded-upstream-calls-error-safety-nets
**Areas discussed:** Timeout budget, Timeout → 502 mapping, Rejection policy, SSE error cleanup

---

## Timeout budget

| Option | Description | Selected |
|--------|-------------|----------|
| One timeout | Single env var on the shared axios instance; bulk load must fit | ✓ |
| Two timeouts | Separate longer timeout for the bulk route/stop load | |

| Option | Description | Selected |
|--------|-------------|----------|
| 10 seconds | Margin for verbose routes payload; still fails before mobile gives up | ✓ |
| 5 seconds | Faster 502s; bulk load at risk | |
| 15 seconds | Most forgiving; long rider wait | |

| Option | Description | Selected |
|--------|-------------|----------|
| DASH_API_TIMEOUT_MS | Milliseconds, matches axios unit and DASH_API_* prefix | ✓ |
| DASH_API_TIMEOUT_SECONDS | Seconds, converted internally | |

| Option | Description | Selected |
|--------|-------------|----------|
| Hard total deadline | Per-request AbortSignal.timeout-style cap on the whole call | ✓ |
| axios `timeout` only | Socket-idle timeout; slow trickles can run longer | |
| You decide | Leave to research | |

**Notes:** Code scout found axios's Node `timeout` is idle-based, which prompted the deadline question.

---

## Timeout → 502 mapping

| Option | Description | Selected |
|--------|-------------|----------|
| Central interceptor | One response-error interceptor throws UpstreamApiError(message only); remove Nearby's per-service wrap | ✓ |
| Per-service try/catch | Replicate Nearby's pattern in each service | |

| Option | Description | Selected |
|--------|-------------|----------|
| Distinct timeout message | "DASH API request timed out after Xms" | ✓ |
| Generic message | Whatever axios says | |

| Option | Description | Selected |
|--------|-------------|----------|
| 502 as specified | Matches UPST-02 and existing mapping | ✓ |
| 504 for timeouts | New error class + controller changes | |

**Notes:** Scout found PredictionService and VehicleService currently let raw AxiosErrors through, so they surface as 500s.

---

## Rejection policy

| Option | Description | Selected |
|--------|-------------|----------|
| Log and keep running | Error-level log, process stays up | ✓ |
| Log and exit(1) | Rely on a supervisor restart | |

| Option | Description | Selected |
|--------|-------------|----------|
| uncaughtException: log and exit | Winston log, then exit(1) | ✓ |
| Leave it out | Keep Node default | |

| Option | Description | Selected |
|--------|-------------|----------|
| Message + stack only | Never serialize the reason object (API key safety) | ✓ |
| Full object | Richer but leak-prone | |

---

## SSE error cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| warn | Stop id + message; client aborts are routine | ✓ |
| error | Noisy on mobile | |
| Split by code | EPIPE/ECONNRESET warn, else error | |

| Option | Description | Selected |
|--------|-------------|----------|
| Unsubscribe + end, same as close | Shared idempotent cleanup | ✓ |
| Unsubscribe + destroy socket | Hard kill | |

| Option | Description | Selected |
|--------|-------------|----------|
| Rely on res 'error' | No second cleanup path in the service | ✓ |
| Also drop on throw | Service removes subscriber whose callback throws | |

---

## Claude's Discretion

- Interceptor structure and timeout-detection mechanics
- Importing `UpstreamApiError` into the config layer
- Where the process handlers live
- Whether BusDataRepository's catch/rethrow needs adjustment

## Deferred Ideas

None.
