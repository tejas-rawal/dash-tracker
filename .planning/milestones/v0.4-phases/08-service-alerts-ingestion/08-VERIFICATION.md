---
phase: 05-service-alerts-ingestion
verified: 2026-09-04T14:10:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 5/5 (4 fully verified, 1 present-but-behavior-unverified)
  gaps_closed:
    - "ALRT-03 field-shape correctness (headerText/descriptionText/url) — previously routed to human_verification because the live top-level/entity shape was unconfirmed and traced to an unreliable auto-generated example (G-05-2). Plan 05-06 added a temporary SERVICE-ALERTS-SHAPE-DIAG diagnostic behind a blocking human-action checkpoint, captured the real live response via a human-run boot, and rewrote DashAlertEntity/DashActivePeriod/DashInformedEntity and mapToServiceAlert()/deriveActiveWindow() against the confirmed flat/camelCase/ISO-8601 shape. fetchFromDashApi()'s guard now accepts array-rooted bodies (still rejecting null/non-object primitives). New regression test built from the literal captured live entity confirms headerText/descriptionText/url/informedRouteIds/informedStopIds/activePeriod all populate correctly. 08-UAT.md records both Test 1 (poll succeeds, no malformed-body error) and Test 2 (field-shape check) as human-confirmed pass on 2026-09-04. Independently confirmed in this pass: 23/23 ServiceAlertService tests, 11/11 ServiceAlertRepository tests (fixtures also corrected to the flat shape), 255/255 full suite, bun run build exit 0, temporary diagnostic log confirmed removed from source (grep, zero hits)."
  gaps_remaining: []
  regressions: []
---

# Phase 8: Service Alerts Ingestion Verification Report

**Phase Goal:** The server continuously fetches and maintains an up-to-date, filtered set of currently-active GTFS-RT service alerts from the DASH/Swiftly API, ready to be queried by other layers once Phase 9 wires them into responses.
**Verified:** 2026-09-04T14:10:00Z
**Status:** passed
**Re-verification:** Yes — supersedes the 2026-09-02 10:50 `08-VERIFICATION.md` (status `human_needed`, 5/5 with 1 present-but-behavior-unverified), after gap-closure plan 05-06 (gap_ids: [G-05-5]) confirmed the real live response shape via a human-run boot capture and rewrote the ingestion pipeline against it.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The server fetches GTFS-RT service alerts (detours, disruptions, stop closures) from the DASH/Swiftly service-alerts endpoint (ALRT-01). | ✓ VERIFIED | `ServiceAlertService.ts:18-21` — `buildDashApiUrl()` returns `/real-time/{agency}/gtfs-rt-alerts/v2?format=json`. `fetchFromDashApi()` handles a JSON-encoded string body fallback and now correctly reads the live API's real top-level shape (confirmed bare array, no envelope) — this was the exact defect (G-05-5) this round closed. 23/23 `ServiceAlertService.test.ts` re-run passing in this pass, including 3 new G-05-5 tests for the bare-array-rooted body (raw and JSON-string forms) and one end-to-end no-envelope mapping test. |
| 2 | Alerts refresh automatically on a dedicated ~5-minute background poll, running independently of (not blocked by, and not blocking) the existing 30-second prediction poll (ALRT-02). | ✓ VERIFIED | `ServiceAlertPollService.ts:5` — `POLL_INTERVAL_MS = 5 * 60_000`. `app.ts` — `serviceAlertPollService.start()` called synchronously, unawaited, strictly before `repository.initialize()`. Unchanged by 05-06 (not in its `files_modified`); 4/4 `ServiceAlertPollService.test.ts` re-run passing in this pass. |
| 3 | Each fetched alert is normalized into a `ServiceAlert` model capturing affected route(s)/stop(s), a description, severity/cause when provided by the feed, and an active window (start/end) (ALRT-03). | ✓ VERIFIED | **Prior gap closed.** `DashAlertEntity`/`DashActivePeriod`/`DashInformedEntity` (`ServiceAlert.ts:18-44`) rewritten flat/camelCase to match the confirmed live shape; `mapToServiceAlert()`/`deriveActiveWindow()` (`ServiceAlertService.ts:59-98`) updated accordingly. The shape was confirmed via a human-run live-boot diagnostic capture (Task 2 of 08-06-PLAN.md, a blocking human-action checkpoint), not re-guessed — breaking the G-05-2→G-05-5 pattern of shipping unverified assumptions. `ServiceAlertService.test.ts:106-139` asserts `headerText`/`descriptionText`/`url`/`informedRouteIds`/`informedStopIds`/`activePeriod` all populate correctly from a fixture built directly from the captured live entity (realistic non-placeholder values: UUID id, real street-intersection description text, real route/stop ids — not generic `"string"`/`0` placeholders like the disproven G-05-2 example). 08-UAT.md records this as human-confirmed pass (Test 2, dated 2026-09-04). |
| 4 | Querying the in-memory alert store at any point in time returns only alerts whose active window contains the current time — expired or not-yet-started alerts are filtered out server-side (ALRT-04). | ✓ VERIFIED | `ServiceAlertRepository.ts:5-16,44-46` — `isAlertActive`/`getActiveAlerts()`, unchanged since prior pass. 11/11 `ServiceAlertRepository.test.ts` re-run passing in this pass; its end-to-end fixture (`describe("end-to-end: fetch -> normalize -> filter-active -> query")`) was updated by 05-06 to the confirmed flat shape after 08-06-SUMMARY.md flagged that the old nested fixture was silently masking a regression (both its "active" and "expired" fixtures had fallen back to always-active once `mapToServiceAlert()` stopped reading `entity.alert.*`). |
| 5 (derived) | Malformed/unexpected-shaped upstream response bodies fail loud via `UpstreamApiError` rather than being silently absorbed as "zero alerts," while the newly-confirmed valid array-rooted shape is correctly accepted (not rejected) — per this phase's stated threat model (T-05-12) and 08-06-PLAN.md's explicit regression requirement that `null`/non-object primitives still reject after the guard widening. | ✓ VERIFIED | `ServiceAlertService.ts:42-44` — guard now reads `body === null || typeof body !== "object"` (the `Array.isArray(body)` rejection from the prior round is deliberately removed, since arrays are now the confirmed-valid shape). Directly inspected in this pass. Regression tests confirmed present and passing: null-body rejection (WR-01), non-object-primitive rejection (WR-01), JSON-string-that-fails-to-parse rejection — all still throw `UpstreamApiError` — alongside the new array-acceptance tests. Re-ran `bun run test -- src/server/api/services/ServiceAlertService.test.ts src/server/api/repositories/ServiceAlertRepository.test.ts src/server/api/services/ServiceAlertPollService.test.ts` directly in this verification pass: 38/38 pass. Re-ran full suite: 255/255 pass. Re-ran `bun run build`: exit 0. |

**Score:** 5/5 truths verified (all fully verified — the prior round's present-but-behavior-unverified item is now closed by confirmed live evidence, not merely presence/wiring).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/server/api/models/ServiceAlert.ts` | Domain + Dash-shaped types | ✓ VERIFIED | `DashAlertEntity`/`DashActivePeriod`/`DashInformedEntity` rewritten flat/camelCase/ISO-8601 to match the confirmed live shape; `DashAlertsApiResponse.entities` remains `entities?: DashAlertEntity[]` as the internal normalization target (array-rooted bodies are normalized into this same contract before `fetchAlerts()` reads it). Confirmed by direct read. |
| `src/server/api/services/ServiceAlertService.ts` | fetch + Dash-to-domain mapping | ✓ VERIFIED | `createServiceAlertService()` factory; guard widened to accept array-rooted bodies (still rejecting null/non-object primitives); normalizes into `{entities}` contract; `mapToServiceAlert()`/`deriveActiveWindow()` updated for the flat shape. Temporary `SERVICE-ALERTS-SHAPE-DIAG` diagnostic confirmed fully removed (`grep -rn "SERVICE-ALERTS-SHAPE-DIAG" src/` → zero hits). |
| `src/server/api/services/ServiceAlertService.test.ts` | corrected WR-01 array tests + live-shape fixture | ✓ VERIFIED | 23 tests, all passing. WR-01 array tests now assert success (resolve, not reject); new no-envelope end-to-end test; new test built from the confirmed live-captured entity. |
| `src/server/api/repositories/ServiceAlertRepository.ts` | singleton in-memory store + active-window query | ✓ VERIFIED | Unchanged since prior pass — singleton via `getInstance()`, `applyAlerts()` atomic swap, `getActiveAlerts()` inclusive-boundary filter. |
| `src/server/api/repositories/ServiceAlertRepository.test.ts` | end-to-end fixtures matching confirmed shape | ✓ VERIFIED | 11 tests, all passing. End-to-end fixture corrected to the flat/camelCase shape (`activePeriods`/`informedEntities` at top level), closing the silent-pass regression 08-06-SUMMARY.md identified. |
| `src/server/api/services/ServiceAlertPollService.ts` | boot-triggered 5-min poll driver | ✓ VERIFIED | Unchanged since prior pass — `start()` fires immediate `pollAlerts()` then `setInterval(POLL_INTERVAL_MS)`; try/catch never calls `applyAlerts()` on failure. |
| `src/server/app.ts` (modified in 05-01) | wires `ServiceAlertPollService.start()` at boot, non-blocking | ✓ VERIFIED | Unchanged since prior pass — `serviceAlertPollService.start();` precedes `repository.initialize()`, zero `await` between construction and `app.listen()`. |
| `src/server/api/models/index.ts` | exports `ServiceAlert` | ✓ VERIFIED | `export * from "./ServiceAlert";` present. |
| `src/server/api/repositories/index.ts` | exports `ServiceAlertRepository` | ✓ VERIFIED | `export * from "./ServiceAlertRepository";` present. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `app.ts` | `ServiceAlertPollService.start()` | Direct call at module top level | ✓ WIRED | `src/server/app.ts`, re-confirmed by direct read this pass. |
| `ServiceAlertPollService.pollAlerts()` | `ServiceAlertService.fetchAlerts()` | direct call | ✓ WIRED | `ServiceAlertPollService.ts:20`. |
| `ServiceAlertService.fetchAlerts()` | DASH API | `axios.get('/real-time/{agency}/gtfs-rt-alerts/v2?format=json')` | ✓ WIRED | Endpoint, string-body fallback, confirmed array-rooted shape, guard, and normalization all confirmed correct in this pass — and confirmed against the real upstream via human-run live boot (08-UAT.md). |
| `ServiceAlertPollService.pollAlerts()` | `ServiceAlertRepository.applyAlerts()` | only on fetch success | ✓ WIRED | `ServiceAlertPollService.ts:19-25` — inside `try`, not `catch`. |
| `ServiceAlertRepository.getActiveAlerts()` | repositories barrel | `export * from "./ServiceAlertRepository"` | ✓ WIRED | No Phase 9 caller yet, by design (ingestion-only phase). |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ALRT-01 | 05-01/02/03/04/05/06-PLAN.md | Server fetches GTFS-RT service alerts from DASH/Swiftly service-alerts endpoint | ✓ SATISFIED | Correct endpoint + `format=json` confirmed live; string-body/entities-field/array-root-shape bugs all closed; live boot re-verification (08-UAT.md Test 1) confirms no malformed-body error. |
| ALRT-02 | 08-01-PLAN.md | Alerts refreshed on dedicated 5-min background poll, independent of 30s prediction poll | ✓ SATISFIED | 5-min `setInterval`, zero coupling to `PredictionStreamService`, non-blocking startup. Unchanged since prior pass. |
| ALRT-03 | 05-01/08-06-PLAN.md | `ServiceAlert` model represents affected route(s)/stop(s), description, severity/cause, active window | ✓ SATISFIED | Field-shape mapping rewritten against a confirmed live capture (not an assumption); unit test built from the real captured entity confirms all fields populate; 08-UAT.md Test 2 records human-confirmed pass (2026-09-04). Previously the sole `human_needed` item — now closed. |
| ALRT-04 | 08-01-PLAN.md | Only currently-active alerts surfaced; expired/future filtered server-side | ✓ SATISFIED | `ServiceAlertRepository.getActiveAlerts()` fully tested; end-to-end fixture corrected to the confirmed shape by 05-06, closing a fixture-masked regression. |

REQUIREMENTS.md's tracking table (lines 60-63) still shows ALRT-02/03/04 as "Gaps Found" from the round-2 verification — this is a **stale documentation artifact**, not a code gap (flagged non-blocking; same finding carried forward from the prior verification, still not auto-corrected). All four IDs appear in the `requirements:` frontmatter across the phase's plans (05-01 through 05-06). No orphaned requirements — ALRT-05 through ALRT-09 correctly remain scoped to Phase 9.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full workspace test suite (single run, this pass) | `bun run test` | 20 files, 255 tests passed, 0 type errors | ✓ PASS |
| Build compiles cleanly (this pass) | `bun run build` | `rm -rf dist && tsc` exits 0 | ✓ PASS |
| Phase-scoped test files (single named run, this pass) | `bun run test -- src/server/api/services/ServiceAlertService.test.ts src/server/api/repositories/ServiceAlertRepository.test.ts src/server/api/services/ServiceAlertPollService.test.ts` | 3 files, 38 tests passed | ✓ PASS |
| Temporary G-05-5 diagnostic log fully removed | `grep -rn "SERVICE-ALERTS-SHAPE-DIAG" src/` | zero matches | ✓ PASS |
| Array-root guard now accepts (not rejects) array bodies | Direct read of `ServiceAlertService.ts:42-44` | `body === null \|\| typeof body !== "object"` (no `Array.isArray` rejection) | ✓ PASS |
| null/non-object-primitive bodies still rejected (no over-widening regression) | `grep -n "rejects with UpstreamApiError when the response body is null\|non-object value" ServiceAlertService.test.ts` | 2 matches, both still present and passing | ✓ PASS |
| Confirmed-shape field-mapping regression test present | `grep -n "matching the confirmed live shape" ServiceAlertService.test.ts` | 1 match, asserting id/cause/effect/headerText/descriptionText/url/informedRouteIds/informedStopIds/activePeriod all together | ✓ PASS |
| Live boot re-verification (human-confirmed, per 08-UAT.md) | N/A — human-run per Task 3's `<human-check>` and phase-level UAT Tests 1/2 | Both recorded pass, dated 2026-09-04 | ✓ PASS (human-confirmed artifact, cross-referenced against matching code evidence above) |

### Anti-Patterns Found

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers in any file modified by 05-06 (re-checked this pass: `ServiceAlertService.ts`, `ServiceAlertService.test.ts`, `ServiceAlert.ts`, `ServiceAlertRepository.test.ts`). No stub returns, no hardcoded-empty data flowing to output.

**Carried-forward non-blocking findings from the 2026-09-02 `08-REVIEW.md` pass — not touched by 05-06 (out of its declared scope), still open, still non-blocking:**

| File | Line | Finding | Severity | Status |
|------|------|---------|----------|--------|
| `ServiceAlertService.ts` | `deriveActiveWindow()` | No `anyOpenStarted` check symmetric to `anyOpenEnded` — a multi-`activePeriods` alert where one period lacks `start` (meaning "already active, unbounded past") can have its collapsed window's `start` incorrectly computed from another period's bounded `start`. | Warning | **Still open.** Re-confirmed present in this pass (`starts`/`ends` computed asymmetrically at `ServiceAlertService.ts:64-77`). Narrow edge case (requires >1 `activePeriods` entries with mixed start-boundedness); does not block this phase's goal. |
| `ServiceAlertService.ts` | `isValidDashAlertEntity()` | Checks `entity` is a non-null object with a string `id`, but not that nested `informedEntities`/`activePeriods` are arrays when present — a malformed nested field would throw a raw `TypeError` instead of `UpstreamApiError`. | Warning | **Still open.** Re-confirmed present in this pass (`ServiceAlertService.ts:53-55`). Still caught by `ServiceAlertPollService.pollAlerts()`'s existing try/catch (log-and-keep-stale), so it degrades to an accepted failure mode, just less diagnosable. |

**New informational finding from this pass (not a gap):**

| File | Finding | Severity | Status |
|------|---------|----------|--------|
| Live payload (per 08-06-SUMMARY.md "Issues Encountered") | The live feed includes `deletedAt`/`deletedBy` fields the current model ignores entirely; if DASH soft-deletes rather than removes alerts from the feed, a deleted-but-still-time-active alert could still surface via `getActiveAlerts()`. | Info | Explicitly out of scope for G-05-5 (response-shape parsing, not soft-delete semantics); flagged by the SUMMARY itself for a possible follow-up requirement before Phase 9 exposes alerts publicly. Not required to close this phase. |
| `.planning/REQUIREMENTS.md` traceability table | ALRT-02/03/04 still show "Gaps Found" despite this pass confirming all four requirements satisfied. | Info | Documentation-sync lag, not a code gap. Carried forward from the prior verification's same recommendation (still not corrected). |

### Prohibitions Check

| Prohibition | Status | Evidence |
|-------------|--------|----------|
| No new Express route/controller for service alerts | ✓ Holds | Re-checked this pass — `grep -rn -i "alert" src/server/api/routes/ src/server/api/controllers/` returns zero matches. |
| No derived severity/priority ranking or new cause/effect enum | ✓ Holds | Re-checked this pass — `cause`/`effect` remain untyped `string \| undefined` passthrough in `ServiceAlert.ts`. |
| The alerts poll never blocks or gates `app.listen()` | ✓ Holds | Re-confirmed by direct read of `app.ts` this pass — no `await` between `ServiceAlertPollService` construction and `app.listen()`. |
| Array-rooted body rejection widening must not accept genuinely malformed input (T-05-12) | ✓ Holds | `null` and non-object primitive bodies still throw `UpstreamApiError` — confirmed by 2 still-passing pre-existing regression tests, independently re-run in this pass. |

### Human Verification Required

None. The single item routed to human verification in the prior round (05-02) — live-payload field-shape correctness for `headerText`/`descriptionText`/`url` — is resolved: 05-06 captured the real live shape via a blocking human-action checkpoint, rewrote the model/mapping against it, added a regression test built from the literal captured entity, and `08-UAT.md` records both phase UAT tests (poll succeeds; field-shape populated) as human-confirmed pass on 2026-09-04.

**Transparency note (not a reopened gap):** 08-06-SUMMARY.md's own "Issues Encountered" section notes that at the *final* live-boot re-verification (Task 3's human-check), no alert happened to be currently active on the live feed, so field-population could not be visually re-confirmed at that exact moment. The field-shape confirmation instead rests on: (a) the genuine live entity captured earlier in the same plan via Task 2's diagnostic checkpoint (used directly to rewrite the model and build the new regression test — the entity's realistic, non-placeholder values are consistent with a genuine capture, not a guess), and (b) the human's own recorded pass verdict for UAT Test 2. This is a materially different evidentiary basis than the prior round's failure mode (an unverified, auto-generated-looking documentation example), so it is treated as sufficient closure rather than a reason to keep the phase in `human_needed`.

### Gaps Summary

No blocking gaps. This re-verification independently confirms — by direct source inspection, by re-running the phase-scoped and full test suites and the build in this pass (not by trusting SUMMARY claims alone), and by cross-referencing the human-confirmed `08-UAT.md` — that the previously-open `human_needed` item (ALRT-03 field-shape correctness) is now closed with genuine live evidence, not a re-guess. The full ingestion pipeline (fetch → normalize → filter-by-active-window → query, plus fail-loud malformed-body handling that correctly now accepts the confirmed-valid array-rooted shape while still rejecting genuinely malformed bodies) is real, substantively implemented, correctly wired, and verified end-to-end against the live DASH/Swiftly API.

Two non-blocking Warning-level robustness findings from the 2026-09-02 code review remain open (an asymmetric `anyOpenStarted` gap in `deriveActiveWindow()`, and a missing array-type check in `isValidDashAlertEntity()`) — both were out of 05-06's declared scope, both degrade to the poll service's existing try/catch rather than causing silent data corruption, and neither blocks this phase's goal achievement. They are recommended for a future hardening plan. A documentation-sync issue (`REQUIREMENTS.md`'s stale traceability table) and a scoped-out soft-delete concern (`deletedAt`/`deletedBy`) are also carried forward as informational, non-blocking items for Phase 9 planning to be aware of.

**Recommendation:** Proceed. Phase 8's goal — a continuously-fetched, correctly-normalized, filtered, in-memory set of currently-active service alerts, ready for Phase 9 to query — is achieved and verified against the real live API, not just against self-consistent test fixtures.

---

*Verified: 2026-09-04T14:10:00Z*
*Verifier: Claude (gsd-verifier)*
