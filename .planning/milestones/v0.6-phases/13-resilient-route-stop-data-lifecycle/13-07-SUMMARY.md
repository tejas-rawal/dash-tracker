---
phase: 13-resilient-route-stop-data-lifecycle
plan: 07
subsystem: api
tags: [sse, prediction-stream, reload, gap-closure, vitest, e2e]

# Dependency graph
requires:
  - phase: 13-01
    provides: "BusDataRepository.load() swaps in a new dataset atomically, so getStopById misses a dropped stop right away"
  - phase: 13-05
    provides: "BusDataRefreshService runs load() every hour, which is how a dataset can drop a stop that has live streams"
provides:
  - "StreamSubscriber { onUpdate, onEnd } and subscribe(stopId, subscriber) on PredictionStreamService"
  - "Terminal NotFoundError handling in poll(): the private endLoop clears the interval, removes the loop, logs one warn and ends every subscriber"
  - "Stale-tick identity guard (loops.get(stopId) !== entry) and per-subscriber isolation of onEnd failures"
  - "The controller passes its single cleanup path as onEnd, so an ended stream ends the response exactly once"
  - "Real-HTTP E2E dataReloadStream.test.ts: a reload that drops a subscribed stop ends its SSE stream, and the stop then answers 404"
affects: [phase-14-readiness, 13-verification]

# Actuals (#2632)
actuals:
  tokens: 10852
  tasks: 2
  commits: 2
plan_head_before: 8da0d6ddd5d3d8918d3a26c15bf16d9f57ae2049

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A subscriber object ({ onUpdate, onEnd }) in place of a bare callback, so the service can end a stream through the same cleanup path a client disconnect uses"
    - "Teardown removes shared state first and then notifies, so re-entrant unsubscribe calls from notifications are no-ops"
    - "Async teardown checks map identity (loops.get(key) === entry) so a stale in-flight tick never removes a newer loop"

key-files:
  created:
    - src/server/api/routes/dataReloadStream.test.ts
  modified:
    - src/server/api/services/PredictionStreamService.ts
    - src/server/api/controllers/PredictionStreamController.ts
    - src/server/api/services/PredictionStreamService.test.ts
    - src/server/api/controllers/PredictionStreamController.test.ts

key-decisions:
  - "A stop dropped by a reload ends its SSE streams with no farewell event: the EventSource reconnect gets the existing 404, so bodies, headers and event types stay unchanged (D-13)"
  - "Only NotFoundError is terminal for a stream loop. UpstreamApiError and any other tick failure stay transient, so a DASH blip never ends a rider's stream"
  - "The teardown line is logged once per stop at warn level ('Ending <n> prediction stream(s) for stop <id>: <reason>'), because a stop leaving the agency dataset is an expected upstream change"

patterns-established:
  - "Service-initiated stream end: the service calls subscriber.onEnd(), and the controller wires onEnd to the same guarded cleanup closure it registers for res close/error"

requirements-completed: [DATA-01]

coverage:
  - id: D1
    description: "Over real HTTP against a fake DASH, a reload that drops stop-1 ends the open /predictions/stream?stop=stop-1 on the next 30 s tick. The stream gets one frame only, makes no further DASH call, logs exactly one warn and no error, a reconnect gets 404 { error: 'Not Found', details: 'Stop not found: stop-1' }, no zombie loop polls in the next 60 s, and no log carries the key"
    requirement: DATA-01
    verification:
      - kind: e2e
        ref: "src/server/api/routes/dataReloadStream.test.ts#ends a live prediction stream when a reload drops its stop, and the stop then answers 404"
        status: pass
    human_judgment: false
  - id: D2
    description: "Service teardown contract. A removed stop ends each subscriber once with one warn and stops polling, while other stops keep streaming. A throwing onEnd is isolated. An unsubscribe after teardown, a re-subscribe (404), an empty in-flight teardown and a stale tick from a replaced loop are all harmless"
    requirement: DATA-01
    verification:
      - kind: unit
        ref: "src/server/api/services/PredictionStreamService.test.ts#when a reload removes the stop"
        status: pass
    human_judgment: false
  - id: D3
    description: "Transient tick failures (UpstreamApiError timeout, plain Error) keep the stream open and never call onEnd, and the next good tick fans out"
    requirement: DATA-01
    verification:
      - kind: unit
        ref: "src/server/api/services/PredictionStreamService.test.ts#keeps the stream open when a poll tick times out upstream, then fans out the next good tick"
        status: pass
      - kind: unit
        ref: "src/server/api/services/PredictionStreamService.test.ts#logs and keeps the interval running when a poll tick's fetch rejects, then recovers next tick"
        status: pass
    human_judgment: false
  - id: D4
    description: "The controller subscribes with { onUpdate, onEnd }, and onEnd ends the response and unsubscribes exactly once, even when a socket close follows. With the real service, a removed stop ends every response once after only the initial frame"
    requirement: DATA-01
    verification:
      - kind: unit
        ref: "src/server/api/controllers/PredictionStreamController.test.ts#ends the response once through the cleanup path when the service ends the stream, even if the connection then closes"
        status: pass
      - kind: integration
        ref: "src/server/api/controllers/PredictionStreamController.test.ts#ends every response on the stop once when a reload removes it, and stops polling"
        status: pass
    human_judgment: false

# Metrics
duration: 5min
completed: 2026-10-01
status: complete
---

# Phase 13 Plan 07: End Live Prediction Streams When a Reload Drops Their Stop Summary

**When the hourly refresh drops a stop, the stop's SSE prediction streams now end on their next 30 s tick. `poll()` treats `NotFoundError` as terminal, a new `StreamSubscriber.onEnd` runs the controller's single cleanup path, and the rider's reconnect gets the existing 404 (closes review WR-01)**

## Performance

- **Duration:** about 5 min
- **Started:** 2026-10-01T18:38:55Z
- **Completed:** 2026-10-01T18:43:30Z
- **Tasks:** 2
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments

- **Service teardown.** `PredictionStreamService` now takes a typed `StreamSubscriber { onUpdate, onEnd }`.
  - On a tick that rejects with `NotFoundError`, the private `endLoop` clears the interval and removes the loop before ending anyone.
  - It logs `Ending <n> prediction stream(s) for stop <id>: Stop not found: <id>` once at warn level, then calls each `onEnd` in its own try/catch.
  - Every other tick error keeps its previous transient behavior.
- **Stale-tick guard.** `endLoop` does nothing unless `loops.get(stopId) === entry`. A late tick from a removed or replaced loop can never tear down a newer one, and an empty teardown logs nothing.
- **Controller wiring.** The controller calls `subscribe(stop, { onUpdate: send, onEnd: cleanup })`, so a service-ended stream uses the same guarded cleanup as a client disconnect. The response ends exactly once, with no new SSE event type and no final frame (D-13).
- **Real-app E2E.** `dataReloadStream.test.ts` runs the real bounded client, repository, services, controller and router against a fake DASH. It proves end-of-stream, no further DASH call or log line, a 404 on reconnect, and no zombie loop.

## Task Commits

1. **Task 1 (tracer): end live prediction streams when a reload drops their stop.** `1754e5c` (feat)
2. **Task 2: pin the prediction stream teardown contract at service and controller.** `c0e9237` (test)

**Plan metadata:** recorded in the docs commit that follows this SUMMARY.

## Files Created/Modified

- `src/server/api/services/PredictionStreamService.ts`: adds the exported `StreamSubscriber`, the `subscribe(stopId, subscriber)` signature, `endLoop` with the identity guard and isolated `onEnd`, and the terminal `NotFoundError` branch in `poll()`. The callback-only `Subscriber` alias is removed.
- `src/server/api/controllers/PredictionStreamController.ts`: passes `{ onUpdate: send, onEnd: cleanup }`.
- `src/server/api/routes/dataReloadStream.test.ts` (new): the real-HTTP E2E, with inline `startFakeDash`/`makeDashRoute` and fake `setInterval`/`clearInterval` only.
- `src/server/api/services/PredictionStreamService.test.ts`: adds the `makeSubscriber()` factory, migrates every call site and adds `vi.clearAllMocks()` per test. Also adds the `UpstreamApiError` transient case and the `when a reload removes the stop` describe (terminal, selective, isolation, unsubscribe-after-teardown, re-subscribe, empty in-flight, stale tick).
- `src/server/api/controllers/PredictionStreamController.test.ts`: adds the subscriber-shape, `onEnd` single-cleanup and `onUpdate` frame cases, plus a real-service teardown case.

## Decisions Made

- The stream ends with no farewell event, because the standard EventSource reconnect lands on the existing 404 contract (D-13).
- The subscriber is an object rather than a third positional callback, following the CLAUDE.md typed-object-param convention.
- The teardown line is a warn logged once per stop, not an error repeated every 30 s.
- I added one test the plan did not list: "ends nothing and logs nothing when every subscriber left while the failing tick was in flight". It pins the DATA-01 empty-edge truth directly. The stale-tick case also covers it, but only alongside a replacement loop.

## Deviations from Plan

None. The plan was executed as written.

## TDD Gate Compliance

Task 2 (`tdd="true"`) pins behavior that the Task 1 tracer had already built, as the plan intended ("They pin what Task 1 built"). So the new cases passed on their first run instead of failing first. Two checks show the pins would catch a regression:

- **E2E without the fix:** with the terminal `NotFoundError` branch disabled, the E2E fails with "stream was not ended within 2000 ms".
- **Mutations of the service:** each was applied temporarily and restored, with no diff left behind.
  - Without the identity guard, the stale-tick case fails.
  - Without the per-subscriber try/catch around `onEnd`, the isolation case fails.
  - With every error treated as terminal, both transient cases fail.

The commits are `feat(13-07)` (tracer) followed by `test(13-07)` (pins). There is no `test(...)` commit before the `feat(...)` commit, which follows from the plan's tracer-then-pin structure rather than from skipping RED.

## Issues Encountered

None.

## Verification

- `bun run test`: 44 files, 670 tests passed, no type errors.
- `bun run test:coverage`: thresholds met (all files 98.69% statements, 96.15% branches, 98.41% functions, 98.69% lines).
- `bunx tsc --noEmit -p tsconfig.json`: exit 0.
- `bunx biome check` on every file in `files_modified`: exit 0. The only output is the two existing `useFilenamingConvention` warnings on PascalCase `*.test.ts` names, which are kept by design.
- All acceptance-criteria greps for Task 1 and Task 2 return their expected counts.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- Review WR-01 is closed. With 13-06 (WR-02) and 13-07 done, the Phase 13 gap-closure plans are complete and the phase is ready for re-verification.
- WR-03 (readiness) is still deferred to Phase 14. The teardown warn line is a visible signal that Phase 14 can build on, but it is not required.

## Self-Check: PASSED

- FOUND: every created or modified file listed above
- FOUND: commits `1754e5c` and `c0e9237`

---
*Phase: 13-resilient-route-stop-data-lifecycle*
*Completed: 2026-10-01*
