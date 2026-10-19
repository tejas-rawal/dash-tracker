# Phase 16: Concurrent SSE Stream Cap per IP - Context

**Gathered:** 2026-10-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Cap how many `GET /api/v1/predictions/stream` connections a single client IP can hold open at the same time. Without the cap, one IP can open 60 streams a minute (the shared bucket only counts connects, Phase 14 D-11) and keep every one open, each driving a 30s DASH poll. The cap closes review finding WR-02 from Phase 14, which was deferred at UAT.

In scope: a per-IP concurrent-stream limit on `/predictions/stream` only. It returns a 429 with the API's `{ error, details }` body, and a slot is freed whenever its stream closes.

Out of scope: changing the 60/min shared bucket, limiting any other route, upstream caching or poll coalescing (UPST-03), and any distributed or shared store.

</domain>

<decisions>
## Implementation Decisions

### Cap size & what counts
- **D-01:** The cap is **5 concurrent open streams per client IP**.
- **D-02:** **Every open connection counts**, including duplicates for the same stop. Two tabs on stop 349 use 2 slots. The cap bounds open sockets per IP as well as DASH polls. Do not dedupe by stop.
- **D-03:** The cap is a **named module constant**, not an env var. This follows Phase 14 D-12 and 13 D-07. Its comment states the reasoning: a rider app with a few stops open fits within it, and it bounds one IP to at most 5 extra DASH polls every 30s.

### Slot lifecycle
- **D-04:** A connect **claims its slot synchronously when it arrives**, before any async work such as subscribe. This prevents a burst of parallel connects from all passing the check while their subscribes are still pending and overshooting the cap.
- **D-05:** **The cap applies to every connect that reaches it, before stop validation.** A capped IP gets 429 even for a malformed request, for example one with no `stop`. Every claimed slot must be released on every path: a 400, 404, 503 or 502 error response, a client disconnect during a pending subscribe, a normal client disconnect, a server-initiated end (the stop leaves the dataset and the service calls `onEnd`), a socket error, and the shutdown force-close of connections.
- **D-06:** The release is **idempotent and fires exactly once per claim**, whichever of these events arrive and in whatever order. The count can never go negative. An IP's map entry is deleted when its count reaches 0, so idle IPs leave no memory behind.
- **D-07:** **Middleware order is the shared 60/min bucket first, then the cap.** Every stream connect is counted by `upstreamRateLimiter` exactly as today (SC3), including connects the cap later rejects. A connect the bucket rejects never reaches the cap and claims no slot.
- **D-08:** The cap **never closes or writes to a stream that is already open** (SC3, Phase 14 D-11). It acts only when a new connect arrives.
- **D-09:** The client IP is `req.ip`, which already honors `TRUST_PROXY_HOPS` (Phase 14 D-17). It is the same key the shared bucket uses.

### 429 response
- **D-10:** The body is `{ error: "Too Many Requests", details: "<distinct message>" }`. The shape matches the bucket's 429 (Phase 14 D-13), but the details text identifies the concurrency cap, for example "Too many open prediction streams from this client; close one before opening another". It must not suggest waiting for a window.
- **D-11:** The cap's 429 sends **`Retry-After` with a short fixed value**, in the style of the `DataNotReadyError` 503 (5s, `RETRY_AFTER_SECONDS` in `errorResponse.ts`). The value gives EventSource and well-behaved clients a backoff hint instead of a tight reconnect loop. It is a named constant.
- **D-12:** **Every cap rejection logs a `warn`** with the client IP and `req.baseUrl + req.path` only, never the query string (D-15 rule from Phase 14). Volume is already bounded because each rejected connect also spends a hit in the 60/min bucket.

### Placement
- **D-13:** The cap is a **separate middleware**, `src/server/api/middleware/streamConcurrencyCap.ts`, built by a `createStreamConcurrencyCap()` factory. Each instance owns its own `Map<string, number>`, so tests can build fresh instances without count bleed. One shared module-level instance is wired in `predictionRoutes.ts` as `router.get("/stream", upstreamRateLimiter, streamConcurrencyCap, streamController.getPredictionsStream)`. `PredictionStreamController` is left unchanged.
- **D-14:** The middleware ties release to the **response's lifecycle**: the `res` `'close'` event, which fires on client disconnect, `res.end()` after server-side cleanup, socket error and destroy. It does not hook into the controller's cleanup closure. `res`, not `req`, tracks the connection, per Phase 12 review WR-04.
- **D-15:** The counter is **hand-rolled** (`Map<ip, count>`). `express-rate-limit` is window-based and has no concurrent-connection mode. The planner should briefly confirm that no well-maintained concurrency-limit package fits better before writing it (CLAUDE.md principle). Default to the hand-rolled map.

### Claude's Discretion
- The exact `details` wording and the exact `Retry-After` value (around 5s).
- Whether the cap's 429 also carries `RateLimit`/`RateLimit-Policy` headers. Those headers already describe the 60/min bucket that ran first, so leaving them as set by the bucket is fine. Don't invent new headers for the cap.
- Whether the middleware exposes a read-only count accessor for tests, or tests observe behavior only through HTTP.
- Test design. At minimum, cover these cases:
  - The 6th concurrent connect from IP A gets 429 while IP B can still connect (SC1).
  - Each close path frees the slot: client disconnect, server `onEnd`, socket error, and a failed connect (404 or 503) (SC2).
  - Parallel connects fired at once never exceed 5.
  - Cap-rejected connects still increment the 60/min bucket (SC3).
  - Open streams keep receiving events after their IP is at the cap.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope
- `.planning/ROADMAP.md` §"Phase 16: Concurrent SSE Stream Cap per IP" — goal and the three success criteria

### Origin of the requirement
- `.planning/phases/14-health-checks-rate-limiting/14-REVIEW.md` §WR-02 — the finding this phase closes, with the suggested `Map` keyed on `req.ip` and the 429 body
- `.planning/phases/14-health-checks-rate-limiting/14-UAT.md` tests 1–2 — the UAT showing an open stream survives its IP being limited, and the decision to schedule this phase
- `.planning/phases/14-health-checks-rate-limiting/14-CONTEXT.md` D-09..D-17 — shared limiter, per-connect counting, the 429 shape, the log rule (no query string), and `TRUST_PROXY_HOPS`

### Prior SSE lifecycle decisions
- `.planning/STATE.md` §Decisions, Phase 12-03 entry — guarded SSE cleanup; `res` (not `req`) `'close'` tracks the connection; error handling
- `.planning/STATE.md` §Decisions, Phase 12 code-review entry — graceful shutdown force-closes connections after 10s

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/server/api/middleware/upstreamRateLimit.ts`: the pattern to mirror. It has a factory plus a module-level shared instance, named constants with D-ref comments, a `{ error, details }` 429, and a Winston warn that logs `baseUrl + path` only.
- `src/server/api/middleware/upstreamRateLimit.test.ts` and `rateLimit.test.ts`: test harness patterns. They use one long-lived server closed with `closeAllConnections()` (see the Phase 14 `deferred-items.md` note on supertest socket reuse crossing apps).
- `src/server/api/controllers/errorResponse.ts`: holds `RETRY_AFTER_SECONDS` (5) for the 503. Decide whether the cap reuses or mirrors it.

### Established Patterns
- Limits are named module constants, not env vars (14 D-12, 13 D-07).
- DI uses factories. Tests build fresh instances so no state bleeds between them.
- No query strings in logs. Rider coordinates live in `/predictions/nearby` queries, and the rule is applied uniformly.

### Integration Points
- `src/server/api/routes/predictionRoutes.ts:23`: insert the cap between `upstreamRateLimiter` and `streamController.getPredictionsStream` on `/stream` only.
- `src/server/api/controllers/PredictionStreamController.ts`: no change expected. Its guarded cleanup calls `res.end()` on server end, which emits `res` `'close'`, and the cap releases on that event.
- `src/server/app.ts` and `src/server/test/app.ts`: `trust proxy` is already set from `TRUST_PROXY_HOPS`, so `req.ip` is correct in both.
- CLAUDE.md "Rate limiting" bullet: update it to mention the concurrent-stream cap on `/predictions/stream`.

</code_context>

<specifics>
## Specific Ideas

- The review WR-02 suggestion is the starting shape: a `Map<string, number>` keyed on `req.ip`, decremented on close, rejecting past 5 with the same `{ error, details }` 429.
- The UAT recipe from Phase 14 (live DASH, stop 349, curl from one IP) is a good manual check: open 5 streams, confirm the 6th gets 429, close one, and confirm a new one opens immediately.

</specifics>

<deferred>
## Deferred Ideas

None. The discussion stayed within the phase scope.

</deferred>

---

*Phase: 16-concurrent-sse-stream-cap-per-ip*
*Context gathered: 2026-10-08*
