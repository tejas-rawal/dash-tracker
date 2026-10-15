# Phase 15: Alert & Nearby Data Hygiene - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-07
**Phase:** 15-alert-nearby-data-hygiene
**Areas discussed:** Bad-alert granularity, Where filtering lives, deletedAt semantics, Nearby guard strictness

Scouting note shown to the user before the questions: a malformed date currently throws a `RangeError` in `deriveActiveWindow`. That fails the whole alert poll, and the stale previous set keeps serving. The repository's `isAlertActive` fail-open can't be reached.

---

## Bad-alert granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Drop that alert only | Exclude the bad alert, log its id, apply the rest | ✓ |
| Fail the whole poll | Keep all-or-nothing, but with a clear error | |

| Option | Description | Selected |
|--------|-------------|----------|
| Drop the whole alert | Any bad period → alert excluded | ✓ |
| Ignore just the bad period | Collapse from the remaining valid periods | |

| Option | Description | Selected |
|--------|-------------|----------|
| One warn per bad alert per poll | Stateless, about 12 lines/hour | ✓ |
| Warn once per alert id | Dedupe state | |
| One summary warn per poll | Single line listing ids | |

| Option | Description | Selected |
|--------|-------------|----------|
| Not a string, or Date can't parse it | null/undefined = unbounded | ✓ |
| Strict ISO-8601 only | Regex/library | |

**User's choice:** all recommended options.

---

## Where filtering lives

| Option | Description | Selected |
|--------|-------------|----------|
| At ingestion (ServiceAlertService) | Repository stores only clean alerts | ✓ |
| At read time (repository) | Store everything, filter in getActiveAlerts | |

| Option | Description | Selected |
|--------|-------------|----------|
| Leave the repository as is | Contract enforced at the single entry point | ✓ |
| Also make the repository fail closed | Defensive isNaN check | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep whole-poll failure for a bad id | Structural break, existing behavior | ✓ |
| Drop per entity as well | Consistent, but scope creep | |

---

## deletedAt semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Anything other than null/undefined | Fail safe, never parsed | ✓ |
| Only a parseable past timestamp | Precise, fails open on garbage | |

| Option | Description | Selected |
|--------|-------------|----------|
| No per-alert log | Routine state | ✓ |
| Debug-level count per poll | | |
| Info line per poll with count | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Deleted check first (no warn) | Dead data, nothing to fix | ✓ |
| Warn regardless | | |

---

## Nearby guard strictness

| Option | Description | Selected |
|--------|-------------|----------|
| Missing, wrong type, or empty string | Matches the stopId rule | ✓ |
| Missing or wrong type only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Check directionId/headsign too, drop the whole entry | Closes the WR-01 gap | ✓ |
| Allow an empty headsign | | |
| Entry-level fields only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| stopCode is a finite number | Reuse isFiniteNumber | ✓ |
| Non-negative integer | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep the warn exactly as is | Boolean guard, unchanged log | ✓ |
| Add the failing field name | | |

---

## Claude's Discretion

- Code structure of the ingestion filter and the date-validation helper
- Exact malformed-date warn wording (must include the alert id, message-only)
- Whether to add an optional `isNonEmptyString` helper

## Deferred Ideas

- v0.5 WR-03: a stop's alerts disappear when all of its nearby entries are dropped
- Per-entity drop for alerts missing an `id`
