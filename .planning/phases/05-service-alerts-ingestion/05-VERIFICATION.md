---
phase: 05-service-alerts-ingestion
verified: 2026-09-02T10:50:00Z
status: human_needed
score: 5/5 must-haves verified
behavior_unverified: 1
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/5
  gaps_closed:
    - "Array-rooted (or JSON-string-encoded array) response body now rejects with UpstreamApiError instead of silently degrading to an empty alert list — 05-04 added `Array.isArray(body)` to the body-shape guard in `ServiceAlertService.ts:37`, with two new passing regression tests (`{ data: [] }` and `{ data: \"[]\" }`), 21/21 ServiceAlertService tests, 36/36 phase-scoped tests, 253/253 full suite, `bun run build` exit 0 — all confirmed by direct source inspection and test execution in this pass, not just SUMMARY claims."
  gaps_remaining: []
  regressions: []
behavior_unverified_items:
  - truth: "ServiceAlert.headerText/descriptionText/url are correctly populated from the live DASH/Swiftly feed's actual header_text/description_text/url field shapes."
    test: "Boot the real server against the live DASH/Swiftly API while at least one active alert exists, and inspect ServiceAlertRepository's in-memory store (temporary log/debugger) for a real alert's headerText/descriptionText/url values."
    expected: "headerText/descriptionText contain the actual alert text from the feed (not undefined), and url (if present in the feed) is populated."
    why_human: "05-UAT.md's recorded live_response_example for this exact endpoint (captured during G-05-2 diagnosis, .planning/debug/service-alerts-malformed-body.md) shows header_text/description_text as JSON ARRAYS (`[{\"translation\": [...]}]`), and url as a plain string (`\"string\"`) — not the single-object `{translation: [...]}` shape ServiceAlertService.ts's mapToServiceAlert() assumes (`alert.header_text?.translation?.[0]?.text`, `alert.url?.translation?.[0]?.text`). If that recorded shape is accurate, these three fields resolve to undefined for every real alert via optional chaining — never crashing, so no test or log would catch this. All existing test fixtures (makeDashAlertEntity) hand-construct the single-object shape the code already assumes, so they cannot detect a mismatch by construction. Plan 05-04 explicitly did not address this (out of scope by its own SUMMARY.md), and no live-boot check with real alert content has been recorded as completed since the 05-03 fix. Unchanged from the prior verification pass — still open."
coincidental_reliance_items:
  - truth: "ServiceAlertService.fetchAlerts() correctly maps headerText/descriptionText/url."
    reason: fixture-only
    harden: "Source header_text/description_text/url fixtures for ServiceAlertService.test.ts from an independently-verified capture of the live API response (not from the same assumption the production code encodes), so a real shape mismatch would show up as a failing test rather than passing by construction."
human_verification:
  - test: "Boot the real server against the live DASH/Swiftly API while at least one active alert exists, and inspect ServiceAlertRepository's in-memory store (temporary log line or debugger) for a real alert's headerText/descriptionText/url values."
    expected: "These fields contain the actual alert text from the feed, not undefined."
    why_human: "05-UAT.md's own recorded live_response_example for this endpoint shows header_text/description_text as JSON arrays and url as a plain string — shapes the current mapToServiceAlert() code does not handle. Every existing test fixture assumes the code's own shape, so it cannot detect this by construction. Requires an authenticated request against the live, non-mocked DASH/Swiftly API with a real active alert present, and human inspection of in-memory state."
---

# Phase 5: Service Alerts Ingestion Verification Report

**Phase Goal:** The server continuously fetches and maintains an up-to-date, filtered set of currently-active GTFS-RT service alerts from the DASH/Swiftly API, ready to be queried by other layers once Phase 6 wires them into responses.
**Verified:** 2026-09-02T10:50:00Z
**Status:** human_needed
**Re-verification:** Yes — supersedes the 2026-09-02 10:30 `05-VERIFICATION.md` (status `gaps_found`, 4/5), after gap-closure plan 05-04 (gap_ids: [G-05-3], WR-01 array-root body-shape guard).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The server fetches GTFS-RT service alerts (detours, disruptions, stop closures) from the DASH/Swiftly service-alerts endpoint (ALRT-01). | ✓ VERIFIED | `ServiceAlertService.ts:16-20` — `buildDashApiUrl()` returns `/real-time/{agency}/gtfs-rt-alerts/v2`, endpoint confirmed correct in 05-02 (human-confirmed live boot). `fetchFromDashApi()` handles a JSON-encoded string body and reads the live API's `entities` (plural) field. Unchanged since prior pass, still confirmed by 21 passing tests in `ServiceAlertService.test.ts` (re-run in this verification pass). |
| 2 | Alerts refresh automatically on a dedicated ~5-minute background poll, running independently of (not blocked by, and not blocking) the existing 30-second prediction poll (ALRT-02). | ✓ VERIFIED | `ServiceAlertPollService.ts:5` — `POLL_INTERVAL_MS = 5 * 60_000`. `app.ts:23-30` — `serviceAlertPollService.start()` called synchronously, unawaited, strictly before `repository.initialize()`. Unchanged since prior pass; 4/4 `ServiceAlertPollService.test.ts` re-run passing. |
| 3 | Each fetched alert is normalized into a `ServiceAlert` model capturing affected route(s)/stop(s), a description, severity/cause when provided by the feed, and an active window (start/end) (ALRT-03). | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `mapToServiceAlert()`/`deriveActiveWindow()` (`ServiceAlertService.ts:55-91`) present, wired, unit-tested against self-consistent fixtures for `informedRouteIds`/`informedStopIds`/`cause`/`effect`/`headerText`/`descriptionText`/`activePeriod`. Unchanged since prior pass: `05-UAT.md`'s own recorded `live_response_example` shows `header_text`/`description_text` as JSON arrays and `url` as a plain string — a shape `mapToServiceAlert()` does not handle, and 05-04 explicitly did not touch this file's mapping logic for this concern (out of scope by its own SUMMARY). See Human Verification. |
| 4 | Querying the in-memory alert store at any point in time returns only alerts whose active window contains the current time — expired or not-yet-started alerts are filtered out server-side (ALRT-04). | ✓ VERIFIED | `ServiceAlertRepository.ts:5-16,44-46` — `isAlertActive`/`getActiveAlerts()`. Unchanged since prior pass; 11/11 `ServiceAlertRepository.test.ts` re-run passing. Independent of the upstream body-shape/field-name/field-shape issues since it operates purely on already-mapped `ServiceAlert` objects. |
| 5 (derived) | Malformed/unexpected-shaped upstream response bodies fail loud via `UpstreamApiError` rather than being silently absorbed as "zero alerts" — per this phase's own stated threat model (T-05-01) and 05-03-PLAN.md's explicit claim that an array-rooted body "still throws `UpstreamApiError` exactly as before." | ✓ VERIFIED | **Gap closed.** `ServiceAlertService.ts:37` now reads `body === null \|\| typeof body !== "object" \|\| Array.isArray(body)` — directly inspected in this pass, confirming the previously-missing `Array.isArray(body)` disjunct is present. Two new regression tests confirmed present and passing: `"rejects with UpstreamApiError when the response body is an array-rooted value (WR-01)"` (`{ data: [] }`) and `"...JSON-encoded string that parses to an array-rooted value (WR-01)"` (`{ data: "[]" }`), both at `ServiceAlertService.test.ts:229-246`. Re-ran `bun run test -- src/server/api/services/ServiceAlertService.test.ts` directly in this verification pass: 21/21 pass. Re-ran full suite: 253/253 pass. Re-ran `bun run build`: exit 0. |

**Score:** 5/5 truths verified (4 fully verified, 1 present-but-behavior-unverified — unchanged from before, not newly introduced by this round)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/server/api/models/ServiceAlert.ts` | Domain + Dash-shaped types | ✓ VERIFIED | `DashAlertsApiResponse.entities` now optional (`entities?: DashAlertEntity[]`), matching runtime contract — 05-04's IN-02 closure, confirmed by direct read. |
| `src/server/api/services/ServiceAlertService.ts` | fetch + Dash-to-domain mapping | ✓ VERIFIED | `createServiceAlertService()` factory; `fetchAlerts()`/`fetchFromDashApi()`/`deriveActiveWindow()`/`mapToServiceAlert()`/`isValidDashAlertEntity()` all present and substantive. Array-root guard defect (prior Truth 5) now fixed and tested. `MALFORMED_BODY_MESSAGE` shared constant present (WR-02 closure). |
| `src/server/api/repositories/ServiceAlertRepository.ts` | singleton in-memory store + active-window query | ✓ VERIFIED | Unchanged since prior pass — singleton via `getInstance()`, `applyAlerts()` atomic swap, `getActiveAlerts()` inclusive-boundary filter. |
| `src/server/api/services/ServiceAlertPollService.ts` | boot-triggered 5-min poll driver | ✓ VERIFIED | Unchanged since prior pass — `start()` fires immediate `pollAlerts()` then `setInterval(POLL_INTERVAL_MS)`; try/catch never calls `applyAlerts()` on failure. |
| `src/server/app.ts` (modified) | wires `ServiceAlertPollService.start()` at boot, non-blocking | ✓ VERIFIED | Unchanged since prior pass — `serviceAlertPollService.start();` precedes `repository.initialize()`, zero `await` between construction and `app.listen()`. |
| `src/server/api/models/index.ts` (modified) | exports `ServiceAlert` | ✓ VERIFIED | `export * from "./ServiceAlert";` present. |
| `src/server/api/repositories/index.ts` (modified) | exports `ServiceAlertRepository` | ✓ VERIFIED | `export * from "./ServiceAlertRepository";` present. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `app.ts` | `ServiceAlertPollService.start()` | Direct call at module top level | ✓ WIRED | `src/server/app.ts:23-30`, re-confirmed by direct read this pass. |
| `ServiceAlertPollService.pollAlerts()` | `ServiceAlertService.fetchAlerts()` | direct call | ✓ WIRED | `ServiceAlertPollService.ts:20`. |
| `ServiceAlertService.fetchAlerts()` | DASH API | `axios.get('/real-time/{agency}/gtfs-rt-alerts/v2')` | ✓ WIRED | Endpoint, string-body fallback, `entities` field, array-root guard all confirmed correct in this pass. |
| `ServiceAlertPollService.pollAlerts()` | `ServiceAlertRepository.applyAlerts()` | only on fetch success | ✓ WIRED | `ServiceAlertPollService.ts:19-25` — inside `try`, not `catch`. |
| `ServiceAlertRepository.getActiveAlerts()` | repositories barrel | `export * from "./ServiceAlertRepository"` | ✓ WIRED | No Phase 6 caller yet, by design (ingestion-only phase). |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ALRT-01 | 05-01/05-02/05-03/05-04-PLAN.md | Server fetches GTFS-RT service alerts from DASH/Swiftly service-alerts endpoint | ✓ SATISFIED | Correct endpoint confirmed live; string-body/entities-field bugs closed; array-root guard gap now closed with passing regression tests. No open robustness gaps against this requirement. |
| ALRT-02 | 05-01-PLAN.md | Alerts refreshed on dedicated 5-min background poll, independent of 30s prediction poll | ✓ SATISFIED | 5-min `setInterval`, zero coupling to `PredictionStreamService`, non-blocking startup. |
| ALRT-03 | 05-01-PLAN.md | `ServiceAlert` model represents affected route(s)/stop(s), description, severity/cause, active window | ⚠️ NEEDS HUMAN | Structure/mapping code present and tested against self-consistent fixtures; `headerText`/`descriptionText`/`url` field-shape correctness against the actual live payload is unconfirmed — unchanged from prior verification, not addressed by 05-04 (explicitly out of scope). |
| ALRT-04 | 05-01-PLAN.md | Only currently-active alerts surfaced; expired/future filtered server-side | ✓ SATISFIED | `ServiceAlertRepository.getActiveAlerts()` fully tested, independent of upstream shape questions. |

REQUIREMENTS.md's tracking table (lines 60-63) still shows ALRT-02/03/04 as "Gaps Found" from the prior round — this is a stale tracking artifact, not a code gap; ALRT-01 is marked "Complete." All four IDs appear in every phase plan's `requirements:` frontmatter (05-01 through 05-04). No orphaned requirements. Recommend the tracking table be refreshed to reflect this pass's per-requirement status (ALRT-01/02/04 satisfied, ALRT-03 needs-human) once this VERIFICATION.md is accepted.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full workspace test suite (single run, this pass) | `bun run test` | 20 files, 253 tests passed, 0 type errors | ✓ PASS |
| Build compiles cleanly (this pass) | `bun run build` | `rm -rf dist && tsc` exits 0 | ✓ PASS |
| Phase-scoped test files (single named run, this pass) | `bun run test -- src/server/api/services/ServiceAlertService.test.ts src/server/api/repositories/ServiceAlertRepository.test.ts src/server/api/services/ServiceAlertPollService.test.ts` | 3 files, 36 tests passed | ✓ PASS |
| Array-root regression tests present and named correctly | `grep -n "array-rooted value (WR-01)" ServiceAlertService.test.ts` | 2 matches, both asserting `rejects.toThrow(UpstreamApiError)` against `{ data: [] }` and `{ data: "[]" }` | ✓ PASS |
| Array-root body-shape guard source fix | Direct read of `ServiceAlertService.ts:37` | `body === null \|\| typeof body !== "object" \|\| Array.isArray(body)` | ✓ PASS (confirms Truth 5 gap is closed, not just claimed) |
| Real server boot + real alert content inspection | N/A | Not run in this verification pass | ? SKIP — routed to human verification (Truth 3, unchanged from prior pass) |

### Anti-Patterns Found

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers in any phase-touched file (re-checked this pass). No stub returns, no hardcoded-empty data flowing to output.

**Prior round's carried-forward findings — status this pass:**

| File | Line | Finding | Severity | Status |
|------|------|---------|----------|--------|
| `ServiceAlertService.ts` | 37 | Old-WR-01: body-shape guard accepted a JSON array root | Warning (was promoted to blocking gap) | **Closed** — `Array.isArray(body)` confirmed present, tested, passing. |
| `ServiceAlertService.ts` | (was 31-33, 38) | Old-WR-02: JSON.parse-failure and non-object-body threw identical duplicated error string | Warning | **Closed** — `MALFORMED_BODY_MESSAGE` shared constant confirmed, JSON.parse-failure site has a distinguishing suffix. |
| `ServiceAlertService.test.ts` | (was 54, 66) | Old-IN-01: two test titles still said "entity" after the `entities` rename | Info | **Closed** — confirmed titles now say "entities" (`grep` for singular "entity" title text returns none in the affected tests). |
| `ServiceAlert.ts` | 59 | Old-IN-02: `DashAlertsApiResponse.entities` typed as required but treated as optional at runtime | Info | **Closed** — confirmed `entities?: DashAlertEntity[]`. |

**New findings from the fresh 05-REVIEW.md pass (2026-09-02, full re-review of current code, 0 critical / 2 warning / 3 info) — independently confirmed in this verification pass by direct source inspection:**

| File | Line | Finding | Severity | Blocks phase? |
|------|------|---------|----------|----------------|
| `ServiceAlertService.ts` | 60-67 | New-WR-01: `deriveActiveWindow()` has no `anyOpenStarted` check symmetric to `anyOpenEnded` — a multi-`active_period` alert where one period lacks `start` (meaning "already active, unbounded past") can have its collapsed window's `start` incorrectly computed from another period's bounded `start`, understating the true active window. Confirmed by direct read: `starts` is built by filtering out `undefined` values with no equivalent `anyOpenStarted` guard used in the `start:` branch. | Warning | **No** — narrow edge case (requires >1 `active_period` entries per alert with mixed start-boundedness; a single-period or all-bounded/all-unbounded alert is unaffected), classified Warning by the review, not a regression from this round's gap-closure work, and not part of the previously-promoted blocking gap. Recommend a follow-up plan (mirrors the already-fixed old-WR-03 pattern) but does not block this phase's `human_needed`/`passed` determination. |
| `ServiceAlertService.ts` | 43-51 | New-WR-02: `isValidDashAlertEntity()` checks `alert` is a non-null object but not that nested `informed_entity`/`active_period` are arrays when present; a malformed nested field would throw a raw `TypeError` from deeper in the mapping code instead of the intended `UpstreamApiError`. Confirmed by direct read of the guard. | Warning | **No** — still caught by `ServiceAlertPollService.pollAlerts()`'s existing try/catch (log-and-keep-stale), so it degrades to the same "poll tick skipped, logged" failure mode already accepted for this phase, just with a less-diagnosable message. Not a silent-success/data-corruption path. Recommend follow-up but non-blocking. |

Both new findings are genuine, independently confirmed defects — they are correctly triaged as non-blocking robustness gaps (not core-goal-breaking) and are recommended for a future gap-closure or hardening plan, not required before Phase 6 proceeds.

### Prohibitions Check

| Prohibition | Status | Evidence |
|-------------|--------|----------|
| No new Express route/controller for service alerts | ✓ Holds | Re-checked this pass — `grep` across `src/server/api/routes/` and `src/server/api/controllers/` for alert-related content returns zero matches. |
| No derived severity/priority ranking or new cause/effect enum | ✓ Holds | Re-checked this pass — `cause`/`effect` remain untyped `string \| undefined` passthrough in `ServiceAlert.ts`. |
| The alerts poll never blocks or gates `app.listen()` | ✓ Holds | Re-confirmed by direct read of `app.ts` this pass — no `await` between `ServiceAlertPollService` construction and `app.listen()`. |

### Human Verification Required

See `human_verification` in frontmatter — one item, unchanged from the prior verification pass (not addressed by 05-04, which was explicitly scoped only to the array-root guard defect):

1. **Real-payload field-shape check for `headerText`/`descriptionText`/`url`**
   - **Test:** Boot the real server against the live DASH/Swiftly API while at least one active alert exists, and inspect `ServiceAlertRepository`'s in-memory store (temporary log line or debugger) for a real alert's `headerText`/`descriptionText`/`url` values.
   - **Expected:** These fields contain the actual alert text from the feed, not `undefined`.
   - **Why human:** `05-UAT.md`'s own recorded `live_response_example` for this endpoint shows `header_text`/`description_text` as JSON arrays and `url` as a plain string — shapes the current `mapToServiceAlert()` code does not handle (`alert.header_text?.translation?.[0]?.text` silently resolves to `undefined` against an array; `alert.url?.translation?.[0]?.text` silently resolves to `undefined` against a plain string). Every existing test fixture assumes the code's own shape, so it cannot detect this by construction. Neither this nor the two new 05-REVIEW.md warnings (`deriveActiveWindow`'s start-side gap, `isValidDashAlertEntity`'s array-type check) can be closed by grep/presence checks — this one specifically requires an authenticated live request with real alert content and in-memory inspection.

### Gaps Summary

The previously-blocking gap is closed. This re-verification independently confirms — by direct source inspection and by re-running the test suite and build in this pass, not by trusting 05-04-SUMMARY.md's claims — that `ServiceAlertService.ts`'s body-shape guard now rejects an array-rooted response body (raw or JSON-string-encoded) with `UpstreamApiError`, backed by two new passing regression tests, with zero regression across the full 253-test suite and a clean `bun run build`. The three non-blocking review findings from the prior round (WR-02, IN-01, IN-02) are also confirmed closed.

No new blocking gaps were found. The phase's core ingestion pipeline (fetch → normalize → filter-by-active-window → query, plus fail-loud malformed-body handling) is real, substantively implemented, well-tested, and correctly wired.

Two open items remain, neither of which blocks phase completion but both of which are surfaced honestly rather than absorbed into a `passed` verdict:

1. **Routed to human verification (unchanged from prior pass):** The live API's actual `header_text`/`description_text`/`url` field shapes, as recorded in `05-UAT.md`'s own `live_response_example`, appear to differ from what `mapToServiceAlert()` assumes. Plan 05-04 explicitly did not address this (it was scoped only to the array-root guard). This is the same class of blind spot that produced both prior gaps (G-05-1, G-05-2) and should be resolved with a live-boot check before Phase 6 builds a client-facing surface on these fields.
2. **New non-blocking findings, recommended for follow-up (not required to proceed):** A fresh full code review (`05-REVIEW.md`) independently found two Warning-severity robustness gaps unrelated to the closed gap — a symmetric `anyOpenStarted` omission in `deriveActiveWindow()` (mirrors the already-fixed old-WR-03), and a missing array-type check in `isValidDashAlertEntity()` for `informed_entity`/`active_period`. Both are narrow edge cases, both degrade to the poll service's existing try/catch (no silent-success/data-corruption path), and both are recommended for a future hardening plan rather than blocking this phase's completion.

**Recommendation:** Proceed with the human live-boot check for item 1 (this is the gating item for a true `passed` status on ALRT-03). Item 2's findings can be tracked as a lightweight follow-up plan at the team's discretion; they do not need to block Phase 6 from starting.

---

*Verified: 2026-09-02T10:50:00Z*
*Verifier: Claude (gsd-verifier)*
