# Phase 16: Concurrent SSE Stream Cap per IP - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md. This log preserves the alternatives considered.

**Date:** 2026-10-08
**Phase:** 16-concurrent-sse-stream-cap-per-ip
**Areas discussed:** Cap size & what counts, When a slot is taken/freed, 429 shape for the cap, Where the cap lives

---

## Cap size & what counts

| Option | Description | Selected |
|--------|-------------|----------|
| 5 | Review suggestion; fits a few tabs; bounds 5 extra polls/30s | ✓ |
| 3 | Tighter; may pinch a shared NAT | |
| 10 | Looser; more room for office/campus NAT | |

| Option | Description | Selected |
|--------|-------------|----------|
| Every open connection | Simplest; matches SC1/SC2; bounds sockets too | ✓ |
| Distinct stops only | Precise DASH bound; sockets unbounded; more bookkeeping | |

| Option | Description | Selected |
|--------|-------------|----------|
| Named module constant | Consistent with 14 D-12 / 13 D-07 | ✓ |
| Zod-validated env var | Tunable; new env surface | |

**User's choice:** 5, every connection, constant.

---

## When a slot is taken/freed

| Option | Description | Selected |
|--------|-------------|----------|
| On connect, before subscribe | Closes parallel-connect race; released on failure | ✓ |
| Only once 200 is written | Simpler; can overshoot under a burst | |

| Option | Description | Selected |
|--------|-------------|----------|
| Cap applies to every connect | Before stop validation; release on every error path | ✓ |
| Validate first, then cap | Bad request gets 400 even when capped | |

| Option | Description | Selected |
|--------|-------------|----------|
| Shared bucket first, then cap | Bucket counts every connect as today (SC3) | ✓ |
| Cap first, then bucket | Cap-rejected connects don't spend the budget | |

**User's choice:** Claim on connect, cap every connect, bucket first.

---

## 429 shape for the cap

| Option | Description | Selected |
|--------|-------------|----------|
| Retry-After short fixed value | ~5s like DataNotReadyError; backoff hint | ✓ |
| No Retry-After | Body text only | |

| Option | Description | Selected |
|--------|-------------|----------|
| Same error, distinct details | Same shape; details name the cap | ✓ |
| Identical to bucket 429 | Misleading "wait the window" | |

| Option | Description | Selected |
|--------|-------------|----------|
| Warn every rejection, IP + path only | Bounded by the 60/min bucket | ✓ |
| Warn first rejection while at cap | Less noise, extra state | |
| Debug only | Less visible | |

**User's choice:** Retry-After ~5s, distinct details, warn on each rejection.

---

## Where the cap lives

| Option | Description | Selected |
|--------|-------------|----------|
| Separate middleware | `streamConcurrencyCap.ts` factory; controller untouched | ✓ |
| Inside PredictionStreamController | Reuse cleanup closure; controller takes on policy | |

| Option | Description | Selected |
|--------|-------------|----------|
| Hand-rolled Map<ip, count> | express-rate-limit has no concurrency mode | ✓ |
| Find a concurrency-limit package | New dependency behind release-age gate | |

**User's choice:** Separate middleware, hand-rolled map.

---

## Claude's Discretion

- Exact details wording and the Retry-After value
- Whether the bucket's RateLimit headers on the cap's 429 are left as they are
- Whether a test-only count accessor is exposed
- Test design, within the minimum cases listed in CONTEXT.md

## Deferred Ideas

None.
