---
status: testing
phase: 10-solidify-vehicle-position-work
source: [10-VERIFICATION.md]
started: 2026-09-21T20:51:51Z
updated: 2026-09-21T20:51:51Z
---

## Current Test

number: 1
name: Live curl spot-check of GET /api/v1/vehicles against a running server with a real DASH_API_KEY
expected: |
  With DASH_API_KEY set and the server running:
  1. `curl -s "http://localhost:<PORT>/api/v1/vehicles?route=<known-short-name>"` returns 200 with vehicle objects containing lat/lon/heading/speed/vehicleType/lastUpdated (ISO-8601) and no tripId key, matching the verified SFMTA payload shape in 10-CONTEXT.md.
  2. `curl -s "http://localhost:<PORT>/api/v1/vehicles?route=NOT-A-REAL-ROUTE"` returns 404 with body `{ "error": "Not Found", "details": "Route not found: NOT-A-REAL-ROUTE" }`.
awaiting: user response

## Tests

### 1. Live curl spot-check of GET /api/v1/vehicles against a running server with a real DASH_API_KEY
expected: Valid route returns 200 with vehicle objects containing lat/lon/heading/speed/vehicleType/lastUpdated (ISO-8601) and no tripId key, matching the verified SFMTA payload shape in 10-CONTEXT.md. Unknown route returns 404 with { error: "Not Found", details: "Route not found: <value>" }.
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
