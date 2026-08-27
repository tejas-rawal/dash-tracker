# Phase 3: Stop Discovery - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-26
**Phase:** 3-Stop Discovery
**Areas discussed:** Endpoint & route design, Stop ordering for a route, Nearby-search defaults & response shape

---

## Endpoint & Route Design

| Option | Description | Selected |
|--------|-------------|----------|
| Nest under routes: `GET /api/v1/routes/:shortName/stops` | Mirrors existing `GET /api/v1/routes/:shortName` pattern | ✓ |
| New top-level: `GET /api/v1/stops?route=:shortName` | Matches predictionRoutes.ts query-param style | |

**User's choice:** Nest under routes.
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| `GET /api/v1/stops/nearby?lat=&lng=&radius=&count=` | New stops resource, query-string params | ✓ |
| Fold into routes router (e.g. `/routes/nearby`) | Keeps everything under existing routes router | |

**User's choice:** New `/api/v1/stops/nearby` endpoint.
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| New `StopController` + `StopService` | Dedicated pair, keeps routes.ts thin | ✓ |
| Add methods to existing `BusRouteController`/`BusRouteService` | Reuse since URL nests under `/routes` | |

**User's choice:** New StopController + StopService.
**Notes:** —

---

## Stop Ordering for a Route

| Option | Description | Selected |
|--------|-------------|----------|
| Group by direction — each direction's ordered stop list separately | Preserves real per-direction ordering | ✓ |
| Single flat deduped list (reuse `getAllStops()`) | Simplest but order is only accurate for one direction | |

**User's choice:** Group by direction.
**Notes:** Response shape: `[{ directionId, title, stops: [...] }]`.

---

## Nearby-Search Defaults & Response Shape

| Option | Description | Selected |
|--------|-------------|----------|
| 500 meters default radius | ~6 min walk | |
| 0.5 miles default radius | US-friendly for DASH riders | ✓ |

**User's choice:** 0.5 miles default.

| Option | Description | Selected |
|--------|-------------|----------|
| Default 10, max 50 | Enough for a picker without over-fetching | ✓ |
| Default 5, max 20 | Tighter, compact mobile picker | |

**User's choice:** Default 10, max 50.

| Option | Description | Selected |
|--------|-------------|----------|
| Include computed distance in each result | Client can display "0.2 mi away", confirms sort order | ✓ |
| Omit distance, just return proximity-sorted stops | Simpler shape | |

**User's choice:** Include distance.

| Option | Description | Selected |
|--------|-------------|----------|
| `radius` param in miles | Matches the mile-based default | ✓ |
| `radius` param in meters | More standard for geo APIs generally | |

**User's choice:** Miles.

---

## Claude's Discretion

- Exact validation error messages/boundaries for lat/lng/radius/count — follow `parseNumberParam` convention from `PredictionController`.
- Internal haversine/distance-calculation implementation approach (no geo library currently in `package.json`).

## Deferred Ideas

None — discussion stayed within phase scope.
