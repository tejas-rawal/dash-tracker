# Phase 5: Service Alerts Ingestion - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-01
**Phase:** 5-Service Alerts Ingestion
**Areas discussed:** Active window derivation, Severity/cause representation, Startup blocking behavior

---

## Active window derivation

| Option | Description | Selected |
|--------|-------------|----------|
| Earliest start → latest end | Union of all periods into one enclosing window. Simple, errs toward showing the alert whenever any part of it could be relevant. | ✓ |
| Keep only the first period | Use active_period[0] verbatim, ignore the rest. | |
| Store all periods, no collapsing | ServiceAlert.activeWindow becomes an array instead of a single start/end. | |

**User's choice:** Earliest start → latest end
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Open-ended window | start = fetch/publish time (or null), end = null/undefined — always-active. | ✓ |
| Skip the alert entirely | Alerts without explicit bounds are dropped from the store. | |

**User's choice:** Open-ended window
**Notes:** —

---

## Severity/cause representation

| Option | Description | Selected |
|--------|-------------|----------|
| Pass through raw strings | Store DASH's cause/effect strings as-is, typed `string \| undefined`. | ✓ |
| Define a typed union/enum | Enumerate known GTFS-RT cause/effect values as a TS union, normalize unknowns. | |

**User's choice:** Pass through raw strings
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Carry cause/effect only, no derived severity | ALRT-03 only asks for "severity/cause when provided" — no invented ranking. | ✓ |
| Compute a derived severity field now | Add `severity: 'low'\|'medium'\|'high'` computed from effect at ingestion time. | |

**User's choice:** Carry cause/effect only, no derived severity
**Notes:** —

---

## Startup blocking behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Non-blocking: start immediately | Server accepts requests right away; alert store fills in on the first poll tick. | ✓ |
| Blocking: await first fetch before listen() | Mirrors BusDataRepository's startup-blocking pattern exactly. | |

**User's choice:** Non-blocking: start immediately
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Immediate first fetch, then every 5 min | Fire once at startup (fire-and-forget), then setInterval(5min). | ✓ |
| Wait for first interval tick | Pure setInterval(5min); store stays empty up to 5 min after every restart. | |

**User's choice:** Immediate first fetch, then every 5 min
**Notes:** —

---

## Claude's Discretion

- Poll failure & staleness behavior — not selected for discussion. Default: mirror `PredictionStreamService.poll()` — log via Winston, keep serving last known alerts on a failed fetch.
- Exact DASH/Swiftly service-alerts endpoint path/response shape — not yet documented in this repo; left to research.

## Deferred Ideas

None — discussion stayed within phase scope.
