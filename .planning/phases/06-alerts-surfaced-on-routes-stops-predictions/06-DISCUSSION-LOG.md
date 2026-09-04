# Phase 6: Alerts Surfaced on Routes, Stops & Predictions - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-04
**Phase:** 6-Alerts Surfaced on Routes, Stops & Predictions
**Areas discussed:** Embedded alert detail level, Predictions alert representation, Route/stop matching against alerts, No-alerts empty state

---

## Embedded alert detail level

| Option | Description | Selected |
|--------|-------------|----------|
| Full ServiceAlert object | Entire object as-is: id, cause, effect, headerText, descriptionText, url, activePeriod | |
| Trimmed summary | Subset only — smaller payload, requires new response-shaping type | ✓ |

**Follow-up:** Which fields belong in the trimmed summary?

| Option | Description | Selected |
|--------|-------------|----------|
| id, effect, headerText, activePeriod | Minimal — omits cause, descriptionText, url | |
| id, effect, headerText, descriptionText, activePeriod | Adds description text | |
| (user's actual choice) id, cause, effect, headerText, descriptionText, activePeriod | User added `cause` back in, omitting only `url` | ✓ |

**User's choice:** Trimmed summary with `id, cause, effect, headerText, descriptionText, activePeriod` — everything except `url`.
**Notes:** None.

---

## Predictions alert representation

| Option | Description | Selected |
|--------|-------------|----------|
| Same alerts array, consistent with routes/stops | `alerts: AlertSummary[]` on predictions too | |
| Boolean flag only | `hasActiveAlert: boolean` instead | |

**User's choice:** Neither — user pushed back on the premise. "I'm thinking we don't need this. Predictions are based on a stop or route which would already have the alert data."

**Follow-up (scope conflict raised):** ALRT-09 is a locked requirement (REQUIREMENTS.md) and roadmap success criterion. Presented two ways to reconcile:

| Option | Description | Selected |
|--------|-------------|----------|
| Lightweight boolean flag only | Minimal `hasActiveAlert` field to satisfy ALRT-09 without duplicating data | |
| Drop ALRT-09 from this phase's scope | Edit ROADMAP.md/REQUIREMENTS.md to remove it — treat routes/stops embedding as sufficient | ✓ |

**User's choice:** Drop ALRT-09 from v1 scope. Applied during discussion:
- REQUIREMENTS.md: ALRT-09 removed from "Prediction Alerts" v1 section, added to "Alerts (future)" v2 section with a deferral note; traceability count updated 9→8.
- ROADMAP.md: Phase 6 "Requirements" line and success criteria updated to drop predictions; added an explicit note that predictions are unchanged this phase.

**Notes:** This was a scope change surfaced and resolved mid-discussion, not a pre-existing gray area — see D-05 in CONTEXT.md.

---

## Route/stop matching against alerts

**Sub-question 1 — which field to match on:**

| Option | Description | Selected |
|--------|-------------|----------|
| route.id | DASH internal route ID, same space as informedEntities.routeId | ✓ |
| route.shortName | Rider-facing short name/number | |

**User's choice:** `route.id`.
**Notes:** User first clarified the mechanism: "There's an informed_entity object in the entities payload. That contains a route_id and stop_id which would help match" — confirming this is exactly what `ServiceAlert.informedRouteIds`/`informedStopIds` already capture from Phase 5's `DashInformedEntity` mapping.

**Sub-question 2 — unscoped (agency-wide) alerts:**

| Option | Description | Selected |
|--------|-------------|----------|
| Show on every route and stop | Treat empty informedRouteIds/informedStopIds as agency-wide | |
| Show on nothing | Never surfaced on any route/stop in this phase; stays ingested | ✓ |

**User's choice:** Show on nothing.
**Notes:** None.

---

## No-alerts empty state

| Option | Description | Selected |
|--------|-------------|----------|
| Always present, empty array | `alerts: []` always included | ✓ |
| Omit field when empty | `alerts` field absent when no active alerts | |

**User's choice:** Always present, empty array.
**Notes:** None.

---

## Claude's Discretion

- Exact repository/service method signatures for filtering alerts by route/stop ID (new repository method vs. filtering in a new service layer) — left to planning/architecture, following existing layered/DI conventions.

## Deferred Ideas

- ALRT-09 (predictions alert flag) — moved to REQUIREMENTS.md v2 "Alerts (future)" section. Can be revisited in a later milestone if a dedicated predictions-alert signal turns out to be needed.
