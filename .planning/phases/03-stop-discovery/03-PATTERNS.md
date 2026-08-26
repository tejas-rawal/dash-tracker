# Phase 3: Stop Discovery - Pattern Map

**Mapped:** 2026-08-26
**Files analyzed:** 6
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/server/api/services/StopService.ts` | service | CRUD (read) | `src/server/api/services/BusRouteService.ts` | exact (route-lookup), plus `PredictionService.ts` (query-param + computed-field flow) |
| `src/server/api/controllers/StopController.ts` | controller | request-response | `src/server/api/controllers/PredictionController.ts` | exact (query-string validation + error mapping) |
| `src/server/api/routes/stopRoutes.ts` | route | request-response | `src/server/api/routes/predictionRoutes.ts` | exact |
| `src/server/api/routes/busRoutes.ts` (modified) | route | request-response | itself (add `/:shortName/stops` alongside existing `/:shortName`) | exact |
| `src/server/api/routes/index.ts` (modified) | route | request-response | itself (mount new `stopRoutes` the same way `busRoutes`/`predictionRoutes` are mounted) | exact |
| distance/haversine helper (likely `src/server/api/services/` util or inline in `StopService.ts`) | utility | transform | none (new capability) | no analog |

## Pattern Assignments

### `src/server/api/services/StopService.ts` (service, CRUD/read + transform)

**Analogs:** `src/server/api/services/BusRouteService.ts` (structure/DI) + `src/server/api/services/PredictionService.ts` (options object, computed/mapped response fields)

**Factory + DI pattern** (`BusRouteService.ts` lines 1-13):
```typescript
import { NotFoundError } from "../errors";
import type { BusRoute, BusStop } from "../models";
import type { BusDataRepository } from "../repositories";

export interface BusRouteService {
    getAgencyRoutes(): BusRoute[];
    getAgencyRoute(shortName: string): BusRoute;
    getAgencyStop(stopId: string): BusStop;
    getAgencyStops(): BusStop[];
    getRoutesForStop(stopId: string): BusRoute[];
}

export function createBusRouteService(repository: BusDataRepository): BusRouteService {
```
Apply the same shape: `export function createStopService(repository: BusDataRepository): StopService { ... return { getStopsForRoute, getNearbyStops }; }`.

**Route lookup + NotFoundError pattern** (`BusRouteService.ts` lines 18-24):
```typescript
function getAgencyRoute(shortName: string): BusRoute {
    const route = repository.getRouteByShortName(shortName);
    if (!route) {
        throw new NotFoundError(`Route not found: ${shortName}`);
    }
    return route;
}
```
Reuse verbatim (via `repository.getRouteByShortName(shortName)`) for validating `:shortName` before iterating `route.directions` for the grouped stop response (per CONTEXT D-04 — do not call `route.getAllStops()`).

**Options-object + computed-field mapping pattern** (`PredictionService.ts` lines 1-17, 28-40):
```typescript
export interface PredictionService {
    getPredictionsForStop(stopId: string, options?: PredictionOptions): Promise<StopPredictionsResponse>;
}

export function createPredictionService(repository: BusDataRepository): PredictionService {
    function buildDashApiUrl(stopId: string, options: PredictionOptions): string {
        const params = new URLSearchParams({ stop: stopId });
        if (options.number !== undefined) {
            params.set("number", String(options.number));
        }
        ...
    }
```
Mirror the `options?: XOptions` parameter shape for `getNearbyStops(lat, lng, options?: { radius?: number; count?: number })`, and mirror the "map raw domain data into an enriched response shape" pattern (`mapToDestinations`) for attaching computed `distance` to each `BusStop` in the nearby-search response (per CONTEXT D-08).

**Grouped-by-direction data source** — read directly from `BusRoute.directions` / `RouteDirection.stops`, per `src/server/api/models/BusRoute.ts` lines 11-33 and `src/server/api/models/RouteDirection.ts` lines 3-19:
```typescript
export class BusRoute {
    directions: RouteDirection[];
    getDirectionById(directionId: string): RouteDirection | undefined {
        return this.directions.find((dir) => dir.id === directionId);
    }
}
```
```typescript
export class RouteDirection {
    id: string;
    title: string;
    stops: BusStop[];
}
```
Build the response as `route.directions.map(dir => ({ directionId: dir.id, title: dir.title, stops: dir.stops }))` — do NOT use `BusRoute.getAllStops()` (it dedupes and flattens, losing per-direction order — explicitly disallowed by CONTEXT D-04).

**Location source for distance calc** (`src/server/api/models/BusStop.ts` lines 22-28):
```typescript
getLocation(): { lat: number; lon: number } {
    return { lat: this.lat, lon: this.lon };
}
```
Use `stop.getLocation()` as the input to the new haversine distance function (no analog exists for haversine itself — new code, per CONTEXT).

**Data source for nearby search** (`BusDataRepository.ts` lines 248-251):
```typescript
public getAllStops(): BusStop[] {
    this.assertInitialized();
    return Array.from(this.stops.values());
}
```
Base the nearby-search input list on `repository.getAllStops()` — no new repository method needed.

---

### `src/server/api/controllers/StopController.ts` (controller, request-response)

**Analog:** `src/server/api/controllers/PredictionController.ts` (full file, 65 lines) — closest match because it already validates multiple query params and returns structured 400s, unlike `BusRouteController.ts` which has no query-param validation.

**Imports pattern** (lines 1-3):
```typescript
import type { Request, RequestHandler, Response } from "express";
import { NotFoundError, UpstreamApiError } from "../errors";
import type { PredictionService } from "../services/PredictionService";
```
For `StopController.ts`, only `NotFoundError` applies (no upstream calls happen in this phase per CONTEXT — omit `UpstreamApiError`):
```typescript
import type { Request, RequestHandler, Response } from "express";
import { NotFoundError } from "../errors";
import type { StopService } from "../services/StopService";
```

**Numeric query-param parsing pattern to extend** (lines 9-15):
```typescript
function parseNumberParam(raw: unknown): number | undefined {
    if (raw === undefined) {
        return undefined;
    }
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
```
Reuse for `count`; the CONTEXT explicitly calls for "extending this pattern for `lat`/`lng` validation" — likely a sibling `parseFloatParam` (allowing negative values, since lat/lng can be negative, unlike `parseNumberParam`'s `parsed > 0` constraint) and a `radius` variant permitting positive floats.

**Error status/body mapping pattern** (lines 17-38) — reuse the `resolveErrorStatus`/`resolveErrorBody` pair shape, but for `StopController` only `NotFoundError` (404) is relevant; all others fall through to 500:
```typescript
function resolveErrorStatus(error: unknown): number {
    if (error instanceof NotFoundError) {
        return 404;
    }
    if (error instanceof UpstreamApiError) {
        return 502;
    }
    return 500;
}

function resolveErrorBody(error: unknown): { error: string; details: string } {
    const details = error instanceof Error ? error.message : "Unknown error";
    let label: string;
    if (error instanceof NotFoundError) {
        label = "Not Found";
    } else if (error instanceof UpstreamApiError) {
        label = "Bad Gateway";
    } else {
        label = "Request Failed";
    }
    return { error: label, details };
}
```

**Required-param 400 + handler + try/catch pattern** (lines 40-65):
```typescript
export function createPredictionController(service: PredictionService): PredictionController {
    const getPredictions: RequestHandler = async (req: Request, res: Response) => {
        const { stop, route } = req.query as Record<string, string | undefined>;

        if (!stop) {
            res.status(400).json({ error: "Bad Request", details: "stop parameter is required" });
            return;
        }

        const rawNumber = req.query.number;
        const number = parseNumberParam(rawNumber);
        if (rawNumber !== undefined && number === undefined) {
            res.status(400).json({ error: "Bad Request", details: "number parameter must be a positive integer" });
            return;
        }

        try {
            const result = await service.getPredictionsForStop(stop, { number, route });
            res.json(result);
        } catch (error: unknown) {
            res.status(resolveErrorStatus(error)).json(resolveErrorBody(error));
        }
    };

    return { getPredictions };
}
```
Apply this exact shape twice:
- `getStopsForRoute` — reads `req.params.shortName`, calls `service.getStopsForRoute(shortName)` (sync, no `await` needed — matches `BusRouteController.getRoute` since no upstream calls occur), wraps in try/catch with `resolveErrorStatus`/`resolveErrorBody`.
- `getNearbyStops` — validates required `lat`/`lng` query params (400 if missing/invalid, mirroring the `stop` required-param check), parses optional `radius` (default 0.5, per CONTEXT D-06) and `count` (default 10, max 50 per CONTEXT D-07) via `parseNumberParam`-style helpers, then calls `service.getNearbyStops(...)`.

---

### `src/server/api/routes/stopRoutes.ts` (route, request-response)

**Analog:** `src/server/api/routes/predictionRoutes.ts` (full file, 14 lines) — new top-level resource router with a single query-string endpoint, exact structural match.

```typescript
import { Router } from "express";
import { createPredictionController } from "../controllers/PredictionController";
import { BusDataRepository } from "../repositories";
import { createPredictionService } from "../services/PredictionService";

const service = createPredictionService(BusDataRepository.getInstance());
const controller = createPredictionController(service);

const router = Router();

router.get("/", controller.getPredictions);

export default router;
```
Apply directly, swapping in `StopService`/`StopController` and mounting at `/nearby`:
```typescript
import { Router } from "express";
import { createStopController } from "../controllers/StopController";
import { BusDataRepository } from "../repositories";
import { createStopService } from "../services/StopService";

const service = createStopService(BusDataRepository.getInstance());
const controller = createStopController(service);

const router = Router();

router.get("/nearby", controller.getNearbyStops);

export default router;
```

---

### `src/server/api/routes/busRoutes.ts` (modified — add nested route)

**Current file** (full, 15 lines):
```typescript
import { Router } from "express";
import { createBusRouteController } from "../controllers/BusRouteController";
import { BusDataRepository } from "../repositories";
import { createBusRouteService } from "../services/BusRouteService";

const service = createBusRouteService(BusDataRepository.getInstance());
const controller = createBusRouteController(service);

const router = Router();

router.get("/all", controller.getAllRoutes);
router.get("/:shortName", controller.getRoute);

export default router;
```
Per CONTEXT D-01/D-03, this file needs a new import of `createStopController`/`createStopService` and a new route `router.get("/:shortName/stops", stopController.getStopsForRoute)` added alongside the existing routes — do not add this logic to `BusRouteController`/`BusRouteService`.

---

### `src/server/api/routes/index.ts` (modified — mount new router)

**Current file** (full, 14 lines):
```typescript
import { Router } from "express";
import busRoutes from "./busRoutes";
import predictionRoutes from "./predictionRoutes";

const router = Router();

router.use("/routes", busRoutes);
router.use("/predictions", predictionRoutes);
// Add other domain routes here
// router.use('/stops', busStopRoutes);
// router.use('/vehicles', vehicleRoutes);

export default router;
```
The file already has a placeholder comment (`// router.use('/stops', busStopRoutes);`) anticipating this exact addition — replace with `router.use("/stops", stopRoutes);` and add the corresponding import.

## Shared Patterns

### Custom Error Types
**Source:** `src/server/api/errors/index.ts` (full file, 14 lines)
**Apply to:** `StopService.ts` (throw `NotFoundError` for unknown route shortName or unknown stop), `StopController.ts` (catch and map to 404)
```typescript
export class NotFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "NotFoundError";
    }
}
```
`UpstreamApiError` does not apply to this phase (no upstream DASH API calls — repository data is already in memory).

### Factory-Function Dependency Injection
**Source:** `src/server/api/services/BusRouteService.ts` line 13, `src/server/api/controllers/BusRouteController.ts` line 10
**Apply to:** `StopService.ts` (`createStopService(repository: BusDataRepository): StopService`), `StopController.ts` (`createStopController(service: StopService): StopController`)
No global singleton imports inside service/controller bodies — repository/service passed as parameter, wired in the route file only.

### Query-Param Validation + 400 Response
**Source:** `src/server/api/controllers/PredictionController.ts` lines 9-15, 44-54
**Apply to:** `StopController.getNearbyStops` for `lat`, `lng`, `radius`, `count` — return `{ error: "Bad Request", details: "<param> parameter is required/invalid" }` with status 400 on missing/malformed input, exactly mirroring the `stop`/`number` param checks.

### Repository Read-Only Access
**Source:** `src/server/api/repositories/BusDataRepository.ts` lines 228-251
**Apply to:** `StopService.ts` — use existing `getRouteByShortName(shortName)` and `getAllStops()`; no new repository methods or upstream fetches needed for this phase.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| haversine/distance-calculation helper (likely a private function inside `StopService.ts`, or a new `src/server/api/services/distance.ts` utility) | utility | transform | No geo/distance calculation exists anywhere in the codebase yet; CONTEXT explicitly flags this as new code with no locked implementation approach — use plain TypeScript math (haversine formula) consuming `BusStop.getLocation()`, consistent with "no geo library in package.json." |

## Metadata

**Analog search scope:** `src/server/api/{controllers,services,routes,models,repositories,errors}`
**Files scanned:** 15 non-test source files
**Pattern extraction date:** 2026-08-26
