# Phase 11: Nearby Stop Predictions - Context

**Gathered:** 2026-09-23
**Status:** Ready for planning

<domain>
## Phase Boundary

New `GET /api/v1/predictions/nearby?lat&lng&radius&number` endpoint: one live, uncached call to DASH/Swiftly `real-time/{agency}/predictions-near-location` per request, regrouped into a nearest-first list of stops, each with id/name/code, `distance` (miles), route → destination predictions (existing `RoutePrediction`/`Destination` shapes), and embedded active `ServiceAlertSummary[]` alerts, plus top-level `generatedAt`. Input validation → 400, upstream failure → 502. Covers NEAR-01..NEAR-09.

Unchanged: `GET /api/v1/stops/nearby`, `GET /api/v1/predictions`, `/predictions/stream`. No SSE, no recents logging, no route filter.

</domain>

<decisions>
## Implementation Decisions

### Live payload (verified — Success Criterion 1 satisfied during discussion)
- **D-01:** The upstream shape was confirmed from a live `alexandria-dash` response supplied by the user during this discussion (see `<specifics>` for the verbatim sample). Dash* types and test fixtures MUST mirror it — do not re-derive from Swiftly docs.
- **D-02:** Envelope is identical to the existing `DashApiResponse` (`{ success, route, data: { agencyKey, predictionsData[] } }`). `predictionsData` is **flat, one entry per (route, stop) pair** — the same stop appears once per route serving it (stop `548` appeared 3× for routes 30/31/KST). Each entry is a `DashPredictionData` plus `distanceToStop: number` (**meters**). The service must group entries by `stopId` into one stop per ID, collecting each entry as a `RoutePrediction` under that stop. Model the upstream entry as a new type extending/mirroring `DashPredictionData` with `distanceToStop` (e.g. `DashNearbyPredictionData`), keeping `Dash*` types separate from response types.
- **D-03:** Upstream query params: `lat`, `lon` (note: upstream uses `lon`; our public API uses `lng`, matching `/stops/nearby`), `meters`, optional `number`. Confirmed working: `?lat=38.8048&lon=-77.0469&meters=400&number=3`.
- **D-04:** Upstream `stopId` is in the same ID space as `BusStop.id` (same IDs `PredictionService` already validates via `getStopById` and forwards upstream); `stopCode` is numeric like `BusStop.code`. Alerts are looked up with `serviceAlertRepository.getActiveAlertsForStop(stopId)` directly on the upstream `stopId`. Contingency if a future payload ever breaks this: map through `BusDataRepository` (by code) rather than dropping alerts.
- **D-05:** `blockId` appears on every live prediction — **ignore it**. `DashPrediction` / `Prediction` stay unchanged (changing them would alter `/predictions` and SSE responses, out of scope).

### Stop data source
- **D-06:** Stop `id`/`name`/`code` come from the upstream entry (`stopId`/`stopName`/`stopCode`). `distance` = upstream `distanceToStop` converted meters → miles. No local haversine.
- **D-07:** The nearby service does NOT need `BusDataRepository`. Stops unknown to the local repository are **kept** (alerts naturally resolve to `[]`). Dependencies: `ServiceAlertRepository` only (factory DI).
- **D-08:** No `lat`/`lon` on response stops — id, name, code, distance, routes, alerts only (upstream sends no coordinates).
- **D-09:** Stops sorted ascending by distance (sort explicitly; don't rely on upstream order). Route order within a stop: Claude's discretion (preserve upstream order is fine).

### Limits & empty results
- **D-10:** `radius` in miles, default 0.5, **max 1 mile**; must be a positive finite number. `radius > 1` → **400** (not clamped). Converted to integer-or-decimal `meters` for upstream (1 mi = 1609.344 m).
- **D-11:** `number`: optional positive integer, **max 10**; > 10 or invalid → 400. When absent, omit it from the upstream URL (Swiftly default applies).
- **D-12:** `lat`/`lng`: required, finite, in range (-90..90 / -180..180); missing, empty-string, or non-numeric → 400. Validation happens in the controller before any upstream call (reuse/extract the `parseCoordinateParam`/`parsePositiveFloatParam` pattern from `StopController`; `Number("")` is `0`, so empty strings must be explicitly rejected).
- **D-13:** Stops/destinations with empty `predictions: []` are **included as-is** (live sample: stop `949` had an empty destination). No filtering.
- **D-14:** No cap on the number of stops returned — the 1-mile radius cap bounds payload size.

### Response shape
- **D-15:** Envelope mirrors `StopPredictionsResponse`:
  ```ts
  {
    success: true,
    generatedAt: string,        // ISO, new Date().toISOString()
    data: {
      agencyKey: string,        // from upstream
      stops: Array<{
        id: string; name: string; code: number;
        distance: number;       // miles, unrounded
        routes: RoutePrediction[];
        alerts: ServiceAlertSummary[];
      }>;
    };
  }
  ```
- **D-16:** `RoutePrediction` is reused **unchanged** (keeps redundant `stopId`/`stopName`/`stopCode` per route). Reuse the existing destination/prediction mapping from `PredictionService` rather than duplicating it (extract to a shared helper if needed).
- **D-17:** `distance` is unrounded, consistent with `/stops/nearby`.

### Errors
- **D-18:** Upstream `success: false`, axios/network error, or malformed body (e.g. missing `data.predictionsData` array) → `UpstreamApiError` → 502. Individual malformed entries (e.g. missing/non-string `stopId`, non-finite `distanceToStop`, non-array `destinations`) are dropped with a `logger.warn`, not failing the request — use the `typeof x === "number" && Number.isFinite(x)` style from Phase 10, not NaN-only checks. No Zod runtime validation of the upstream body (existing convention).

### Claude's Discretion
- Whether this lives in a new `NearbyPredictionService`/controller handler or extends `PredictionService`/`PredictionController` — follow the architecture (factory DI, never import singletons inside services); the route is `/predictions/nearby` in `predictionRoutes.ts`.
- Route order within each stop; log message wording; exact meters rounding.
- Whether to also map network errors in the existing `/predictions` path — do NOT change existing endpoint behavior beyond what's needed for shared helpers.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & scope
- `.planning/REQUIREMENTS.md` — NEAR-01..NEAR-09 (v0.5), Future (NEAR-10/11), Out of Scope table
- `.planning/ROADMAP.md` §"Phase 11: Nearby Stop Predictions" — goal and 5 success criteria
- `.planning/PROJECT.md` §Key Decisions — miles/0.5 default (Phase 3), alert matching by `BusStop.id` (Phase 9), Phase 10 finite-number filter lesson

### Prior phase context
- `.planning/milestones/v0.4-phases/10-solidify-vehicle-position-work/10-CONTEXT.md` — D-05 (drop malformed entries silently, log), D-07 (no Zod on Dash responses), live-payload-first verification pattern
- `.planning/milestones/v0.4-phases/09-alerts-surfaced-on-routes-stops-predictions/09-CONTEXT.md` — alert embedding / `ServiceAlertSummary` decisions

No external specs — upstream shape is captured verbatim in `<specifics>`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/server/api/models/Prediction.ts`: `DashApiResponse`, `DashPredictionData`, `RoutePrediction`, `Destination`, `StopPredictionsResponse` — extend, don't fork.
- `src/server/api/services/PredictionService.ts`: `mapToRoutePredictions`/`mapToDestinations` (currently closure-private — extract for reuse), `buildDashApiUrl` pattern, `success: false` → `UpstreamApiError`.
- `src/server/api/services/serviceAlertMapping.ts`: `mapToServiceAlertSummaries`.
- `src/server/api/repositories/ServiceAlertRepository.ts:55`: `getActiveAlertsForStop(stopId)`.
- `src/server/api/controllers/StopController.ts`: `parseCoordinateParam`, `parsePositiveFloatParam` validation helpers.
- `src/server/api/controllers/PredictionController.ts`: `parseNumberParam`, `resolveErrorStatus`/`resolveErrorBody` (UpstreamApiError → 502 "Bad Gateway").

### Established Patterns
- Factory DI (`createXService(deps)`), singletons only wired in `routes/*.ts`.
- `Dash*` upstream types separate from response types; explicit mapping in the service.
- Controllers validate query params and return `{ error: "Bad Request", details }` 400s.
- Tests co-located, vitest, `vi.mock` for axios; fixtures should mirror the live sample.

### Integration Points
- `src/server/api/routes/predictionRoutes.ts` — add `router.get("/nearby", ...)`; wire `ServiceAlertRepository.getInstance()`.
- `src/server/api/models/index.ts` barrel — export new types.

</code_context>

<specifics>
## Specific Ideas

Live upstream response (user-supplied 2026-09-23, `alexandria-dash`, `lat=38.8048&lon=-77.0469&meters=400&number=3`), abbreviated to representative entries:

```json
{"success":true,"route":"/real-time/alexandria-dash/predictions-near-location GET","data":{"agencyKey":"alexandria-dash","predictionsData":[
 {"routeShortName":"30","routeName":"30 - DUKE","routeId":"30","stopId":"548","stopName":"King St + N Washington St","stopCode":4000858,
  "destinations":[
   {"directionId":"0","headsign":"Van Dorn Street Station","predictions":[{"time":1790192451,"sec":318,"min":5,"blockId":"0061","tripId":"405020","vehicleId":"0212"}]},
   {"directionId":"0","headsign":"West Alexandria Transit Center (SHORT TRIP)","predictions":[{"time":1790192711,"sec":578,"min":9,"blockId":"0078","tripId":"1219020","vehicleId":"0227"}]}],
  "distanceToStop":46.5},
 {"routeShortName":"31","routeName":"31 - KING","routeId":"31","stopId":"548","stopName":"King St + N Washington St","stopCode":4000858,
  "destinations":[{"directionId":"0","headsign":"NVCC Alexandria","predictions":[{"time":1790192575,"sec":442,"min":7,"blockId":"0008","tripId":"488020","vehicleId":"0721"}]}],
  "distanceToStop":46.5},
 {"routeShortName":"30","routeName":"30 - DUKE","routeId":"30","stopId":"561","stopName":"King St + S Washington St","stopCode":4000871,
  "destinations":[{"directionId":"1","headsign":"Braddock Road Station","predictions":[{"time":1790192813,"sec":680,"min":11,"blockId":"0013","tripId":"1418020","vehicleId":"0708"}]}],
  "distanceToStop":58},
 {"routeShortName":"34","routeName":"34 - OLD TOWN NORTH","routeId":"34","stopId":"949","stopName":"City Hall / Market Sq","stopCode":4000820,
  "destinations":[{"directionId":"0","headsign":"Lee Center","predictions":[]}],
  "distanceToStop":337.7}
]}}
```

Full live response had 8 entries across 4 stops (548 ×3 routes, 561 ×3, 949, 413), upstream already sorted by `distanceToStop`.

</specifics>

<deferred>
## Deferred Ideas

- Exposing `blockId` on predictions — would change existing `/predictions` + SSE shapes; revisit if a client needs it.
- Stop coordinates on nearby-prediction stops (map view) — clients can use `/stops/nearby` for now.
- NEAR-10 (SSE nearby stream), NEAR-11 (route filter) — already tracked in REQUIREMENTS.md Future.

</deferred>

---

*Phase: 11-nearby-stop-predictions*
