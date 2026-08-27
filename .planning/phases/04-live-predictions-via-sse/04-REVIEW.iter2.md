---
phase: 04-live-predictions-via-sse
reviewed: 2026-08-27T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - src/server/api/services/PredictionStreamService.ts
  - src/server/api/services/PredictionStreamService.test.ts
  - src/server/api/controllers/PredictionStreamController.ts
  - src/server/api/controllers/PredictionStreamController.test.ts
  - src/server/api/routes/predictionRoutes.ts
  - src/server/api/routes/predictionRoutes.test.ts
  - src/server/api/models/Prediction.ts
  - src/server/api/services/PredictionService.ts
  - src/server/api/services/PredictionService.test.ts
  - src/server/api/controllers/PredictionController.test.ts
findings:
  critical: 3
  warning: 2
  info: 2
  total: 7
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-08-27T00:00:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

The phase delivers the SSE endpoint, the shared per-stop poll loop, and the `generatedAt`
timestamp exactly as scoped, and the sequential test suite (all 213 tests) genuinely does
exercise the single-caller subscribe/unsubscribe lifecycle described in the plan. However,
`PredictionStreamService.subscribe()` has no protection against concurrent first-subscribers
for the same stop, and `PredictionStreamController` registers its disconnect cleanup handler
too late to catch a client that disconnects while the initial upstream fetch is still in
flight. Both gaps directly undermine the plan's own `must_haves` (LIVE-02, LIVE-03) and the
threat model's stated DoS mitigations (T-04-01, T-04-02), and neither is exercised by the new
tests — every test in `PredictionStreamService.test.ts` performs its two `subscribe()` calls
sequentially (`await`ing the first before starting the second), so the race window between
"no entry yet" and "entry stored" is never opened. A third, related defect makes a single
misbehaving/disconnected subscriber capable of silently starving every other subscriber of
the same stop for a tick.

## Critical Issues

### CR-01: Concurrent first-subscribers for the same new stop create duplicate, permanently-leaked poll loops

**File:** `src/server/api/services/PredictionStreamService.ts:56-84`
**Issue:**
`subscribe()` decides whether to join an existing loop or start a new one purely by
synchronously reading `loops.get(stopId)` before the `await predictionService.getPredictionsForStop(stopId)` call:

```ts
async function subscribe(stopId: string, onUpdate: Subscriber) {
    const existing = loops.get(stopId);
    if (existing) { ... }               // <-- only checked BEFORE the await
    const initialPayload = await predictionService.getPredictionsForStop(stopId); // yields control
    const entry: StreamLoop = { subscribers: new Set([onUpdate]), lastData: initialPayload,
        timer: setInterval(() => { void poll(stopId); }, POLL_INTERVAL_MS) };
    loops.set(stopId, entry);           // <-- last writer wins
    ...
}
```

If two SSE clients subscribe to the same *not-yet-active* stop close enough together that the
second call's `loops.get(stopId)` check runs before the first call's `loops.set(stopId, entry)`
has executed (trivially possible — `getPredictionsForStop` makes a real HTTP call to the DASH
API, which yields the event loop for the entire round trip), **both** branches take the
"start a new loop" path. Each creates its own `setInterval` and calls `loops.set(stopId, ...)`,
so the second call's `entry` silently overwrites the first's in the map. Consequences:

1. The first caller's `setInterval` is never referenced again by anything that could
   `clearInterval` it — it has no entry in `loops` pointing back to it, so **it runs forever**
   even after every subscriber disconnects, making an unbounded, permanent extra upstream poll
   every 30s per race occurrence. This is the exact DoS scenario T-04-01 in the plan's threat
   model claims is mitigated ("total concurrent timers is bounded by distinct actively-subscribed
   stops") — it is not, under this race.
2. The first caller's subscriber callback (`send`/`onUpdate`) is registered on the now-orphaned
   entry and will never be invoked again by any surviving poll tick (`poll()` always re-reads
   `loops.get(stopId)`, which now resolves to the second entry) — that first SSE client silently
   stops receiving updates after its initial frame, with no error, no disconnect, indistinguishable
   from a healthy but idle stream.
3. Calling `unsubscribe()` for the first subscriber (e.g., on that client's disconnect) reads
   `loops.get(stopId)` fresh and therefore mutates/clears the **second** entry's interval instead
   — potentially killing the second (still-connected, still-being-served) client's loop while the
   orphaned first interval keeps running indefinitely.

This is a direct violation of LIVE-02 ("PredictionService.getPredictionsForStop is invoked at
most once per 30s tick for that stop — never once per subscriber") and of the plan's stated
threat mitigation for T-04-01. It is not caught by the current test suite because every test
that exercises "second subscribe for the same stop" awaits the first `subscribe()` call to
completion before issuing the second (see `PredictionStreamService.test.ts:50-65`), so the
`loops.get(stopId)` check in the second call always observes the already-populated map.

**Fix:** Cache the in-flight first-fetch promise per stop (the same pattern already used
elsewhere in this codebase for exactly this class of problem — see
`BusDataRepository.initializationPromise`), so concurrent subscribers for a brand-new stop
share one pending fetch and only one `StreamLoop`/`setInterval` is ever created:

```ts
const loops = new Map<string, StreamLoop>();
const pendingFirstFetch = new Map<string, Promise<StopPredictionsResponse>>();

async function subscribe(stopId: string, onUpdate: Subscriber) {
    const existing = loops.get(stopId);
    if (existing) {
        existing.subscribers.add(onUpdate);
        return { initialPayload: existing.lastData, unsubscribe: () => unsubscribeFrom(stopId, onUpdate) };
    }

    let fetchPromise = pendingFirstFetch.get(stopId);
    if (!fetchPromise) {
        fetchPromise = predictionService.getPredictionsForStop(stopId);
        pendingFirstFetch.set(stopId, fetchPromise);
    }

    let initialPayload: StopPredictionsResponse;
    try {
        initialPayload = await fetchPromise;
    } finally {
        pendingFirstFetch.delete(stopId);
    }

    // Re-check: another concurrent caller may have already created the loop while we awaited.
    const raced = loops.get(stopId);
    if (raced) {
        raced.subscribers.add(onUpdate);
        return { initialPayload: raced.lastData, unsubscribe: () => unsubscribeFrom(stopId, onUpdate) };
    }

    const entry: StreamLoop = {
        subscribers: new Set([onUpdate]),
        lastData: initialPayload,
        timer: setInterval(() => { void poll(stopId); }, POLL_INTERVAL_MS),
    };
    loops.set(stopId, entry);
    return { initialPayload, unsubscribe: () => unsubscribeFrom(stopId, onUpdate) };
}
```

Add a test that calls `subscribe("stop-1", cb1)` and `subscribe("stop-1", cb2)` **without**
awaiting the first before starting the second, then asserts `getPredictionsForStop` was called
exactly once and only one interval exists (e.g., via `vi.advanceTimersByTimeAsync` producing
exactly one additional call, not two).

---

### CR-02: Disconnect cleanup handler registered after the initial fetch — a client that disconnects mid-subscribe leaks its loop forever

**File:** `src/server/api/controllers/PredictionStreamController.ts:46-63`
**Issue:**
```ts
try {
    const { initialPayload, unsubscribe } = await streamService.subscribe(stop, send); // can be slow — real HTTP call
    res.writeHead(200, { ... });
    send(initialPayload);
    req.on("close", () => { unsubscribe(); res.end(); }); // registered only AFTER subscribe resolves
} catch (error: unknown) { ... }
```
`req.on("close", ...)` is only attached once `streamService.subscribe()` has resolved. `subscribe()`
can take an arbitrary amount of time — for a brand-new stop it performs a full round trip to the
DASH API. If the client aborts the connection (navigation, timeout, explicit cancel) during that
window, Node emits `close` on `req` immediately, but no listener is registered yet to observe it.
`close` is not re-delivered to listeners attached after the fact, so:

- `unsubscribe()` for that client is never called. The dead callback remains permanently
  registered in the loop's `subscribers` Set.
- If that was the loop's only subscriber, `subscribers.size` never reaches `0`, so the interval
  is **never cleared** — violating LIVE-03 ("When the last SSE subscriber for a stop disconnects,
  that stop's 30s interval timer is cleared") and directly contradicting the threat model's claim
  for T-04-02 ("`req.on('close', ...)` always fires ... on client disconnect, error, or abort, so
  an abandoned connection cannot leak a subscriber-set entry or keep a loop alive indefinitely").
- Every subsequent poll tick will still try to invoke the dead client's `send` callback, which
  calls `res.write()` on an already-destroyed response/socket (see CR-03 for the resulting
  fan-out breakage).

**Fix:** Register the close listener before awaiting the subscribe, and/or check the
already-disconnected state after the await resolves:

```ts
let closed = false;
req.on("close", () => { closed = true; });

try {
    const { initialPayload, unsubscribe } = await streamService.subscribe(stop, send);
    if (closed || req.destroyed) {
        unsubscribe();
        return;
    }
    res.writeHead(200, { ... });
    send(initialPayload);
    req.on("close", () => { unsubscribe(); res.end(); });
} catch (error: unknown) { ... }
```
(Adjust so the single `req.on("close", ...)` call path always ends up calling `unsubscribe()`
exactly once regardless of when the disconnect happens.)

---

### CR-03: A single subscriber's failing write silently blocks delivery to every other subscriber of the same stop, and is misreported as an upstream failure

**File:** `src/server/api/services/PredictionStreamService.ts:25-41`
**Issue:**
```ts
async function poll(stopId: string): Promise<void> {
    const entry = loops.get(stopId);
    if (!entry) return;
    try {
        const result = await predictionService.getPredictionsForStop(stopId);
        entry.lastData = result;
        for (const subscriber of entry.subscribers) {
            subscriber(result);          // <-- res.write() for SSE subscribers, unguarded
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error(`Failed to poll predictions for stop ${stopId}: ${message}`);
    }
}
```
The fan-out loop over `entry.subscribers` sits inside the same `try` block as the upstream
fetch. `subscriber(result)` is `PredictionStreamController`'s `send`, which calls
`res.write(...)`. If any one subscriber's underlying connection is already broken/closed at the
moment of a poll tick (a state reachable via CR-02's leaked-subscriber path, or via ordinary
network-level timing between a client disconnect and the "close" event actually firing),
`res.write()` throwing on that iteration aborts the `for` loop entirely — every subscriber
after the broken one in iteration order silently receives no update for that tick, and the
whole thing is logged as `Failed to poll predictions for stop {id}: {write error message}`,
which misattributes a per-connection delivery failure to an upstream-API failure and makes the
real cause invisible in the logs. This also means one bad connection can repeatedly and
indefinitely degrade a shared stream for well-behaved concurrent subscribers of that same stop.

**Fix:** Isolate each subscriber's delivery from both the fetch's error handling and from each
other:

```ts
try {
    const result = await predictionService.getPredictionsForStop(stopId);
    entry.lastData = result;
    for (const subscriber of entry.subscribers) {
        try {
            subscriber(result);
        } catch (deliveryError) {
            const message = deliveryError instanceof Error ? deliveryError.message : "Unknown error";
            logger.error(`Failed to deliver prediction update for stop ${stopId}: ${message}`);
        }
    }
} catch (error) {
    // unchanged upstream-fetch error handling
}
```

## Warnings

### WR-01: `resolveErrorBody`'s catch-all branch throws after headers may already be written

**File:** `src/server/api/controllers/PredictionStreamController.ts:42-63`
**Issue:** `send(initialPayload)` (line 55) runs after `res.writeHead(200, ...)` but is still
inside the `try` block. If `send`/`res.write` throws at that point (e.g., the client disconnected
in the small window between `subscribe()` resolving and `writeHead`/`send` executing), control
falls into the `catch` block, which calls `res.status(...).json(...)` — but the response headers
have already been sent via `writeHead`, so this throws a fresh, unhandled
`ERR_HTTP_HEADERS_SENT` error inside an `async` Express handler with no surrounding try/catch at
the route level, which becomes an unhandled promise rejection (Express does not await async
handlers).
**Fix:** Move `send(initialPayload)` and `req.on("close", ...)` registration outside the
try/catch (only `streamService.subscribe(...)` needs its own error handling), or guard the catch
block with `if (res.headersSent) { return; }` before attempting to write a JSON error body.

### WR-02: `PredictionStreamService.test.ts` and `PredictionStreamController.test.ts` do not cover the concurrency scenarios above

**File:** `src/server/api/services/PredictionStreamService.test.ts` (whole file), `src/server/api/controllers/PredictionStreamController.test.ts` (whole file)
**Issue:** All "two subscribers" scenarios are written as strictly sequential `await subscribe(...)` calls, and the controller test's disconnect scenario always drives `subscribe()` to resolve fully before simulating `close`. Neither the interleaved-subscribe race (CR-01) nor the disconnect-during-await race (CR-02) can be caught by this suite even after a regression, since the harness never exercises the un-awaited/interleaved ordering.
**Fix:** Add the interleaved-subscribe test described in CR-01's fix, and a controller test that resolves `streamService.subscribe` only after `triggerClose()` has already fired once (mock `subscribe` to return a promise you control manually, call the close callback before resolving it, then assert `unsubscribe` was still called and no post-header write happened).

## Info

### IN-01: `poll()`'s and `unsubscribeFrom()`'s `if (!entry) return` guards are unreachable under the current implementation and go untested

**File:** `src/server/api/services/PredictionStreamService.ts:26-29, 44-47`
**Issue:** These defensive checks exist for the case where a loop was torn down between the timer firing and the callback executing, but as noted in the phase summary, coverage sits at 80% branches for this file specifically because of these two guards. This is only worth revisiting once CR-01/CR-02 are fixed, since the fix will likely make these branches reachable (e.g., a torn-down loop racing with an in-flight `poll` tick).
**Fix:** No action required beyond what CR-01/CR-02 fixes naturally exercise; flagging for awareness only.

### IN-02: Duplicate `resolveErrorStatus`/`resolveErrorBody` helpers between `PredictionController.ts` and `PredictionStreamController.ts`

**File:** `src/server/api/controllers/PredictionStreamController.ts:10-31`
**Issue:** These two functions are byte-for-byte identical to the ones in `PredictionController.ts` (and, per the plan/summary, `StopController.ts` also has its own copy). This was an explicit, deliberate choice recorded in the plan ("this codebase duplicates this pair per-controller rather than sharing a util"), so it is not a regression introduced by this phase — noting it here only because a third near-identical copy increases the maintenance surface for the NotFoundError/UpstreamApiError → status/label mapping if that mapping ever needs to change.
**Fix:** Consider extracting a shared `resolveHttpError(error): { status, body }` helper in `src/server/api/errors/` the next time any of the three copies needs to change, rather than a fourth copy-paste.

---

_Reviewed: 2026-08-27T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
