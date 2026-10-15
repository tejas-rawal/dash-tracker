# Phase 13: Resilient Route/Stop Data Lifecycle - Pattern Map

**Mapped:** 2026-09-30
**Files analyzed:** 27 (5 new, 22 modified: source plus co-located tests)
**Analogs found:** 26 / 27 (the backoff/jitter scheduling math has no analog)

All analog paths below are git-tracked source (verified with `git ls-files`). All paths are relative to the repo root.

## Load-Bearing Discrepancies (read first)

1. **The error body is `{ error, details }`, not `{ error, message }`.** CONTEXT D-03 says "existing `{ error, message }` body shape", but every controller and test uses `details` (e.g. `PredictionController.ts:33-44`, `VehicleController.test.ts:108-111`, `upstreamTimeout.test.ts:73-76`). The 503 body should be `{ error: "Service Unavailable", details: "<loading text>" }` to match the existing shape. D-03's intent was the existing shape, so use `details`.
2. **No controller sets a response header today.** The only header precedent is the SSE `res.writeHead(200, {...})` in `PredictionStreamController.ts:95-100`. `Retry-After` will be the first `res.set(...)`/`res.setHeader(...)` call. Every controller test's `makeMockRes` (e.g. `VehicleController.test.ts:7-14`) only mocks `json` and `status`, so any test that hits the 503 path must add a chainable `set` (or `setHeader`) mock.
3. **Today the 500 body echoes `error.message`, and tests lock that in.** These assertions must be rewritten to the new generic text under D-02: `BusRouteController.test.ts:104-105, 161, 252`, `PredictionController.test.ts:298-299, 352`, `NearbyPredictionController.test.ts:274, 289`, `VehicleController.test.ts:148-149`, plus any similar assertions in the Stop/Favorites/Recents/PredictionStream tests. The 404 and 502 bodies keep `details: error.message`.
4. **`upstreamTimeout.test.ts:151-163` calls `repository.initialize()` and asserts the old double-prefixed log** `"Failed to initialize bus data: Failed to fetch and process data: ..."`. D-08 consolidates logging and D-19 removes `initialize()`, so this test must be rewritten against the new load API or the refresh service. Its comment at lines 54-56 ("Never seed the repository ... relies on the singleton never having loaded") also makes the file a ready-made place to test "unloaded means 503" end to end.
5. **The D-08 "one log line per attempt" rule conflicts with the repository's existing `info` logs.** `BusDataRepository.fetchAndProcessData` logs `info` at line 111 ("Fetching bus data from API") and line 137 ("Processed N routes"), and `error` at lines 99 and 141. The planner must decide which of these survive. At minimum, the two `error` logs (lines 99 and 141) go away and are replaced by the service's single `warn` or `info`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/server/api/errors/index.ts` (mod) | model (error type) | n/a | same file, `UpstreamApiError` lines 8-13 | exact |
| `src/server/api/errors/index.test.ts` (mod) | test | n/a | same file, lines 41-76 | exact |
| `src/server/api/controllers/errorResponse.ts` (new) | utility (controller helper) | request-response / transform | `src/server/api/controllers/PredictionController.ts` lines 23-44 | exact (lift and extend) |
| `src/server/api/controllers/errorResponse.test.ts` (new) | test | request-response | `src/server/api/controllers/VehicleController.test.ts` lines 1-14, 94-151 | role-match |
| `src/server/api/controllers/BusRouteController.ts` (mod) | controller | request-response | `src/server/api/controllers/VehicleController.ts` | exact |
| `src/server/api/controllers/StopController.ts` (mod) | controller | request-response | `VehicleController.ts` | exact |
| `src/server/api/controllers/PredictionController.ts` (mod) | controller | request-response | `VehicleController.ts` | exact |
| `src/server/api/controllers/PredictionStreamController.ts` (mod) | controller | streaming (SSE) | same file lines 74-84 | exact |
| `src/server/api/controllers/VehicleController.ts` (mod) | controller | request-response | same file | exact |
| `src/server/api/controllers/NearbyPredictionController.ts` (mod) | controller | request-response | `VehicleController.ts` | exact |
| `src/server/api/controllers/FavoritesController.ts` (mod) | controller | CRUD | `VehicleController.ts` | exact |
| `src/server/api/controllers/RecentsController.ts` (mod) | controller | request-response | `VehicleController.ts` | exact |
| 8 x `src/server/api/controllers/*Controller.test.ts` (mod) | test | request-response | `VehicleController.test.ts` lines 94-151 | exact |
| `src/server/api/services/BusDataRefreshService.ts` (new) | service (scheduler) | event-driven / batch (timer) | `src/server/api/services/ServiceAlertPollService.ts` | role-match (setTimeout chain instead of setInterval) |
| `src/server/api/services/BusDataRefreshService.test.ts` (new) | test | event-driven | `src/server/api/services/ServiceAlertPollService.test.ts` | exact |
| `src/server/api/services/ServiceAlertPollService.ts` (mod, add `stop()`) | service | event-driven | same file + `PredictionStreamService.ts` line 57 (`clearInterval`) | exact |
| `src/server/api/services/ServiceAlertPollService.test.ts` (mod) | test | event-driven | same file lines 52-66 | exact |
| `src/server/api/repositories/BusDataRepository.ts` (mod) | repository | batch load + in-memory read | same file | exact |
| `src/server/api/repositories/BusDataRepository.test.ts` (mod) | test | batch | same file | exact |
| `src/server/app.ts` (mod) | config / entry point | lifecycle | same file | exact |
| `src/server/api/routes/upstreamTimeout.test.ts` (mod) | test (E2E) | request-response | same file | exact |
| `src/server/api/routes/dataLifecycle.test.ts` (new, optional E2E for 503 then 200 and nearby-not-gated) | test (E2E) | request-response | `src/server/api/routes/upstreamTimeout.test.ts` | exact |

Services that read the repository (`BusRouteService`, `StopService`, `PredictionService`, `VehicleService`, `FavoritesService`, `RecentsService`) need **no change**. None of them catches repository errors: `FavoritesService.resolveEntity` (lines 16-20) calls the repository directly, and `PredictionService.getValidatedStop` (lines 32-38) runs before any `.catch`. So `DataNotReadyError` reaches the controllers unchanged. `PredictionStreamService.subscribe` (lines 75-86) rethrows through `try/finally`, which satisfies D-04 without any change.

---

## Pattern Assignments

### `src/server/api/errors/index.ts` (model, add `DataNotReadyError`)

**Analog:** same file, lines 8-13. Copy it verbatim and rename:
```typescript
export class UpstreamApiError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "UpstreamApiError";
    }
}
```
The CONTEXT leaves the message text to Claude's discretion. A default constructor argument is fine, but keeping `constructor(message: string)` matches the siblings.

**Test:** `src/server/api/errors/index.test.ts` lines 41-76. Add a third `describe("DataNotReadyError")` block with the same four `it`s: instance of `Error`, instance of its own class, message, and `name`. Use the Arrange/Act/Assert comments.

---

### `src/server/api/controllers/errorResponse.ts` (new utility, request-response)

**Analog:** `src/server/api/controllers/PredictionController.ts` lines 23-44. This is the most complete of the 7 duplicated mappers, with both 404 and 502:
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

**Imports pattern** (`PredictionController.ts` lines 1-2): `import type { Response } from "express";` and `import { DataNotReadyError, NotFoundError, UpstreamApiError } from "../errors";`. Use relative paths only, with no aliases.

**Required changes when lifting:**
- Add `DataNotReadyError` mapped to `503`, with label `"Service Unavailable"`, plus a `Retry-After` header built from a named module constant. Follow the constant style of `NearbyPredictionController.ts` lines 9-11 (`const MAX_RADIUS_MILES = 1;` with a "why" comment), e.g. `const RETRY_AFTER_SECONDS = 5;`.
- The 500 branch must use a generic `details` string and must not use `error.message` (D-02, closes WR-02/IN-04).
- 404 keeps `{ error: "Not Found", details: error.message }`. 502 keeps `{ error: "Bad Gateway", details: error.message }`, where the message is already message-only per Phase 12 D-06.
- Suggested signature, since it needs `res` to set the header: `export function sendErrorResponse(res: Response, error: unknown): void`. Use a named export and an explicit return type, per CLAUDE.md.
- Optional: the 500 branch is the only place an unexpected error would otherwise disappear once its message is no longer echoed. If the planner wants it logged, follow the message-only rule from `processHandlers.ts` lines 3-11: log `error.message` or the stack, never the object. Planner's call.

---

### Controllers (8 files): replace local mappers with the shared helper

**Analog / call-site shape:** `src/server/api/controllers/VehicleController.ts` lines 32-45:
```typescript
export function createVehicleController(service: VehicleService): VehicleController {
    const getVehiclePositions: RequestHandler = async (req: Request, res: Response) => {
        const { route } = req.query as Record<string, string | undefined>;

        try {
            const result = await service.getVehiclePositions({ route });
            res.json(result);
        } catch (error: unknown) {
            res.status(resolveErrorStatus(error)).json(resolveErrorBody(error));
        }
    };
```
In each `catch`, replace `res.status(resolveErrorStatus(error)).json(resolveErrorBody(error))` with the helper call. Then delete the local mappers and the now-unused error imports:

| File | Local mapper to delete | Catch sites |
|---|---|---|
| `BusRouteController.ts` | inline ternaries (no named fn), lines 16-19, 29-32 | 2 |
| `StopController.ts` | lines 34-45 | lines 54, 97 |
| `PredictionController.ts` | lines 23-44 | line 70 |
| `PredictionStreamController.ts` | lines 11-32 | line 82 (keep the `finished`/`headersSent` guard at lines 79-81) |
| `VehicleController.ts` | lines 9-30 | line 40 |
| `NearbyPredictionController.ts` | lines 40-48 (502/500 only) | line 91 |
| `FavoritesController.ts` | lines 11-22 | lines 50, 72, 81 |
| `RecentsController.ts` | lines 9-20 | line 33 |

Leave the 400 validation bodies (`{ error: "Bad Request", details: ... }`) inline as they are. They are not error mapping.

**SSE specifics (D-04):** in `PredictionStreamController.ts` lines 74-84, `subscribe` rejects before `writeHead`, so the helper runs on a normal JSON response. The header (`Retry-After`) can be set safely because `res.headersSent` is already checked at line 79. No stream-specific gate is needed.

**Controller test pattern:** `src/server/api/controllers/VehicleController.test.ts`.
- Mock res (lines 7-14). This must gain `set` (or `setHeader`) for the 503 tests:
```typescript
const makeMockRes = () => {
    const res = {
        json: vi.fn(),
        status: vi.fn(),
    } as unknown as Response;
    (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
    return res;
};
```
- Error-path test shape (lines 94-112):
```typescript
it("responds with 502 and a Bad Gateway body when the service throws UpstreamApiError", async () => {
    // Arrange
    const mockService = makeMockService();
    mockService.getVehiclePositions.mockRejectedValue(
        new UpstreamApiError("DASH API returned success: false for vehicle positions"),
    );
    const { getVehiclePositions } = createVehicleController(mockService);
    const req = makeMockReq({});
    const res = makeMockRes();

    // Act
    await getVehiclePositions(req, res, vi.fn());

    // Assert
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({
        error: "Bad Gateway",
        details: "DASH API returned success: false for vehicle positions",
    });
});
```
Put the exhaustive mapping tests (404/503/502/500, generic 500 text, non-`Error` throw, and `Retry-After` value) in `errorResponse.test.ts`. Each controller test only needs one 503 case to prove the helper is wired in, plus rewritten 500 assertions (see Discrepancy 3). `NearbyPredictionController` has no repository reader, so its 503 case can be left out, although wiring it to the shared helper is still required.

---

### `src/server/api/services/BusDataRefreshService.ts` (new service, timer-driven batch)

**Analog:** `src/server/api/services/ServiceAlertPollService.ts` (whole file, 36 lines).

**Imports + constant pattern** (lines 1-5):
```typescript
import { logger } from "../../config";
import type { ServiceAlertRepository } from "../repositories/ServiceAlertRepository";
import type { ServiceAlertService } from "./ServiceAlertService";

const POLL_INTERVAL_MS = 5 * 60_000; // 5 min, vs. PredictionStreamService's 30s prediction poll
```
Use the same format for the D-07 constants, e.g. `REFRESH_INTERVAL_MS = 60 * 60_000`, `INITIAL_RETRY_DELAY_MS = 1_000`, `MAX_RETRY_DELAY_MS = 60_000`. Import the repository type the way `VehicleService.ts` line 10 does (`import type { BusDataRepository } from "../repositories";`) or the way `FavoritesService.ts` line 3 does (`"../repositories/BusDataRepository"`).

**Interface + factory pattern** (lines 7-14, 35):
```typescript
export interface ServiceAlertPollService {
    start(): void;
}

export function createServiceAlertPollService(
    service: ServiceAlertService,
    repository: ServiceAlertRepository,
): ServiceAlertPollService {
    ...
    return { start };
}
```
Mirror this as `export interface BusDataRefreshService { start(): void; stop(): void; }` and `export function createBusDataRefreshService(repository: BusDataRepository): BusDataRefreshService`. Use DI: never call `BusDataRepository.getInstance()` inside the service.

**Attempt + message-only error pattern** (lines 18-26):
```typescript
async function pollAlerts(): Promise<void> {
    try {
        const alerts = await service.fetchAlerts();
        repository.applyAlerts(alerts);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error(`Failed to poll service alerts: ${message}`);
    }
}
```
Differences from the analog, required by the CONTEXT:
- **D-10:** do not copy lines 28-33 (`setInterval`). Chain the attempts instead: `setTimeout(runAttempt, delay)` is scheduled only after the attempt settles. Keep the handle in a closure variable (`let timer: NodeJS.Timeout | undefined`) the way `PredictionStreamService.ts` line 12 types `timer: NodeJS.Timeout`.
- **D-08:** a failure logs `logger.warn` (not `error`) with the attempt number, message-only error, and next delay. The first success logs one `logger.info`. Later refresh successes and failures also produce one line each.
- **Fire-and-forget:** `start()` kicks off the first attempt immediately with `void runAttempt();`, as at line 29 (`void pollAlerts(); // immediate first fetch, fire-and-forget (D-07)`).
- **`stop()`:** clears the pending timer (the `clearTimeout` counterpart of `PredictionStreamService.ts` line 57's `clearInterval(entry.timer)`). The planner decides whether a `stopped` flag also stops an in-flight attempt from rescheduling (D-15).

**No analog:** the capped exponential backoff with jitter (see No Analog Found).

**Test analog:** `src/server/api/services/ServiceAlertPollService.test.ts`.
- Mock and import order (lines 1-9). `vi.mock("../../config", ...)` must come before the service import:
```typescript
vi.mock("../../config", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from "../../config";
import { createServiceAlertPollService } from "./ServiceAlertPollService";
```
- `makeMock*` factories (lines 11-17), with the mock cast `as never` into the factory (line 41).
- Fake timers (lines 27-33): `vi.useFakeTimers()` in `beforeEach` and `vi.useRealTimers()` in `afterEach`.
- Timer advancement (lines 43-45, 59-62): `start(); await vi.advanceTimersByTimeAsync(0);` for the immediate attempt, then `await vi.advanceTimersByTimeAsync(<ms>)` for each backoff step or the hourly tick.
- Log assertion (line 80): `expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("upstream down"));`. Switch it to `logger.warn` for failed attempts.
- For jitter determinism, either `vi.spyOn(Math, "random").mockReturnValue(...)` or inject a random/clock dependency (CONTEXT: Claude's discretion). Restore mocks in `afterEach`, following `processHandlers.test.ts` lines 29-34 (`vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();`).
- Cases to cover: success on the first attempt schedules the hourly refresh; delays grow 1s, 2s, 4s... and cap at 60s; no overlap (the next attempt is not scheduled while one is pending); a refresh failure after a success schedules the next hourly attempt rather than backoff; `stop()` clears a pending backoff timer and a pending hourly timer (advance time and assert the repo load mock was not called again).

---

### `src/server/api/services/ServiceAlertPollService.ts` (modified, add `stop()`, D-17)

**Current `start()`** (lines 28-35):
```typescript
function start(): void {
    void pollAlerts(); // immediate first fetch, fire-and-forget (D-07)
    setInterval(() => {
        void pollAlerts();
    }, POLL_INTERVAL_MS);
}

return { start };
```
Store the `setInterval` return value in a closure `let interval: NodeJS.Timeout | undefined`. `stop()` calls `clearInterval(interval)`, matching `PredictionStreamService.ts` line 57. Add `stop(): void` to the interface at lines 7-9. The planner may leave the overlap-guard comment at lines 15-17 unchanged, because D-10 explicitly keeps `setInterval` here.

**Test:** add a case after lines 52-66: `start()`, `stop()`, `await vi.advanceTimersByTimeAsync(300_000)`, then `expect(mockService.fetchAlerts).toHaveBeenCalledTimes(1)`.

---

### `src/server/api/repositories/BusDataRepository.ts` (modified)

**Keep as the only commit point: `applyData`** (lines 79-89). Extend it to set the load state on success:
```typescript
private applyData(data: {
    routes: Map<string, BusRoute>;
    routesByShortName: Map<string, BusRoute>;
    stops: Map<string, BusStop>;
}): void {
    this.routes = data.routes;
    this.routesByShortName = data.routesByShortName;
    this.stops = data.stops;
    this.isInitialized = true;
    this.initializationPromise = null;
}
```
On success, set `lastLoadedAt = new Date()` and clear `lastFailedAt`/`lastError`. Remove `initializationPromise` entirely (D-19). The planner may also derive `isInitialized` from `lastLoadedAt !== undefined` instead of storing a separate flag.

**Remove / collapse (D-19):** `initialize()` (lines 49-63), `refreshData()` (lines 66-73), and the `initializationPromise` field (line 35). Collapse `initialize()`, `refreshData()`, and `handleLoadError` into one public load method (e.g. `load(): Promise<void>`) that fetches, applies on success, records failure state, and rethrows so the service can count attempts.

**Existing message-only failure pattern to reuse for `lastError`** (lines 96-101 and 139-143):
```typescript
private handleLoadError(action: "initialize" | "refresh", error: unknown): never {
    this.initializationPromise = null;
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Failed to ${action} bus data: ${message}`);
    throw new Error(`Failed to ${action} bus data: ${message}`);
}
```
On failure, set `lastFailedAt = new Date()` and `lastError = message`, and leave the maps and `lastLoadedAt` untouched. Per D-08, drop the `logger.error` here and at line 141, because the refresh service owns the per-attempt log line. `message` is already key-free: Phase 12's axios interceptor maps every transport failure to a message-only `UpstreamApiError`.

**Empty-routes check becomes a failure (D-11):** lines 122-125 currently return empty maps:
```typescript
if (!routes || !Array.isArray(routes) || routes.length === 0) {
    logger.warn("No routes found in API response");
    return { routes: stagingRoutes, routesByShortName: stagingRoutesByShortName, stops: stagingStops };
}
```
Change it to `throw new Error("...no routes...")` with a message-only error.

**All-or-nothing (D-12):** already true. `createStop` (lines 197-212) throws on bad code or coordinates, and staging maps are only committed through `applyData`. Keep it this way.

**Typed not-ready error (D-01):** `assertInitialized` (lines 229-233):
```typescript
private assertInitialized(): void {
    if (!this.isInitialized) {
        throw new Error("BusDataRepository has not been initialized. Call initialize() before accessing data.");
    }
}
```
Change it to `throw new DataNotReadyError(...)` and add `import { DataNotReadyError } from "../errors";`. This will be the first `../errors` import in `repositories/`; services already import it that way, e.g. `FavoritesService.ts` line 1. All six getters (lines 236-276) already call `assertInitialized()`, so no other change is needed there.

**New `getLoadState()` (D-16):** a public method with an explicit return type, e.g. `public getLoadState(): { lastLoadedAt?: Date; lastFailedAt?: Date; lastError?: string }`. Return a copy, not internal references. It follows the JSDoc style of the other public getters (lines 246-250).

**Test analog:** `src/server/api/repositories/BusDataRepository.test.ts`.
- Config mock (lines 5-12) and the `makeApi*` factories (lines 19-46). Reuse them unchanged.
- Singleton reset (lines 51-62). The new load-state fields live on the instance, so resetting `instance = undefined` also resets them:
```typescript
beforeEach(() => {
    vi.clearAllMocks();
    // Reset the singleton so each test gets a fresh instance
    // @ts-expect-error accessing private static for test isolation
    BusDataRepository.instance = undefined;
    repo = BusDataRepository.getInstance();
});
```
- Rewrite or delete: `describe("initialize")` dedupe tests (lines 117-159), `describe("refreshData")` (lines 292-329), the empty/null-routes "gracefully" tests (lines 161-183, which now fail per D-11), and every `"throws when called before initialization"` assertion (lines 332-335, 364-367, 395-398, 417-420, 451-454, 485-488). The last group changes to `toThrow(DataNotReadyError)`.
- New cases: load state after success, after failure with no prior success, after failure following a success (the maps still serve old data and `lastLoadedAt` does not change), and success after failure clears `lastFailedAt`/`lastError`. Also `lastError` must not contain `"key"` (the mocked `apiKey` value at line 8).

---

### `src/server/app.ts` (modified, boot order D-18 and shutdown)

**Current init/listen block to restructure** (lines 26-72). Key excerpts:
```typescript
const serviceAlertPollService = createServiceAlertPollService(
    createServiceAlertService(),
    ServiceAlertRepository.getInstance(),
);
serviceAlertPollService.start();

Promise.all([repository.initialize(), favoritesRecentsRepository.initialize()])
    .then(() => {
        const server = app.listen(port, () => {
            logger.info(`Server is running on port ${port}`);
        });
        ...
    })
    .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error(`Failed to initialize application data: ${message}`);
        process.exit(1);
    });
```
New order: `registerProcessErrorHandlers()` (line 9, stays first), then `favoritesRecentsRepository.initialize()` only, with the `.catch` and `process.exit(1)` kept for SQLite (lines 68-72), then `app.listen`, then `refreshService.start()` and `serviceAlertPollService.start()`. `repository.initialize()` leaves the `Promise.all`. Update the stale comments at lines 8, 26, and 30-31, which say "startup-blocking init chain" and "before accepting requests".

**Shutdown pattern to extend** (lines 45-66):
```typescript
const shutdown = (): void => {
    server.close(async (): Promise<void> => {
        try {
            await favoritesRecentsRepository.close();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown error";
            logger.error(`Shutdown failed: ${message}`);
            process.exit(1);
        }
        logger.info("Server is gracefully shutting down");
        process.exit(0);
    });
    setTimeout((): void => server.closeAllConnections(), SHUTDOWN_GRACE_MS);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
```
Call `refreshService.stop()` and `serviceAlertPollService.stop()` synchronously at the top of `shutdown`, before `server.close(...)`. Both are synchronous timer clears, so they add no new failure path. `app.ts` has no test file. Verification is manual or E2E.

---

### `src/server/api/routes/upstreamTimeout.test.ts` (modified) and optional new `src/server/api/routes/dataLifecycle.test.ts`

**Analog:** `src/server/api/routes/upstreamTimeout.test.ts`.
- Real app via supertest (lines 1-10): `import request from "supertest"; import app from "../../test/app";` with no service mocks. The real repository singleton stays unloaded, which is exactly the pre-load 503 state.
- Logger spies (lines 40-48):
```typescript
beforeEach(() => {
    infoSpy = vi.spyOn(logger, "info").mockImplementation(() => logger);
    warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);
    errorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
});
```
- Body assertion style (lines 72-76): `expect(response.status).toBe(...)` then `expect(response.body).toEqual({ error: ..., details: ... })`. For 503, also assert `response.headers["retry-after"]`.
- Background timer test style (lines 165-186): `vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] })` so that `AbortSignal.timeout` stays on real timers, followed by `vi.waitFor(...)`. For the refresh service, fake `setTimeout`/`clearTimeout` instead. Be careful: faking `setTimeout` may interfere with supertest or `AbortSignal`, so fake only what the test needs.
- Rewrite lines 151-163 (the startup-load test) against the new load API. The expected log is the new single `warn` line, not the double-prefixed `error`.
- E2E success criterion 2 (503 until loaded, then 200 without a restart): `GET /api/v1/routes/all` returns 503 on the unloaded singleton, then the repository loads (mock `axios.get` or point `axios.defaults.baseURL` at a local `http.createServer` that returns a routes payload, as `startBlackholedDash` does at lines 13-18), then the same request returns 200. Reset the singleton with the `@ts-expect-error` pattern from `BusDataRepository.test.ts` lines 54-55. `/api/v1/predictions/nearby` staying ungated before load is already covered implicitly by lines 83-102 (it returns 502, not 503, on an unloaded repository). Keep that test passing.

---

## Shared Patterns

### Message-only error extraction (secret safety, D-14 / Phase 12 D-06, D-12)
**Source:** used everywhere, e.g. `ServiceAlertPollService.ts` line 23, `app.ts` line 69, `BusDataRepository.ts` line 98:
```typescript
const message = error instanceof Error ? error.message : "Unknown error";
```
**Apply to:** the refresh service's `warn` line, the repository's `lastError`, and any 500 logging in `errorResponse.ts`. Never log or store the error object, because axios errors carry `Authorization` (see `processHandlers.ts` lines 3-5).

### Factory + interface + DI
**Source:** `ServiceAlertPollService.ts` lines 7-14 and 35; `VehicleService.ts` lines 10 and 16.
**Apply to:** `createBusDataRefreshService(repository)`. It is built in `app.ts` with `BusDataRepository.getInstance()` passed in, as `app.ts` lines 32-35 do for the alert poll.

### Named module constants for timings (D-07)
**Source:** `ServiceAlertPollService.ts` line 5, `PredictionStreamService.ts` line 5 (`const POLL_INTERVAL_MS = 30_000;`), `app.ts` line 24 (`const SHUTDOWN_GRACE_MS = 10_000;`), `NearbyPredictionController.ts` lines 9-11.
**Apply to:** the backoff base, cap, and refresh interval in the refresh service, and `Retry-After` seconds in `errorResponse.ts`. Use numeric separators (`60_000`) and a trailing "why" comment.

### Singleton reset in tests
**Source:** `BusDataRepository.test.ts` lines 51-62 (`// @ts-expect-error accessing private static for test isolation`).
**Apply to:** every test that touches the real `BusDataRepository` (repository unit tests and any E2E 503/200 test).

### Fake timers
**Source:** `ServiceAlertPollService.test.ts` lines 27-33 and 43-45 (`vi.useFakeTimers()` / `await vi.advanceTimersByTimeAsync(ms)`); `processHandlers.test.ts` lines 29-34 (`vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();`).
**Apply to:** `BusDataRefreshService.test.ts`, the `ServiceAlertPollService.test.ts` `stop()` case, and any E2E test that starts the refresh service.

### Test style
Arrange/Act/Assert comments in every `it`, `makeX` factories at the top of the file, `vi.mock(...)` before the imports that consume the mock, and services passed into factories with `as never` (`ServiceAlertPollService.test.ts` line 41).

## No Analog Found

| File / Concern | Role | Data Flow | Reason |
|---|---|---|---|
| Capped exponential backoff with jitter in `BusDataRefreshService.ts` | service internals | timer | No backoff, jitter, `Math.random`, or `clearTimeout` exists anywhere in `src/server` (grep confirmed). Write a small pure helper, e.g. `computeRetryDelayMs(attempt: number, random: () => number): number`, which is easy to unit test. The formula (full or equal jitter) is Claude's discretion. |
| `setTimeout` chaining (next attempt scheduled after settle) | service internals | timer | The existing pollers (`ServiceAlertPollService`, `PredictionStreamService`) both use `setInterval`, and D-10 explicitly says not to copy them. Only the factory, logging, and `start()` shape carry over. |
| Setting a response header from a JSON error path (`Retry-After`) | controller helper | request-response | The only header write is the SSE `writeHead` (`PredictionStreamController.ts` lines 95-100). Use Express `res.set("Retry-After", String(RETRY_AFTER_SECONDS))` and extend the mock `res` in tests. |

## Metadata

**Analog search scope:** `src/server/api/{controllers,services,repositories,errors,routes,middleware}`, `src/server/config`, `src/server/app.ts`, `src/server/test`
**Files scanned:** 34 (all 8 controllers; 7 services; `BusDataRepository` and its test; `FavoritesRecentsRepository`; `ServiceAlertPollService` and its test; errors and tests; `app.ts`; `test/app.ts`; `test/setup.ts`; `config/index.ts`; `processHandlers` and its test; `upstreamTimeout.test.ts`; `busRoutes.ts` and its test; `favoriteRoutes.test.ts`; `VehicleController.test.ts`; `PredictionController.test.ts`)
**Pattern extraction date:** 2026-09-30
