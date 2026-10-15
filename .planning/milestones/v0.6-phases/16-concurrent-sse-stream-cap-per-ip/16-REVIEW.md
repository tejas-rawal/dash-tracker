---
phase: 16-concurrent-sse-stream-cap-per-ip
reviewed: 2026-10-12T16:55:12Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src/server/api/middleware/streamConcurrencyCap.ts
  - src/server/api/middleware/streamConcurrencyCap.test.ts
  - src/server/api/routes/predictionRoutes.ts
  - src/server/api/routes/streamCap.test.ts
  - src/server/test/streamClient.ts
findings:
  critical: 0
  warning: 3
  info: 5
  total: 8
status: issues_found
---

# Phase 16: Code Review Report

**Reviewed:** 2026-10-12T16:55:12Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

This phase adds a per-IP cap on concurrent SSE streams (`streamConcurrencyCap.ts`), places it on `/predictions/stream` after the shared rate-limit bucket, and adds a shared test client plus two test suites.

I traced the claim/release logic against Node 20's `ServerResponse` lifecycle, the async `express-rate-limit@8.7.0` middleware that runs before the cap, and `PredictionStreamController`'s cleanup path. The core logic holds up:
- The claim is synchronous up to `next()`.
- `res.destroyed` is set before `'close'` is emitted, both in `onServerResponseClose` and in `emitCloseNT`, so the early-drop guard is sound.
- The release runs at most once and deletes keys that reach zero.
- Every path the controller can end on emits `'close'` on `res`.

Lint passes (Biome on the 5 files) and all 27 tests pass with `--typecheck`.

There are no blockers. The findings below cover:
- one product-level availability risk in how the cap groups clients by address;
- two test-harness defects that turn failures into hangs or cascades;
- several smaller quality items.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: A 5-stream cap keyed by IPv4 address or IPv6 /56 locks out riders who share a public address (bus Wi-Fi, CGNAT, campus networks)

**File:** `src/server/api/middleware/streamConcurrencyCap.ts:9,34`
**Issue:** The cap key is `ipKeyGenerator(req.ip)`. That is one key per IPv4 address and one per IPv6 /56. A concurrency limit of 5 is far tighter than the bucket's 60 requests per minute, because a slot is held for the whole stream's lifetime instead of one request.

Every client behind one NAT shares those 5 slots. For a transit-arrivals app, the common case is riders on the same bus Wi-Fi, a station or office hotspot, or a mobile carrier's CGNAT. Mobile IPv6 carriers usually give each device its own /64, and many /64s from one pool fall inside the same /56. Once five riders hold streams, the sixth gets a 429.

Browsers' `EventSource` does not retry on a non-200 response, so the `Retry-After: 5` hint is never used. That rider's live stream fails for good until they reload the page.

The same grouping becomes a global lockout if `TRUST_PROXY_HOPS` is left at 0 behind a reverse proxy. Every client then shares the proxy's address, so the whole service gets 5 streams in total. Under the rate limiter alone, that misconfiguration only meant 60 requests per minute.

**Fix:** Key the concurrency cap more narrowly than the request bucket, and size it for shared addresses. For example, key IPv6 by /64 and raise the per-key cap, while the /56 bucket still bounds the reconnect rate:
```ts
// Concurrency is per device, not per network: a /64 is one subscriber; the /56 bucket still bounds churn.
const key = req.ip === undefined ? UNKNOWN_CLIENT_KEY : ipKeyGenerator(req.ip, 64);
```
At minimum, record the shared-NAT trade-off in D-01/D-09. Also add a startup log line stating the effective cap and trusted-hop count, so a proxy misconfiguration is visible.

### WR-02: `connectStream` swallows every client error, so a failed or dropped connect hangs the test instead of failing it

**File:** `src/server/test/streamClient.ts:29-32,55-57`
**Issue:** `opened` is only ever resolved, inside the response callback. The `'error'` listener is a no-op for all errors, not just the expected hang-up after a deliberate `destroy()`. So `opened` never settles, and every `await openStream(...)` or `await hold(...)` waits for vitest's 5 s timeout with a generic timeout message, when:
- the connection is refused;
- the server resets before headers;
- the cap's own `res.destroyed` drop path leaves a request unanswered.

The real cause is lost. Both suites build on this helper.
**Fix:** Reject `opened` on any error that happens before a response arrives, and only ignore errors after that:
```ts
let rejectOpened: (error: Error) => void = () => {};
let responded = false;
const opened = new Promise<OpenedStream>((resolve, reject) => {
    resolveOpened = resolve;
    rejectOpened = reject;
});
const request = http.get({ ... }, (response) => {
    responded = true;
    ...
});
request.on("error", (error) => {
    // After a response, an error is the expected hang-up from a simulated disconnect.
    if (!responded) {
        rejectOpened(error);
    }
});
```
Callers that deliberately destroy a pending connect (`connectPending`) should attach `.catch(() => {})` to `opened`.

### WR-03: The `afterEach` in `streamCap.test.ts` skips timer and mock restoration when its wait fails, so one failure spreads to every later test

**File:** `src/server/api/routes/streamCap.test.ts:116-123`
**Issue:** `await vi.waitFor(() => expect(openResponses()).toBe(0))` runs before `vi.useRealTimers()` and `vi.restoreAllMocks()`. If any test leaves a response open and the wait times out, those two calls never run. The faked `setInterval`/`clearInterval` and the `logger.warn`/`logger.error` spies then stay installed. The next `beforeEach` re-spies an already-spied logger, so later tests fail or behave wrongly for reasons unrelated to their own code.

The wait also runs while fake `setInterval` is still installed. `vi.waitFor` advances fake time by its interval on every check, so the cleanup wait can trigger poll ticks in the tests that fake timers.
**Fix:** Restore global state first, and make the wait the last step:
```ts
afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    for (const stream of streams.splice(0)) {
        stream.request.destroy();
    }
    await vi.waitFor(() => expect(openResponses()).toBe(0));
});
```
If the `logger.warn` spy is still needed while the wait runs, use `try`/`finally` instead.

## Info

### IN-01: Unused import `openStream`

**File:** `src/server/api/middleware/streamConcurrencyCap.test.ts:9`
**Issue:** `openStream` is imported but never used. The suite only calls `connectStream`, via `hold` and `connectPending`. Biome's recommended set does not flag it, and `tsc` has no `noUnusedLocals`, so nothing catches it.
**Fix:** `import { type OpenedStream, connectStream } from "../../test/streamClient";`

### IN-02: The `UNKNOWN_CLIENT_KEY` rationale is out of date, and the branch is almost never reached

**File:** `src/server/api/middleware/streamConcurrencyCap.ts:15-17,34`
**Issue:** The comment says `req.ip` is undefined "once the socket closes". The `res.destroyed` guard added later (lines 28-30) already drops those requests before the key is computed.

The branch can now only be reached in the short window where the socket handle is torn down but `'close'` has not been emitted yet. In that window, every such request from any client shares one global 5-slot key.

The limiter's default key generator also never produces `"unknown"` for these requests. It logs `ERR_ERL_UNDEFINED_IP_ADDRESS` and keys them as `undefined`. So the test name "keys clients exactly as the shared bucket does" is not strictly true for this case.
**Fix:** Rewrite the comment to describe the case that remains, a teardown race in which the shared key is a safe fallback. Alternatively, drop the request the same way as the `res.destroyed` path, since nobody can read a response.

### IN-03: The cap's key depends implicitly on the limiter's default `ipv6Subnet`

**File:** `src/server/api/middleware/streamConcurrencyCap.ts:32-34`
**Issue:** "The shared bucket's own key" holds only because both sides use `ipKeyGenerator`'s default of 56. If someone sets `ipv6Subnet` on `createUpstreamRateLimiter`, the two keys drift apart with no warning.
**Fix:** Export one constant, for example `CLIENT_IPV6_SUBNET`, from `upstreamRateLimit.ts`. Pass it explicitly both as `ipv6Subnet` in the limiter and as `ipKeyGenerator(req.ip, CLIENT_IPV6_SUBNET)` in the cap. If WR-01 is adopted, instead document on purpose why the two keys differ.

### IN-04: A cap rejection logs every time, unlike the limiter's once-per-window warning

**File:** `src/server/api/middleware/streamConcurrencyCap.ts:38-42`
**Issue:** The rate limiter logs one warning per key per window. The cap logs on every rejection, so one client at the cap can write up to about 55 warn lines a minute (60 minus its 5 held streams). That scales with the number of distinct keys an abuser controls, such as rotating /56s. It is a new log-volume amplifier that other 4xx paths, such as the 400 for a missing `stop`, do not have. D-12 accepts this, but the reason given ("the bucket already bounds the volume") only bounds it per key.
**Fix:** Log once per key while that key stays saturated. For example, keep a `Set` of keys already warned, and clear a key in `release` when its count drops below the cap.

### IN-05: Test constants are duplicated and the mock service is typed as `any`

**File:** `src/server/api/middleware/streamConcurrencyCap.test.ts:15-23,103-106`; `src/server/api/routes/streamCap.test.ts:28-38,66-69,79-83`
**Issue:**
- `CAP_BODY`, the cap-warning prefix and `remainingOf` are copied into both suites. The production string `STREAM_CAP_DETAILS` is copied a third time.
- `mock.results[0]?.value` is typed as `any`, so `getMockService().getPredictionsForStop.mockResolvedValue(...)` is not type-checked against `PredictionService`. If the factory has not run, it fails as a bare `TypeError` inside `beforeEach`.

**Fix:**
- Move the shared helpers into `src/server/test/streamClient.ts`, or a sibling helper file.
- Give the mock an explicit type: `const mockService = vi.mocked(createPredictionService).mock.results[0]?.value as { getPredictionsForStop: Mock<PredictionService["getPredictionsForStop"]> }`.
- Fail fast if it is undefined: `if (!mockService) throw new Error("PredictionService factory was not called at import")`.

---

_Reviewed: 2026-10-12T16:55:12Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
