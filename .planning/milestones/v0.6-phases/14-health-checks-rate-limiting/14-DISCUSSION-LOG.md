# Phase 14: Health Checks & Rate Limiting - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md. This log keeps the alternatives that were considered.

**Date:** 2026-10-06
**Phase:** 14-health-checks-rate-limiting
**Areas discussed:** Probe paths & readiness body, Staleness threshold, Rate-limit shape, Client IP behind a proxy

---

## Probe paths & readiness body

| Option | Description | Selected |
|--------|-------------|----------|
| /api/v1/health/live + /ready | New healthRoutes in the v1 router, following the existing layering | ✓ |
| Root /livez + /readyz | Kubernetes-style, unversioned, registered in app.ts | |
| Root /health + /health/ready | Unversioned, PaaS-conventional | |

| Option | Description | Selected |
|--------|-------------|----------|
| Status + age + timestamps | status, reason, dataAgeSeconds, lastLoadedAt, lastFailedAt (no lastError) | ✓ |
| Full load-state snapshot | Same as above plus lastError | |
| Minimal | status + dataAgeSeconds only | |

| Option | Description | Selected |
|--------|-------------|----------|
| { status: 'ok' } | Constant liveness body | ✓ |
| { status, uptimeSeconds } | Adds process uptime | |

| Option | Description | Selected |
|--------|-------------|----------|
| Route/stop data only | Gate exactly per HLTH-02 | ✓ |
| Report alerts too, gate on routes only | Informational alerts age | |

**User's choice:** Every recommended option.

---

## Staleness threshold

| Option | Description | Selected |
|--------|-------------|----------|
| 3 hours | Tolerates missed hourly refreshes | ✓ |
| 2 hours | Tighter | |
| 24 hours | Very lenient | |

| Option | Description | Selected |
|--------|-------------|----------|
| Named module constant | Same as 13 D-07 | ✓ |
| Zod env var with default | Operator-tunable | |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, keep refresh as-is | Phase 14 reads state only | ✓ |
| Retry sooner after a failed refresh | Would change Phase 13's scheduler | |

**Notes:** The question text said "two straight failures". The correct number is three: with a 3h threshold and hourly refreshes, readiness flips only after three consecutive failed refreshes. The user was told about this correction.

---

## Rate-limit shape

| Option | Description | Selected |
|--------|-------------|----------|
| express-rate-limit | Established middleware with an in-memory store | ✓ |
| Hand-rolled fixed-window map | No dependency | |

| Option | Description | Selected |
|--------|-------------|----------|
| One shared bucket | Shared budget for all DASH-triggering calls per IP | ✓ |
| Separate bucket per endpoint | Three budgets | |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, count SSE connection opens | Limits reconnect storms | ✓ |
| No, leave it out | Literal RATE-01 list | |

| Option | Description | Selected |
|--------|-------------|----------|
| 60 / 1 min | About one request per second on average | ✓ |
| 30 / 1 min | Tighter | |
| 120 / 1 min | Looser | |

| Option | Description | Selected |
|--------|-------------|----------|
| Match existing error shape | { error: 'Too Many Requests', details } + Retry-After | ✓ |
| Library default | Plain-text message | |

| Option | Description | Selected |
|--------|-------------|----------|
| Standard RateLimit headers | IETF draft headers, no legacy X-RateLimit-* | ✓ |
| Only Retry-After on 429 | Minimal | |

| Option | Description | Selected |
|--------|-------------|----------|
| One warn per IP per window | Surfaces abuse without noise | ✓ |
| No logging | | |
| Warn on every 429 | | |

**User's choice:** Every recommended option.

---

## Client IP behind a proxy

| Option | Description | Selected |
|--------|-------------|----------|
| Zod env var TRUST_PROXY_HOPS (default 0) | Configurable hop count, spoof-safe default | ✓ |
| Hard-code trust proxy = 1 | Assumes exactly one proxy | |
| Leave off | Socket IP only | |

| Option | Description | Selected |
|--------|-------------|----------|
| Not decided yet | Stay deployment-agnostic | ✓ |
| Behind a single LB/PaaS proxy | | |
| Directly exposed | | |

---

## Claude's Discretion

- The limiter module's name and location, and the factory plus shared-instance wiring
- How to detect the first rejection in a window for logging
- Readiness 503 `Retry-After` and `Cache-Control: no-store`
- `dataAgeSeconds` rounding, and clock injection vs fake timers
- How work is split between the health service and the controller

## Deferred Ideas

- Retrying sooner after a failed post-load refresh (Phase 13 scheduler change)
- Alert-poll freshness in readiness
