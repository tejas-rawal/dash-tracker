---
phase: 04-live-predictions-via-sse
verified: 2026-08-27T12:10:00Z
status: passed
score: 7/7 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 4: Live Predictions via SSE Verification Report

**Phase Goal:** Riders can subscribe to a stop and see arrival predictions update automatically over a live connection, with the existing REST endpoint still available as a fallback, and both response shapes reporting server-side freshness.
**Verified:** 2026-08-27T12:10:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Client opens `GET /api/v1/predictions/stream?stop={id}` and receives an immediate `event: prediction` frame, then further frames roughly every 30s, without client-side polling (LIVE-01 / SC1) | ✓ VERIFIED | Real-HTTP tracer test in `predictionRoutes.test.ts` ("streams an immediate event: prediction frame...") asserts `content-type: text/event-stream` and an `event: prediction` frame body over a live server. `PredictionStreamService.test.ts`'s fan-out test proves the 30s (`POLL_INTERVAL_MS`) tick actually fires a subsequent fetch/push via `vi.advanceTimersByTimeAsync(30_000)`. |
| 2 | However many SSE subscribers are attached to the same stop, `PredictionService.getPredictionsForStop` is invoked at most once per 30s tick — never once per subscriber (LIVE-02 / SC2) | ✓ VERIFIED | `PredictionStreamService.test.ts`: "fans out one additional fetch per tick to every subscriber of the same stop" — 2 subscribers, exactly 2 total calls (1 initial + 1 tick), both subscribers receive the same payload. Concurrent-first-subscriber race also covered ("two subscribes for the same brand-new stop issued without awaiting the first share one fetch and one loop"). |
| 3 | When the last SSE subscriber for a stop disconnects, that stop's interval is cleared; the next subscriber triggers a brand-new fetch and timer (LIVE-03 / SC3) | ✓ VERIFIED | Unit-level: "stops polling once the sole subscriber unsubscribes" + "subscribing again after a full unsubscribe triggers a fresh fetch". End-to-end: `predictionRoutes.test.ts` "tears down the poll loop on client disconnect, triggering a fresh fetch on reconnect" — real HTTP connect → destroy → reconnect, asserts an additional fetch occurred. |
| 4 | `GET /api/v1/predictions` continues to work exactly as before and performs its own independent upstream fetch regardless of any active SSE loop for the same stop (LIVE-04 / SC4, D-09) | ✓ VERIFIED | `predictionRoutes.test.ts` "performs its own independent fetch for REST even while a stream loop is active for the same stop" opens a real stream connection (populating the loop/cache) then issues a REST call and asserts an *additional* independent fetch occurred. All 12 pre-existing REST tests still pass unchanged. |
| 5 | Both the REST response and every SSE `prediction` event carry a top-level `generatedAt` ISO 8601 string, stamped once per fetch inside `PredictionService.getPredictionsForStop` (LIVE-05 / SC5, D-07, D-08) | ✓ VERIFIED | `StopPredictionsResponse.generatedAt: string` is a required field (`Prediction.ts:27`); `PredictionService.getPredictionsForStop` stamps `new Date().toISOString()` (`PredictionService.ts:89`); `PredictionService.test.ts` asserts the ISO-8601 shape via regex. SSE frames carry the identical object serialized by `JSON.stringify(payload)` in `PredictionStreamController.ts`'s `send()` — same return value, no separate stamping path. |
| 6 | A transient upstream failure during a poll tick is logged via `logger.error` and does not close subscriber connections, emit an error event, or stop the interval — subscribers keep seeing the last good payload until the next successful tick (D-04) | ✓ VERIFIED | `PredictionStreamService.test.ts`: "logs and keeps the interval running when a poll tick's fetch rejects, then recovers next tick" — asserts `onUpdate` not called on the failing tick, `logger.error` called with a message containing the stop id, and a subsequent successful tick still fans out fresh data (interval was never cleared). |
| 7 | Requesting the stream with a missing `stop` param or an unknown stop id returns a typed 400/404 JSON error before any SSE headers are written | ✓ VERIFIED | `PredictionStreamController.test.ts`: 400 case asserts `subscribe` never called; 404/502 cases assert `res.writeHead` never called. `predictionRoutes.test.ts` confirms the same at the real-route level (400 missing stop, 404 unknown stop) with standard `{ error, details }` JSON body shape matching the REST endpoint's convention. |

**Score:** 7/7 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/server/api/services/PredictionStreamService.ts` | Shared per-stop poll loop, fan-out subscribers | ✓ VERIFIED | Exports `PredictionStreamService` interface + `createPredictionStreamService` factory exactly as specified; internal `loops` Map, `pendingFirstFetch` race guard, `poll`/`subscribe`/`unsubscribeFrom` all present and substantive (no stubs). |
| `src/server/api/controllers/PredictionStreamController.ts` | SSE request handler | ✓ VERIFIED | `createPredictionStreamController` factory; validates `stop`, subscribes, defers `writeHead` until after `subscribe()` resolves, wraps header/initial-send in try/catch, registers `req.on("close", ...)` cleanup. |
| `src/server/api/routes/predictionRoutes.ts` (modified) | Mounts `/stream` | ✓ VERIFIED | `router.get("/stream", streamController.getPredictionsStream)` added alongside existing `router.get("/", ...)`; `streamService` constructed from the *same* `service` instance passed to `createPredictionController` (D-05/D-09). |
| `src/server/api/models/Prediction.ts` (modified) | `generatedAt` field | ✓ VERIFIED | Required top-level `generatedAt: string` field added to `StopPredictionsResponse`, positioned alongside `data` per D-07. |
| `src/server/api/services/PredictionService.ts` (modified) | Stamps `generatedAt` | ✓ VERIFIED | `generatedAt: new Date().toISOString()` added to the `getPredictionsForStop` return object. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `predictionRoutes.ts` | `PredictionStreamController.getPredictionsStream` | `router.get("/stream", ...)` | ✓ WIRED | Confirmed in source; exercised by real-HTTP tracer test. |
| `PredictionStreamController` | `PredictionStreamService.subscribe` | `await streamService.subscribe(stop, send)` | ✓ WIRED | Confirmed; headers written only after this resolves (verified by both controller unit test and code inspection). |
| `PredictionStreamService` | `PredictionService.getPredictionsForStop` | direct call, no fetch/mapping duplication | ✓ WIRED | Confirmed — `PredictionStreamService` never imports axios/repository directly, only calls the injected `predictionService`. |
| `req.on('close')` | `unsubscribe()` → `subscribers.delete` → `clearInterval` when `size===0` → `loops.delete` | Node/Express disconnect event | ✓ WIRED | Confirmed in `PredictionStreamController.ts` and `PredictionStreamService.ts`; proven end-to-end by the real-HTTP disconnect/reconnect test. |
| `predictionRoutes.ts` (REST path) | `PredictionController.getPredictions` → `PredictionService.getPredictionsForStop` | independent of stream loop | ✓ WIRED | Confirmed by the REST-independence test — REST always performs its own fetch, never reads `lastData` from the stream loop. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite passes with typecheck | `bun run test` | 217/217 tests passed across 17 files, 0 type errors | ✓ PASS |
| Coverage thresholds (80% branches/functions/lines/statements) | `bun run test:coverage` | 97.75% stmts / 93.93% branch / 97.33% funcs / 97.75% lines project-wide; exit 0 | ✓ PASS |
| Build compiles cleanly | `bun run build` | `tsc` completed with no errors; `dist/server/api/services/PredictionStreamService.js` produced | ✓ PASS |
| Named service-level test suite (spot-check on LIVE-02 fan-out) | `bun run test -- src/server/api/services/PredictionStreamService.test.ts` | 9/9 pass, including the fan-out and failure-recovery scenarios | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| LIVE-01 | 04-01-PLAN.md | Subscribe via SSE, live updates without polling | ✓ SATISFIED | Truth #1 above |
| LIVE-02 | 04-01-PLAN.md | Single shared upstream poll per stop regardless of subscriber count | ✓ SATISFIED | Truth #2 above |
| LIVE-03 | 04-01-PLAN.md | Polling stops on idle, resumes on new subscriber | ✓ SATISFIED | Truth #3 above |
| LIVE-04 | 04-01-PLAN.md | REST endpoint unchanged, independent fallback | ✓ SATISFIED | Truth #4 above |
| LIVE-05 | 04-01-PLAN.md | `generatedAt` freshness timestamp on both REST and SSE | ✓ SATISFIED | Truth #5 above |

No orphaned requirements — REQUIREMENTS.md maps exactly LIVE-01 through LIVE-05 to Phase 4, and all five appear in `04-01-PLAN.md`'s `requirements` frontmatter field.

### Anti-Patterns Found

None. Scanned all 10 files touched by this phase (`PredictionStreamService.ts`/`.test.ts`, `PredictionStreamController.ts`/`.test.ts`, `predictionRoutes.ts`/`.test.ts`, `Prediction.ts`, `PredictionService.ts`/`.test.ts`, `PredictionController.test.ts`) for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/stub-return patterns — zero matches.

**Known residual risk (non-blocking, does not fail any LIVE-01..05 must-have):** The phase went through a 3-iteration code-review fix cycle. All 3 Critical findings (CR-01 concurrent-first-subscriber duplicate loops, CR-02 late disconnect-listener registration, CR-03 fan-out abort on one bad subscriber) and 4 of 5 Warnings were closed and independently re-verified against the current source during this verification pass (confirmed directly in `PredictionStreamService.ts`'s `pendingFirstFetch` map and `poll()`'s per-subscriber try/catch, and in `PredictionStreamController.ts`'s pre-subscribe `close` listener). One residual item remains open per the reviewer's iteration-3 report and was NOT auto-fixed (3-iteration cap reached):

- **WR-05:** `PredictionStreamController.ts`'s `res.writeHead`/`send(initialPayload)` call (lines 70-83) is wrapped in a try/catch that only catches *synchronous* throws. A genuine mid-write client socket error surfaces asynchronously as a Node `'error'` event, not a thrown exception — no `res.on("error", ...)` listener exists anywhere in `src/server`. This is an orthogonal robustness gap (a specific network-failure timing on the *very first* frame of a connection), not a violation of any of LIVE-01 through LIVE-05 as scoped — none of the must-have truths above depend on this path, and it was correctly triaged as non-blocking by the code reviewer. Recommended as tracked tech debt / a follow-up `/gsd-code-review 04 --fix` pass, consistent with `04-REVIEW-FIX.md`'s own recommendation.
- **IN-01 (residual):** The WR-03 catch branch itself (the synchronous-throw guard added in iteration 2) has no dedicated unit test. Coverage report confirms this: `PredictionStreamController.ts` sits at 84.5%/80.76% (lines 79-83 uncovered), the lowest of any file touched this phase — visibly lower than the ~95-100% achieved elsewhere, consistent with this specific gap and not indicative of any other untested path.

Neither item blocks phase completion; both are explicitly out of scope for LIVE-01 through LIVE-05 and were transparently disclosed in the phase's own review artifacts rather than hidden.

## Deviations from Plan (cross-checked against SUMMARY)

Both auto-fixed deviations documented in `04-01-SUMMARY.md` were confirmed present in source:
- Biome `useNamingConvention` suppression on the `Connection` header key — confirmed via `biome-ignore` comment in both `PredictionStreamController.ts:74` and its test.
- 20ms settle-delay pattern in disconnect-driven SSE tests — confirmed present in `predictionRoutes.test.ts` (lines 224-234, 296, 325-328).

## Human Verification Required

None. All must-have truths were verified with genuine behavioral test evidence (fake-timer tick advancement for the 30s cadence, real HTTP connections for the SSE tracer/disconnect/REST-independence paths) rather than presence-only checks.

## Gaps Summary

No gaps. All 5 ROADMAP success criteria (mapping 1:1 to LIVE-01 through LIVE-05) and the 2 additional plan-level must-haves (D-04 failure resilience, 400/404 pre-header error responses) are verified against actual, substantive, wired code with passing behavioral tests — not merely present symbols. `bun run test`, `bun run test:coverage`, and `bun run build` were independently re-run during this verification (not taken from SUMMARY narrative) and all pass. The one pre-existing lint "error" (a Biome formatting diff in `.planning/config.json`) predates this phase (traced to commit `eead153`) and is unrelated to any file this phase modified.

---

_Verified: 2026-08-27T12:10:00Z_
_Verifier: Claude (gsd-verifier)_
