---
phase: 05-service-alerts-ingestion
verified: 2026-09-02T10:30:00Z
status: gaps_found
score: 4/5 must-haves verified
behavior_unverified: 1
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 5/6
  gaps_closed:
    - "Endpoint 404 (G-05-1) — corrected to /real-time/{agency}/gtfs-rt-alerts/v2, live-boot-confirmed by human during G-05-2 diagnosis."
    - "Malformed-body / entity-vs-entities mismatch (G-05-2) — JSON.parse string-body fallback and entity->entities rename shipped in 05-03, all regression tests pass, full suite 251/251 green."
    - "Non-blocking startup ordering (previously PRESENT_BEHAVIOR_UNVERIFIED) — now corroborated by two real live-boot sessions (G-05-1 and G-05-2 diagnosis) in which the server continued running and logging poll errors without hanging; code shape (no await, start() before repository.initialize()) is unchanged and still holds."
  gaps_remaining:
    - "Array-rooted (or otherwise non-JSON-object) response body silently degrades to an empty alert list instead of throwing UpstreamApiError, contradicting 05-03-PLAN.md's own STRIDE claim — confirmed via source inspection and 05-REVIEW.md's WR-01, still unfixed and untested."
  regressions: []
gaps:
  - truth: "A response body that is neither a JSON string parsing to a non-null non-array object, nor already a non-null non-array object, causes fetchFromDashApi() to reject with UpstreamApiError — per 05-03-PLAN.md's own explicit STRIDE claim that 'a string that parses to a non-object JSON value (array-at-root, primitive, or invalid JSON) still throws UpstreamApiError exactly as before.'"
    status: failed
    reason: "The body-shape guard is `body === null || typeof body !== \"object\"`. In JavaScript `typeof [] === \"object\"`, so an array-rooted body (`response.data = []` or a string that JSON.parses to `[]`) passes the guard undetected, is cast to DashAlertsApiResponse, and fetchAlerts() then reads `.entities` on an array (always undefined), silently logging \"No service alerts found\" and resolving to [] instead of throwing. This is 05-REVIEW.md's WR-01 finding (filed against the 05-03 diff), remains unfixed as of the latest commit (b58577c), and has zero test coverage for the array-root case — only the invalid-JSON-string and null-body cases are tested."
    artifacts:
      - path: "src/server/api/services/ServiceAlertService.ts"
        issue: "Line 37-38: `body === null || typeof body !== \"object\"` does not also check `Array.isArray(body)`, so a bare-array JSON body passes as if it were a valid response object."
    missing:
      - "Add `|| Array.isArray(body)` to the guard at ServiceAlertService.ts:37 so an array-rooted body throws UpstreamApiError."
      - "Add a regression test asserting `data: []` or `data: \"[]\"` rejects with UpstreamApiError, per 05-REVIEW.md's WR-01 fix suggestion."
behavior_unverified_items:
  - truth: "ServiceAlert.headerText/descriptionText/url are correctly populated from the live DASH/Swiftly feed's actual header_text/description_text/url field shapes."
    test: "Boot the real server against the live DASH/Swiftly API while at least one active alert exists, and inspect ServiceAlertRepository's in-memory store (temporary log/debugger) for a real alert's headerText/descriptionText/url values."
    expected: "headerText/descriptionText contain the actual alert text from the feed (not undefined), and url (if present in the feed) is populated."
    why_human: "05-UAT.md's recorded `live_response_example` for this exact endpoint (captured during G-05-2 diagnosis) shows `header_text`/`description_text` as JSON ARRAYS (`[{\"translation\": [...]}]`), and `url` as a plain string (`\"string\"`) — not the single-object `{translation: [...]}` shape ServiceAlertService.ts's mapToServiceAlert() assumes (`alert.header_text?.translation?.[0]?.text`, `alert.url?.translation?.[0]?.text`). If that recorded shape is accurate, `alert.header_text.translation` and `alert.url.translation` are both `undefined` at runtime (arrays/strings have no `.translation` property), so `headerText`/`descriptionText`/`url` would silently resolve to `undefined` for every real alert — never crashing (optional chaining swallows it), so no test or log would catch this. Every existing test's fixtures (`makeDashAlertEntity`) hand-construct the single-object shape the code already assumes, so they cannot detect this by construction — the same blind spot that let G-05-1 (wrong endpoint) and G-05-2 (entity/entities mismatch, string body) both ship undetected by unit tests. Neither 05-02's nor 05-03's PLAN.md human-check for a live boot was recorded as completed in 05-UAT.md/SUMMARY.md — 05-03-SUMMARY.md explicitly defers it: 'the live-boot check is recorded here as human_judgment: true ... for the next UAT pass.' This can only be resolved by inspecting a real captured payload or re-running the live boot check with actual alert content present."
coincidental_reliance_items:
  - truth: "ServiceAlertService.fetchAlerts() correctly maps headerText/descriptionText/url."
    reason: fixture-only
    harden: "Source header_text/description_text/url fixtures for ServiceAlertService.test.ts from an independently-verified capture of the live API response (not from the same assumption the production code encodes), so a real shape mismatch would show up as a failing test rather than passing by construction."
human_verification:
  - test: "Boot the real server against the live DASH/Swiftly API while at least one active alert exists, and inspect ServiceAlertRepository's in-memory store (temporary log/debugger) for a real alert's headerText/descriptionText/url values."
    expected: "headerText/descriptionText contain the actual alert text from the feed (not undefined), and url (if present in the feed) is populated."
    why_human: "Requires an authenticated request against the live, non-mocked DASH/Swiftly API with a real active alert present, and human inspection of in-memory state — not reproducible by a unit test whose fixtures already assume the shape in question. See behavior_unverified_items above for full evidence."
---

# Phase 5: Service Alerts Ingestion Verification Report

**Phase Goal:** The server continuously fetches and maintains an up-to-date, filtered set of currently-active GTFS-RT service alerts from the DASH/Swiftly API, ready to be queried by other layers once Phase 6 wires them into responses.
**Verified:** 2026-09-02T10:30:00Z
**Status:** gaps_found
**Re-verification:** Yes — supersedes the 2026-09-01 `05-VERIFICATION.md` (status `human_needed`, 5/6), after gap-closure plans 05-02 (G-05-1: endpoint 404) and 05-03 (G-05-2: malformed body / entity-entities mismatch).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The server fetches GTFS-RT service alerts (detours, disruptions, stop closures) from the DASH/Swiftly service-alerts endpoint (ALRT-01). | ✓ VERIFIED | `ServiceAlertService.ts:16-18` — `buildDashApiUrl()` returns `/real-time/{agency}/gtfs-rt-alerts/v2`, the endpoint confirmed correct in 05-02 (closed G-05-1's live 404, human-confirmed via a real boot per `05-UAT.md`). `fetchFromDashApi()` now also transparently handles a JSON-encoded string body (05-03, closing G-05-2's proximate cause) and reads the live API's actual `entities` (plural) field (05-03, closing G-05-2's second bug). 19 passing tests in `ServiceAlertService.test.ts` exercise the fetch → parse → map path. |
| 2 | Alerts refresh automatically on a dedicated ~5-minute background poll, running independently of (not blocked by, and not blocking) the existing 30-second prediction poll (ALRT-02). | ✓ VERIFIED | `ServiceAlertPollService.ts:5` — `POLL_INTERVAL_MS = 5 * 60_000`, a distinct `setInterval` driver in its own file with no import/reference to or from `PredictionStreamService.ts`/`PredictionService.ts` (confirmed by cross-reference grep — zero hits either direction). `app.ts:26-30` wires `serviceAlertPollService.start()` synchronously, unawaited, strictly before `repository.initialize()` (line 32) and outside its `.then()`/`.catch()` chain — no `await` appears between construction and `app.listen()`. Cadence and non-blocking-start behaviorally proven via fake-timer tests (`ServiceAlertPollService.test.ts`, 4/4 passing). Non-blocking-in-practice is further corroborated by two real live-boot sessions during G-05-1/G-05-2 diagnosis, in which the server continued running (poll errors were logged, not startup crashes/hangs). |
| 3 | Each fetched alert is normalized into a `ServiceAlert` model capturing affected route(s)/stop(s), a description, severity/cause when provided by the feed, and an active window (start/end) (ALRT-03). | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `mapToServiceAlert()` (`ServiceAlertService.ts:70-91`) is present, wired, and unit-tested for `informedRouteIds`/`informedStopIds`/`cause`/`effect`/`headerText`/`descriptionText`/`activePeriod`. However, the test fixtures assume `header_text`/`description_text` are single objects (`{translation: [...]}`) and `url` is the same shape — the exact assumption the production code encodes. `05-UAT.md`'s own recorded `live_response_example` for this endpoint (captured while diagnosing G-05-2) shows `header_text`/`description_text` as JSON **arrays** and `url` as a **plain string**, which would make `alert.header_text?.translation?.[0]?.text` resolve to `undefined` for every real alert. No test or live-boot check has confirmed which shape is actually correct since the entity/entities fix — see Human Verification and `behavior_unverified_items`. |
| 4 | Querying the in-memory alert store at any point in time returns only alerts whose active window contains the current time — expired or not-yet-started alerts are filtered out server-side (ALRT-04). | ✓ VERIFIED | `ServiceAlertRepository.ts:5-16,44-46` — `isAlertActive`/`getActiveAlerts()`. 11 passing tests in `ServiceAlertRepository.test.ts` cover: empty-before-first-apply, inclusive boundaries at both `start` and `end`, exclusion of expired/future alerts, stable insertion order, atomic full-replacement on `applyAlerts()`, and one genuine end-to-end fetch→normalize→filter→query test. This logic is independent of the upstream body-shape/field-name issues (Truths 1 & 3 above) since it operates purely on already-mapped `ServiceAlert` objects. |
| 5 (derived) | Malformed/unexpected-shaped upstream response bodies fail loud via `UpstreamApiError` rather than being silently absorbed as "zero alerts" — per this phase's own stated threat model (T-05-01) and 05-03-PLAN.md's explicit claim that an array-rooted body "still throws `UpstreamApiError` exactly as before." | ✗ FAILED | `ServiceAlertService.ts:37-38` — `body === null || typeof body !== "object"` does not exclude arrays (`typeof [] === "object"`). An array-rooted body (or a JSON string parsing to one) silently passes the guard, then `fetchAlerts()` reads `.entities` on the array (`undefined`), logs a warning, and resolves to `[]` — never throwing. Confirmed independently via source inspection and matches `05-REVIEW.md`'s WR-01 finding filed against this exact diff; no fix commit exists after `b812445`/`b58577c`, and no test exercises the array-root case (`grep` for `data: \[\]` / `Array.isArray(body)` in the test file returns nothing). |

**Score:** 4/5 truths verified (1 present, behavior-unverified; 1 failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/server/api/models/ServiceAlert.ts` | Domain + Dash-shaped types | ✓ VERIFIED | Exports `ServiceAlert`/`ServiceAlertActivePeriod` (domain) and `DashActivePeriod`/`DashInformedEntity`/`DashTranslation`/`DashAlertTranslatedString`/`DashAlert`/`DashAlertEntity`/`DashAlertsApiResponse` (raw upstream, now `entities` plural per G-05-2 fix) — named exports only. |
| `src/server/api/services/ServiceAlertService.ts` | fetch + Dash-to-domain mapping | ⚠️ VERIFIED with defect | `createServiceAlertService()` factory; `fetchAlerts()`/`fetchFromDashApi()`/`deriveActiveWindow()`/`mapToServiceAlert()`/`isValidDashAlertEntity()` all present and substantive. Correct endpoint, string-body JSON.parse fallback, entities-field rename all implemented and tested. Contains the unresolved WR-01 array-root gap (see Truth 5). |
| `src/server/api/repositories/ServiceAlertRepository.ts` | singleton in-memory store + active-window query | ✓ VERIFIED | Singleton via `getInstance()`, `applyAlerts()` atomic swap, `getActiveAlerts()` inclusive-boundary filter, no `assertInitialized()` guard. |
| `src/server/api/services/ServiceAlertPollService.ts` | boot-triggered 5-min poll driver | ✓ VERIFIED | `start()` fires immediate `pollAlerts()` then `setInterval(POLL_INTERVAL_MS)`; try/catch never calls `applyAlerts()` on failure. |
| `src/server/app.ts` (modified) | wires `ServiceAlertPollService.start()` at boot, non-blocking | ✓ VERIFIED | Literal `serviceAlertPollService.start();` present, precedes `repository.initialize()`, zero `await` between construction and `app.listen()`. |
| `src/server/api/models/index.ts` (modified) | exports `ServiceAlert` | ✓ VERIFIED | `export * from "./ServiceAlert";` present, existing lines unchanged. |
| `src/server/api/repositories/index.ts` (modified) | exports `ServiceAlertRepository` | ✓ VERIFIED | `export * from "./ServiceAlertRepository";` present alongside `BusDataRepository`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `app.ts` | `ServiceAlertPollService.start()` | Direct call at module top level | ✓ WIRED | `src/server/app.ts:26-30`. |
| `ServiceAlertPollService.pollAlerts()` | `ServiceAlertService.fetchAlerts()` | direct call | ✓ WIRED | `ServiceAlertPollService.ts:20`. |
| `ServiceAlertService.fetchAlerts()` | DASH API | `axios.get('/real-time/{agency}/gtfs-rt-alerts/v2')` | ✓ WIRED | Confirmed correct endpoint (G-05-1 closed), string-body fallback + `entities` field read (G-05-2 closed). |
| `ServiceAlertPollService.pollAlerts()` | `ServiceAlertRepository.applyAlerts()` | only on fetch success | ✓ WIRED | `ServiceAlertPollService.ts:19-25` — inside `try`, not `catch`; behaviorally proven by rejected-fetch test. |
| `ServiceAlertRepository.getActiveAlerts()` | repositories barrel | `export * from "./ServiceAlertRepository"` | ✓ WIRED | No Phase 6 caller yet, by design (ingestion-only phase). |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ALRT-01 | 05-01/05-02/05-03-PLAN.md | Server fetches GTFS-RT service alerts from DASH/Swiftly service-alerts endpoint | ✓ SATISFIED (with a flagged robustness gap — Truth 5) | Correct endpoint confirmed live; string-body/entities-field bugs closed; array-root guard gap remains open. |
| ALRT-02 | 05-01-PLAN.md | Alerts refreshed on dedicated 5-min background poll, independent of 30s prediction poll | ✓ SATISFIED | 5-min `setInterval`, zero coupling to `PredictionStreamService`, non-blocking startup. |
| ALRT-03 | 05-01-PLAN.md | `ServiceAlert` model represents affected route(s)/stop(s), description, severity/cause, active window | ⚠️ NEEDS HUMAN | Structure/mapping code present and tested against self-consistent fixtures; `headerText`/`descriptionText`/`url` field-shape correctness against the actual live payload is unconfirmed (see Truth 3). |
| ALRT-04 | 05-01-PLAN.md | Only currently-active alerts surfaced; expired/future filtered server-side | ✓ SATISFIED | `ServiceAlertRepository.getActiveAlerts()` fully tested, independent of upstream shape questions. |

REQUIREMENTS.md maps exactly ALRT-01..04 to Phase 5 (checked as `[x]` complete in the requirements doc); all four appear in `05-01-PLAN.md`'s (and are re-declared in 05-02/05-03's) `requirements:` frontmatter. No orphaned requirements.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full workspace test suite (single run) | `bun run test` | 20 files, 251 tests passed, 0 type errors | ✓ PASS |
| Build compiles cleanly | `bun run build` | `rm -rf dist && tsc` exits 0 | ✓ PASS |
| Phase-scoped test files (single named run) | `bun run test -- src/server/api/services/ServiceAlertService.test.ts src/server/api/repositories/ServiceAlertRepository.test.ts src/server/api/services/ServiceAlertPollService.test.ts` | 3 files, 34 tests passed | ✓ PASS |
| Coverage threshold | `bun run test:coverage` | 98.1% stmts / 94.24% branch / 97.77% funcs / 98.1% lines | ✓ PASS (above 80% floor) |
| `entity`/`entity:` stale top-level references | `grep -n "response\.entity\b\|entity:" ServiceAlertService.ts ServiceAlert.ts` | 0 matches (only per-item `entity` parameter names remain, correctly) | ✓ PASS |
| Array-root body-shape guard (WR-01 regression probe) | `node -e "console.log([] === null || typeof [] !== 'object')"` | `false` — confirms the guard does not reject an array | ✗ FAIL (confirms Truth 5's defect) |
| Real server boot + real alert content inspection | N/A | Not run in this verification pass | ? SKIP — routed to human verification (Truth 3) |

### Anti-Patterns Found

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers in any phase-touched file. No stub returns, no hardcoded-empty data flowing to output.

**Carried-forward, still-open code review findings (`05-REVIEW.md`, status `issues_found`, 0 critical / 2 warning / 2 info, dated 2026-09-02, reviewing the 05-03 diff):**

| File | Line | Finding | Severity | Status |
|------|------|---------|----------|--------|
| `ServiceAlertService.ts` | 37-40 | WR-01: body-shape guard accepts a JSON array root, contradicting the plan's own STRIDE claim | Warning | **Open** — promoted to Truth 5 / gap above given it directly falsifies a written claim in the shipped plan with zero test coverage |
| `ServiceAlertService.ts` | 31-33, 38 | WR-02: JSON.parse-failure and non-object-body cases throw the identical duplicated error string, reducing diagnosability | Warning | Open, non-blocking (does not affect correctness, only log clarity) |
| `ServiceAlertService.test.ts` | 54, 66 | IN-01: two test titles still say "entity" after the `entities` rename | Info | Open, cosmetic only |
| `ServiceAlert.ts` | 59 | IN-02: `DashAlertsApiResponse.entities` typed as required but treated as optional at runtime | Info | Open, pre-existing (not introduced by this phase), non-blocking |

### Prohibitions Check

| Prohibition | Status | Evidence |
|-------------|--------|----------|
| No new Express route/controller for service alerts | ✓ Holds | `grep` across `src/server/api/routes/` and `src/server/api/controllers/` for alert-related content returns zero matches. |
| No derived severity/priority ranking or new cause/effect enum | ✓ Holds | `grep` for `severity`/`priority` in `ServiceAlert.ts`/`ServiceAlertService.ts` returns zero matches; `cause`/`effect` remain untyped `string \| undefined` passthrough. |
| The alerts poll never blocks or gates `app.listen()` | ✓ Holds | No `await` between `ServiceAlertPollService` construction and `app.listen()`; `start()` precedes `repository.initialize()`; corroborated by two real live-boot sessions that did not hang. |

### Human Verification Required

See `human_verification` in frontmatter — one item:

1. **Real-payload field-shape check for `headerText`/`descriptionText`/`url`**
   - **Test:** Boot the real server against the live DASH/Swiftly API while at least one active alert exists, and inspect `ServiceAlertRepository`'s in-memory store (temporary log line or debugger) for a real alert's `headerText`/`descriptionText`/`url` values.
   - **Expected:** These fields contain the actual alert text from the feed, not `undefined`.
   - **Why human:** `05-UAT.md`'s own recorded `live_response_example` for this endpoint shows `header_text`/`description_text` as JSON arrays and `url` as a plain string — shapes the current `mapToServiceAlert()` code does not handle (`alert.header_text?.translation?.[0]?.text` silently resolves to `undefined` against an array). Every existing test fixture assumes the code's own shape, so it cannot detect this by construction. No live-boot check with real alert content was completed after the 05-03 fix (both 05-02's and 05-03's plan-declared `<human-check>`s were left as deferred per their own SUMMARY.md files).

### Gaps Summary

Phase 5's core ingestion pipeline (fetch → normalize → filter-by-active-window → query) is real, substantively implemented, well-tested (251/251 suite, 34/34 phase-scoped, 98%+ coverage), and correctly wired into `app.ts` with a fully independent 5-minute poll. Two of the three UAT-reported live-boot gaps (G-05-1 endpoint 404, G-05-2 malformed body / entity-entities mismatch) are closed with passing regression tests and (for G-05-1, implicitly for G-05-2's proximate symptoms) corroborating live-boot evidence.

However, this re-verification surfaces one confirmed, unresolved code defect and one credible, evidence-backed open question that the phase's own artifacts had not yet closed:

1. **Confirmed defect (gap, blocks `passed`):** The malformed-body guard added across 05-02/05-03 does not reject an array-rooted response body, directly contradicting an explicit written claim in 05-03-PLAN.md's own STRIDE mitigation text ("a string that parses to a non-object JSON value (array-at-root, primitive, or invalid JSON) still throws `UpstreamApiError` exactly as before"). This was already flagged as WR-01 in `05-REVIEW.md` and remains unfixed with zero regression test coverage.
2. **Evidence-backed open question (routed to human):** The live API's actual `header_text`/`description_text`/`url` field shapes, as recorded in `05-UAT.md`'s own `live_response_example` from the G-05-2 diagnosis session, appear to differ from what `mapToServiceAlert()` assumes — a mismatch that, if real, would silently null out every alert's description text without any test or crash surfacing it. This exact class of blind spot (an untested assumption about the live API's shape) is what produced both G-05-1 and G-05-2, so it warrants direct verification before Phase 6 builds a client-facing surface on top of these fields.

Recommend a small gap-closure plan for item 1 (one-line fix: add `Array.isArray(body)` to the guard, plus one regression test) and a live-boot human check for item 2 before considering ALRT-03 fully satisfied.

---

*Verified: 2026-09-02T10:30:00Z*
*Verifier: Claude (gsd-verifier)*
