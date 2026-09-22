# Phase 10: Solidify vehicle position work - Pattern Map

**Mapped:** 2026-09-21
**Files analyzed:** 8 (4 source + 4 test)
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|-----------------|----------------|
| `src/server/api/models/Vehicle.ts` | model | request-response (transform) | `src/server/api/models/Prediction.ts` | exact |
| `src/server/api/services/VehicleService.ts` | service | CRUD (upstream fetch + filter/map) | `src/server/api/services/BusRouteService.ts` | exact |
| `src/server/api/controllers/VehicleController.ts` | controller | request-response | `src/server/api/controllers/BusRouteController.ts` (unchanged; VehicleController itself is already correct — no changes needed) | n/a (no change) |
| `src/server/api/routes/vehicleRoutes.ts` | route | request-response | `src/server/api/routes/busRoutes.ts` | exact |
| `src/server/api/services/VehicleService.test.ts` | test | CRUD | `src/server/api/services/BusRouteService.test.ts` | exact |
| `src/server/api/controllers/VehicleController.test.ts` | test | request-response | (unchanged; already covers 404/502/500 mapping — no new assertions required by this phase's decisions) | n/a (no change) |

All 4 modified/created source files have an **exact** analog already named in CONTEXT.md's `canonical_refs`. No "no analog found" files this phase.

## Pattern Assignments

### `src/server/api/models/Vehicle.ts` (model, transform)

**Analog:** `src/server/api/models/Prediction.ts` (full file read, 77 lines)

**`Dash*`-shaped vs. response-shaped separation pattern** (lines 45-76 = `DashPrediction`/`DashDestination`/`DashPredictionData`/`DashApiResponse`; lines 1-37 = `Prediction`/`Destination`/`RoutePrediction`/`StopPredictionsResponse`):
```typescript
// Dash-shaped types mirror the upstream payload exactly (including any nesting)
export interface DashPrediction {
    min: number;
    sec: number;
    time: number;
    tripId: string;
    vehicleId: string;
}
// ...
export interface DashApiResponse {
    success: boolean;
    route: string;
    data: {
        agencyKey: string;
        predictionsData: DashPredictionData[];
    };
}

// Response-shaped types are the service's own DTO — same field names where they
// carry over 1:1, but independently declared (not `extends`/reused) so upstream
// shape drift doesn't leak into the public contract.
export interface Prediction {
    min: number;
    sec: number;
    time: number;
    tripId: string;
    vehicleId: string;
}
```

**Apply to `Vehicle.ts` per D-08/D-09/D-10:**
- `DashVehicle` must gain a nested `loc: { lat: number; lon: number; heading: number; speed: number; time: number }` object (currently `lat`/`lon`/`heading`/`speed`/`lastUpdated` are incorrectly flat — this is the bug D-08 fixes) and add `vehicleType: string` (D-10) at the top level. Drop `tripId` entirely (D-09).
- `VehiclePosition` keeps `lat`/`lon`/`heading`/`speed` flat (unchanged shape from the consumer's point of view) but they now come from `dashVehicle.loc.*` instead of `dashVehicle.*` directly. `lastUpdated` changes type from `number` to `string` (ISO, mapped from `loc.time` which is Unix seconds) to match `generatedAt`'s format convention — see `VehiclePositionsResponse.generatedAt: string` in the same file (line 40) and `StopPredictionsResponse.generatedAt: string` in `Prediction.ts` (line 27) for the established ISO-string convention. Drop `tripId`, add `vehicleType: string`.
- `DashVehiclesApiResponse` and `VehiclePositionsResponse` envelope shapes are unaffected — same pattern as `DashApiResponse`/`StopPredictionsResponse` (top-level `success`/`route` vs `success`/`generatedAt`, both wrapping `data: { agencyKey, ... }`).

---

### `src/server/api/services/VehicleService.ts` (service, CRUD/transform)

**Analog:** `src/server/api/services/BusRouteService.ts` (full file read, 56 lines)

**Factory-DI pattern** (lines 15-18):
```typescript
export function createBusRouteService(
    repository: BusDataRepository,
    serviceAlertRepository: ServiceAlertRepository,
): BusRouteService {
```
Apply to `VehicleService`: change `export function createVehicleService(): VehicleService` to `export function createVehicleService(repository: BusDataRepository): VehicleService` (D-04). Import `type { BusDataRepository } from "../repositories"` (mirrors `BusRouteService.ts` line 4: `import type { BusDataRepository, ServiceAlertRepository } from "../repositories";`).

**404-on-missing-route pattern** (`getAgencyRoute`, lines 30-36 — this is the literal pattern named in CONTEXT.md D-04):
```typescript
function getAgencyRoute(shortName: string): RouteWithAlerts {
    const route = repository.getRouteByShortName(shortName);
    if (!route) {
        throw new NotFoundError(`Route not found: ${shortName}`);
    }
    return attachAlerts(route);
}
```
Apply to `VehicleService.getVehiclePositions`: when `options.route` is provided, call `repository.getRouteByShortName(options.route)` before/alongside the DASH fetch and `throw new NotFoundError(\`Route not found: ${options.route}\`)` if it returns `undefined`. Import `NotFoundError` the same way `BusRouteService.ts` does (line 1: `import { NotFoundError } from "../errors";`) — `VehicleService.ts` already imports `UpstreamApiError` from the same module (current line 2), so just extend that import list.

**Existing `VehicleService.ts` structure to extend, not replace** (full file read, 69 lines — `buildDashApiUrl` lines 16-26, `fetchFromDashApi` lines 28-33, `mapToVehiclePositions` lines 35-49, `getVehiclePositions` lines 51-66):
```typescript
import { axios, environment, logger } from "../../config";
import { UpstreamApiError } from "../errors";
import type {
    DashVehicle,
    DashVehiclesApiResponse,
    VehicleOptions,
    VehiclePosition,
    VehiclePositionsResponse,
} from "../models/Vehicle";
```
`mapToVehiclePositions` (lines 35-49) is the function D-08 changes to flatten `vehicle.loc.lat` → `lat`, `vehicle.loc.lon` → `lon`, `vehicle.loc.heading` → `heading`, `vehicle.loc.speed` → `speed`, `new Date(vehicle.loc.time * 1000).toISOString()` → `lastUpdated`, and to add `vehicleType: vehicle.vehicleType`. `getVehiclePositions` (lines 51-66) already assembles `success`/`generatedAt`/`data.agencyKey`/`data.vehicles` — this is the pattern to keep, with the new `repository.getRouteByShortName` check added before returning.

**Malformed-coordinate filtering pattern (D-05)** — no direct in-service analog (existing coordinate validation in `BusDataRepository.createStop`, lines 197-211, *throws* on `Number.isNaN(lat) || Number.isNaN(lon)` rather than silently filtering — different failure mode, do not copy the throw). Closest applicable precedent for "warn + drop, don't fail the whole request" is `BusDataRepository`'s empty-collection guard (lines 122-125):
```typescript
if (!routes || !Array.isArray(routes) || routes.length === 0) {
    logger.warn("No routes found in API response");
    return { routes: stagingRoutes, routesByShortName: stagingRoutesByShortName, stops: stagingStops };
}
```
and `ServiceAlertService.ts` (line 105) uses the same `logger.warn("<message>")` call shape. Combine with a `.filter()` predicate (project already uses `.filter()` extensively in services, e.g. `FavoritesService.ts:41`, `StopService.ts:58`). Recommended shape for `mapToVehiclePositions`:
```typescript
return vehicles
    .filter((vehicle) => {
        const valid = !Number.isNaN(vehicle.loc.lat) && !Number.isNaN(vehicle.loc.lon);
        if (!valid) {
            logger.warn(`Dropping vehicle ${vehicle.id} with invalid coordinates: lat=${vehicle.loc.lat}, lon=${vehicle.loc.lon}`);
        }
        return valid;
    })
    .map((vehicle) => ({ /* ... */ }));
```

**Error handling pattern** (lines 54-56, unchanged): `if (!dashResponse.success) { throw new UpstreamApiError(...); }` — keep as-is, `VehicleController.ts`'s existing `resolveErrorStatus`/`resolveErrorBody` (lines 9-30) already map `UpstreamApiError` → 502 and `NotFoundError` → 404, so no controller changes are needed for D-04's new `NotFoundError` throw to reach the client correctly.

---

### `src/server/api/routes/vehicleRoutes.ts` (route, request-response)

**Analog:** `src/server/api/routes/busRoutes.ts` (full file read, 19 lines)

**DI wiring pattern** (lines 1-9):
```typescript
import { Router } from "express";
import { createBusRouteController } from "../controllers/BusRouteController";
import { createStopController } from "../controllers/StopController";
import { BusDataRepository, ServiceAlertRepository } from "../repositories";
import { createBusRouteService } from "../services/BusRouteService";
import { createStopService } from "../services/StopService";

const service = createBusRouteService(BusDataRepository.getInstance(), ServiceAlertRepository.getInstance());
const controller = createBusRouteController(service);
```
Apply to `vehicleRoutes.ts`: add `import { BusDataRepository } from "../repositories";` and change `const service = createVehicleService();` to `const service = createVehicleService(BusDataRepository.getInstance());` (this is the "construction site" CONTEXT.md's Integration Points section flags — confirmed this route file, not `app.ts`, is where `createVehicleService()` is currently called). Router registration (`router.get("/", controller.getVehiclePositions);`) is unaffected.

---

### `src/server/api/services/VehicleService.test.ts` (test, CRUD)

**Analog:** `src/server/api/services/BusRouteService.test.ts` (mock-repo helper + `getAgencyRoute` describe block, lines 1-30 and 145-195)

**Mock repository factory pattern** (lines 19-25):
```typescript
const makeMockRepo = () => ({
    getAllRoutes: vi.fn(),
    getRouteByShortName: vi.fn(),
    getStopById: vi.fn(),
    getAllStops: vi.fn(),
    getRoutesForStop: vi.fn(),
});
```
Apply: add a similarly-shaped `makeMockRepo` to `VehicleService.test.ts` (only needs `getRouteByShortName: vi.fn()` for this service's usage) and pass it as `createVehicleService(mockRepo as never)` in every existing test (all 8 current test cases construct `createVehicleService()` with zero args — each call site needs updating).

**404 test-case pattern** (lines 176-194):
```typescript
it("throws a NotFoundError when no route matches the short name", () => {
    const mockRepo = makeMockRepo();
    mockRepo.getRouteByShortName.mockReturnValue(undefined);
    const { getAgencyRoute } = createBusRouteService(mockRepo as never, makeMockAlertRepo() as never);
    expect(() => getAgencyRoute("UNKNOWN")).toThrowError(NotFoundError);
});

it("includes the short name in the NotFoundError message", () => {
    // ... expect(() => getAgencyRoute("UNKNOWN")).toThrowError("Route not found: UNKNOWN");
});
```
Apply directly for D-04's route-validation tests on `getVehiclePositions({ route: "UNKNOWN" })`.

**Existing test data factories to update** (`VehicleService.test.ts` lines 19-32, `makeDashVehicle`): must be restructured to nest `lat`/`lon`/`heading`/`speed`/`time` under `loc: {...}` (D-08) and drop `tripId` (D-09), add `vehicleType` (D-10) — use the exact field values from CONTEXT.md's verified live payload (SFMTA `id: "1550"`, `loc: { heading: 113.8, lat: 37.72179, lon: -122.44705, speed: 0, time: 1534287835 }`, `vehicleType: "0"`) as the canonical fixture reference rather than re-guessing shapes.

**Import/mock-setup pattern** (lines 1-17, unchanged): `vi.mock("../../config", ...)` with `axios`/`environment`/`logger` mocked — `logger.warn` mock is already present (line 11) and ready to assert against for D-05's dropped-vehicle logging.

---

### `src/server/api/controllers/VehicleController.test.ts` and `src/server/api/controllers/VehicleController.ts` (no changes expected)

Per CONTEXT.md, `VehicleController`/`vehicleRoutes.ts`'s controller wiring is existing/correct — only the route file's service-construction call changes (documented above). `VehicleController.test.ts`'s existing 502/500 error-mapping tests (lines 94-132) already prove the controller passes through whatever status `resolveErrorStatus` returns; since `resolveErrorStatus` (in `VehicleController.ts`, lines 9-17) already handles `NotFoundError` → 404 alongside `UpstreamApiError` → 502, D-04's new `NotFoundError` throw requires no controller code change. Planner should confirm during planning whether a new controller test case (`route not found → 404`) is still worth adding for coverage completeness, even though CONTEXT.md doesn't mandate it.

## Shared Patterns

### Factory-Function DI
**Source:** `src/server/api/services/BusRouteService.ts` lines 15-18, wired in `src/server/api/routes/busRoutes.ts` lines 1-9
**Apply to:** `VehicleService.ts` (constructor signature change) and `vehicleRoutes.ts` (construction call site)
```typescript
export function createBusRouteService(
    repository: BusDataRepository,
    serviceAlertRepository: ServiceAlertRepository,
): BusRouteService { /* ... */ }
// wiring:
const service = createBusRouteService(BusDataRepository.getInstance(), ServiceAlertRepository.getInstance());
```

### `Dash*`-shaped vs. response-shaped model separation
**Source:** `src/server/api/models/Prediction.ts` (whole file)
**Apply to:** `Vehicle.ts` — `DashVehicle` gains nested `loc` object matching DASH's real payload; `VehiclePosition` stays flat as the service's own DTO, independently declared.

### NotFoundError → 404 mapping
**Source:** `src/server/api/errors/index.ts` lines 1-6 (`NotFoundError`), already consumed in `src/server/api/controllers/VehicleController.ts` lines 9-17 (`resolveErrorStatus`)
**Apply to:** `VehicleService.getVehiclePositions` — throw `new NotFoundError(\`Route not found: ${shortName}\`)`; no controller change needed, it's already wired.

### `logger.warn` for drop/skip-without-failing conditions
**Source:** `src/server/api/repositories/BusDataRepository.ts` lines 122-125 (empty-collection guard), `src/server/api/services/ServiceAlertService.ts` line 105
**Apply to:** `VehicleService.mapToVehiclePositions` — `logger.warn(...)` per dropped vehicle with invalid `lat`/`lon` (D-05), rest of the request proceeds unaffected.

## No Analog Found

None — every file this phase touches has an exact same-role-and-data-flow analog already named in CONTEXT.md's `canonical_refs`.

## Metadata

**Analog search scope:** `src/server/api/models/`, `src/server/api/services/`, `src/server/api/controllers/`, `src/server/api/routes/`, `src/server/api/repositories/`, `src/server/api/errors/`
**Files scanned:** 12 (Vehicle.ts, Prediction.ts, VehicleService.ts + .test.ts, BusRouteService.ts + .test.ts, VehicleController.ts + .test.ts, vehicleRoutes.ts, busRoutes.ts, BusDataRepository.ts, errors/index.ts)
**Pattern extraction date:** 2026-09-21
**Tracked-source gate:** all 9 analog/target source paths confirmed via `git ls-files` — no gitignored mirrors involved.
