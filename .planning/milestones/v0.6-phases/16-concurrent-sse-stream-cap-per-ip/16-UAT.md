---
status: complete
phase: 16-concurrent-sse-stream-cap-per-ip
source: [16-VERIFICATION.md]
started: 2026-10-12T16:59:41Z
updated: 2026-10-13T19:52:04Z
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

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]

## Moved Out

- Production proxy configuration (TRUST_PROXY_HOPS matches the real hop count) was removed from this UAT on 2026-10-13 at the user's request: it needs a production deploy that doesn't exist yet. It is tracked in `.planning/DEPLOY-CHECKLIST.md`.
