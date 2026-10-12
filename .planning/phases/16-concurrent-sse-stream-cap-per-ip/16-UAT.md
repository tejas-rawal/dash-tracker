---
status: testing
phase: 16-concurrent-sse-stream-cap-per-ip
source: [16-VERIFICATION.md]
started: 2026-10-12T16:59:41Z
updated: 2026-10-12T16:59:41Z
---

## Current Test

number: 1
name: Live stream cap against real DASH
expected: |
  With a real .env, open 5 curl streams on GET /api/v1/predictions/stream (e.g. stop 349). A 6th connect from the same IP gets 429 { error, details } with Retry-After: 5. Closing one stream lets a new connect open immediately, while the other 4 keep receiving frames every ~30 s.
awaiting: user response

## Tests

### 1. Live stream cap against real DASH
expected: 6th concurrent stream from one IP gets 429 with Retry-After: 5; closing one frees a slot immediately; remaining streams keep receiving ~30 s frames.
result: [pending]

### 2. Accept shared-IP trade-off (review WR-01 / threat T-16-07)
expected: Explicit sign-off that riders behind one shared address (bus Wi-Fi, carrier NAT, campus, IPv6 /56) share 5 concurrent streams, and the client does not auto-retry after a 429 — or a decision to change the keying/cap.
result: [pending]

### 3. Production proxy configuration
expected: Production TRUST_PROXY_HOPS matches the real reverse-proxy hop count, so the cap keys on the client IP rather than the proxy's IP (otherwise the whole service shares 5 streams).
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
