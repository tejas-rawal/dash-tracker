# Phase 4: Live Predictions via SSE - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-27
**Phase:** 4-Live Predictions via SSE
**Areas discussed:** SSE endpoint & event design, Poll loop lifecycle & failure handling, generatedAt placement & format, REST endpoint changes

---

## SSE Endpoint & Event Design

| Option | Description | Selected |
|--------|-------------|----------|
| `GET /api/v1/predictions/stream?stop=` | Sibling of existing REST endpoint under /predictions | |
| `GET /api/v1/stops/:stopId/predictions/stream` | Path-param style nested under stops | |
| You decide | Claude picks based on codebase conventions during planning | ✓ |

**User's choice:** You decide.

| Option | Description | Selected |
|--------|-------------|----------|
| Immediate on connect | Client sees data right away; reuses last known data if a loop is already running | ✓ |
| Wait for next tick | Simpler, no special-casing for cached data | |

**User's choice:** Immediate on connect.

| Option | Description | Selected |
|--------|-------------|----------|
| Named event: 'prediction' | `event: prediction\ndata: {...}` — extensible to future event types | ✓ |
| Plain data-only message | Just `data: {...}`, works with EventSource's default onmessage | |

**User's choice:** Named event: 'prediction'.

---

## Poll Loop Lifecycle & Failure Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Keep serving stale data, log the failure | Subscribers keep last successful data; retries next tick; logged server-side | ✓ |
| Emit an error event, keep connection open | Named 'error' SSE event, connection stays open | |
| Close the SSE connection with an error | Matches REST's UpstreamApiError throw; forces reconnect | |

**User's choice:** Keep serving stale data, log the failure. Claude recommended this option (asked "what's the cleanest option here?"); rationale: closing on every transient hiccup forces reconnect storms; an error event adds a second event type clients must handle for a usually self-healing case.

| Option | Description | Selected |
|--------|-------------|----------|
| New PredictionStreamService (or similar) | New service owns timer/subscriber state, calls into PredictionService for fetch | ✓ |
| Extend PredictionService directly | Add poll-loop map into existing service | |

**User's choice:** New PredictionStreamService. Claude recommended this option; rationale: mirrors the Phase 3 precedent of splitting StopService out from BusRouteService for a distinct concern; avoids mixing long-lived stateful timer logic with single-shot fetch logic and its existing test suite.

| Option | Description | Selected |
|--------|-------------|----------|
| Listen for 'close' on the response object | Standard Express/Node pattern, no heartbeat needed | ✓ |
| You decide | Claude picks the standard pattern during planning | |

**User's choice:** Listen for 'close' on the response object.

---

## generatedAt Placement & Format

| Option | Description | Selected |
|--------|-------------|----------|
| Top-level, alongside 'data' | `{ success, generatedAt, data: {...} }` — freshness as response metadata | ✓ |
| Nested inside 'data' | `{ success, data: { generatedAt, ... } }` | |

**User's choice:** Top-level, alongside 'data'.

| Option | Description | Selected |
|--------|-------------|----------|
| ISO 8601 string | Human-readable, matches STATE.md timestamps elsewhere in this project | ✓ |
| Epoch milliseconds | Smaller payload, no timezone ambiguity | |

**User's choice:** ISO 8601 string.

---

## REST Endpoint Changes

| Option | Description | Selected |
|--------|-------------|----------|
| Always its own upstream call (unchanged) | REST stays exactly as it behaves today, independent of any poll loop | ✓ |
| Serve from the poll loop's cache when active | Saves a redundant upstream call, but couples REST behavior to SSE subscriber state | |

**User's choice:** Always its own upstream call (unchanged). Claude recommended this option (asked "not sure which is the better option here, what would you suggest?"); rationale: PROJECT.md explicitly frames REST as an independent fallback path; coupling to poll-loop cache state would make REST's freshness silently depend on unrelated SSE subscriber activity; the DASH API isn't expensive enough to justify the added coupling.

---

## Claude's Discretion

- Exact URL/query-string shape of the SSE endpoint.
- Internal implementation of the poll-loop timer/subscriber-map data structure inside `PredictionStreamService`.
- Exact SSE framing/headers setup (`Content-Type: text/event-stream`, `Cache-Control`, etc.).

## Deferred Ideas

None — discussion stayed within phase scope.
