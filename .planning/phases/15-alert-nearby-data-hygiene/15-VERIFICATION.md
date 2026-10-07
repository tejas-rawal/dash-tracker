---
phase: 15-alert-nearby-data-hygiene
verified: 2026-10-07T20:05:23Z
status: passed
score: 29/29 must-haves verified
covered_files:
  - .planning/REQUIREMENTS.md
  - .planning/phases/15-alert-nearby-data-hygiene/15-01-PLAN.md
  - .planning/phases/15-alert-nearby-data-hygiene/15-01-SUMMARY.md
  - .planning/phases/15-alert-nearby-data-hygiene/15-02-PLAN.md
  - .planning/phases/15-alert-nearby-data-hygiene/15-02-SUMMARY.md
  - .planning/phases/15-alert-nearby-data-hygiene/15-03-PLAN.md
  - .planning/phases/15-alert-nearby-data-hygiene/15-03-SUMMARY.md
  - src/server/api/models/ServiceAlert.ts
  - src/server/api/routes/alertHygiene.test.ts
  - src/server/api/routes/predictionRoutes.test.ts
  - src/server/api/services/NearbyPredictionService.test.ts
  - src/server/api/services/NearbyPredictionService.ts
  - src/server/api/services/ServiceAlertService.test.ts
  - src/server/api/services/ServiceAlertService.ts
covered_digest: "v1:sha256:19a5bb653e8cad39724af9a6ffee6e7dd6fd45551343d97131c2f17973a9c798"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 20/20
  gaps_closed:
    - "CR-01 / 15-UAT test 1 / plan 15-01 A1: a structurally malformed alert (activePeriods [null], {}, 5, \"abc\"; informedEntities [null], {}) no longer fails the whole poll. The developer chose 'reject' (D-16), and 15-03 implements it. The real-poll E2E and an independent probe both show the alert dropped on its own while the sibling and a same-poll soft-delete are applied."
  gaps_remaining: []
  regressions: []
---

# Phase 15: Alert & Nearby Data Hygiene Verification Report

**Phase Goal:** Riders are never shown alerts that DASH has deleted or whose dates can't be trusted, and never shown nearby-prediction stops with missing or garbled names.
**Verified:** 2026-10-07T20:05:23Z
**Status:** passed
**Re-verification:** Yes. The previous run was human_needed on CR-01 only. The developer decided it as D-16, and gap-closure plan 15-03 implements that.

## Re-verification focus

The only open item before was the CR-01 decision. The developer rejected the whole-poll failure (D-16 in `15-CONTEXT.md:44-50`), and 15-03 implements that. I checked it against the code, not the summary:

- **Code.** `ServiceAlertService.ts:69-84` adds `isPlainRecord` and `readRecordList`. `readRecordList` accepts only null/undefined (mapped to `[]`) or an array whose every element is a non-null, non-array object. Anything else returns `undefined`.
  - `parseAlert` (`:156-170`) checks the activePeriods list, then the informedEntities list, then `findMalformedBound(periods)`, and returns `{ alert }` or `{ malformed }`.
  - `fetchAlerts` (`:202-212`) runs `isDeleted` first, then `parseAlert`, and has a single warn site.
  - In `ServiceAlert.ts:43-44,27-28`, both lists and the informed ids are typed `unknown`.
  - Outside test files, `grep` finds only two reads of `.activePeriods` / `.informedEntities` in `src/server`: lines 157 and 161, both `readRecordList(...)`. So the compiler-enforced boundary holds.
- **Tests.** I ran the phase test files myself: 5 files, 211 tests passed, no type errors. `tsc --noEmit` exits 0. They include:
  - the 14-row D-16 `it.each`;
  - the null-lists, non-string-ids, D-10 and message-only tests;
  - the real-poll E2E `keeps applying alert updates through the real poll when an alert is structurally malformed (D-16)`.
- **Independent probe.** I wrote a temporary test that calls the real `fetchAlerts()` with one bad alert and one good alert, then deleted it; `git status` is clean. Every original CR-01 shape now resolves with the good alert kept and no rejection:
  - `activePeriods`: `[null]`, `{}`, `5`, `"abc"`;
  - `informedEntities`: `[null]`, `{}`;
  - extra shapes: `activePeriods: true`, `informedEntities: [[]]`, `activePeriods: [{start:{}}]`.

  Before 15-03, all six original shapes rejected with a TypeError.

The UAT item is therefore resolved by code and tests, not by an override.

## Goal Achievement

### Observable Truths

Truths 1-20 are carried from the initial verification and re-checked against the current code. Truths 21-29 are new from 15-03. Three 15-03 truths restate earlier ones and are merged with refreshed evidence: D-07 into truth 11, D-06 into truth 10, and "pre-existing bodies unchanged" into truth 4.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1 / ALRT-12: an alert with any non-null `deletedAt` never appears on route, stop, nearby-stop or nearby-prediction responses, even while its window is active | ✓ VERIFIED | `isDeleted` `:59-61` runs first in the loop at `:203`. There is one ingestion choke point (`ServiceAlertPollService` -> `fetchAlerts` -> `applyAlerts`). The 5-endpoint E2E passes. CR-01 is now closed: a same-poll structural break can no longer freeze a since-deleted alert on screen (truth 21). |
| 2 | SC2 / ALRT-13: an alert with a malformed `activePeriod` date is excluded from every response and logged with its id | ✓ VERIFIED | `findMalformedBound(periods)` `:165-167`. The warn text is still `Dropping service alert <id> with a malformed activePeriods <start\|end> date`. The 7-row unit table and the E2E pass. |
| 3 | SC3 / NEAR-12: a nearby entry with missing or mistyped route/stop/destination names or ids (or `agencyKey`) is dropped with the existing single warn; valid entries are still returned | ✓ VERIFIED | `NearbyPredictionService.ts` has not changed since 15-02 (`git diff --stat 79c6912` is empty). `NearbyPredictionService.test.ts` and `predictionRoutes.test.ts` pass. |
| 4 | SC4: well-formed alerts and nearby entries are served exactly as before; every pre-existing test body is unchanged | ✓ VERIFIED | `git diff 10cc17d` on `ServiceAlertService.test.ts`, `alertHygiene.test.ts` and `ServiceAlertRepository.test.ts` has 0 removed lines (additions only). All of these pass. |
| 5 | D-01: a malformed-date alert drops only itself; the real poll keeps applying the rest | ✓ VERIFIED | The real-poll E2E passes |
| 6 | D-02: one bad period drops the whole alert | ✓ VERIFIED | The "one bad start/end among good periods" rows pass |
| 7 | D-03: malformed = present and (non-string or NaN-parse); null/undefined = unbounded; non-ISO parseable strings are kept and normalized | ✓ VERIFIED | `isParseableDate` `:63-65`; the related unit rows pass |
| 8 | D-04: one stateless, message-only warn naming the id and bound | ✓ VERIFIED | The "warns again on every fetch" and raw-value tests pass |
| 9 | D-05: filtering happens only at ingestion; `ServiceAlert` gains no deletion field | ✓ VERIFIED | `ServiceAlert.ts:6-16` is unchanged |
| 10 | D-06: the repository and poll service are byte-identical to f3b96d4; only null or round-trippable ISO bounds are emitted | ✓ VERIFIED | `git diff --stat f3b96d4 -- ServiceAlertRepository.ts ServiceAlertPollService.ts` is empty. The D-06 invariant test passes. |
| 11 | D-07: an id-less or null entity still rejects with UpstreamApiError | ✓ VERIFIED | `:186-190` is unchanged and runs before the per-alert loop; the pre-existing rows pass |
| 12 | D-08: any non-null `deletedAt` deletes; the value is never parsed; `deletedBy` is ignored | ✓ VERIFIED | 7-row table passes |
| 13 | D-09: soft-deleted drops are silent | ✓ VERIFIED | The ALRT-12 rows assert no warn |
| 14 | D-10: the deleted check runs before validation | ✓ VERIFIED | `:203` runs before `:206`. Passing tests: "drops a deleted alert with a malformed date without warning" and "drops a deleted alert with a malformed list without warning (D-10)". |
| 15 | D-11: route/stop name and id fields use `isNonEmptyString` | ✓ VERIFIED | Unchanged since 15-02; the tests pass |
| 16 | D-12: stopCode must be finite; 0, -1 and 4000858.5 are kept | ✓ VERIFIED | Same |
| 17 | D-13: destination directionId and headsign must be non-empty; one bad destination drops the entry | ✓ VERIFIED | Same |
| 18 | D-14: warn, `describeEntry` and `filterValidEntries` unchanged; boolean predicate | ✓ VERIFIED | Same |
| 19 | D-15: the agencyKey guard is unchanged and covered by tests | ✓ VERIFIED | Same |
| 20 | NEAR-12 edges: an empty string drops the entry; no trimming or normalization | ✓ VERIFIED | Same |
| 21 | CR-01 closed (D-16, ALRT-12): through the real poll, alert-old is first applied. The next poll carries alert-old soft-deleted, alert-new, alert-bad-periods (`[null]`) and alert-bad-informed (`{}`). After it, the repository holds exactly `['alert-new']`, `/routes/1A` shows only alert-new, and no poll error is logged. | ✓ VERIFIED | `alertHygiene.test.ts:255-296`. It asserts `activeIds() == ['alert-new']`, the route body, the absence of `alert-old`, that `errorSpy` was not called, and both warn lines. It passes, and it exercises the poll state transition directly. |
| 22 | D-16: an undeleted alert whose activePeriods is present but not an array of plain objects is dropped on its own, and fetchAlerts resolves with the other alerts | ✓ VERIFIED | 8 activePeriods rows: `[null]`, a null among good periods, `{}`, a lone object, `5`, `"abc"`, a nested array and a string element. Each asserts `["alert-2"]` kept. The independent probe confirms the same result. |
| 23 | D-16: the same holds for informedEntities (`[null]`, `{}`, `'route-1'`, a number among good entities) | ✓ VERIFIED | 4 informedEntities rows pass; the probe confirms `[null]`, `{}` and `[[]]` |
| 24 | D-16 / D-04 shape: exactly one message-only warn per alert naming the list | ✓ VERIFIED | `toHaveBeenCalledTimes(1)` plus the exact text in every row. "never puts the raw list value or other alert fields in the warn line" passes. |
| 25 | D-16 ordering: activePeriods list, then informedEntities list, then dates | ✓ VERIFIED | `parseAlert` order `:157-167`, and 2 ordering rows (both lists bad names activePeriods; a bad informed list plus a bad date names informedEntities) |
| 26 | D-16 / SC4: null or omitted lists keep their meaning (always active, no targets, no warn) | ✓ VERIFIED | `readRecordList` `:77-79` returns `[]`; the null-lists test passes |
| 27 | D-16: informed ids are strings only; non-string ids are skipped silently and the alert is kept | ✓ VERIFIED | `typeof id === "string"` filter at `:134-139`. The test expects `["route-1"]`/`["stop-1"]` and no warn. |
| 28 | D-10 extended: a deleted alert with a malformed list drops with no warn | ✓ VERIFIED | Unit test passes |
| 29 | Compiler-enforced boundary: both lists are typed `unknown`, and only `readRecordList` in `parseAlert` reads them. This supersedes 15-01's `findMalformedBound(entity.activePeriods)` link. | ✓ VERIFIED | `ServiceAlert.ts:43-44`. Outside test files, `src/server` reads the raw lists only at `:157` and `:161`. `tsc --noEmit` exits 0. `findMalformedBound` (`:89`), `deriveActiveWindow` (`:103`) and `mapToServiceAlert` (`:126-130`) take only checked lists. |

**Score:** 29/29 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/server/api/models/ServiceAlert.ts` | `deletedAt?: unknown`; lists and informed ids typed `unknown`; `ServiceAlert` unchanged | ✓ VERIFIED | `contains: "informedEntities?: unknown;"` passes |
| `src/server/api/services/ServiceAlertService.ts` | `isDeleted`, `isParseableDate`, `isPlainRecord`, `readRecordList`, `findMalformedBound`, `parseAlert` and the ingestion loop | ✓ VERIFIED | Wired into `fetchAlerts` and through the poll in `app.ts` |
| `src/server/api/services/ServiceAlertService.test.ts` | ALRT-12/13 tables, D-06 invariant, `structurally malformed alerts (D-16)` | ✓ VERIFIED | Passes |
| `src/server/api/routes/alertHygiene.test.ts` | 5-endpoint E2E, real-poll E2E, D-16 real-poll E2E | ✓ VERIFIED | 4 tests pass |
| `src/server/api/services/NearbyPredictionService.ts` | Extended nearby guard | ✓ VERIFIED | Unchanged since 15-02 |
| `src/server/api/services/NearbyPredictionService.test.ts` | Display-field, stopCode and warn tests | ✓ VERIFIED | Passes |
| `src/server/api/routes/predictionRoutes.test.ts` | Route-level "never serves a nearby stop built from ..." | ✓ VERIFIED | Passes |

`gsd-tools verify.artifacts` passes all artifacts: 15-01 4/4, 15-02 3/3, 15-03 4/4.

### Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| ServiceAlertService | ServiceAlert model | `isDeleted` reads `entity.deletedAt` unparsed | ✓ WIRED |
| fetchAlerts | findMalformedBound | 15-01 pattern `findMalformedBound(entity.activePeriods)` | SUPERSEDED (intended, per 15-03 truth 12). The intent is still met by `parseAlert(entity)` -> `findMalformedBound(periods)`, which runs before `mapToServiceAlert`. Not a regression. |
| fetchAlerts | parseAlert | `parseAlert(entity)` on every undeleted entity, with one warn site | ✓ WIRED |
| parseAlert | unknown-typed lists | `readRecordList(entity.activePeriods)` / `readRecordList(entity.informedEntities)` | ✓ WIRED |
| parseAlert | date validation | `findMalformedBound(periods)` on the checked list | ✓ WIRED |
| ServiceAlertPollService | ServiceAlertService | `service.fetchAlerts()` -> `repository.applyAlerts` | ✓ WIRED |
| alertHygiene.test.ts | real poll and test app | `createServiceAlertPollService(createServiceAlertService(), ServiceAlertRepository.getInstance())` plus `request(app)` | ✓ WIRED |
| filterValidEntries | isValidNearbyEntry | unchanged 15-02 links | ✓ WIRED |

`gsd-tools verify.key-links`: 15-01 3/4 (the one miss is the superseded pattern above), 15-02 2/2, 15-03 5/5.

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|---|---|---|---|---|
| Route, stop and nearby alert lists | `alerts` | `ServiceAlertRepository.getActiveAlertsFor*` <- `applyAlerts(fetchAlerts())` <- DASH `gtfs-rt-alerts/v2` | Yes | ✓ FLOWING |
| Nearby stops | `name`, `code`, routes | DASH `predictions-near-location` -> `parseDashResponse` -> `filterValidEntries` -> `groupByStop` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Phase test files: ALRT-12/13/D-16 units, E2Es, repository, NEAR-12 units and route rows | `bun run test -- ServiceAlertService.test.ts alertHygiene.test.ts ServiceAlertRepository.test.ts NearbyPredictionService.test.ts predictionRoutes.test.ts` | 5 files, 211 passed, no type errors | ✓ PASS |
| Compiler boundary | `bunx tsc --noEmit -p tsconfig.json` | exit 0 | ✓ PASS |
| CR-01 shapes through the real `fetchAlerts()` | Temporary probe test, deleted afterwards | 9/9 structural shapes resolve with the good alert kept | ✓ PASS |
| D-06 invariance | `git diff --stat f3b96d4 -- ServiceAlertRepository.ts ServiceAlertPollService.ts` | empty | ✓ PASS |
| Pre-existing test bodies unchanged | `git diff 10cc17d -- <3 alert test files> \| grep '^-[^-]'` | no removed lines | ✓ PASS |
| WR-04 edge | Same probe with 100k and 130k well-formed periods | 100k resolves; 130k rejects `RangeError: Maximum call stack size exceeded` | ⚠️ reproduced; classified below |

The orchestrator's post-execution gate reported `bun run build` exit 0 and `bun run test` 826/826. I did not re-run the full suite.

### Probe Execution

No probes are declared, and no `scripts/*/tests/probe-*.sh` exists. SKIPPED.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| ALRT-12 | 15-01, 15-03 | Alerts carrying `deletedAt` are never surfaced on route, stop or nearby-prediction responses | ✓ SATISFIED | Truths 1, 9, 12-14, 21, 28 |
| ALRT-13 | 15-01, 15-03 | A malformed `activePeriod` date is excluded and logged, not treated as active | ✓ SATISFIED | Truths 2, 5-8, 10, 22-26, 29 |
| NEAR-12 | 15-02 | The nearby guard drops entries with missing or mistyped display fields (including `agencyKey`) | ✓ SATISFIED | Truths 3, 15-20 |

The plan frontmatter declares {ALRT-12, ALRT-13, NEAR-12}. REQUIREMENTS.md maps exactly these three IDs to Phase 15 (lines 86-88). None is orphaned and none is missing.

### Prohibitions (test-tier)

| Prohibition | Enforcement evidence | Disposition |
|---|---|---|
| ALRT-12: no deletion metadata in summaries or logs | E2E body assertions; no warn on deleted rows; `ServiceAlert` has no deletion field | verified (wired test) |
| ALRT-13: no guessed or repaired window | Numeric/object bound rows and "one bad X among good" rows are dropped | verified (wired test) |
| ALRT-13 (15-03): never repair a malformed list (no wrapping a lone object, no skipping bad elements, no treating a present non-list as absent) | Rows for a lone unwrapped period object, one null among good periods, `"abc"`/`5`/`{}`, and a number among good informed entities. Each asserts the alert is dropped. | verified (wired test) |
| ALRT-12 (15-03): one structurally malformed alert must not fail the whole poll | Real-poll D-16 E2E (`errorSpy` not called; the soft-delete is applied) plus the probe | verified (wired test) |
| NEAR-12: no placeholder, coerced or fabricated display field | Unchanged from 15-02; tests pass | verified (wired test) |
| NEAR-12: no rider coordinates or raw entry in the drop warn | Exact warn string asserted | verified (wired test) |

### Anti-Patterns and Review Findings

There are no TBD/FIXME/XXX/TODO/HACK markers and no `.skip`/`.only` in any modified file.

| Finding | File | Severity | Classification and reasoning |
|---|---|---|---|
| WR-04: one alert with about 125k+ well-formed `activePeriods` overflows the `Math.min(...)`/`Math.max(...)` spreads in `deriveActiveWindow` (`:117,121`), so `fetchAlerts` rejects and the poll fails | `ServiceAlertService.ts` | ⚠️ Warning (non-blocking) | Reproduced at 130k periods. **Not a gap**, for four reasons. (1) D-16 and the 15-03 prohibition cover *structurally malformed* alerts. This alert is well-formed, so no locked decision or must-have is violated. (2) 15-03-PLAN assumption A3 explicitly carries the spread forward as accepted (T-15-07). (3) It needs a payload of several MB from the authenticated DASH feed for a single alert. (4) It is the same failure class as a DASH timeout or a D-07 id-less entity: any poll failure keeps the previous snapshot under the accepted architecture, so SC1 is not absolute against poll failures either way. **Recommended low-cost follow-up:** replace the spreads with a `reduce`/loop. It is a 2-line change, and it would let the "one alert cannot fail the poll" invariant actually be enforced instead of resting on every helper being total. |
| WR-01: an open `start` is ignored when another period has a start | `ServiceAlertService.ts:110-118` | ℹ️ Info | Pre-existing at f3b96d4. SC4 requires unchanged behavior. It narrows the window and never widens it. Out of scope for 15-03 per the plan. |
| WR-02: `new Date(s)` is lenient and depends on the host timezone for zone-less strings | `:63-65` | ℹ️ Info | Explicitly allowed by locked D-03 ("strict ISO not required") |
| WR-03: alert text fields are not runtime type-checked | `:143-147` | ℹ️ Info | Outside ALRT-12/13 and NEAR-12, which cover deletion, dates and nearby display fields. Candidate for a future hygiene item. |
| IN-01: upstream id interpolated into the warn line | `:208` | ℹ️ Info | Accepted as T-15-06 (authenticated feed) |
| IN-02 / IN-05: no aggregate signal when every alert is deleted or no ids remain | `:59-61`, `:134-139` | ℹ️ Info | D-09 and D-16 deliberately make these drops silent |
| IN-03 / IN-04: nearby `tripId`/`vehicleId` empty strings; repeated `isFiniteNumber` | `NearbyPredictionService.ts` | ℹ️ Info | Outside NEAR-12's display-field scope (D-11 to D-13) |

The earlier info note that `ServiceAlert.ts:18` overstated validation is resolved. The comment now reads "One element of a checked activePeriods list", which matches the code.

### Human Verification Required

None. The single prior item, CR-01 / 15-UAT test 1, was decided by the developer as D-16 and is now proven by code plus passing unit, E2E and probe evidence. `15-UAT.md` still shows test 1 as `result: [pending]`. The orchestrator should mark it resolved by D-16 / 15-03 when bundling this report.

### Gaps Summary

There are no gaps. All four roadmap success criteria and all 29 merged must-haves from 15-01, 15-02 and 15-03 hold in the codebase:

- **The CR-01 gap is closed.** A structurally malformed alert is now checked per alert, behind a compiler-enforced `unknown` boundary, and dropped on its own with one id-and-list warn. A same-poll soft-delete still takes effect through the real poll, which is what ALRT-12 needs.
- **Nothing regressed.** 15-01 and 15-02 behavior is intact: pre-existing test bodies are unchanged, the repository and poll are byte-identical to f3b96d4, and the nearby service is untouched since 15-02. The one 15-01 key-link pattern miss is the supersession 15-03 intended.
- **No review finding blocks the goal or a locked decision.**
  - WR-04 is a real but extreme-payload residual throw path, outside D-16's structural scope and accepted by plan assumption A3. It is recorded as a non-blocking warning with a recommended 2-line follow-up.
  - WR-01 to WR-03 and IN-01 to IN-05 are pre-existing, explicitly allowed by locked decisions, or outside the three requirements.

---

_Verified: 2026-10-07T20:05:23Z_
_Verifier: Claude (gsd-verifier)_
