---
status: testing
phase: 14-health-checks-rate-limiting
source: [14-VERIFICATION.md]
started: 2026-10-06T20:47:56Z
updated: 2026-10-06T20:47:56Z
---

## Current Test

number: 1
name: Open SSE stream survives its IP being rate-limited
expected: |
  With route/stop data loaded and a DASH stub answering, an open GET /api/v1/predictions/stream?stop=<loaded stop> from IP A keeps receiving prediction events (at least one 30s poll cycle) after IP A is pushed to 429 by 61+ GET /api/v1/predictions requests. The stream is not closed, errored or written to by the limiter; only new /stream connects from IP A get 429.
awaiting: user response

## Tests

### 1. Open SSE stream survives its IP being rate-limited
expected: The open stream keeps receiving prediction events after IP A is at 429; it is not closed, errored or written to by the limiter. Only new /stream connects from IP A get 429.
result: [pending]

### 2. Decide on /predictions/stream fan-out residual risk (review WR-02)
expected: Either an explicit acceptance recorded in 14-CONTEXT.md (D-11 locks per-connect counting; SC3 names only /predictions, /predictions/nearby, /vehicles), or a follow-up scheduled to cap concurrent streams per IP.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
