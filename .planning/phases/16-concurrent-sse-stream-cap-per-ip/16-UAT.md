---
status: complete
phase: 16-concurrent-sse-stream-cap-per-ip
source: [16-VERIFICATION.md]
started: 2026-10-12T16:59:41Z
updated: 2026-10-12T19:21:29Z
---

## Current Test

[testing complete]

## Tests

### 1. Live stream cap against real DASH
expected: 6th concurrent stream from one IP gets 429 with Retry-After: 5; closing one frees a slot immediately; remaining streams keep receiving ~30 s frames.
result: pass
evidence: "Verified by Claude against live DASH (stop 349, PORT=3917): 5 streams 200 text/event-stream; 6th -> 429 {error, details} Retry-After: 5; closed one -> replacement 200 at once, 7th still 429; all 5 open streams got frames at 18:54:37 and 18:55:07 (30 s); after closing all, new connect 200. Server logged the cap warn keyed ::/56."

### 2. Accept shared-IP trade-off (review WR-01 / threat T-16-07)
expected: Explicit sign-off that riders behind one shared address (bus Wi-Fi, carrier NAT, campus, IPv6 /56) share 5 concurrent streams, and the client does not auto-retry after a 429 — or a decision to change the keying/cap.
result: pass

### 3. Production proxy configuration
expected: Production TRUST_PROXY_HOPS matches the real reverse-proxy hop count, so the cap keys on the client IP rather than the proxy's IP (otherwise the whole service shares 5 streams).
result: skipped
reason: "not deployed yet — at deploy, set TRUST_PROXY_HOPS to the real proxy hop count and confirm the cap log key is the client's public IP"

## Summary

total: 3
passed: 2
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps

[none]
