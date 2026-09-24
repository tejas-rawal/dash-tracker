# Phase 11: Nearby Stop Predictions - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-23
**Phase:** 11-nearby-stop-predictions
**Areas discussed:** Live payload verification, Stop data source & unknown stops, Limits & empty stops, Response envelope shape

---

## Live payload verification

| Option | Description | Selected |
|--------|-------------|----------|
| I'll paste a live response | Curl with DASH key, paste JSON; lock types during discuss | ✓ |
| Plan a live-probe task first | Plan 1 checkpoint task to capture fixture | |
| Researcher uses Swiftly docs | Phase 8 anti-pattern | |

**User's choice:** Pasted a live `alexandria-dash` response (see CONTEXT.md `<specifics>`).

| Option (stop-ID mismatch contingency) | Description | Selected |
|--------|-------------|----------|
| Map through the repository | Resolve upstream stop → local BusStop for alerts | ✓ |
| Stop and re-discuss | Treat as blocker | |
| You decide | | |

**Notes:** Live payload showed flat per-(route, stop) entries, `distanceToStop` in meters, `blockId` extra field, same stop-ID space as `BusStop.id` — contingency not needed.

---

## Stop data source & unknown stops

| Question | Options | Selected |
|----------|---------|----------|
| Distance source | Convert upstream `distanceToStop` / Local haversine | Convert upstream |
| Unknown local stop | Keep with `alerts: []` / Drop | Keep |
| Stop lat/lon | No (id/name/code/distance) / Yes from local BusStop | No |
| `blockId` | Ignore / Add to DashPrediction+Prediction | Ignore |

---

## Limits & empty stops

| Question | Options | Selected |
|----------|---------|----------|
| Radius cap | 1 mi / 2 mi / 0.5 mi | 1 mi |
| Over cap | 400 / Clamp | 400 |
| `number` | Positive int cap 10, omit if absent / No cap / Default 3 | Cap 10, omit if absent |
| Empty stops/destinations | Include / Drop | Include |

---

## Response envelope shape

| Question | Options | Selected |
|----------|---------|----------|
| Envelope | Mirror StopPredictionsResponse / Flat | Mirror |
| RoutePrediction per stop | Reuse unchanged / Omit stop fields | Reuse unchanged |
| Distance format | Unrounded / 2 decimals | Unrounded |

---

## Claude's Discretion

- New service/handler vs. extending PredictionService; route order within a stop; log wording; meters rounding.

## Deferred Ideas

- Exposing `blockId`; stop coordinates on nearby predictions; NEAR-10/NEAR-11 (already tracked).
