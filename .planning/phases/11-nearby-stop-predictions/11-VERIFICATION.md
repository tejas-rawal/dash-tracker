---
phase: 11-nearby-stop-predictions
verified: 2026-09-24T15:15:00Z
status: gaps_found
score: 4/7 must-haves verified
covered_files:
  - .planning/REQUIREMENTS.md
  - .planning/phases/11-nearby-stop-predictions/11-01-PLAN.md
  - .planning/phases/11-nearby-stop-predictions/11-01-SUMMARY.md
  - .planning/phases/11-nearby-stop-predictions/11-02-PLAN.md
  - .planning/phases/11-nearby-stop-predictions/11-02-SUMMARY.md
  - src/server/api/controllers/NearbyPredictionController.test.ts
  - src/server/api/controllers/NearbyPredictionController.ts
  - src/server/api/models/Prediction.ts
  - src/server/api/routes/predictionRoutes.test.ts
  - src/server/api/routes/predictionRoutes.ts
  - src/server/api/services/NearbyPredictionService.test.ts
  - src/server/api/services/NearbyPredictionService.ts
  - src/server/api/services/PredictionService.ts
  - src/server/api/services/predictionMapping.test.ts
  - src/server/api/services/predictionMapping.ts
covered_digest: "v1:sha256:7ec1e41f6bcca7a9db091930aebd49d66c71a551eff3c196dbe8e54377b626cf"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "SC5 / NEAR-09: a single malformed stop entry in an otherwise valid upstream response is dropped and the remaining stops are still returned"
    status: partial
    reason: >-
      isValidNearbyEntry checks only that each destination.predictions is an array. It never checks the
      array's elements. An entry with predictions: [null] passes the guard. mapToDestinations then reads
      pred.min on null and throws a TypeError, which the controller maps to 500 "Request Failed" and returns
      with the raw TypeError text. Every other valid stop is lost. Reproduced by the verifier through the
      real route (supertest, only axios.get stubbed): one valid entry (548) plus one entry (561) with
      predictions [null] returned
      {"status":500,"body":{"error":"Request Failed","details":"Cannot read properties of null (reading 'min')"}}.
      The upstream 502 half of SC5 (success:false, network error, malformed body) is verified.
    artifacts:
      - path: "src/server/api/services/NearbyPredictionService.ts"
        issue: "isValidNearbyEntry (lines 22-36) stops at Array.isArray(destination.predictions). Its own comment (lines 20-21) says it exists to stop a 500 from the shared mapping, and it does not."
      - path: "src/server/api/services/predictionMapping.ts"
        issue: "mapToDestinations (lines 9-15) dereferences pred.min/sec/time/tripId/vehicleId unguarded, which is where it crashes"
      - path: "src/server/api/services/NearbyPredictionService.test.ts"
        issue: "The 'malformed entries' it.each table (lines ~483-514) has no non-object prediction element row, so the gap is untested"
    missing:
      - "Validate every element of destination.predictions in isValidNearbyEntry: it must be a non-null object with numeric min/sec/time and string tripId/vehicleId, the fields the mapper copies. Otherwise drop the whole entry with one logger.warn."
      - "Add malformed-entry rows for predictions [null], ['x'] and [{}] to NearbyPredictionService.test.ts, plus one route E2E case asserting 200 with the valid stops kept"
  - truth: "Prohibition (verification: test): MUST NOT fabricate or default arrival data for malformed upstream entries. Malformed entries are dropped and logged, never filled in."
    status: failed
    reason: >-
      Same root cause as the gap above. An entry whose predictions array holds a non-object scalar (for
      example ["x"]) passes the guard, and the mapper turns it into an empty prediction object. The verifier's
      repro returned 200 with stop 561's destination predictions [{}]. That is a placeholder prediction with no
      min/sec/time/tripId/vehicleId, served to the rider as an arrival, and no warn was logged for it. The
      test-tier enforcement covers only the listed field-level cases and has no case for prediction elements,
      so this prohibition fails closed.
    artifacts:
      - path: "src/server/api/services/NearbyPredictionService.ts"
        issue: "The guard lets non-object prediction elements through"
      - path: "src/server/api/services/predictionMapping.ts"
        issue: "The field-by-field copy of a string element yields {} with every field undefined"
    missing:
      - "The same per-element validation fixes this, so fix both together"
      - "Add a test asserting that no response prediction is missing min/sec/time/tripId/vehicleId after a malformed element is injected"
behavior_unverified_items: []
human_verification:
  - test: "Live smoke test with a real DASH_API_KEY: bun run dev-server, then curl -s 'http://localhost:${PORT:-3000}/api/v1/predictions/nearby?lat=38.8048&lng=-77.0469&radius=0.25&number=3'"
    expected: "200. Stops nearest-first with stop 548 (King St + N Washington St) at or near the top, every distance under 0.25, routes grouped per stop, and an alerts array on every stop. '?lat=&lng=-77.0469' returns 400, and radius=5 returns 400."
    why_human: "Needs live DASH/Swiftly credentials and data. Every automated test stubs axios.get with the captured fixture."
  - test: "Stop-ID-space cross-check (SC1 remainder): with the dev server running, confirm the stop ids from /predictions/nearby (e.g. '548', '561') appear as BusStop.id values in GET /api/v1/routes/all (or /routes/30) stops, and, while any stop-scoped alert is active, that the alert appears on the matching nearby stop"
    expected: "Nearby stopIds are the same strings as BusStop.id and as the GTFS-RT informedStopIds that ServiceAlertRepository matches on, so NEAR-06 alert embedding works on live data"
    why_human: "D-04 asserts the ID-space match by inference: PredictionService already forwards BusStop.id as Swiftly's stop= param. No live nearby stopId was cross-checked against the loaded BusStop.id set or a live alert, and the NEAR-06 E2E test injects an alert keyed on the fixture's own '548'."
  - test: "Client disconnect mid-flight (backstop truth): send a nearby request, abort the client before the upstream call returns (use a slow or blackholed DASH_API_BASE_URL), and watch the server logs"
    expected: "No unhandled promise rejection, no retry, no lingering state. The handler's res.json on the closed socket is a no-op."
    why_human: "The plan marks this truth verification: backstop. No test simulates an abort, so presence and wiring cannot qualify it (insufficient_spec)."
---

# Phase 11: Nearby Stop Predictions Verification Report

**Phase Goal:** A rider can send their location to `GET /api/v1/predictions/nearby` and get live arrival predictions for every stop around them (nearest-first, with distance and active service alerts) from a single live call to DASH/Swiftly `real-time/{agency}/predictions-near-location`.
**Verified:** 2026-09-24T15:15:00Z
**Status:** gaps_found
**Re-verification:** No (initial verification)

## Goal Achievement

The endpoint exists, is wired end to end (route, controller, service, shared mapping, ServiceAlertRepository), and meets SC2 to SC4 under real tests. It misses part of SC5. The code review's CR-01 is **confirmed**, and the verifier's repro found a second symptom: one upstream entry with a non-object prediction element either takes down the whole request (500, with an internal TypeError returned to the client) or leaks a made-up empty prediction `{}` into a 200 response.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: the live `predictions-near-location` payload shape is confirmed before the Dash* types were locked; the fixtures mirror it; the stop-ID space matches `BusStop.id` | ? UNCERTAIN | **Shape: confirmed.** 11-CONTEXT.md D-01/D-02 and `<specifics>` record a user-supplied live `alexandria-dash` response (2026-09-23): the envelope, the flat per-(route, stop) entries, `distanceToStop` in meters, and `blockId` present. `DashNearbyPredictionData extends DashPredictionData { distanceToStop: number }` matches it. The fixtures in `predictionRoutes.test.ts:363-452` and `NearbyPredictionService.test.ts` reproduce the 548/548/561/949 entries verbatim, `blockId` included. **ID space: inferred, not observed.** D-04 relies on PredictionService forwarding `BusStop.id` as Swiftly's `stop=` param (`PredictionService.ts:41`). No live nearby stopId was checked against the loaded `BusStop.id` set. Routed to human verification. `.planning/STATE.md:115` still lists this concern as open. |
| 2 | SC2: `generatedAt` ISO plus nearest-first stops, each with id/name/code, `distance` in miles, `RoutePrediction`/`Destination` routes and `ServiceAlertSummary[]` alerts (`[]` when none), from exactly one uncached upstream call | ✓ VERIFIED | `NearbyPredictionService.ts:116-152` groups by raw stopId, computes distance as `distanceToStop / 1609.344`, calls `getActiveAlertsForStop` once per stop, sorts stably by distance and stamps `generatedAt`. E2E (a) checks the order `["548","561","949"]`, the exact key set, the absence of blockId, `alerts []` and a single `axios.get`. E2E (b) proves the real ServiceAlertRepository singleton is wired. The unit test at `:386` asserts that two calls make two upstream requests (no cache). All pass. |
| 3 | SC3: `radius` (default 0.5 mi, capped at 1) is sent as `meters`, `number` is forwarded, and omitting both works | ✓ VERIFIED | Controller `:28-38, :70-88`; service `toMeters = Math.ceil(r*1609.344)`, with `number` set only when it is defined. E2E: 0.25→meters=403 and number=3; 1→meters=1610 and number=10; 5.0→number=5; the default gives meters=805 with no `number=`. All pass. |
| 4 | SC4: missing, empty, non-numeric or out-of-range lat/lng, or an invalid radius/number, return 400 with no upstream call | ✓ VERIFIED | `parseStrictNumber` rejects non-strings, blanks, arrays, objects and non-finite values. `NearbyPredictionController.test.ts` has 49 passing tests covering the boundaries, blanks, NaN/Infinity/1e999, repeated and nested params and validation order, with `not.toHaveBeenCalled()` on every 400. E2E (c) covers lat missing, radius=1.5 and number=11 with the spy uncalled. |
| 5 | SC5: upstream `success:false`, network error or malformed body returns 502; a single malformed stop entry is dropped and the remaining stops are returned | ✗ FAILED (partial) | The 502 half is verified: the ordered body guard `:88-104` and the try/catch wrapping `:77-85`, E2E (d)/(e)/(f) and the unit tables pass, and the API key never leaks (the `super-secret-key` test). **The drop half fails for entries with a malformed prediction element.** Verifier repro via supertest: `[valid 548, 561 with predictions:[null]]` gave **500** `{"error":"Request Failed","details":"Cannot read properties of null (reading 'min')"}`. See gaps. |
| 6 | Existing `/stops/nearby` and `/predictions` are unchanged; no SSE stream; no recents on the nearby path | ✓ VERIFIED | `git diff --quiet b33dc28` exits 0 for StopController, PredictionController, StopService, PredictionStreamService, VehicleService, StopController.test, stopRoutes.test and PredictionService.test. The PredictionService refactor is a verbatim move to `predictionMapping.ts`, and its untouched suite passes. The only lines removed from predictionRoutes.test.ts belong to the vitest import, which was widened. The nearby controller and service read no headers and have no recents dependency. |
| 7 | Backstop: a client disconnect mid-flight leaves no state and no unhandled rejection | ? UNCERTAIN (insufficient_spec) | `verification: backstop`. The try/catch covers the only await, and the service holds no state, but no test simulates an abort. Presence alone does not qualify this truth. Human item. |

**Score:** 4/7 truths verified (0 present-but-behavior-unverified; 2 uncertain and routed to human; 1 failed)

### Prohibitions (all `verification: test`)

| Prohibition | Disposition | Evidence |
|-------------|-------------|----------|
| MUST NOT record rider coordinates (logs or persistence) | ✓ enforced | `NearbyPredictionService.test.ts:400-401` asserts no logged argument contains `38.8048`/`-77.0469`. The info log records only `meters`. The warn log records only stopId/routeShortName. No persistence dependency. |
| MUST NOT serve cached predictions as live | ✓ enforced | Test `:386` asserts two calls make two `axios.get` calls. `generatedAt` is stamped on each call (`:419`). |
| MUST NOT fabricate or default arrival data for malformed entries | ✗ **violated** | Verifier repro: an entry with `predictions:["x"]` returned 200 with stop 561's destination `predictions: [{}]`, a placeholder prediction with no fields and no warn. The enforcement tests do not cover prediction elements. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/server/api/models/Prediction.ts` | Nearby Dash*/response types | ✓ VERIFIED | `DashNearbyPredictionData extends DashPredictionData` and the 4 new interfaces are present. `DashNearbyApiResponse` is unused (review IN-02, info). |
| `src/server/api/services/predictionMapping.ts` | Shared mapping | ✓ VERIFIED (with defect) | Exports `mapToRoutePrediction` and `mapToRoutePredictions`, used by both services. It is the crash site for gap 1. |
| `src/server/api/services/NearbyPredictionService.ts` | One live call, validation, grouping, sort, alerts | ⚠️ PARTIAL | Substantive and wired. The entry guard is incomplete (gap 1). |
| `src/server/api/controllers/NearbyPredictionController.ts` | Validation → 400, 502/500 mapping | ✓ VERIFIED | Includes `MAX_RADIUS_MILES = 1` and `MAX_PREDICTIONS_PER_DESTINATION = 10`. |
| `src/server/api/routes/predictionRoutes.ts` | `/nearby` registration and DI | ✓ VERIFIED | Line 14: `createNearbyPredictionService(ServiceAlertRepository.getInstance())`; line 21: `router.get("/nearby", ...)`. |
| `src/server/api/services/NearbyPredictionService.test.ts` | ≥200 lines on the live fixture | ✓ VERIFIED | 535 lines, 38 tests. No prediction-element malformed case. |
| `src/server/api/controllers/NearbyPredictionController.test.ts` | ≥150 lines, NEAR-08 matrix | ✓ VERIFIED | 293 lines, 49 tests. |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| predictionRoutes.ts | NearbyPredictionService.ts | `createNearbyPredictionService(ServiceAlertRepository.getInstance())` | ✓ WIRED |
| NearbyPredictionService.ts | predictionMapping.ts | `mapToRoutePrediction(entry)` (line 132) | ✓ WIRED |
| PredictionService.ts | predictionMapping.ts | `import { mapToRoutePredictions } from "./predictionMapping"` | ✓ WIRED |
| NearbyPredictionService.ts | ServiceAlertRepository | `getActiveAlertsForStop(entry.stopId)` once per new stop (line 128) | ✓ WIRED |
| NearbyPredictionController.ts | NearbyPredictionService.ts | `await service.getNearbyPredictions(lat, lng, { radius, number })` inside try/catch | ✓ WIRED |
| predictionRoutes.test.ts | NearbyPredictionController.ts | supertest through the real controller and service, with only `axios.get` spied | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| Nearby response `data.stops` | `predictionsData` | `axios.get('/real-time/{agency}/predictions-near-location?lat&lon&meters[&number]')` on every request | Yes (live upstream, uncached) | ✓ FLOWING |
| `stops[].alerts` | `getActiveAlertsForStop(stopId)` | ServiceAlertRepository singleton (populated by the Phase 8 ingestion) | Yes | ✓ FLOWING (live ID-space match is a human item) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite and coverage | `bun run test:coverage` (run once) | 34 files / 507 tests passed; 98.27% statements, 93.57% branches | ✓ PASS |
| Typecheck | `bunx tsc --noEmit -p tsconfig.json` | exit 0 | ✓ PASS |
| Lint on phase source files | `bunx biome check` (6 impl files) | "No fixes applied", exit 0 | ✓ PASS |
| Unchanged endpoints | `git diff --quiet b33dc28 -- <8 files>` | exit 0 | ✓ PASS |
| CR-01 repro: null prediction element | throwaway supertest (deleted afterwards) | 500 `Cannot read properties of null (reading 'min')` | ✗ FAIL |
| Fabrication repro: string prediction element | same throwaway test | 200, `predictions: [{}]` served | ✗ FAIL |

The throwaway test file `src/server/api/routes/zzVerifierThrowaway.test.ts` was deleted after the run, and `git status` shows no source changes.

### Probe Execution

Step 7c: SKIPPED. The phase declares no probes, and `scripts/*/tests/probe-*.sh` does not exist.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| NEAR-01 | 11-01 | Endpoint backed by one predictions-near-location call | ✓ SATISFIED | E2E (a); one `axios.get`; the URL contains the path |
| NEAR-02 | 11-01, 11-02 | Optional radius (miles, default 0.5, capped) → meters | ✓ SATISFIED | E2E meters=805/403/1610; radius=1.5 gives 400 |
| NEAR-03 | 11-01, 11-02 | Optional `number` forwarded | ✓ SATISFIED | E2E number=3/10/5; omitted by default |
| NEAR-04 | 11-01 | id/name/code/distance (miles), nearest-first | ✓ SATISFIED | E2E (a) plus the grouping and ordering units |
| NEAR-05 | 11-01 | Route → destination grouping in RoutePrediction/Destination | ✓ SATISFIED | Shared mapping; E2E (a) route short names per stop |
| NEAR-06 | 11-01 | Per-stop ServiceAlertSummary[] | ✓ SATISFIED (live ID match is a human item) | E2E (b) with the real singleton; unit test calls it once per stop |
| NEAR-07 | 11-01 | Top-level `generatedAt` ISO | ✓ SATISFIED | E2E (a) round-trip; unit `:419` |
| NEAR-08 | 11-01, 11-02 | 400 on bad lat/lng/radius/number | ✓ SATISFIED | 49-case controller matrix; E2E spy uncalled |
| NEAR-09 | 11-01 | 502 via UpstreamApiError; malformed entries dropped, not failing the request | ✗ BLOCKED (partial) | 502 paths pass. A malformed prediction element fails the request with 500 (gap 1). |

All 9 IDs are declared in the plan frontmatter (11-01 lists NEAR-01..09 and 11-02 lists NEAR-02/03/08) and map to Phase 11 in REQUIREMENTS.md. No requirement is left without a claiming plan. Note that REQUIREMENTS.md already marks NEAR-09 `[x]` Complete, which this verification contradicts.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| NearbyPredictionService.ts | 20-36 | Partial type guard: `entry is DashNearbyPredictionData` claims more than it checks | 🛑 Blocker | Gap 1 and the fabrication prohibition |
| NearbyPredictionController.ts | 44-48 | 500 path returns the raw internal `error.message` to the client and does not log it (review WR-02) | ⚠️ Warning | Combined with gap 1, it sends `Cannot read properties of null...` to riders |
| NearbyPredictionService.ts | 103, 124-125 | `agencyKey as string` and unchecked `stopName`/`stopCode`/route fields; upstream drift drops keys silently (review WR-01) | ⚠️ Warning | Response contract can change silently; no fabrication |
| NearbyPredictionService.ts | 78 | No upstream timeout on the shared axios instance (review WR-03; accepted as T-11-06) | ⚠️ Warning | A stalled upstream hangs the request instead of returning 502. SC5 covers "network error" and this is a hang, so it is not scored as a gap. |
| models/Prediction.ts | 85-92 | `DashNearbyApiResponse` is exported and never used (IN-02) | ℹ️ Info | Dead type |
| All phase-modified files | n/a | TBD/FIXME/XXX/TODO | none found | n/a |

### Code Review Cross-Check (11-REVIEW.md)

- **CR-01: CONFIRMED** by code reading and a reproduction through the real route. The review understated it. The review calls it a NEAR-08 breach, but the requirement it breaks is NEAR-09 / SC5. It also has a second symptom the review missed: scalar elements (`"x"`) do not crash and instead produce a fabricated `{}` prediction in a 200 response, which violates a declared `must_haves.prohibitions` item.
- WR-01, WR-02, WR-03: confirmed as present. Recorded as warnings, not gaps.

### Human Verification Required

These items still stand once the gaps are closed.

#### 1. Live smoke test
**Test:** Run `bun run dev-server` with a real `DASH_API_KEY`, then `curl -s "http://localhost:${PORT:-3000}/api/v1/predictions/nearby?lat=38.8048&lng=-77.0469&radius=0.25&number=3"`.
**Expected:** 200, nearest-first, stop 548 at or near the top, distances under 0.25, and an alerts array on every stop. `lat=` returns 400, and `radius=5` returns 400.
**Why human:** Needs live credentials. Every automated test stubs axios.

#### 2. Stop-ID-space cross-check (remainder of SC1)
**Test:** Confirm that the nearby stop ids appear as `BusStop.id` in `/api/v1/routes/*` stops. While a stop-scoped alert is active, confirm it shows on the matching nearby stop.
**Expected:** Same string IDs, and alerts embed on live data.
**Why human:** D-04 is an inference from the `/predictions` `stop=` param. Nobody has compared the IDs against live data.

#### 3. Client disconnect mid-flight (backstop)
**Test:** Abort a nearby request while the upstream call is pending.
**Expected:** No unhandled rejection, no retry, no state left behind.
**Why human:** Backstop truth with no automated abort test.

### Gaps Summary

One root cause blocks the phase. `isValidNearbyEntry` validates the entry, its `destinations` array and each destination's `predictions` array, but not the prediction elements themselves. The shared `mapToDestinations` dereferences every element unguarded, so:

- A `null` element throws, and the request becomes a 500 with the raw TypeError returned to the client. This breaks SC5 / NEAR-09's "a single malformed entry is dropped and the remaining stops are still returned".
- A scalar element maps to an empty `{}` prediction and is served in a 200 response. This breaks the declared prohibition against fabricating arrival data.

The fix is small and local:
1. Extend the guard to require each prediction to be a non-null object with numeric `min`/`sec`/`time` and string `tripId`/`vehicleId`.
2. Add unit rows for `[null]`, `["x"]` and `[{}]`.
3. Add one route E2E case that asserts 200 with the valid stops kept.

Consider WR-02 (a generic 500 message plus a server-side log) in the same pass. Everything else (SC2 to SC4, the unchanged-endpoint guarantee, and the privacy and no-cache prohibitions) holds under passing tests. The three human items above remain after the gap closes.

---

_Verified: 2026-09-24T15:15:00Z_
_Verifier: Claude (gsd-verifier)_
