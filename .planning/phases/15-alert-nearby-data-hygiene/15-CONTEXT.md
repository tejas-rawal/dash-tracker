# Phase 15: Alert & Nearby Data Hygiene - Context

**Gathered:** 2026-10-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Riders never see alerts that DASH soft-deleted (`deletedAt` present) or whose `activePeriods` dates can't be parsed. They also never see nearby-prediction entries whose display fields are missing, mistyped, or empty. This closes three carried-forward tech-debt items: ALRT-12 (soft-delete filter), ALRT-13 (Phase 9 WR-02, malformed dates) and NEAR-12 (v0.5 WR-01, display-field guard).

The phase touches only `ServiceAlertService` (alert ingestion), the `DashAlertEntity` model, and the nearby entry guard in `NearbyPredictionService`. There are no new endpoints, no response-shape changes, and no change for well-formed data (success criterion 4).

**Discovered during scouting (changes the ALRT-13 framing):** malformed dates do not currently fail open at the repository. `deriveActiveWindow()` calls `new Date(NaN).toISOString()`, which throws `RangeError`. That makes the whole `fetchAlerts()` fail, the poll logs an error, and `ServiceAlertRepository` keeps serving the **previous** alert set. One bad alert therefore freezes all alert updates, including the arrival of new deletions, until DASH fixes it. The `isAlertActive` NaN fail-open that WR-02 describes cannot be reached through the service today.

</domain>

<decisions>
## Implementation Decisions

### Bad-alert granularity (ALRT-13)
- **D-01:** A malformed date **drops only that alert**. Every other alert in the poll is applied normally. This replaces today's behavior, where the `RangeError` fails the whole poll. Alerts are only an enrichment, so one bad record must not freeze every update. (This differs deliberately from the all-or-nothing rule for route/stop data in 13 D-12.)
- **D-02:** If **any** `activePeriods` entry has a malformed `start` or `end`, the **whole alert** is dropped. The bad period is not skipped while the rest are collapsed, because the collapsed earliest-start / latest-end window can't be trusted.
- **D-03:** A date is **malformed** when it is present (not `null`/`undefined`) and is either not a string or a string that `new Date(s)` can't parse (`Number.isNaN(getTime())`). `null`/`undefined` still means unbounded on that side (existing Phase 8 behavior: zero periods → always active). Strict ISO-8601 is **not** required.
- **D-04:** Each dropped malformed alert logs **one `warn` per poll**. This is stateless, with no "already warned" set, so a persistent bad alert logs about every 5 minutes, and that is accepted. The line names the **alert id** and which bound was bad (for example start or end). It does not dump the raw entity.

### Where filtering lives
- **D-05:** Deleted and malformed alerts are dropped **at ingestion, in `ServiceAlertService.fetchAlerts()`**, before or while mapping. The repository only ever stores clean alerts, and one choke point covers route, stop, nearby-stop and nearby-prediction responses (success criteria 1–2). `ServiceAlert` (the domain model) does **not** gain a `deletedAt` field.
- **D-06:** `ServiceAlertRepository` (`isAlertActive`) is **not changed**. The contract of `ServiceAlert.activePeriod` becomes "valid ISO string or null", enforced at the single entry point, and there is no second, redundant check in the repository (the project's no-redundant-layers principle). WR-02 closes because invalid input can no longer get in. Tests must prove the service never emits an invalid bound.
- **D-07:** An entity without a string `id` **still fails the whole poll** (`isValidDashAlertEntity` → `UpstreamApiError`), as it does today. That is a structural break with no id to log, and changing it is outside ALRT-12/13.

### deletedAt semantics (ALRT-12)
- **D-08:** An alert is deleted when `deletedAt` is **anything other than `null`/`undefined`**. A past, future or garbled timestamp, an empty string, or a non-string all count. The value is never parsed, so the check fails safe. Add `deletedAt?: unknown` (or a similarly honest type) to `DashAlertEntity`. `deletedBy` is ignored.
- **D-09:** Dropping a soft-deleted alert is **not logged**. Deletion is a routine state of the feed, not a data error. Tests prove the filtering.
- **D-10:** The **deleted check runs before date validation**. A deleted alert with a bad date is dropped silently and never triggers the D-04 warn.

### Nearby guard strictness (NEAR-12)
- **D-11:** `isValidNearbyEntry` also checks `routeId`, `routeName`, `routeShortName` and `stopName`. Each must be a **non-empty string**, the same rule `stopId` already uses (`typeof === "string" && !== ""`).
- **D-12:** `stopCode` must be a **finite number** (reuse `isFiniteNumber`). There is no integer or sign rule.
- **D-13:** Each destination's `directionId` and `headsign` must also be **non-empty strings**. A bad destination invalidates the **whole entry**, consistent with the existing rule that one bad prediction drops the entry.
- **D-14:** The drop warn stays **exactly as it is**: one `warn` per dropped entry, `Dropping malformed nearby prediction entry (stop X, route Y)`. The guard remains a boolean type predicate and does not report which field failed. Valid entries in the same response are still returned.
- **D-15:** `agencyKey` is **already handled**: `parseDashResponse` throws `UpstreamApiError` (502) when it is not a string, which fixed WR-01's cast. No change is needed. The planner only confirms that test coverage exists.

### Claude's Discretion
- Exact code structure of the ingestion filter: one `partition`/`flatMap` pass vs. separate `isDeleted` / `hasValidDates` helpers, and whether `deriveActiveWindow` takes pre-validated input or validates inline. D-02/D-03/D-10 must hold either way.
- Exact wording of the malformed-date warn, as long as it includes the alert id and is message-only.
- Whether a small shared `isNonEmptyString` helper is added in `NearbyPredictionService.ts`.
- Whether an empty `headsign` would be legitimate upstream. The decision is to reject it (D-13). If research finds live evidence that DASH sends empty headsigns, flag it back to the user rather than silently loosening the rule.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and roadmap
- `.planning/ROADMAP.md` § Phase 15: goal and 4 success criteria
- `.planning/REQUIREMENTS.md`: ALRT-12, ALRT-13, NEAR-12

### Original findings being closed
- `.planning/milestones/v0.4-phases/09-alerts-surfaced-on-routes-stops-predictions/09-REVIEW.md` § WR-02: malformed `activePeriod` fail-open in `isAlertActive`
- `.planning/milestones/v0.5-phases/11-nearby-stop-predictions/11-REVIEW.md` § WR-01: guard lets missing route/stop/destination fields through; `agencyKey` cast
- `.planning/milestones/v0.4-phases/08-service-alerts-ingestion/08-06-SUMMARY.md`: confirmed live alert payload shape (flat Swiftly format, ISO-8601 `activePeriods`, `deletedAt`/`deletedBy` present but ignored)
- `.planning/STATE.md`: open concern about soft-deleted alerts (Phase 8 → scheduled here)

### Prior phase decisions that constrain this one
- `.planning/phases/12-bounded-upstream-calls-error-safety-nets/12-CONTEXT.md` D-06/D-12: message-only errors and logs, never serialize upstream objects
- `.planning/phases/13-resilient-route-stop-data-lifecycle/13-CONTEXT.md` D-12: all-or-nothing for route/stop data (deliberately **not** applied to alerts, see D-01)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `isRecord`, `isFiniteNumber`, `isValidPrediction` in `src/server/api/services/NearbyPredictionService.ts`: extend `isValidNearbyEntry` in the same style (`typeof` checks, no Zod, per Phase 11 D-18).
- `describeEntry` in `NearbyPredictionService.ts` already produces the "stop X, route Y" warn text. Keep it.
- Test fixtures in `ServiceAlertService.test.ts` and `NearbyPredictionService.test.ts` use the confirmed live shapes. Extend them; don't invent new shapes.

### Established Patterns
- `ServiceAlertService.fetchAlerts()` validates the envelope (`entities` array, `id` string) and then maps with `mapToServiceAlert` → `deriveActiveWindow`. The new per-alert filtering slots in between.
- `ServiceAlertPollService` catches any `fetchAlerts()` throw and keeps the previous set. With D-01, a malformed date no longer reaches that path.
- `ServiceAlertRepository.applyAlerts()` does an atomic full-replacement swap. It stays unchanged (D-06).
- `NearbyPredictionService.filterValidEntries()` drops an entry and logs one warn per dropped entry. It stays unchanged (D-14).

### Integration Points
- `src/server/api/models/ServiceAlert.ts`: add `deletedAt` to `DashAlertEntity` only.
- `src/server/api/services/ServiceAlertService.ts`: deleted filter, date validation, per-alert drop with warn.
- `src/server/api/services/NearbyPredictionService.ts`: `isValidNearbyEntry` gains the display-field checks.
- Downstream consumers, which are unchanged but covered by success criterion 1: BusRoute/Stop services (route and stop alerts), `PredictionService` (alerts on predictions), `NearbyPredictionService.groupByStop` (nearby-stop alerts), all through `ServiceAlertRepository.getActiveAlertsFor*`.

</code_context>

<specifics>
## Specific Ideas

- Fail safe wherever there's doubt: a garbled `deletedAt` hides the alert, and a garbled date drops the alert. Hiding a questionable alert is preferred over showing a wrong one.
- Logs: warn only for real data-quality problems (malformed dates, malformed nearby entries). Routine states (soft-deleted alerts) stay silent.

</specifics>

<deferred>
## Deferred Ideas

- **v0.5 WR-03:** when every entry for a nearby stop is dropped, that stop's locally sourced service alerts disappear with it. This is a side effect of the whole-entry drop policy. It is out of scope here (NEAR-12 only tightens the guard), but D-11–D-13 make drops slightly more likely, so it's worth a future look.
- Per-entity dropping for alerts with a missing `id` (instead of failing the whole poll): considered and kept as is (D-07).

</deferred>

---

*Phase: 15-alert-nearby-data-hygiene*
*Context gathered: 2026-10-07*
