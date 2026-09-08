# Phase 6: Alerts Surfaced on Routes, Stops & Predictions - Pattern Map

**Mapped:** 2026-09-04
**Files analyzed:** 6 (new/modified)
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/server/api/models/ServiceAlertSummary.ts` (new) | model | transform | `src/server/api/models/StopDiscovery.ts` | role-match (response-shape type, not domain class) |
| `src/server/api/repositories/ServiceAlertRepository.ts` (modified — add `getActiveAlertsForRoute`/`getActiveAlertsForStop`) | repository | CRUD (read/filter) | itself (existing `getActiveAlerts`) | exact |
| `src/server/api/services/ServiceAlertService.ts` or new alert-embedding helper (modified/new — add trimmed-summary mapping fn) | service | transform | `PredictionService.mapToRoutePredictions`/`mapToDestinations` (`src/server/api/services/PredictionService.ts`) | exact (Dash→domain→response-shape mapping pattern) |
| `src/server/api/services/BusRouteService.ts` (modified — embed `alerts` on route/stop-for-route responses) | service | CRUD + transform | itself (existing `getAgencyRoutes`/`getAgencyRoute`) | exact |
| `src/server/api/services/StopService.ts` (modified — embed `alerts` on `getNearbyStops`) | service | CRUD + transform | itself (existing `getNearbyStops`) | exact |
| `src/server/app.ts` (modified — wire `ServiceAlertRepository` into `BusRouteService`/`StopService` factory calls) | config/wiring | request-response | itself (existing DI wiring for `ServiceAlertPollService`) | exact |

No new controllers or routes are needed — response shapes change inside existing services; `BusRouteController` and `StopController` pass through service output unchanged (`res.json(result)`), so no controller edits are anticipated unless a plan discovers otherwise.

## Pattern Assignments

### `src/server/api/models/ServiceAlertSummary.ts` (model, transform) — NEW FILE

**Analog:** `src/server/api/models/StopDiscovery.ts` (plain response-shape interfaces, not the domain `class`-based models like `BusRoute`/`BusStop`)

**Interface-style pattern** (full file, `src/server/api/models/StopDiscovery.ts` lines 1-21):
```typescript
import type { BusStop } from "./BusStop";

export interface RouteDirectionStops {
    directionId: string;
    title: string;
    stops: BusStop[];
}

export interface NearbySearchOptions {
    radius?: number;
    count?: number;
}

export interface NearbyStop {
    id: string;
    name: string;
    code: number;
    lat: number;
    lon: number;
    distance: number;
}
```

**Field source — mirror `ServiceAlert`/`ServiceAlertActivePeriod`** (`src/server/api/models/ServiceAlert.ts` lines 1-16):
```typescript
export interface ServiceAlertActivePeriod {
    start: string | null;
    end: string | null;
}

export interface ServiceAlert {
    id: string;
    cause?: string;
    effect?: string;
    headerText?: string;
    descriptionText?: string;
    url?: string;
    informedRouteIds: string[];
    informedStopIds: string[];
    activePeriod: ServiceAlertActivePeriod;
}
```

Per D-01, the new `ServiceAlertSummary` type should include only `id`, `cause`, `effect`, `headerText`, `descriptionText`, `activePeriod` — omit `url`, `informedRouteIds`, `informedStopIds`. Add this type to a new file (`models/ServiceAlertSummary.ts`) or alongside `ServiceAlert.ts`, then re-export from `src/server/api/models/index.ts` (barrel — confirm export list matches existing `export * from "./X"` pattern used there).

---

### `src/server/api/repositories/ServiceAlertRepository.ts` (repository, CRUD/read) — MODIFIED

**Analog:** itself — extend the existing `getActiveAlerts` pattern (full file already read, `src/server/api/repositories/ServiceAlertRepository.ts` lines 1-47)

**Core pattern to extend** (lines 43-46):
```typescript
    // D-06: no assertInitialized() guard — an empty store is a valid state, not an error.
    public getActiveAlerts(referenceTime: Date = new Date()): ServiceAlert[] {
        return Array.from(this.alerts.values()).filter((alert) => isAlertActive(alert, referenceTime));
    }
```

New methods (`getActiveAlertsForRoute(routeId)`, `getActiveAlertsForStop(stopId)`) should build on top of `getActiveAlerts()` rather than duplicating the active-window filter, e.g.:
```typescript
    public getActiveAlertsForRoute(routeId: string, referenceTime: Date = new Date()): ServiceAlert[] {
        return this.getActiveAlerts(referenceTime).filter((alert) => alert.informedRouteIds.includes(routeId));
    }

    public getActiveAlertsForStop(stopId: string, referenceTime: Date = new Date()): ServiceAlert[] {
        return this.getActiveAlerts(referenceTime).filter((alert) => alert.informedStopIds.includes(stopId));
    }
```
Per D-04, no special-casing needed for agency-wide alerts (empty `informedRouteIds`/`informedStopIds`) — `.includes()` naturally excludes them since they never match a specific `routeId`/`stopId`.

**Singleton access pattern** (lines 18-30, unchanged, for reference when wiring into services):
```typescript
export class ServiceAlertRepository {
    private alerts: Map<string, ServiceAlert> = new Map();
    private static instance: ServiceAlertRepository;
    private constructor() {}

    public static getInstance(): ServiceAlertRepository {
        if (!ServiceAlertRepository.instance) {
            ServiceAlertRepository.instance = new ServiceAlertRepository();
        }
        return ServiceAlertRepository.instance;
    }
    ...
}
```

---

### Alert-summary mapping function (new function, likely added to `ServiceAlertService.ts` or a small new module) (service, transform)

**Analog:** `src/server/api/services/PredictionService.ts` — `mapToDestinations`/`mapToRoutePredictions` (lines 49-73)

**Core mapping pattern to mirror:**
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
```

Apply the same one-object-shape-to-another mapping style for `ServiceAlert -> ServiceAlertSummary`:
```typescript
function mapToServiceAlertSummary(alert: ServiceAlert): ServiceAlertSummary {
    return {
        id: alert.id,
        cause: alert.cause,
        effect: alert.effect,
        headerText: alert.headerText,
        descriptionText: alert.descriptionText,
        activePeriod: alert.activePeriod,
    };
}
```
Existing `ServiceAlertService.mapToServiceAlert` (`src/server/api/services/ServiceAlertService.ts` lines 80-99) is the sibling Dash-to-domain mapping already in the file — the new function is domain-to-response-shape, one layer further down the same pipeline. Co-locate the new mapping function in `ServiceAlertService.ts` (exported for use by `BusRouteService`/`StopService`) or a new pure-function module (e.g. `src/server/api/services/serviceAlertMapping.ts`) — Claude's discretion per CONTEXT.md.

---

### `src/server/api/services/BusRouteService.ts` (service, CRUD + transform) — MODIFIED

**Analog:** itself (full file already read, `src/server/api/services/BusRouteService.ts` lines 1-44)

**Factory-DI + existing method pattern to extend:**
```typescript
export function createBusRouteService(repository: BusDataRepository): BusRouteService {
    function getAgencyRoutes(): BusRoute[] {
        return repository.getAllRoutes();
    }

    function getAgencyRoute(shortName: string): BusRoute {
        const route = repository.getRouteByShortName(shortName);
        if (!route) {
            throw new NotFoundError(`Route not found: ${shortName}`);
        }
        return route;
    }
    ...
    return { getAgencyRoutes, getAgencyRoute, getAgencyStop, getAgencyStops, getRoutesForStop };
}
```

To embed alerts (D-02: `alerts` always present, `[]` when none), the factory signature needs a second dependency — `createBusRouteService(repository: BusDataRepository, serviceAlertRepository: ServiceAlertRepository)` — mirroring the existing multi-arg factory-DI convention already used elsewhere (e.g. `createServiceAlertPollService(createServiceAlertService(), ServiceAlertRepository.getInstance())` in `src/server/app.ts` line 26-28). Return types change from `BusRoute`/`BusRoute[]` to a new response-shape type (e.g. `BusRouteWithAlerts`) that spreads the route plus an `alerts: ServiceAlertSummary[]` field — do not mutate the `BusRoute` domain class itself (matches the project's `Dash*`-vs-domain-vs-response-shape separation convention noted in CLAUDE.md).

---

### `src/server/api/services/StopService.ts` (service, CRUD + transform) — MODIFIED

**Analog:** itself (full file already read, `src/server/api/services/StopService.ts` lines 1-52)

**`getNearbyStops` pattern to extend** (lines 29-49):
```typescript
    function getNearbyStops(lat: number, lng: number, options?: NearbySearchOptions): NearbyStop[] {
        const radius = options?.radius ?? DEFAULT_RADIUS_MILES;
        const count = Math.min(options?.count ?? DEFAULT_COUNT, MAX_COUNT);

        return repository
            .getAllStops()
            .map((stop) => {
                const location = stop.getLocation();
                return {
                    id: stop.id,
                    name: stop.name,
                    code: stop.code,
                    lat: location.lat,
                    lon: location.lon,
                    distance: haversineDistanceMiles({ lat, lon: lng }, location),
                };
            })
            .filter((stop) => stop.distance <= radius)
            .sort((a, b) => a.distance - b.distance)
            .slice(0, count);
    }
```
Add `alerts: ServiceAlertSummary[]` to each mapped `NearbyStop`-like object inside the existing `.map()` callback, calling `serviceAlertRepository.getActiveAlertsForStop(stop.id)` and mapping via `mapToServiceAlertSummary`. `getStopsForRoute` (lines 16-27) needs the same treatment for each `BusStop` in `direction.stops` — since `RouteDirectionStops.stops` is `BusStop[]`, this likely requires a new response-shape type (e.g. `BusStopWithAlerts`) analogous to `NearbyStop`.

---

### `src/server/app.ts` (wiring) — MODIFIED

**Analog:** itself — existing multi-dependency factory wiring (lines 2, 26-28):
```typescript
import { BusDataRepository, ServiceAlertRepository } from "./api/repositories";
...
const serviceAlertPollService = createServiceAlertPollService(
    createServiceAlertService(),
    ServiceAlertRepository.getInstance(),
```
Follow this same pattern to pass `ServiceAlertRepository.getInstance()` into `createBusRouteService(...)` and `createStopService(...)` at their existing call sites in `app.ts`.

## Shared Patterns

### Factory-function DI (no direct singleton imports inside services)
**Source:** `src/server/api/services/BusRouteService.ts` lines 13, `src/server/app.ts` lines 26-28
**Apply to:** `BusRouteService`, `StopService` — both must receive `ServiceAlertRepository` as a constructor/factory parameter, not import `ServiceAlertRepository.getInstance()` directly inside the service module.

### Error mapping (unchanged, no new error types needed)
**Source:** `src/server/api/errors/index.ts` (via `NotFoundError`/`UpstreamApiError` usage in `BusRouteService.ts`, `StopService.ts`)
**Apply to:** No new error paths are introduced by this phase — alert lookups return `[]` for "no alerts," never throw. `NotFoundError` handling for missing routes/stops is unchanged.

### Dash* → domain → response-shape mapping
**Source:** `src/server/api/services/PredictionService.ts` lines 49-73 (`mapToDestinations`, `mapToRoutePredictions`); `src/server/api/services/ServiceAlertService.ts` lines 80-99 (`mapToServiceAlert`)
**Apply to:** The new alert-summary mapping function — same one-shape-to-another transform style, pure function, no side effects.

### Response-shape interfaces (plain, not domain classes)
**Source:** `src/server/api/models/StopDiscovery.ts` (full file)
**Apply to:** `ServiceAlertSummary` and any `*WithAlerts` response types — these are plain interfaces exported from `models/`, distinct from the class-based domain models (`BusRoute`, `BusStop`).

### Barrel re-exports
**Source:** `src/server/api/models/index.ts`, `src/server/api/repositories/index.ts` (`export * from "./X"`)
**Apply to:** Any new model file (`ServiceAlertSummary.ts`) must be added to `src/server/api/models/index.ts`.

## No Analog Found

None — all files in scope have a direct or near-direct analog already in the codebase (this phase modifies/extends existing files rather than introducing a new architectural role).

## Metadata

**Analog search scope:** `src/server/api/{models,services,repositories,controllers,routes}`
**Files scanned:** 25 non-test `.ts` files under `src/server/api/`, plus `src/server/app.ts`
**Pattern extraction date:** 2026-09-04
