---
phase: 11-nearby-stop-predictions
verified: 2026-09-24T16:31:07Z
status: passed
score: 5/7 must-haves verified
covered_files:

  - .planning/REQUIREMENTS.md
  - .planning/phases/11-nearby-stop-predictions/11-01-PLAN.md
  - .planning/phases/11-nearby-stop-predictions/11-01-SUMMARY.md
  - .planning/phases/11-nearby-stop-predictions/11-02-PLAN.md
  - .planning/phases/11-nearby-stop-predictions/11-02-SUMMARY.md
  - .planning/phases/11-nearby-stop-predictions/11-03-PLAN.md
  - .planning/phases/11-nearby-stop-predictions/11-03-SUMMARY.md
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

covered_digest: "v1:sha256:bc7e413e3b5d6b955fa372db043a9dfe0d2e1a3af0f8ea51d7eb36d2019359ba"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/7
  gaps_closed:
    - "SC5 / NEAR-09: a single malformed stop entry in an otherwise valid upstream response is dropped and the remaining stops are still returned"
    - "Prohibition (verification: test): MUST NOT fabricate or default arrival data for malformed upstream entries. Malformed entries are dropped and logged, never filled in."
  gaps_remaining: []
  regressions: []
advisory:

  - finding: "WR-03 (review): the whole-entry drop policy removes a stop, and its locally sourced service alerts, when every one of its upstream entries holds a malformed element. The tightened element check also drops an entry if a live prediction ever omits vehicleId, for example a schedule-based arrival."
    category: other
    reason: "This matches the SC5 wording (the malformed entry is dropped, the remaining stops are returned) and the declared DashPrediction contract (vehicleId: string). It becomes a real problem only if live Swiftly data omits vehicleId or tripId. Resolve it by watching for 'Dropping malformed nearby prediction entry' warns during the live smoke test (human item 1), or by recording an explicit CONTEXT decision on alert loss."
    evidence_status: "none provided"
  - finding: "WR-01 (review, carried forward as a warning from the prior verification): the guard does not type-check the display fields stopName, stopCode, routeId, routeName, routeShortName, directionId or headsign, or data.agencyKey. An entry missing stopName is served with no 'name' key."
    category: other
    reason: "The verifier reproduced it: HTTP 200, stop 561 served with no name key. Nothing is fabricated, because the key is absent rather than invented, so the fabrication prohibition holds. The locked D-18 scope of 'malformed' is stopId, distanceToStop, destinations and predictions. This is contract drift under upstream drift, not a goal failure. Resolve it with typeof checks on those fields (D-18-compatible)."
    evidence_status: "reproduced; judged outside the SC5/D-18 malformed scope"
human_verification:

  - test: "Live smoke test with a real DASH_API_KEY: bun run dev-server, then curl -s 'http://localhost:${PORT:-3000}/api/v1/predictions/nearby?lat=38.8048&lng=-77.0469&radius=0.25&number=3'. Watch the server log while it runs."
    expected: "200. Stops come back nearest-first with stop 548 (King St + N Washington St) at or near the top, every distance under 0.25, routes grouped per stop, and an alerts array on every stop. No 'Dropping malformed nearby prediction entry' warn appears for normal live data (a warn would mean live predictions omit a field the 11-03 guard now requires, such as vehicleId). '?lat=&lng=-77.0469' returns 400, and radius=5 returns 400."
    why_human: "Needs live DASH/Swiftly credentials and data. Every automated test stubs axios.get with the captured fixture."
  - test: "Stop-ID-space cross-check (SC1 remainder): with the dev server running, confirm the stop ids from /predictions/nearby (e.g. '548', '561') appear as BusStop.id values in GET /api/v1/routes/all (or /routes/30) stops. While any stop-scoped alert is active, confirm the alert appears on the matching nearby stop."
    expected: "Nearby stopIds are the same strings as BusStop.id and as the GTFS-RT informedStopIds that ServiceAlertRepository matches on, so NEAR-06 alert embedding works on live data."
    why_human: "D-04 asserts the ID-space match by inference: PredictionService already forwards BusStop.id as Swiftly's stop= param. No live nearby stopId was cross-checked against the loaded BusStop.id set or a live alert."
  - test: "Client disconnect mid-flight (backstop truth): send a nearby request and abort the client before the upstream call returns (use a slow or blackholed DASH_API_BASE_URL). Watch the server logs."
    expected: "No unhandled promise rejection, no retry, no lingering state. The handler's res.json on the closed socket is a no-op."
    why_human: "The plan marks this truth verification: backstop. No test simulates an abort, so presence and wiring cannot qualify it (insufficient_spec). Note that the shared axios instance has no timeout (review WR-02), so a truly blackholed upstream keeps the server-side request pending until the socket errors."
---

# Phase 11: Nearby Stop Predictions Verification Report

**Phase Goal:** A rider can send their location to `GET /api/v1/predictions/nearby` and get live arrival predictions for every stop around them (nearest-first, with distance and active service alerts) from a single live call to DASH/Swiftly `real-time/{agency}/predictions-near-location`.
**Verified:** 2026-09-24T16:31:07Z
**Status:** human_needed
**Re-verification:** Yes, after gap-closure plan 11-03 (commits d88d7ad, 95b225d, 3e5b411, dddfd1c)

## Goal Achievement

Both prior gaps are closed. `isValidNearbyEntry` (`NearbyPredictionService.ts:41-60`) now requires `destination.predictions.every(isValidPrediction)`. `isValidPrediction` (`:26-35`) requires a non-null object with finite-number `min`/`sec`/`time` and string `tripId`/`vehicleId`, which are exactly the five fields `predictionMapping.ts:9-15` dereferences. So no element that reaches `mapToDestinations` can throw or map to an incomplete prediction.

The verifier re-ran both original repros through the real route (supertest, only `axios.get` stubbed), plus 11 more adversarial shapes. All returned 200 with the valid stops kept and zero incomplete predictions. Nothing previously passing regressed: all untouched files are byte-identical to 81038c9 and b33dc28, the test files only gained lines, and the full suite passes.

The status is `human_needed` rather than `passed` only because of the two items that were already routed to a human (the SC1 live stop-ID match and the backstop disconnect truth) plus the live smoke test. None of them can be closed without live credentials or an abort harness.

### Observable Truths (ROADMAP success criteria and plan truths)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: the live `predictions-near-location` payload shape is confirmed before the Dash* types were locked; the fixtures mirror it; the stop-ID space matches `BusStop.id` | ? UNCERTAIN (unchanged) | Shape: confirmed (11-CONTEXT D-01/D-02 live sample; `DashNearbyPredictionData extends DashPredictionData { distanceToStop }`; fixtures reproduce 548/548/561/949 with `blockId`). ID space: inferred from D-04, not observed. Human item 2. |
| 2 | SC2: `generatedAt` plus nearest-first stops with id/name/code, `distance` in miles, `RoutePrediction`/`Destination` routes, `ServiceAlertSummary[]` alerts, from exactly one uncached upstream call | ✓ VERIFIED (regression check) | `NearbyPredictionService.ts:140-177` differs from the prior report only in line numbers. `groupByStop(filterValidEntries(...))` at `:174`. E2E (a)/(b) and the no-cache unit test pass in the full run (520/520). |
| 3 | SC3: `radius` (default 0.5, capped at 1) goes upstream as `meters`; `number` is forwarded; omitting both works | ✓ VERIFIED (regression check) | `toMeters`/`buildDashApiUrl` at `:80-94` are unchanged. Controller is byte-identical to 81038c9. The E2E meters/number cases pass. |
| 4 | SC4: bad lat/lng/radius/number return 400 with no upstream call | ✓ VERIFIED (regression check) | `NearbyPredictionController.ts` and its 49-test suite are byte-identical to 81038c9 and pass. |
| 5 | SC5: upstream `success:false`, network error or malformed body returns 502; a single malformed stop entry is dropped and the remaining stops are returned | ✓ VERIFIED (gap closed) | The 502 half is unchanged (`parseDashResponse` `:112-128`, fetch wrapper `:96-110`). The drop half: the guard now validates every prediction element. New E2E `keeps the valid stops and serves no incomplete prediction when a prediction element is 'null'` / `'a string'` passes when run by name. Independent verifier repro: `predictions:[null]` gives **200**, stops `["548","949"]`, stop 561 dropped, no `error` in the body. Previously this returned 500 with a TypeError. |
| 6 | Existing `/stops/nearby` and `/predictions` are unchanged; no SSE; no recents on the nearby path | ✓ VERIFIED (regression check) | `git diff --quiet b33dc28 HEAD` passes on StopController, PredictionController, StopService, PredictionStreamService, VehicleService, StopController.test, stopRoutes.test and PredictionService.test. `git diff --quiet 81038c9 HEAD` passes on predictionMapping(.test), PredictionService(.test), NearbyPredictionController(.test), predictionRoutes.ts, Prediction.ts and package.json. |
| 7 | Backstop: a client disconnect mid-flight leaves no state and no unhandled rejection | ? UNCERTAIN (insufficient_spec, unchanged) | `verification: backstop`. The only await is still inside the try/catch, and the service is stateless, but no abort test exists. Human item 3. |

**Score:** 5/7 truths verified (0 present-but-behavior-unverified; 2 uncertain and routed to human; 0 failed)

#### 11-03 plan truths (gap-closure detail, all merged under SC5 and the prohibition)

| # | 11-03 truth | Status | Evidence |
|---|-------------|--------|----------|
| a | `[null]` element on an extra stop-561 entry returns 200 with stops `['548','561','949']` | ✓ VERIFIED | Named E2E `... element is 'null'` passes |
| b | Same with `'x'`; stop 561 routes are exactly `['30']` | ✓ VERIFIED | Named E2E `... element is 'a string'` passes (it asserts route list `["30"]`) |
| c | No `Cannot read properties` text in the body | ✓ VERIFIED | Asserted in both E2E rows; the verifier repro shows an empty `error` field on every case |
| d | null / scalar / `{}` / non-finite min, sec or time / non-string tripId or vehicleId drops the entry with exactly one warn | ✓ VERIFIED | 10 new `it.each` rows, each passing and asserting `mockLoggerWarn` called once. The verifier additionally confirmed that `Infinity` min, numeric vehicleId and an array element are dropped |
| e | One bad element invalidates the whole entry | ✓ VERIFIED | Rows `a valid prediction followed by a null…` and `an empty-object element in a second d…` pass |
| f | Every served prediction has exactly min/sec/time/tripId/vehicleId with correct types | ✓ VERIFIED | Unit `never serves a prediction missing min, sec, time, tripId or vehicleId ...` passes; the E2E key-set loop passes |
| g | Live elements with `blockId` still pass and blockId is stripped; `predictions: []` is still served | ✓ VERIFIED | `isValidPrediction` does not check `blockId`, and `every` over `[]` is true. Pre-existing E2E (a) (blockId absent, stop 949 empty destination) passes unedited |
| h | Nothing outside the nearby service changes; test files only gain lines | ✓ VERIFIED | `git diff --numstat 81038c9 HEAD -- src/` shows 47/0 and 109/0 for the tests and 27/3 for NearbyPredictionService.ts only. The byte-identity checks listed under SC6 pass |

### Prohibitions (all `verification: test`)

| Prohibition | Disposition | Evidence |
|-------------|-------------|----------|
| MUST NOT record rider coordinates (logs or persistence) | ✓ enforced (unchanged) | The info log at `:100` records only `meters`. The warn at `:134` records only stopId/routeShortName. The unit privacy test passes. |
| MUST NOT serve cached predictions as live | ✓ enforced (unchanged) | The two-calls/two-`axios.get` unit test passes. `generatedAt` is stamped per call (`:171`). |
| MUST NOT fabricate or default arrival data for malformed entries | ✓ **enforced (gap closed)** | Wired test enforcement: the unit `never serves a prediction missing ...` test (injects `{}`, `"x"` and a missing vehicleId and asserts the key set and types of every served prediction) and the E2E key-set loop both pass. Verifier repro: `predictions:["x"]` now gives 200 with stop 561 dropped and `badPreds=0`, where it previously served `[{}]`. The only related residual is WR-01: a missing `stopName` produces an **absent** `name` key, not a synthetic one, so no value is fabricated. It is recorded as an advisory. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/server/api/services/NearbyPredictionService.ts` | Per-element validation (`isFiniteNumber`, `isValidPrediction`), `predictions.every(isValidPrediction)` | ✓ VERIFIED | Present at `:20-35` and `:57`. Wired: `filterValidEntries` → `groupByStop` at `:174`. The file is 180 lines of substantive code. |
| `src/server/api/services/NearbyPredictionService.test.ts` | Malformed-element rows plus the no-fabrication test | ✓ VERIFIED | Contains `never serves a prediction missing min, sec, time, tripId or vehicleId`. 10 new rows. It uses the `makeDashPrediction` and `makeEntryWithPredictions` factories, following the project's `makeX` convention. |
| `src/server/api/routes/predictionRoutes.test.ts` | Route E2E for both repros | ✓ VERIFIED | Contains `serves no incomplete prediction when a prediction element is`. It goes through the real controller and service, with only `axios.get` spied. |
| Prior artifacts (Prediction.ts, predictionMapping.ts, NearbyPredictionController.ts, predictionRoutes.ts, controller tests) | Unchanged | ✓ VERIFIED | Byte-identical to 81038c9. `predictionMapping.ts` is no longer a crash site because every input to it is now validated. |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `isValidNearbyEntry` | `isValidPrediction` | `destination.predictions.every(isValidPrediction)` (`:57`) | ✓ WIRED |
| NearbyPredictionService.ts | predictionMapping.ts | `groupByStop(filterValidEntries(predictionsData))` (`:174`), then `mapToRoutePrediction(entry)` (`:156`). Only validated entries reach the mapper | ✓ WIRED |
| predictionRoutes.test.ts | NearbyPredictionService.ts | supertest through the real controller and service, only `axios.get` spied | ✓ WIRED |
| predictionRoutes.ts | NearbyPredictionService.ts | `createNearbyPredictionService(ServiceAlertRepository.getInstance())` (unchanged) | ✓ WIRED |
| NearbyPredictionService.ts | ServiceAlertRepository | `getActiveAlertsForStop(entry.stopId)` once per new stop (`:152`) | ✓ WIRED |
| NearbyPredictionController.ts | NearbyPredictionService.ts | `await service.getNearbyPredictions(...)` in try/catch (unchanged) | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| Nearby response `data.stops` | `predictionsData` | `axios.get('/real-time/{agency}/predictions-near-location?lat&lon&meters[&number]')` per request, then `filterValidEntries` | Yes (live upstream, uncached, now fully validated per element) | ✓ FLOWING |
| `stops[].alerts` | `getActiveAlertsForStop(stopId)` | ServiceAlertRepository singleton | Yes | ✓ FLOWING (the live ID-space match is human item 2) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite and coverage (run once) | `bun run test:coverage` | 34 files / 520 tests passed (507 before plus 13 new); 98.29% statements, 93.68% branches | ✓ PASS |
| Named gap-closure tests | `bunx vitest --run -t "never serves a prediction missing\|serves no incomplete prediction when a prediction element\|drops an entry with"` on the 2 files | 24 passed (21 malformed rows, the no-fabrication test, 2 E2E rows) | ✓ PASS |
| Typecheck | `bunx tsc --noEmit -p tsconfig.json` | exit 0 | ✓ PASS |
| Lint on the touched files | `bunx biome check` (3 files) | "No fixes applied". One pre-existing `useFilenamingConvention` warning on the PascalCase test filename | ✓ PASS |
| Byte identity of untouched code | `git diff --quiet 81038c9 HEAD -- <14 paths>` and `git diff --quiet b33dc28 HEAD -- <8 paths>` | both exit 0 | ✓ PASS |
| Original repro: null element | throwaway supertest (deleted afterwards) | 200, stops `["548","949"]`, 561 dropped, `badPreds=0` | ✓ PASS (was ✗) |
| Original repro: string element | same | 200, stops `["548","949"]`, `badPreds=0` | ✓ PASS (was ✗) |
| Extra shapes: `destinations:[null]`, `["x"]`, `"x"`, `predictions:{}`, `[[]]` element, `Infinity` min, numeric vehicleId, distance -1 or "58", stopId "" | same | all 200, bad entry dropped, `badPreds=0` | ✓ PASS |
| Missing `stopName` (WR-01 probe) | same | 200, stop 561 served with routes `["31"]` and no `name` key | ℹ️ Advisory (not fabrication; outside the D-18 malformed scope) |

The throwaway file `src/server/api/routes/zzVerifierThrowaway.test.ts` was deleted after the run. `git status` shows only the pre-existing untracked `.planning/milestone.lock`.

### Probe Execution

Step 7c: SKIPPED. The phase declares no probes, and `scripts/*/tests/probe-*.sh` does not exist.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| NEAR-01 | 11-01 | Endpoint backed by one predictions-near-location call | ✓ SATISFIED | E2E (a); one `axios.get` |
| NEAR-02 | 11-01, 11-02 | Optional radius (miles, default 0.5, capped) → meters | ✓ SATISFIED | E2E meters=805/403/1610; radius=1.5 gives 400 |
| NEAR-03 | 11-01, 11-02 | Optional `number` forwarded | ✓ SATISFIED | E2E number=3/10/5; omitted by default |
| NEAR-04 | 11-01 | id/name/code/distance (miles), nearest-first | ✓ SATISFIED | E2E (a) plus the ordering units. (WR-01 advisory: `name` goes missing only when upstream omits it) |
| NEAR-05 | 11-01 | Route → destination grouping | ✓ SATISFIED | The shared mapping; 11-03 re-asserts the adjacency edge (stop 561 routes `["30"]`) |
| NEAR-06 | 11-01 | Per-stop ServiceAlertSummary[] | ✓ SATISFIED (the live ID match is human item 2) | E2E (b) with the real singleton |
| NEAR-07 | 11-01 | Top-level `generatedAt` ISO | ✓ SATISFIED | E2E (a); unit test |
| NEAR-08 | 11-01, 11-02 | 400 on bad lat/lng/radius/number | ✓ SATISFIED | The 49-case controller matrix (unchanged, passing) |
| NEAR-09 | 11-01, 11-03 | 502 via UpstreamApiError; malformed entries dropped, not failing the request | ✓ SATISFIED (was BLOCKED) | The 502 paths are unchanged and passing. The per-element guard, 10 new rows, the no-fabrication test, 2 E2E rows and the verifier repro all pass |

All 9 IDs are claimed by plan frontmatter: 11-01 claims NEAR-01..09, 11-02 claims NEAR-02/03/08 and 11-03 claims NEAR-09. All 9 map to Phase 11 in REQUIREMENTS.md, and no requirement is orphaned.

Bookkeeping note for the orchestrator: REQUIREMENTS.md still shows NEAR-01..08 as `[ ]` and "Gaps Found" in its traceability table, and NEAR-09 as `[x]` Complete. The first was reverted in 4bc81cd after the prior gaps_found result. That state no longer matches this verification. Update it once the human items are resolved.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| NearbyPredictionService.ts | 41-60 | Type predicate `entry is DashNearbyPredictionData` still does not check the display fields (stopName, stopCode, route*, directionId, headsign) (review WR-01) | ⚠️ Warning (advisory) | An upstream field omission or type drift passes through as a missing or wrong-typed key. No fabrication and no crash (verifier probe) |
| NearbyPredictionService.ts | 127 | `data.agencyKey as string` unchecked cast (WR-01) | ⚠️ Warning | `agencyKey` silently disappears if upstream omits it |
| NearbyPredictionService.ts | 102 | No upstream timeout on the shared axios instance (review WR-02; accepted T-11-06) | ⚠️ Warning (unchanged) | A stalled upstream hangs instead of returning 502 |
| NearbyPredictionController.ts | 44-48 | 500 path echoes the raw `error.message` (prior WR-02; deferred in 11-03 as T-11-16 with a follow-up quick task) | ⚠️ Warning (unchanged) | No known input reaches this branch after 11-03, and the verifier's 13 probes all returned 200 |
| NearbyPredictionService.ts | 49-50 | Duplicates `isFiniteNumber` inline (IN-01) | ℹ️ Info | Two copies of the rule can drift apart |
| NearbyPredictionService.test.ts | 526-541 | "without sec/vehicleId" rows set `undefined` instead of omitting the key; no `destinations:[null]` or `Infinity` row (IN-03) | ℹ️ Info | The verifier probe covered those shapes, and all were dropped correctly |
| Phase-modified files | n/a | TBD/FIXME/XXX/TODO/HACK | none found | n/a |

### Advisory (New Scope, Unevidenced)

| # | Finding | Category | Why Advisory |
|---|---------|----------|--------------|
| 1 | WR-03: the whole-entry drop can remove a stop and its local alerts; a live prediction missing `vehicleId` would drop its whole entry | other | New scope from the 11-03 review. It matches SC5's wording and the declared `DashPrediction.vehicleId: string` contract. No evidence that live data omits the field. It is folded into human item 1 (watch the warn log) |
| 2 | WR-01: display fields are not type-checked; a missing `stopName` is served without a `name` key | other | Carried forward as a warning, and reproduced. The value is absent, not fabricated, and falls outside the locked D-18 definition of "malformed". Not blocking |

### Code Review Cross-Check (11-REVIEW.md, run 2026-09-24T16:27:56Z)

- **Prior CR-01: RESOLVED.** The review and the verifier independently confirm it. The verifier also closed the second symptom (scalar element → `{}` prediction), which the first review had missed.
- The current WR-01 to WR-03 and IN-01 to IN-04 are confirmed present. None of them breaks a roadmap success criterion or a declared prohibition, so all are recorded as warnings, info or advisory.

### Human Verification Required

These are the same three items as before. Item 1 now also asks the tester to watch for drop warns.

#### 1. Live smoke test

**Test:** Run `bun run dev-server` with a real `DASH_API_KEY`, then `curl -s "http://localhost:${PORT:-3000}/api/v1/predictions/nearby?lat=38.8048&lng=-77.0469&radius=0.25&number=3"`, and watch the server log.
**Expected:** 200, nearest-first, stop 548 at or near the top, distances under 0.25, and an alerts array on every stop. No "Dropping malformed nearby prediction entry" warn for normal live data. `lat=` returns 400, and `radius=5` returns 400.
**Why human:** Needs live credentials. Every automated test stubs axios. Only live data can show whether real predictions always carry `tripId`/`vehicleId`.

#### 2. Stop-ID-space cross-check (remainder of SC1)

**Test:** Confirm the nearby stop ids appear as `BusStop.id` in `/api/v1/routes/*` stops. While a stop-scoped alert is active, confirm it shows on the matching nearby stop.
**Expected:** The string IDs match, and alerts embed on live data.
**Why human:** D-04 is an inference and has not been observed on live data.

#### 3. Client disconnect mid-flight (backstop)

**Test:** Abort a nearby request while the upstream call is pending.
**Expected:** No unhandled rejection, no retry, no state left behind.
**Why human:** Backstop truth with no automated abort test.

### Gaps Summary

There are no gaps. Plan 11-03 closed the single root cause behind both prior gaps (CR-01). `isValidNearbyEntry` now validates every prediction element against exactly the fields the shared mapper copies, and the whole entry is dropped with one warn if any element fails:

- SC5 / NEAR-09 now holds. A malformed element no longer turns the request into a 500. The entry is dropped, and the remaining stops return 200.
- The test-tier fabrication prohibition now has wired, passing enforcement. No incomplete or empty prediction is served.

The gap-closure change is confined to `NearbyPredictionService.ts` plus test additions. Everything else is byte-identical, and the full suite passes (520/520, coverage above 80%).

The phase goal is achieved in code. It is not marked `passed` because three items need live data or a manual abort test: the live smoke test, the SC1 stop-ID-space match, and the client-disconnect backstop truth. The remaining review warnings (WR-01 display-field checks, WR-02 timeout, deferred 500-message echo, WR-03 alert-loss policy) are non-blocking follow-ups.

---

_Verified: 2026-09-24T16:31:07Z_
_Verifier: Claude (gsd-verifier)_
