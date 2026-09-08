---
phase: 06-alerts-surfaced-on-routes-stops-predictions
verified: 2026-09-04T21:46:52Z
status: passed
score: 16/18 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:

  - test: "Under real concurrent load, trigger ServiceAlertPollService.applyAlerts() (a 5-minute-poll swap of the alerts Map) at the same moment a request is mid-flight through BusRouteService.getAgencyRoutes()/getAgencyRoute() (which calls ServiceAlertRepository.getActiveAlertsForRoute for each route in the response)."
    expected: "The in-flight request's route-alerts lookups all read from a single consistent Map snapshot — either entirely pre-swap or entirely post-swap data, never a mix of both — for every route in the same response."
    why_human: "ServiceAlertRepository.applyAlerts() does 'this.alerts = staging' as a single reference reassignment (atomic in JS's synchronous execution model), but this must_have is explicitly tagged 'verification: backstop' in 06-01-PLAN.md's frontmatter. No test in ServiceAlertRepository.test.ts or BusRouteService.test.ts exercises applyAlerts() concurrently with a route-alerts read — presence of the atomic-swap code pattern is necessary but per the backstop-verification rule is not sufficient without an explicit held-out/property-based test or directly observed runtime behavior."
  - test: "Same as above, but for StopService.getStopsForRoute()/getNearbyStops() (which call ServiceAlertRepository.getActiveAlertsForStop per stop) racing against a concurrent ServiceAlertPollService.applyAlerts() swap."
    expected: "The in-flight request's stop-alerts lookups all read from a single consistent Map snapshot for every stop in the same response — no torn/partial read."
    why_human: "Identical reasoning to the route-lookup item above; this is the stop-side instance of the same 06-02-PLAN.md must_have, also tagged 'verification: backstop', also with no concurrency-exercising test in the suite."
---

# Phase 6: Alerts Surfaced on Routes, Stops & Predictions Verification Report

**Phase Goal:** Riders (via route and stop responses) can see active service alerts affecting what they're viewing, without a separate alerts endpoint or any SSE stream changes.
**Verified:** 2026-09-04T21:46:52Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Merged from ROADMAP.md Phase 6 Success Criteria + `must_haves.truths` in both `06-01-PLAN.md` and `06-02-PLAN.md` (roadmap SCs are the higher-level restatement; the granular plan truths below are what were actually tested against the codebase).

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `GET /api/v1/routes/all`: each route includes an `alerts` field | ✓ VERIFIED | `BusRouteService.ts` `attachAlerts()` called by `getAgencyRoutes()`; `busRoutes.ts` wires it to the live route; test "returns all routes from the repository" asserts `alerts: []` present on every route |
| 2 | `GET /api/v1/routes/:shortName`: response includes an `alerts` field | ✓ VERIFIED | `getAgencyRoute()` calls `attachAlerts(route)`; test "returns the route matching the given short name" asserts `{ ...route, alerts: [] }` |
| 3 | Route's `alerts` array contains trimmed `ServiceAlertSummary` for every active alert whose `informedRouteIds` includes the route's `id` (D-03) | ✓ VERIFIED | `ServiceAlertRepository.getActiveAlertsForRoute` filters by `alert.informedRouteIds.includes(routeId)`; `BusRouteService.test.ts` "calls serviceAlertRepository.getActiveAlertsForRoute with each route's id" and "includes the mapped alert summaries verbatim" |
| 4 | Route with zero matching alerts has `alerts: []` — never omitted/null/undefined (D-02) | ✓ VERIFIED | Default mock returns `[]`; `attachAlerts` always assigns the mapped array; multiple tests assert `alerts: []` |
| 5 | Embedded alert summary never includes `url`, `informedRouteIds`, or `informedStopIds` (D-01) | ✓ VERIFIED | `mapToServiceAlertSummary` builds an explicit 6-field object; `serviceAlertMapping.test.ts` "never includes url, informedRouteIds, or informedStopIds even when populated on the input" uses `.not.toHaveProperty` against inputs that do populate those fields |
| 6 | Alert with both `informedRouteIds`/`informedStopIds` empty (agency-wide) never returned by `getActiveAlertsForRoute` (D-04) | ✓ VERIFIED | Filter predicate structurally excludes it (empty array `.includes()` is always false); `ServiceAlertRepository.test.ts` "excludes an agency-wide alert ... for every routeId" |
| 7 | Alerts preserve `getActiveAlerts()`'s stable insertion order — embedding never re-sorts | ✓ VERIFIED | `getActiveAlertsForRoute`/`getActiveAlertsForStop` are pure `.filter()` calls (order-preserving); `ServiceAlertRepository.test.ts` "returns multiple matching alerts in the same stable order as getActiveAlerts()" (both route and stop variants) |
| 8 | Route matched by 2+ active alerts includes each as a separate entry — no merging/dedup | ✓ VERIFIED | `BusRouteService.test.ts` "preserves order and includes each of 2+ matching alerts as a separate entry (no merging)" |
| 9 | Concurrent `ServiceAlertPollService.applyAlerts()` swaps never produce a torn/partial read during a **route**-alerts lookup (`verification: backstop`) | ? UNCERTAIN | Code shows a single-reference-reassignment atomic swap (`this.alerts = staging`), but no held-out/property-based/concurrency test exercises this; per backstop-verification rule, presence alone is insufficient — routed to human verification |
| 10 | `GET /api/v1/routes/:shortName/stops`: every stop in every direction includes an `alerts` field | ✓ VERIFIED | `StopService.getStopsForRoute` maps `direction.stops` through `attachStopAlerts`; `StopDiscovery.ts` `RouteDirectionStops.stops: StopWithAlerts[]`; multiple `StopService.test.ts` assertions |
| 11 | `GET /api/v1/stops/nearby`: every returned stop includes an `alerts` field | ✓ VERIFIED | `getNearbyStops`'s `.map()` computes `alerts` before filter/sort/slice; `NearbyStop.alerts: ServiceAlertSummary[]` field in `StopDiscovery.ts`; test "defaults to radius 0.5 miles ..." asserts `alerts: []` present |
| 12 | Stop's `alerts` array contains trimmed summary for every active alert whose `informedStopIds` includes the stop's `id` (D-03) | ✓ VERIFIED | `getActiveAlertsForStop` filters by `informedStopIds.includes(stopId)`; `StopService.test.ts` "embeds the mapped alert summaries verbatim ..." (both `getStopsForRoute` and `getNearbyStops` variants) |
| 13 | Stop with zero matching alerts has `alerts: []` — never omitted (D-02) | ✓ VERIFIED | Default mock `[]`; tests "returns alerts: [] for a stop with no matching active alerts" |
| 14 | Agency-wide alert never returned by `getActiveAlertsForStop`, never appears on any stop (D-04) | ✓ VERIFIED | `ServiceAlertRepository.test.ts` "excludes an agency-wide alert (empty informedRouteIds and informedStopIds) for every stopId" |
| 15 | Distance-ascending sort order in `/stops/nearby` unaffected by alert embedding | ✓ VERIFIED | `alerts` computed inside the `.map()` before `.filter()/.sort()/.slice()`, never used as sort key; `StopService.test.ts` "preserves distance-ascending sort order when alerts differ per stop" explicitly proves this with differing per-stop alert data |
| 16 | Stop present in multiple directions of the same route gets independently-computed `alerts` per direction — no cross-direction merging | ✓ VERIFIED | `attachStopAlerts` invoked once per stop occurrence via `.map()`, no caching by stop id; `StopService.test.ts` "calls getActiveAlertsForStop once per stop occurrence — twice for a stop shared across 2 directions" |
| 17 | Two nearby stops informed by the same alert each independently include it — never merged/deduped | ✓ VERIFIED | `getNearbyStops`'s per-element `.map()` has no grouping/dedup-by-alert logic; each stop's `alerts` is computed independently via its own `getActiveAlertsForStop(stop.id)` call — structurally guaranteed by the implementation (no shared-state accumulator) |
| 18 | Concurrent `ServiceAlertPollService.applyAlerts()` swaps never produce a torn/partial read during a **stop**-alerts lookup (`verification: backstop`) | ? UNCERTAIN | Same reasoning as #9, stop-side instance; no concurrency-exercising test — routed to human verification |

**Score:** 16/18 truths verified (2 uncertain — both backstop-tagged concurrency invariants, routed to human verification; not counted as failed since the code is present, wired, and structurally sound, just unproven by an explicit test)

### Roadmap Success Criteria Cross-Check

| # | Success Criterion | Status | Covered By |
|---|--------------------|--------|-----------|
| 1 | `GET /routes/all` and `GET /routes/:shortName` include each route's currently-active alerts | ✓ VERIFIED | Truths #1–#8 |
| 2 | `GET /routes/:shortName/stops` and `GET /stops/nearby` include each stop's currently-active alerts | ✓ VERIFIED | Truths #10–#17 |
| 3 | Routes/stops with no active alerts return the same shape (empty `alerts: []`), no new endpoint, no SSE changes | ✓ VERIFIED | Truths #4, #13; prohibitions table below (no new route, no predictions/SSE diff) |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/server/api/models/ServiceAlertSummary.ts` | `ServiceAlertSummary`, `RouteWithAlerts`, `StopWithAlerts` types | ✓ VERIFIED | All three types present exactly as specified; `ServiceAlertSummary` omits `url`/`informedRouteIds`/`informedStopIds` |
| `src/server/api/services/serviceAlertMapping.ts` | `mapToServiceAlertSummary(ies)` pure mapping functions | ✓ VERIFIED | Both functions present, pure, order-preserving, tested |
| `src/server/api/repositories/ServiceAlertRepository.ts` | `getActiveAlertsForRoute`, `getActiveAlertsForStop` | ✓ VERIFIED | Both methods present, built on `getActiveAlerts()`, fully tested (12 new tests across both describe blocks) |
| `src/server/api/services/BusRouteService.ts` | 2-arg factory DI, `RouteWithAlerts` return types | ✓ VERIFIED | `createBusRouteService(repository, serviceAlertRepository)`; no direct `ServiceAlertRepository.getInstance()` import |
| `src/server/api/services/StopService.ts` | 2-arg factory DI, alert embedding on both methods | ✓ VERIFIED | `createStopService(repository, serviceAlertRepository)`; no direct singleton import |
| `src/server/api/models/StopDiscovery.ts` | `RouteDirectionStops.stops: StopWithAlerts[]`, `NearbyStop.alerts` | ✓ VERIFIED | Both type changes present |
| `src/server/api/routes/busRoutes.ts` | Wires `ServiceAlertRepository.getInstance()` into both `createBusRouteService` and `createStopService` | ✓ VERIFIED | Both call sites pass 2 args |
| `src/server/api/routes/stopRoutes.ts` | Wires `ServiceAlertRepository.getInstance()` into `createStopService` | ✓ VERIFIED | 2-arg call site confirmed |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `BusRouteService.getAgencyRoutes/getAgencyRoute` | `ServiceAlertRepository.getActiveAlertsForRoute` | `attachAlerts` → `mapToServiceAlertSummaries` → `RouteWithAlerts.alerts` | ✓ WIRED | Read in `BusRouteService.ts:19-24`; controller passes result straight to `res.json()` with no field stripping |
| `busRoutes.ts` | `createBusRouteService` | 2nd constructor arg | ✓ WIRED | `ServiceAlertRepository.getInstance()` passed at module load |
| `StopService.getStopsForRoute/getNearbyStops` | `ServiceAlertRepository.getActiveAlertsForStop` | `attachStopAlerts` / inline map → `mapToServiceAlertSummaries` → `StopWithAlerts.alerts`/`NearbyStop.alerts` | ✓ WIRED | Read in `StopService.ts:22-24, 55` |
| `busRoutes.ts` (stopService) / `stopRoutes.ts` | `createStopService` | 2nd constructor arg | ✓ WIRED | Both call sites pass `ServiceAlertRepository.getInstance()`; regression tests assert `mock.calls[...]).toHaveLength(2)` in both `busRoutes.test.ts` and `stopRoutes.test.ts` |
| Controllers (`BusRouteController`, `StopController`) | HTTP response | `res.json(result)` | ✓ WIRED | No mapping/stripping layer between service result and response body — `alerts` field reaches the client unchanged |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| Route response `alerts` | `route.alerts` | `ServiceAlertRepository` in-memory Map, populated by `ServiceAlertPollService`'s 5-min poll (Phase 5) | Yes — live query, not static | ✓ FLOWING |
| Stop response `alerts` (`/routes/:shortName/stops`) | `stop.alerts` | Same repository, `getActiveAlertsForStop` | Yes | ✓ FLOWING |
| Stop response `alerts` (`/stops/nearby`) | `stop.alerts` | Same repository, `getActiveAlertsForStop` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite passes | `bun run test` | 283/283 passed, 21 test files, 0 type errors | ✓ PASS |
| Production build compiles clean | `bun run build` | `rm -rf dist && tsc` — no errors | ✓ PASS |
| Named describe blocks exist for both new repository methods | `grep -n "describe(\"getActiveAlertsFor(Route\|Stop)\""` | Both blocks present in `ServiceAlertRepository.test.ts` | ✓ PASS |
| D-01 trimmed-shape guarantee | inspected `serviceAlertMapping.test.ts` "never includes url, informedRouteIds, or informedStopIds ..." | Uses `.not.toHaveProperty` against a populated input | ✓ PASS |
| No new alerts endpoint introduced | `grep -rn "alerts" src/server/api/routes/` (non-test) | No matches — only `busRoutes.ts`/`stopRoutes.ts` DI wiring reference `ServiceAlertRepository`, no new route path | ✓ PASS |
| Predictions/SSE files untouched by this phase | `git diff 50d2988..HEAD --stat -- <prediction files>` | Empty diff | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` convention or explicit probe declarations found in this phase's PLAN/SUMMARY files. Skipped — no probes applicable.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| ALRT-05 | 06-01 | `GET /api/v1/routes/all` includes active alerts for each route | ✓ SATISFIED | Truths #1, #3–#9 |
| ALRT-06 | 06-01 | `GET /api/v1/routes/:shortName` includes active alerts for that route | ✓ SATISFIED | Truths #2–#9 |
| ALRT-07 | 06-02 | `GET /api/v1/routes/:shortName/stops` includes active alerts for each stop | ✓ SATISFIED | Truths #10, #12–#18 |
| ALRT-08 | 06-02 | `GET /api/v1/stops/nearby` includes active alerts for each returned stop | ✓ SATISFIED | Truths #11–#18 |

No orphaned requirements — REQUIREMENTS.md's Phase 6 traceability table lists exactly ALRT-05 through ALRT-08, and both plans jointly claim all four. (Note: REQUIREMENTS.md's checkboxes and traceability "Pending" label are still stale as of this verification — that's a documentation-sync task, not a code gap; it is expected to be updated in the phase's docs-evolution step after verification.)

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers found in any of this phase's 15 modified/created files | — | none |
| `src/server/api/services/BusRouteService.ts:19-24` | 19-24 | WR-01 (code review, non-blocking): `{ ...route, alerts } as RouteWithAlerts` cast — spread of a class instance loses `BusRoute` prototype methods (`getAllStops`, `getDirectionById`); type lies about runtime shape | ℹ️ Info (already surfaced in 06-REVIEW.md, no live incident — only `res.json()` consumes the value) | Documented pre-existing warning, not a new finding |
| `src/server/api/repositories/ServiceAlertRepository.ts:8,11` | 8, 11 | WR-02 (code review, non-blocking): malformed `activePeriod` bounds (`new Date(invalid)` → `NaN`) fail open (alert treated as always-active) rather than fail-safe | ℹ️ Info (already surfaced in 06-REVIEW.md; pre-existing from Phase 5's `isAlertActive`, not modified in Phase 6) | Documented pre-existing warning, not a new finding |

No blocker-level anti-patterns found. Both warnings above were already surfaced in `06-REVIEW.md` as non-blocking and are carried forward here for completeness, not re-flagged as new gaps.

### Human Verification Required

### 1. Concurrent poll swap vs. in-flight route-alerts lookup

**Test:** Trigger `ServiceAlertPollService.applyAlerts()` (the 5-minute alert-refresh swap) while a `GET /api/v1/routes/all` (or `/routes/:shortName`) request is mid-flight, iterating multiple routes and calling `ServiceAlertRepository.getActiveAlertsForRoute()` per route.
**Expected:** Every route in that single response reads from one consistent alerts snapshot (all pre-swap or all post-swap) — no route in the same response reflects a different poll cycle than another.
**Why human:** This must_have is explicitly tagged `verification: backstop` in `06-01-PLAN.md`. The code (`this.alerts = staging` as a single reference reassignment) is structurally consistent with an atomic swap under JS's synchronous execution model, but no test in the suite exercises `applyAlerts()` racing against a live route-alerts read, and per the backstop-verification rule, presence of the pattern alone does not qualify as verified.

### 2. Concurrent poll swap vs. in-flight stop-alerts lookup

**Test:** Same scenario as above, but for `GET /api/v1/routes/:shortName/stops` or `GET /api/v1/stops/nearby`, racing `ServiceAlertPollService.applyAlerts()` against `ServiceAlertRepository.getActiveAlertsForStop()` calls made per stop.
**Expected:** Every stop in the same response reads from one consistent alerts snapshot — no torn/partial read across stops in the same response.
**Why human:** Identical reasoning to item 1; this is the stop-side instance of the same must_have (tagged `verification: backstop` in `06-02-PLAN.md`), also with no concurrency-exercising test.

### Gaps Summary

No gaps. All 4 requirements (ALRT-05–08) are implemented, wired end-to-end from controller through repository, and covered by 283 passing tests plus a clean `tsc` build. The only open items are two `verification: backstop`-tagged truths about concurrent-swap safety during route/stop alert lookups — the underlying code pattern (atomic Map reference reassignment) is sound and consistent with the pattern the repository has relied on since Phase 5's `getActiveAlerts()`, but no test explicitly proves the no-torn-read invariant under concurrency, so per the verifier's backstop rule these are routed to human sign-off rather than marked verified on code inspection alone.

Two pre-existing, non-blocking code-review warnings (WR-01, WR-02 from `06-REVIEW.md`) remain unfixed but were already flagged as acceptable deferred items by the reviewer — not re-raised as new gaps here.

---

_Verified: 2026-09-04T21:46:52Z_
_Verifier: Claude (gsd-verifier)_
