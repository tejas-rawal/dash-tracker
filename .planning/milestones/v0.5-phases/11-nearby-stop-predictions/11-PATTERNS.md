# Phase 11: Nearby Stop Predictions - Pattern Map

**Mapped:** 2026-09-23
**Files analyzed:** 11 (6 source new/modified, 5 test new/modified)
**Analogs found:** 11 / 11 (one sub-pattern, network-error → `UpstreamApiError`, has no direct analog; see "No Analog Found")

All paths below are relative to the worktree root. Every analog was checked with `git ls-files` (tracked source; no mirror paths).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/server/api/models/Prediction.ts` (modify) | model | transform (type defs) | same file (`DashPredictionData`/`DashApiResponse`/`StopPredictionsResponse`) + `src/server/api/models/StopDiscovery.ts` (`NearbyStop`) | exact |
| `src/server/api/services/predictionMapping.ts` (new) | utility (pure mapper) | transform | `src/server/api/services/serviceAlertMapping.ts` | exact |
| `src/server/api/services/PredictionService.ts` (modify) | service | request-response (upstream proxy) | itself: move lines 68-92 out, import them back | exact |
| `src/server/api/services/NearbyPredictionService.ts` (new) | service | request-response (upstream proxy + regroup) | `src/server/api/services/VehicleService.ts` (upstream fetch, drop malformed + warn) + `PredictionService.ts` (URL builder, mapping) + `StopService.ts` `getNearbyStops` (sort by distance, alerts per stop) | exact (composite) |
| `src/server/api/controllers/NearbyPredictionController.ts` (new) — or a new handler in `PredictionController.ts` (Claude's discretion) | controller | request-response | `src/server/api/controllers/StopController.ts` `getNearbyStops` (lat/lng/radius validation) + `PredictionController.ts` (async, number parse, 502 mapping) | exact (composite) |
| `src/server/api/routes/predictionRoutes.ts` (modify) | route | request-response | itself + `src/server/api/routes/stopRoutes.ts` (`ServiceAlertRepository.getInstance()` wiring, `/nearby`) | exact |
| `src/server/api/models/index.ts` | barrel | n/a | already `export * from "./Prediction"` — **no change needed** if new types live in `Prediction.ts` | n/a |
| `src/server/api/services/NearbyPredictionService.test.ts` (new) | test | request-response | `src/server/api/services/VehicleService.test.ts` + `PredictionService.test.ts` | exact |
| `src/server/api/services/predictionMapping.test.ts` (new, optional) | test | transform | `src/server/api/services/serviceAlertMapping.test.ts` | exact |
| `src/server/api/controllers/NearbyPredictionController.test.ts` (new) | test | request-response | `src/server/api/controllers/PredictionController.test.ts` + `StopController.test.ts` (`getNearbyStops` block, lines 118-357) | exact |
| `src/server/api/routes/predictionRoutes.test.ts` (modify) | test (supertest integration) | request-response | itself (lines 1-50, 172-188) | exact |

---

## Pattern Assignments

### `src/server/api/models/Prediction.ts` (model, modify)

**Analog:** same file, lines 25-37 (`StopPredictionsResponse`) and 59-76 (`DashPredictionData`, `DashApiResponse`); plus `src/server/api/models/StopDiscovery.ts` lines 9-22 (`NearbySearchOptions`, `NearbyStop` with `distance` + `alerts`).

**Upstream types to extend (lines 59-76)**. `DashNearbyPredictionData` should `extends DashPredictionData` and add `distanceToStop: number` (meters), per D-02. Keep `DashPrediction` unchanged (D-05, ignore `blockId`).
```typescript
export interface DashPredictionData {
    routeId: string;
    routeName: string;
    routeShortName: string;
    stopId: string;
    stopName: string;
    stopCode: number;
    destinations: DashDestination[];
}

export interface DashApiResponse {
    success: boolean;
    route: string;
    data: {
        agencyKey: string;
        predictionsData: DashPredictionData[];
    };
}
```
The nearby envelope is the same as `DashApiResponse` but with the element type swapped. Either a new `DashNearbyApiResponse` with `predictionsData: DashNearbyPredictionData[]`, or make `DashApiResponse` generic. Keep it simple and add a sibling interface.

**Response envelope to mirror (lines 25-37)**:
```typescript
export interface StopPredictionsResponse {
    success: boolean;
    generatedAt: string;
    data: {
        agencyKey: string;
        stop: { id: string; name: string; code: number };
        routes: RoutePrediction[];
    };
}
```
**Options type pattern (lines 39-43, `PredictionOptions`)**: add a `NearbyPredictionOptions { radius?: number; number?: number }`, modeled on `PredictionOptions` / `NearbySearchOptions` (StopDiscovery.ts lines 9-12).

**Cross-model import pattern** (StopDiscovery.ts line 1, ServiceAlertSummary.ts lines 1-2): use a `import type { ServiceAlertSummary } from "./ServiceAlertSummary";` at the top of `Prediction.ts` for the `alerts` field. D-15 stop shape = `NearbyStop` (StopDiscovery.ts lines 14-22) minus `lat`/`lon` (D-08) plus `routes: RoutePrediction[]`.

**Barrel:** `src/server/api/models/index.ts` line 4 `export * from "./Prediction";` already re-exports everything, so no barrel edit is needed. If a separate `NearbyPrediction.ts` file is chosen instead, add `export * from "./NearbyPrediction";` in alphabetical position (lines 1-9 are alphabetical).

---

### `src/server/api/services/predictionMapping.ts` (utility, transform; new)

**Analog:** `src/server/api/services/serviceAlertMapping.ts` (whole file, 19 lines), a module of plain exported pure mapping functions imported by several services.
```typescript
import type { ServiceAlert } from "../models/ServiceAlert";
import type { ServiceAlertSummary } from "../models/ServiceAlertSummary";

// D-01: trims url/informedRouteIds/informedStopIds off the domain ServiceAlert, leaving only
// the fields a rider-facing response should carry.
export function mapToServiceAlertSummary(alert: ServiceAlert): ServiceAlertSummary {
    return { id: alert.id, cause: alert.cause, /* ... */ activePeriod: alert.activePeriod };
}

export function mapToServiceAlertSummaries(alerts: ServiceAlert[]): ServiceAlertSummary[] {
    return alerts.map(mapToServiceAlertSummary);
}
```

**Code to move verbatim** from `src/server/api/services/PredictionService.ts` lines 68-92 (these are closure-private today, with no closure dependencies, so they can be lifted as-is and `export`ed):
```typescript
function mapToDestinations(destinations: DashDestination[]): Destination[] {
    return destinations.map((dest) => ({
        directionId: dest.directionId,
        headsign: dest.headsign,
        predictions: dest.predictions.map((pred) => ({
            min: pred.min,
            sec: pred.sec,
            time: pred.time,
            tripId: pred.tripId,
            vehicleId: pred.vehicleId,
        })),
    }));
}

function mapToRoutePredictions(predictionsData: DashPredictionData[]): RoutePrediction[] {
    return predictionsData.map((item) => ({
        routeId: item.routeId,
        /* ...routeName, routeShortName, stopId, stopName, stopCode */
        destinations: mapToDestinations(item.destinations),
    }));
}
```
Note: the explicit field-by-field `pred` mapping is what strips upstream `blockId` (D-05). Keep it. Also export a single-item `mapToRoutePrediction(item: DashPredictionData): RoutePrediction` so the nearby service can map one grouped entry at a time. `DashNearbyPredictionData extends DashPredictionData`, so it is assignable without a cast.

---

### `src/server/api/services/PredictionService.ts` (service, modify)

**Change:** delete lines 68-92 and import them instead. Trim the model import block (lines 4-12) to drop `DashDestination`, `DashPredictionData`, and `Destination` if they are no longer referenced. No behavior change (CONTEXT "do NOT change existing endpoint behavior"). The existing `PredictionService.test.ts` tests at lines 224-267 ("maps DASH predictionsData...", "maps destinations and predictions...") act as the regression guard.
```typescript
import { mapToRoutePredictions } from "./predictionMapping";   // sibling-import style, cf. StopService.ts lines 6-7
```

---

### `src/server/api/services/NearbyPredictionService.ts` (service, request-response; new)

**Primary analog:** `src/server/api/services/VehicleService.ts` (92 lines), the most recent (Phase 10) upstream-proxy service with the finite-number drop-and-warn filter.

**Imports pattern** (VehicleService.ts lines 1-10). Relative paths, `config` barrel, `import type` for models/repos:
```typescript
import { axios, environment, logger } from "../../config";
import { NotFoundError, UpstreamApiError } from "../errors";
import type { DashVehicle, DashVehiclesApiResponse, VehicleOptions, VehiclePosition, VehiclePositionsResponse } from "../models/Vehicle";
import type { BusDataRepository } from "../repositories";
```
For the nearby service: import `UpstreamApiError` only, the new Dash*/response types from `../models/Prediction`, `type { ServiceAlertRepository } from "../repositories"` (D-07: **no** `BusDataRepository`), `mapToServiceAlertSummaries` from `./serviceAlertMapping`, `mapToRoutePrediction` from `./predictionMapping`.

**Interface + factory DI pattern** (VehicleService.ts lines 12-16, 91):
```typescript
export interface VehicleService {
    getVehiclePositions(options?: VehicleOptions): Promise<VehiclePositionsResponse>;
}

export function createVehicleService(repository: BusDataRepository): VehicleService {
    // ... closure-private helpers ...
    return { getVehiclePositions };
}
```
Recommended signature: `createNearbyPredictionService(serviceAlertRepository: ServiceAlertRepository): NearbyPredictionService` with `getNearbyPredictions(lat: number, lng: number, options?: NearbyPredictionOptions): Promise<NearbyPredictionsResponse>`, following the `getNearbyStops(lat, lng, options?)` shape in StopService.ts line 15.

**Constants pattern** (StopService.ts lines 9-11):
```typescript
const DEFAULT_RADIUS_MILES = 0.5;
const DEFAULT_COUNT = 10;
const MAX_COUNT = 50;
```
Use `DEFAULT_RADIUS_MILES = 0.5` and `METERS_PER_MILE = 1609.344` (D-10). Max-radius/max-number caps are enforced as 400s in the controller (D-10/D-11), not clamped here.

**URL builder pattern** (VehicleService.ts lines 17-27 / PredictionService.ts lines 47-59). `URLSearchParams`, only set optional params when defined (D-11: omit `number` when absent):
```typescript
function buildDashApiUrl(stopId: string, options: PredictionOptions): string {
    const { agency } = environment.dashApi;
    const params = new URLSearchParams({ stop: stopId });

    if (options.number !== undefined) {
        params.set("number", String(options.number));
    }
    // ...
    return `/real-time/${agency}/predictions?${params.toString()}`;
}
```
Nearby: `new URLSearchParams({ lat: String(lat), lon: String(lng), meters: String(meters) })` → `/real-time/${agency}/predictions-near-location?...` (D-03: upstream uses `lon`, not `lng`).

**Fetch pattern** (VehicleService.ts lines 29-34). Log the external call with `logger.info` (CLAUDE.md: log external API calls):
```typescript
async function fetchFromDashApi(options: VehicleOptions): Promise<DashVehiclesApiResponse> {
    const url = buildDashApiUrl(options);
    logger.info(`Fetching vehicle positions from DASH API: ${url}`);
    const response = await axios.get(url);
    return response.data as DashVehiclesApiResponse;
}
```
**D-18 differs from this analog.** Here `axios.get` rejections propagate raw and end up as 500 (see `VehicleService.test.ts` line 151, "propagates a thrown error when the axios call rejects", and `PredictionService.test.ts` lines 302-315). The nearby service must wrap `axios.get` in `try/catch` and rethrow `new UpstreamApiError(...)` (see "No Analog Found"). Do not change the existing services.

**Finite-number / drop-and-warn filter** (VehicleService.ts lines 36-51), which D-18 mandates:
```typescript
function isValidCoordinate(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function mapToVehiclePositions(vehicles: DashVehicle[]): VehiclePosition[] {
    return vehicles
        .filter((vehicle) => {
            const valid =
                isValidCoordinate(vehicle.loc?.lat) &&
                isValidCoordinate(vehicle.loc?.lon) &&
                isValidCoordinate(vehicle.loc?.time);
            if (!valid) {
                logger.warn(`Dropping vehicle ${vehicle.id} with invalid loc data`);
            }
            return valid;
        })
        .map(/* ... */);
}
```
Nearby entry validity: `typeof entry.stopId === "string"`, `typeof entry.distanceToStop === "number" && Number.isFinite(entry.distanceToStop)`, `Array.isArray(entry.destinations)`. Warn once per dropped entry, naming stop/route.

**Malformed-body guard** (from `src/server/api/services/ServiceAlertService.ts` lines 109-113). This is the existing "whole body is malformed → UpstreamApiError" pattern:
```typescript
if (!Array.isArray(response.entities)) {
    throw new UpstreamApiError(
        "DASH API returned a malformed service alerts response (entities is not an array)",
    );
}
```
Apply it to `dashResponse.data?.predictionsData` (D-18).

**success:false + response envelope** (VehicleService.ts lines 75-88):
```typescript
const dashResponse = await fetchFromDashApi(options);

if (!dashResponse.success) {
    throw new UpstreamApiError("DASH API returned success: false for vehicle positions");
}

return {
    success: true,
    generatedAt: new Date().toISOString(),
    data: {
        agencyKey: dashResponse.data.agencyKey,
        vehicles: mapToVehiclePositions(dashResponse.data.vehicles),
    },
};
```

**Per-stop alerts + distance sort** (StopService.ts lines 44-60):
```typescript
return repository
    .getAllStops()
    .map((stop) => {
        // ...
        return {
            id: stop.id, name: stop.name, code: stop.code, /* lat, lon, */
            distance: haversineDistanceMiles({ lat, lon: lng }, location),
            alerts: mapToServiceAlertSummaries(serviceAlertRepository.getActiveAlertsForStop(stop.id)),
        };
    })
    .filter((stop) => stop.distance <= radius)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count);
```
For nearby: group valid entries by `stopId` (a `Map<string, {...}>` preserves first-seen insertion order, so route order within a stop follows upstream order per D-09 discretion). Take `id/name/code` from the first entry (D-06), set `distance = distanceToStop / METERS_PER_MILE` unrounded (D-17; do **not** reuse `haversineDistanceMiles`, which rounds to 2dp), push `mapToRoutePrediction(entry)` into `routes`, compute `alerts` once per stop via `getActiveAlertsForStop(stopId)` (D-04), then `.sort((a, b) => a.distance - b.distance)`. No `.filter`/`.slice` (D-13, D-14).

---

### `src/server/api/controllers/NearbyPredictionController.ts` (controller, request-response; new)

**Discretion note:** CONTEXT leaves new-controller vs. extending `PredictionController` to the planner. A separate `createNearbyPredictionController(service: NearbyPredictionService)` leaves `createPredictionController(service)` and its 355-line test untouched, and matches the one-controller-per-service layout (`VehicleController`, `StopController`). Adding a handler to `PredictionController` would need a second service param and changes to every existing `createPredictionController(mockService)` call site.

**Imports + interface** (PredictionController.ts lines 1-7):
```typescript
import type { Request, RequestHandler, Response } from "express";
import { NotFoundError, UpstreamApiError } from "../errors";
import type { PredictionService } from "../services/PredictionService";

export interface PredictionController {
    getPredictions: RequestHandler;
}
```

**Param parsers to reuse** (StopController.ts lines 10-24, PredictionController.ts lines 9-15):
```typescript
function parseCoordinateParam(raw: unknown, min: number, max: number): number | undefined {
    if (raw === undefined) {
        return undefined;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

function parsePositiveFloatParam(raw: unknown): number | undefined {
    if (raw === undefined) {
        return undefined;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseNumberParam(raw: unknown): number | undefined {   // PredictionController.ts lines 9-15
    if (raw === undefined) {
        return undefined;
    }
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
```
**D-12 gap:** none of these reject `""` (`Number("") === 0`, so `?lat=` currently parses as latitude 0). The nearby parsers must add an explicit `raw === ""` rejection (also reject non-string/array query values). **Planner decision:** if these helpers are extracted into a shared module (e.g. `src/server/api/controllers/queryParams.ts`; `src/server/api/helpers/` exists but holds only `.gitkeep`) and `StopController` is switched to import them, `/stops/nearby` will start returning 400 for empty strings. CONTEXT says `/stops/nearby` is "Unchanged", so either keep StopController on its local copies or accept and test that narrow behavior change explicitly.

**Validation-then-400 flow** (StopController.ts lines 58-91). Copy this sequence, adding upper-bound checks for `radius > 1` (D-10) and `number > 10` (D-11):
```typescript
const rawLat = req.query.lat;
const lat = parseCoordinateParam(rawLat, -90, 90);
if (lat === undefined) {
    res.status(400).json({
        error: "Bad Request",
        details: "lat parameter is required and must be a valid latitude (-90 to 90)",
    });
    return;
}
// ... lng identical with -180..180 ...

const rawRadius = req.query.radius;
const radius = parsePositiveFloatParam(rawRadius);
if (rawRadius !== undefined && radius === undefined) {
    res.status(400).json({ error: "Bad Request", details: "radius parameter must be a positive number" });
    return;
}
```

**Async handler + error translation** (PredictionController.ts lines 62-71, 23-44). The service is async, so the handler is `async` and awaits:
```typescript
try {
    const result = await service.getPredictionsForStop(stop, { number, route, deviceId: resolveOptionalDeviceId(req) });
    res.json(result);
} catch (error: unknown) {
    res.status(resolveErrorStatus(error)).json(resolveErrorBody(error));
}
```
```typescript
function resolveErrorStatus(error: unknown): number {
    if (error instanceof NotFoundError) { return 404; }
    if (error instanceof UpstreamApiError) { return 502; }
    return 500;
}

function resolveErrorBody(error: unknown): { error: string; details: string } {
    const details = error instanceof Error ? error.message : "Unknown error";
    let label: string;
    if (error instanceof NotFoundError) { label = "Not Found"; }
    else if (error instanceof UpstreamApiError) { label = "Bad Gateway"; }
    else { label = "Request Failed"; }
    return { error: label, details };
}
```
Existing convention is a per-controller local copy (identical in `VehicleController.ts` lines 9-30). The nearby path never throws `NotFoundError`, so the local copy can drop that branch (UpstreamApiError → 502 "Bad Gateway", else 500 "Request Failed").

---

### `src/server/api/routes/predictionRoutes.ts` (route, modify)

**Analog:** itself (18 lines) + `src/server/api/routes/stopRoutes.ts` lines 3-11.
```typescript
// predictionRoutes.ts lines 4-16 (current)
import { BusDataRepository, FavoritesRecentsRepository } from "../repositories";
// ...
const service = createPredictionService(BusDataRepository.getInstance(), FavoritesRecentsRepository.getInstance());
const controller = createPredictionController(service);
// ...
router.get("/", controller.getPredictions);
router.get("/stream", streamController.getPredictionsStream);
```
```typescript
// stopRoutes.ts lines 3-11: ServiceAlertRepository singleton wired only here, and /nearby path
import { BusDataRepository, ServiceAlertRepository } from "../repositories";
const service = createStopService(BusDataRepository.getInstance(), ServiceAlertRepository.getInstance());
router.get("/nearby", controller.getNearbyStops);
```
Add `ServiceAlertRepository` to the repositories import, `createNearbyPredictionService(ServiceAlertRepository.getInstance())`, `createNearbyPredictionController(...)`, and `router.get("/nearby", nearbyController.getNearbyPredictions);`. `/nearby` is a literal path, so there is no collision with `/` or `/stream`. `routes/index.ts` line 12 already mounts this router at `/predictions`, so no change is needed there.

---

### `src/server/api/services/NearbyPredictionService.test.ts` (test; new)

**Analog:** `src/server/api/services/VehicleService.test.ts` lines 1-42 (harness), 140-160 (errors), 199-320 (drop-and-warn).

**Config mock + imports-after-mock** (VehicleService.test.ts lines 1-18):
```typescript
import { describe, expect, it, vi } from "vitest";
import { NotFoundError, UpstreamApiError } from "../errors";
import type { DashVehicle, DashVehiclesApiResponse } from "../models/Vehicle";

vi.mock("../../config", () => ({
    axios: { get: vi.fn() },
    environment: {
        dashApi: { agency: "alexandria-dash", baseUrl: "https://api.goswift.ly", apiKey: "key" },
        server: { port: 3000 },
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { axios, environment, logger } from "../../config";
import { createVehicleService } from "./VehicleService";

const mockAxiosGet = vi.mocked(axios.get);
const mockLoggerWarn = vi.mocked(logger.warn);
```
**`makeX` factories with overrides** (VehicleService.test.ts lines 24-42 / PredictionService.test.ts lines 31-55). Build `makeDashNearbyPredictionData(overrides)` and `makeDashNearbyApiResponse(entries)`. Per D-01, defaults must come from the live sample in CONTEXT `<specifics>` (agency `alexandria-dash`, route `/real-time/alexandria-dash/predictions-near-location GET`, stop `548`/`"King St + N Washington St"`/`4000858`, `distanceToStop: 46.5`, predictions carrying `blockId`). Because `DashPrediction` has no `blockId`, a fixture carrying it needs a cast or spread, and it doubles as the test that `blockId` is stripped.

**Alert repo mock** (StopService.test.ts lines 25-27 pattern):
```typescript
const makeMockAlertRepo = () => ({
    getActiveAlertsForRoute: vi.fn().mockReturnValue([]),
    getActiveAlertsForStop: vi.fn().mockReturnValue([]),   // shape used by StopService tests
});
// pass as `makeMockAlertRepo() as never`
```
**Drop-and-warn assertion** (VehicleService.test.ts lines 217-235):
```typescript
mockLoggerWarn.mockClear();
// ...
expect(result.data.vehicles).toEqual([]);
expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining("1550"));
```
**URL assertions** (PredictionService.test.ts lines 119-185): `expect(mockAxiosGet).toHaveBeenCalledWith(expect.stringContaining("number=5"))` and `expect.not.stringContaining("number=")` for omission. Add `lon=`, `meters=`, `predictions-near-location`.

**AAA comments:** every test uses `// Arrange`, `// Act`, `// Assert` (or `// Act & Assert`).

Required cases (from D-02..D-18): grouping stop 548 ×2 routes into one stop; sort by distance when upstream order is reversed; meters→miles unrounded; default radius 0.5 → `meters=805` (or chosen rounding); unknown stop kept with `alerts: []`; empty `predictions: []` kept (stop 949); `success:false` → `UpstreamApiError`; axios reject → `UpstreamApiError`; missing `predictionsData` → `UpstreamApiError`; malformed entry dropped with warn.

### `src/server/api/services/predictionMapping.test.ts` (test; new, optional)

**Analog:** `src/server/api/services/serviceAlertMapping.test.ts` (74 lines), a pure-function test with no mocks. Moving existing mapping coverage is optional because `PredictionService.test.ts` lines 224-267 already exercise it through the service; add one direct test that `blockId` on the input is not present on the output.

### `src/server/api/controllers/NearbyPredictionController.test.ts` (test; new)

**Analog:** `src/server/api/controllers/PredictionController.test.ts` lines 1-60 (async harness) + `StopController.test.ts` lines 118-357 (lat/lng/radius 400 matrix).
```typescript
const makeMockRes = () => {
    const res = { json: vi.fn(), status: vi.fn() } as unknown as Response;
    (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
    return res;
};

const makeMockReq = (query: Record<string, string> = {}, headers: Record<string, string | string[] | undefined> = {}): Request =>
    ({ query, headers }) as unknown as Request;

const makeMockService = () => ({ getPredictionsForStop: vi.fn() });
// ...
await getPredictions(req, res, vi.fn());
expect(res.status).toHaveBeenCalledWith(400);
```
Add cases for D-10/D-11/D-12: `lat=""`, `lng=""`, `radius=1.01` → 400, `radius=1` → OK, `number=11` → 400, `number=10` → OK, service not called on any 400, `UpstreamApiError` → 502 "Bad Gateway".

### `src/server/api/routes/predictionRoutes.test.ts` (test; modify)

**Analog:** itself, lines 1-50 and 172-188.
```typescript
vi.mock("../services/PredictionService", () => ({
    createPredictionService: vi.fn(() => ({ getPredictionsForStop: vi.fn() })),
}));

import app from "../../test/app";
import { createPredictionService } from "../services/PredictionService";

const getMockService = () => vi.mocked(createPredictionService).mock.results[0]?.value;
```
Add a parallel `vi.mock("../services/NearbyPredictionService", ...)` + `getMockNearbyService()` and a new `describe("GET /api/v1/predictions/nearby", ...)` block using `request(app).get("/api/v1/predictions/nearby?lat=38.8048&lng=-77.0469")`. The 502 case copies lines 172-188:
```typescript
getMockService().getPredictionsForStop.mockRejectedValue(new UpstreamApiError("..."));
const response = await request(app).get("/api/v1/predictions?stop=stop-1");
expect(response.status).toBe(502);
expect(response.body).toMatchObject({ error: "Bad Gateway", details: "..." });
```
Also add a wiring test mirroring lines 45-50 (`createNearbyPredictionService` called with exactly 1 argument, the alert repository). Also add a regression assertion that `/predictions/nearby` does not hit `getPredictionsForStop` (it would 400 on missing `stop` if the route were mis-registered).

---

## Shared Patterns

### Factory DI, singletons only in routes
**Source:** `src/server/api/services/StopService.ts` lines 18-21; `src/server/api/routes/stopRoutes.ts` line 6
**Apply to:** `NearbyPredictionService.ts`, `NearbyPredictionController.ts`, `predictionRoutes.ts`
```typescript
export function createStopService(
    repository: BusDataRepository,
    serviceAlertRepository: ServiceAlertRepository,
): StopService {
```
The service imports only `type { ServiceAlertRepository }`. `ServiceAlertRepository.getInstance()` appears only in `predictionRoutes.ts`.

### Error classes and HTTP mapping
**Source:** `src/server/api/errors/index.ts` lines 8-13 (`UpstreamApiError`); `PredictionController.ts` lines 23-44
**Apply to:** service (throw), controller (translate)
Services throw `UpstreamApiError`; controllers map to `502 { error: "Bad Gateway", details }`, and unknown errors to `500 { error: "Request Failed", details }`. 400s use `{ error: "Bad Request", details: "<param> parameter ..." }`.

### Alert embedding
**Source:** `src/server/api/services/StopService.ts` line 55; `serviceAlertMapping.ts` lines 17-19; `ServiceAlertRepository.ts` lines 55-57
**Apply to:** `NearbyPredictionService.ts`
```typescript
alerts: mapToServiceAlertSummaries(serviceAlertRepository.getActiveAlertsForStop(stop.id)),
```

### Upstream call logging
**Source:** `VehicleService.ts` lines 31, 48
**Apply to:** `NearbyPredictionService.ts`
`logger.info(\`Fetching ... from DASH API: ${url}\`)` once per upstream call; `logger.warn(...)` per dropped entry. No per-stop info noise.

### Response envelope
**Source:** `VehicleService.ts` lines 81-88 / `PredictionService.ts` lines 106-118
**Apply to:** `NearbyPredictionService.ts`
`{ success: true, generatedAt: new Date().toISOString(), data: { agencyKey: dashResponse.data.agencyKey, ... } }`

### Test harness
**Source:** `VehicleService.test.ts` lines 5-18 (config mock), `PredictionController.test.ts` lines 7-19 (req/res mocks), `predictionRoutes.test.ts` lines 8-17 (service mock + supertest `app` from `src/server/test/app.ts`)
**Apply to:** all new/modified test files. Use `makeX` factories with `overrides` spreads, `as never` for partial repo mocks, and AAA comments.

## No Analog Found

| File / Sub-pattern | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `NearbyPredictionService.ts`, network/axios error → `UpstreamApiError` (D-18) | service | request-response | No service in the codebase catches `axios.get` rejections. `PredictionService` and `VehicleService` let them propagate (tests assert the raw error, which becomes a 500). The closest precedent is `ServiceAlertService.ts` lines 36-39 (`try { ... } catch { throw new UpstreamApiError(...) }` around `JSON.parse`). Use `try { response = await axios.get(url) } catch (error) { const message = error instanceof Error ? error.message : "Unknown error"; throw new UpstreamApiError(\`DASH API request failed for nearby predictions: ${message}\`); }`, with the message pattern from PredictionService.ts line 123. Axios exposes `axios.isAxiosError`, but it is unnecessary since all failures map to 502. |
| Group-by-key regroup (flat `predictionsData` → one stop per `stopId`) | service | transform | No existing grouping reducer. Use a `Map<string, NearbyStopPredictions>` built in a `for...of` loop (same style as the `Map` staging loop in `ServiceAlertRepository.ts` lines 35-41). |

## Metadata

**Analog search scope:** `src/server/api/{models,services,controllers,routes,repositories,errors}`, `src/server/config`, `src/server/test`
**Files scanned:** 24 source/test files read (all small; single reads)
**Pattern extraction date:** 2026-09-23
