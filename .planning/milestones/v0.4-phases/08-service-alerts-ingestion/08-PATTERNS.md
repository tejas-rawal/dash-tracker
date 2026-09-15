# Phase 8: Service Alerts Ingestion - Pattern Map

**Mapped:** 2026-09-01
**Files analyzed:** 6 (new) + 1 (modified)
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/server/api/models/ServiceAlert.ts` | model | transform | `src/server/api/models/Prediction.ts` | exact (Dash* + domain type split) |
| `src/server/api/repositories/ServiceAlertRepository.ts` | model/service (singleton store) | batch/polling | `src/server/api/repositories/BusDataRepository.ts` | role-match (singleton + fetch/apply, minus startup-blocking) |
| `src/server/api/services/ServiceAlertService.ts` | service | request-response (query) + transform (mapping) | `src/server/api/services/PredictionService.ts` | exact (Dash mapping + factory DI) |
| `src/server/api/services/ServiceAlertPollService.ts` (or poll logic inside repository — planner's call) | service | event-driven (interval poll) | `src/server/api/services/PredictionStreamService.ts` | exact (setInterval poll loop, error-log-and-continue) |
| `src/server/app.ts` (modified) | config/bootstrap | event-driven (boot wiring) | itself (existing `BusDataRepository.initialize()` wiring) | exact (extend, don't replace) |
| `src/server/api/repositories/index.ts` (modified) | barrel | n/a | itself | exact |
| `src/server/api/models/index.ts` (modified) | barrel | n/a | itself | exact |

Note: whether the poll loop lives inside a dedicated `ServiceAlertRepository.startPolling()` method (mirroring `BusDataRepository`'s own fetch methods, D-01 keeps it a separate repo) or a standalone `ServiceAlertPollService` wrapping the repository is a planner/implementer decision — both analogs are provided below (`BusDataRepository` for repo shape, `PredictionStreamService` for poll-loop shape). D-01 says "new dedicated repository/model/service ... mirroring the existing `BusDataRepository`/`BusRoute`/`PredictionService` factory-DI pattern" — so prefer: `ServiceAlert` (model) + `ServiceAlertRepository` (singleton store, fetch+apply, **not** blocking-init) + `ServiceAlertService` (factory-DI, Dash-mapping) + a small poll driver (either a method on the repository or a thin service) started from `app.ts`.

## Pattern Assignments

### `src/server/api/models/ServiceAlert.ts` (model, transform)

**Analog:** `src/server/api/models/Prediction.ts` (full file, 76 lines — read in one pass)

**Domain type vs. Dash-shaped type split** (lines 1-43, 44-75):
```typescript
// Domain-facing response/entity shapes at top of file
export interface RoutePrediction {
    routeId: string;
    routeName: string;
    // ...
}

// Dash-prefixed raw upstream shapes at bottom, mapped explicitly in the service
export interface DashPredictionData {
    routeId: string;
    routeName: string;
    // ...
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

Apply to `ServiceAlert.ts`: define `ServiceAlert` (domain) with `id`, `cause?: string`, `effect?: string`, `activePeriod: { start: string | null; end: string | null }`, header/description text fields, plus `DashAlert`/`DashActivePeriod`/`DashAlertsApiResponse` (raw GTFS-RT shapes) at the bottom — mirroring the `Prediction`/`DashPrediction` split exactly. Per D-04, `cause`/`effect` are typed `string | undefined` — no enum.

---

### `src/server/api/repositories/ServiceAlertRepository.ts` (repository, batch/polling singleton)

**Analog:** `src/server/api/repositories/BusDataRepository.ts` (278 lines — read in full, one pass)

**Singleton pattern** (lines 30-47):
```typescript
export class BusDataRepository {
    private routes: Map<string, BusRoute> = new Map();
    private isInitialized = false;
    private initializationPromise: Promise<void> | null = null;

    private static instance: BusDataRepository;

    private constructor() {}

    public static getInstance(): BusDataRepository {
        if (!BusDataRepository.instance) {
            BusDataRepository.instance = new BusDataRepository();
        }
        return BusDataRepository.instance;
    }
}
```
Apply directly: `ServiceAlertRepository` gets its own `getInstance()`, but per D-06 it must NOT gate server startup — do not call `assertInitialized()`-style guards that throw before first fetch; instead default to an empty array/map until the first poll completes (stale-but-available / empty-until-first-fetch, never a hard error).

**fetch → apply staging pattern** (lines 58-73, 79-89):
```typescript
public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = this.fetchAndProcessData()
        .then((data) => this.applyData(data))
        .catch((error) => this.handleLoadError("initialize", error));

    return this.initializationPromise;
}

public async refreshData(): Promise<void> {
    const refreshPromise = this.fetchAndProcessData()
        .then((data) => this.applyData(data))
        .catch((error) => this.handleLoadError("refresh", error));

    this.initializationPromise = refreshPromise;
    return refreshPromise;
}

private applyData(data: { routes: Map<string, BusRoute>; /* ... */ }): void {
    this.routes = data.routes;
    this.isInitialized = true;
    this.initializationPromise = null;
}
```
Apply to `ServiceAlertRepository`: `fetchAndProcessAlerts()` → `applyAlerts()` (swap in a staged `Map<string, ServiceAlert>` or array, commit atomically). Per D-07, the first fetch should fire immediately (fire-and-forget from `app.ts`, not awaited before `listen()`), then continue via `setInterval`.

**Error handling — log + rethrow (adapt to log + keep-stale per D-Claude's-discretion)** (lines 96-101, 139-143):
```typescript
private handleLoadError(action: "initialize" | "refresh", error: unknown): never {
    this.initializationPromise = null;
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Failed to ${action} bus data: ${message}`);
    throw new Error(`Failed to ${action} bus data: ${message}`);
}
```
For alerts, do NOT rethrow-and-clear on poll failure (per CONTEXT.md discretion note) — instead follow the `PredictionStreamService.poll()` catch-and-log pattern below, keeping the last successfully fetched alert set intact.

**Read-only query accessors** (lines 236-264):
```typescript
public getAllRoutes(): BusRoute[] {
    this.assertInitialized();
    return Array.from(this.routes.values());
}
```
Apply: `getActiveAlerts()` returning currently-active alerts (filtered by active window against `Date.now()`), no `assertInitialized()` guard (empty store is valid, not an error state, per D-06).

---

### `src/server/api/services/ServiceAlertService.ts` (service, transform + query)

**Analog:** `src/server/api/services/PredictionService.ts` (103 lines — read in full, one pass)

**Factory-DI + imports pattern** (lines 1-19):
```typescript
import { axios, environment, logger } from "../../config";
import { NotFoundError, UpstreamApiError } from "../errors";
import type { BusStop } from "../models";
import type { DashApiResponse, /* ... */ } from "../models/Prediction";
import type { BusDataRepository } from "../repositories";

export interface PredictionService {
    getPredictionsForStop(stopId: string, options?: PredictionOptions): Promise<StopPredictionsResponse>;
}

export function createPredictionService(repository: BusDataRepository): PredictionService {
    // ...
    return { getPredictionsForStop };
}
```
Apply: `createServiceAlertService(repository: ServiceAlertRepository)` — same factory-function-returns-object-literal shape, named-export interface + factory function.

**Fetch-from-DASH-API pattern** (lines 28-47):
```typescript
function buildDashApiUrl(stopId: string, options: PredictionOptions): string {
    const { agency } = environment.dashApi;
    const params = new URLSearchParams({ stop: stopId });
    return `/real-time/${agency}/predictions?${params.toString()}`;
}

async function fetchFromDashApi(stopId: string, options: PredictionOptions): Promise<DashApiResponse> {
    const url = buildDashApiUrl(stopId, options);
    logger.info(`Fetching predictions from DASH API: ${url}`);
    const response = await axios.get(url);
    return response.data as DashApiResponse;
}
```
Apply for the alerts endpoint URL builder (endpoint path TBD — not yet documented in `INTEGRATIONS.md`; GTFS-RT service-alerts endpoint on DASH/Swiftly needs confirming during implementation, e.g. likely `/real-time/{agency}/gtfs-rt-alerts` or similar — check DASH/Swiftly API docs).

**Dash → domain mapping pattern** (lines 63-73):
```typescript
function mapToRoutePredictions(predictionsData: DashPredictionData[]): RoutePrediction[] {
    return predictionsData.map((item) => ({
        routeId: item.routeId,
        routeName: item.routeName,
        // ...
        destinations: mapToDestinations(item.destinations),
    }));
}
```
Apply: `mapToServiceAlert(dashAlert: DashAlert): ServiceAlert` — pass through `cause`/`effect` as raw strings (D-04), and collapse `active_period` entries per D-02/D-03:
```typescript
function deriveActiveWindow(periods: DashActivePeriod[] | undefined): { start: string | null; end: string | null } {
    if (!periods || periods.length === 0) {
        return { start: null, end: null }; // always-active, never expires (D-03)
    }
    const starts = periods.map((p) => p.start).filter((s): s is number => s !== undefined);
    const ends = periods.map((p) => p.end).filter((e): e is number => e !== undefined);
    return {
        start: starts.length ? new Date(Math.min(...starts) * 1000).toISOString() : null,
        end: ends.length ? new Date(Math.max(...ends) * 1000).toISOString() : null,
    };
}
```

**Error mapping pattern** (lines 83-85):
```typescript
if (!dashResponse.success) {
    throw new UpstreamApiError(`DASH API returned success: false for stop ${stopId}`);
}
```
Apply: throw `UpstreamApiError` on failed/malformed alerts fetch, per CANONICAL_REFS (`src/server/api/errors/index.ts` — `NotFoundError`, `UpstreamApiError`).

---

### Poll loop driver (interval-based, boot-triggered)

**Analog:** `src/server/api/services/PredictionStreamService.ts` (114 lines — read in full, one pass)

**setInterval poll loop with catch-and-log (never throw)** (lines 26-47):
```typescript
async function poll(stopId: string): Promise<void> {
    const entry = loops.get(stopId);
    if (!entry) return;

    try {
        const result = await predictionService.getPredictionsForStop(stopId);
        entry.lastData = result;
        // deliver to subscribers...
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error(`Failed to poll predictions for stop ${stopId}: ${message}`);
    }
}
```
This is the exact "log error, keep serving last-known-good data" pattern to mirror for the alerts poll (per CONTEXT.md's Claude's Discretion note). Adapt to a boot-triggered, non-subscriber-driven loop:
```typescript
const POLL_INTERVAL_MS = 5 * 60_000; // 5 min, vs. 30s prediction poll

async function pollAlerts(): Promise<void> {
    try {
        await repository.refreshAlerts();
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error(`Failed to poll service alerts: ${message}`);
        // do NOT clear the store — keep last successfully fetched alerts (stale-but-available)
    }
}

export function startServiceAlertPolling(): void {
    void pollAlerts(); // immediate first fetch, fire-and-forget (D-07)
    setInterval(() => {
        void pollAlerts();
    }, POLL_INTERVAL_MS);
}
```

**setInterval usage precedent** (line 101-103):
```typescript
timer: setInterval(() => {
    void poll(stopId);
}, POLL_INTERVAL_MS),
```
Confirms project convention: wrap async poll calls in `void poll(...)` inside `setInterval`'s callback (fire-and-forget, no unhandled-promise warnings).

---

### `src/server/app.ts` (modified — boot wiring)

**Analog:** itself, current startup sequence (lines 1-43, full file)

**Current blocking-init pattern to NOT replicate for alerts** (lines 19-43):
```typescript
const repository = BusDataRepository.getInstance();
repository
    .initialize()
    .then(() => {
        const server = app.listen(port, () => {
            logger.info(`Server is running on port ${port}`);
        });
        // ...
    })
    .catch((error: unknown) => {
        // ...
        process.exit(1);
    });
```
Per D-06/D-07, the alerts poll must NOT be awaited before `app.listen()`. Add a separate, non-blocking call alongside (not inside) the `repository.initialize().then(...)` chain — e.g. call `startServiceAlertPolling()` (or `ServiceAlertRepository.getInstance().startPolling()`) either before the `.then()` chain (fire immediately at process start) or inside the `.then()` callback body without awaiting it. Do not add it to the `.catch()` failure path — alert polling should proceed independently of bus-data init outcome.

---

## Shared Patterns

### Winston logging
**Source:** `src/server/api/repositories/BusDataRepository.ts` lines 111, 123, 137, 141 and `PredictionStreamService.ts` lines 39-40, 44-45
**Apply to:** repository fetch logging, poll start/error logging
```typescript
logger.info(`Fetching bus data from API: ${apiUrl}`);
logger.warn("No routes found in API response");
logger.error(`Failed to fetch and process data: ${message}`);
```

### Authenticated axios instance
**Source:** `src/server/config/axios.ts` (referenced via barrel `src/server/config/index.ts` line 3: `export { axiosInstance as axios } from "./axios";`)
**Apply to:** `ServiceAlertService`'s DASH API fetch call — `import { axios, environment, logger } from "../../config";`

### Error classes
**Source:** `src/server/api/errors/index.ts` (full file, 13 lines)
```typescript
export class UpstreamApiError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "UpstreamApiError";
    }
}
```
**Apply to:** `ServiceAlertService` fetch-failure path (throw `UpstreamApiError` on malformed/failed alerts response).

### Barrel re-exports
**Source:** `src/server/api/models/index.ts`, `src/server/api/repositories/index.ts` (both `export * from "./X"` one-liners)
**Apply to:** add `export * from "./ServiceAlert"` to `models/index.ts`; add `export * from "./ServiceAlertRepository"` to `repositories/index.ts`. If a new `services/index.ts` barrel doesn't exist, check — services are currently imported directly by path (no barrel found in `src/server/api/services/`), so `ServiceAlertService.ts` likely follows the same no-barrel convention as `PredictionService.ts`/`BusRouteService.ts`.

## No Analog Found

None — all planned files have a strong analog in the existing codebase (this phase is explicitly designed by CONTEXT.md D-01 to mirror the existing repository/model/service triad).

## Metadata

**Analog search scope:** `src/server/api/{models,repositories,services,errors}/`, `src/server/{app.ts,config/}`
**Files scanned:** `BusDataRepository.ts`, `PredictionStreamService.ts`, `PredictionService.ts`, `Prediction.ts`, `BusRoute.ts`, `app.ts`, `errors/index.ts`, `models/index.ts`, `repositories/index.ts`, `config/index.ts`
**Pattern extraction date:** 2026-09-01
