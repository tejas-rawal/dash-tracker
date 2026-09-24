---
status: complete
phase: 11-nearby-stop-predictions
source: [11-VERIFICATION.md]
started: 2026-09-24T16:32:51Z
updated: 2026-09-24T16:38:06Z
---

## Current Test

[testing complete]

## Tests

### 1. Live smoke test with a real DASH_API_KEY
Run `bun run dev-server`, then `curl -s 'http://localhost:${PORT:-3000}/api/v1/predictions/nearby?lat=38.8048&lng=-77.0469&radius=0.25&number=3'`, and watch the server log.
expected: 200. Stops come back nearest-first with stop 548 at or near the top, every distance under 0.25, routes grouped per stop, and an alerts array on every stop. No 'Dropping malformed nearby prediction entry' warn for normal live data (a warn would mean live predictions omit a field the 11-03 guard requires, such as vehicleId). '?lat=&lng=-77.0469' returns 400, and radius=5 returns 400.
result: pass
evidence: "Agent-run against live DASH API. 200; 4 stops nearest-first (548 at 0.029mi, 561, 949, 413; max 0.232 < 0.25); routes grouped per stop (548: 30,31,KST); alerts array on every stop; zero 'Dropping malformed' warns; lat= -> 400, radius=5 -> 400."

### 2. Stop-ID-space cross-check (SC1 remainder)
With the dev server running, confirm the stop ids from /predictions/nearby (e.g. '548', '561') appear as BusStop.id values in GET /api/v1/routes/all (or /routes/30). While any stop-scoped alert is active, confirm it appears on the matching nearby stop.
expected: Nearby stopIds are the same strings as BusStop.id and the GTFS-RT informedStopIds that ServiceAlertRepository matches on, so NEAR-06 alert embedding works on live data.
result: pass
evidence: "Agent-run. Nearby ids 548/561/949/413 each match exactly one BusStop.id in /routes/all with the same name. Live NO_SERVICE construction alert (City Hall/Market Sq) embedded on nearby stop 949."

### 3. Client disconnect mid-flight
Send a nearby request and abort the client before the upstream call returns (use a slow or blackholed DASH_API_BASE_URL). Watch the server logs.
expected: No unhandled promise rejection, no retry, no lingering state. res.json on the closed socket is a no-op.
result: pass
evidence: "Agent-run via 8s delay proxy on predictions-near-location; curl aborted at 2s. Single upstream call (no retry), no unhandled rejection/error/warn in server log after upstream completed, server kept serving (GET /routes/30 -> 200)."

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]
