# Phase 6: Favorites (Routes & Stops) - Pattern Map

**Mapped:** 2026-08-31
**Files analyzed:** 6
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/server/api/middleware/requireDeviceId.ts` | middleware | request-response | none (new directory) — closest conceptual pattern: `StopController`'s inline 400 validation | no direct analog (see below) |
| `src/server/api/routes/favoriteRoutes.ts` | route | request-response | `src/server/api/routes/stopRoutes.ts` | exact |
| `src/server/api/routes/index.ts` (modify) | route | request-response | itself (existing barrel) | exact |
| `src/server/api/controllers/FavoritesController.ts` | controller | request-response (CRUD-shaped: create/delete/list) | `src/server/api/controllers/StopController.ts` | exact |
| `src/server/api/services/FavoritesService.ts` | service | CRUD | `src/server/api/services/StopService.ts` | exact |
| `src/server/api/repositories/FavoritesRecentsRepository.ts` (modify — add `deleteFavorite`) | repository | CRUD | itself (`upsertFavorite`/`listFavorites` in same file) | exact |

## Pattern Assignments

### `src/server/api/middleware/requireDeviceId.ts` (middleware, request-response)

**No existing middleware file exists** (`src/server/api/middleware/` is a new directory per CONTEXT.md). Model the middleware as an Express `RequestHandler` that mirrors the 400 validation shape already used inline in controllers, but as standalone middleware calling `next()`.

**Reference for the 400 response shape** — `src/server/api/controllers/StopController.ts` (lines 61-67):
```typescript
if (lat === undefined) {
    res.status(400).json({
        error: "Bad Request",
        details: "lat parameter is required and must be a valid latitude (-90 to 90)",
    });
    return;
}
```

**Shape to follow for the new middleware file:**
```typescript
import type { NextFunction, Request, RequestHandler, Response } from "express";

export const requireDeviceId: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    const deviceId = req.headers["x-device-id"];
    const value = Array.isArray(deviceId) ? deviceId[0] : deviceId;
    if (!value || value.trim().length === 0) {
        res.status(400).json({ error: "Bad Request", details: "X-Device-Id header is required" });
        return;
    }
    next();
};
```
Note: per CONTEXT.md, do NOT augment `Request` type or stash the deviceId — controller re-reads `req.headers["x-device-id"]` directly.

---

### `src/server/api/routes/favoriteRoutes.ts` (route, request-response)

**Analog:** `src/server/api/routes/stopRoutes.ts` (full file, lines 1-14)

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

**Pattern to apply:** instantiate service via `createFavoritesService(FavoritesRecentsRepository.getInstance(), BusDataRepository.getInstance())`, instantiate controller via `createFavoritesController(service)`, mount `requireDeviceId` middleware at router level (`router.use(requireDeviceId)`), then define `router.post("/", ...)`, `router.delete("/:entityType/:entityId", ...)`, `router.get("/", ...)`.

**Modify `src/server/api/routes/index.ts`** (full file, lines 1-15) — add one line following the existing pattern:
```typescript
import { Router } from "express";
import busRoutes from "./busRoutes";
import predictionRoutes from "./predictionRoutes";
import stopRoutes from "./stopRoutes";

const router = Router();

router.use("/routes", busRoutes);
router.use("/predictions", predictionRoutes);
router.use("/stops", stopRoutes);
// Add other domain routes here
// router.use('/vehicles', vehicleRoutes);

export default router;
```
Add `import favoriteRoutes from "./favoriteRoutes";` and `router.use("/favorites", favoriteRoutes);`.

---

### `src/server/api/controllers/FavoritesController.ts` (controller, request-response)

**Analog:** `src/server/api/controllers/StopController.ts` (full file, lines 1-102)

**Imports pattern** (lines 1-3):
```typescript
import type { Request, RequestHandler, Response } from "express";
import { NotFoundError } from "../errors";
import type { StopService } from "../services/StopService";
```

**Controller interface + factory shape** (lines 5-8, 47):
```typescript
export interface StopController {
    getStopsForRoute: RequestHandler;
    getNearbyStops: RequestHandler;
}
...
export function createStopController(service: StopService): StopController {
    ...
    return { getStopsForRoute, getNearbyStops };
}
```

**Shared error-status/body helpers to replicate** (lines 34-45) — reuse this exact pair of helper functions in `FavoritesController.ts` (or extract to a shared module if planner prefers, but CONTEXT.md doesn't call for extraction — local copy is the established convention since `BusRouteController.ts` inlines the same logic rather than sharing it):
```typescript
function resolveErrorStatus(error: unknown): number {
    if (error instanceof NotFoundError) {
        return 404;
    }
    return 500;
}

function resolveErrorBody(error: unknown): { error: string; details: string } {
    const details = error instanceof Error ? error.message : "Unknown error";
    const label = error instanceof NotFoundError ? "Not Found" : "Request Failed";
    return { error: label, details };
}
```

**Try/catch handler pattern** (lines 48-56):
```typescript
const getStopsForRoute: RequestHandler = (req: Request, res: Response) => {
    try {
        const { shortName } = req.params;
        const result = service.getStopsForRoute(Array.isArray(shortName) ? shortName[0] : shortName);
        res.json(result);
    } catch (error: unknown) {
        res.status(resolveErrorStatus(error)).json(resolveErrorBody(error));
    }
};
```
Note: for `FavoritesController`, request bodies/handlers are typically async (service methods return `Promise<T>` since the repository is async) — CONTEXT.md/CLAUDE.md require `async` functions to be awaited, so handlers should be `async (req, res) => { try { ... await service.xxx(...); res.json(...) } catch ... }` rather than the synchronous pattern shown above (StopService is synchronous; FavoritesService will not be).

**400 validation pattern to reuse for `entityType` checking** (lines 61-67, same file) — same shape, e.g. reject if `entityType !== "route" && entityType !== "stop"`:
```typescript
res.status(400).json({
    error: "Bad Request",
    details: "lat parameter is required and must be a valid latitude (-90 to 90)",
});
return;
```

**Endpoints to implement per CONTEXT.md:**
- `favorite: RequestHandler` — POST, body `{ entityType, entityId }`, 400 on bad entityType, calls `service.addFavorite(deviceId, entityType, entityId)` which throws `NotFoundError` if entity doesn't resolve → mapped to 404 via `resolveErrorStatus`; success → `200 { success: true }`.
- `unfavorite: RequestHandler` — DELETE `/:entityType/:entityId`, validates entityType is exactly `"route"`/`"stop"` (400 otherwise), calls `service.removeFavorite(...)`, always `200 { success: true }`.
- `listFavorites: RequestHandler` — GET, calls `service.listFavorites(deviceId)`, returns `res.json(result)` (empty array is valid 200, no special-casing needed — same as `getAllRoutes` returning an array directly).

---

### `src/server/api/services/FavoritesService.ts` (service, CRUD)

**Analog:** `src/server/api/services/StopService.ts` (full file, lines 1-53)

**Imports pattern** (lines 1-4):
```typescript
import { NotFoundError } from "../errors";
import type { NearbySearchOptions, NearbyStop, RouteDirectionStops } from "../models";
import type { BusDataRepository } from "../repositories";
import { haversineDistanceMiles } from "./distance";
```

**Interface + factory-DI shape** (lines 10-15, 51):
```typescript
export interface StopService {
    getStopsForRoute(shortName: string): RouteDirectionStops[];
    getNearbyStops(lat: number, lng: number, options?: NearbySearchOptions): NearbyStop[];
}

export function createStopService(repository: BusDataRepository): StopService {
    ...
    return { getStopsForRoute, getNearbyStops };
}
```
For `FavoritesService`, DI takes **two** repositories per CONTEXT.md ("hydrates directly from `BusDataRepository`... rather than routing through `BusRouteService`/`StopService`"):
```typescript
export function createFavoritesService(
    favoritesRepository: FavoritesRecentsRepository,
    busDataRepository: BusDataRepository,
): FavoritesService { ... }
```

**Throw-on-not-found pattern** (lines 16-20):
```typescript
function getStopsForRoute(shortName: string): RouteDirectionStops[] {
    const route = repository.getRouteByShortName(shortName);
    if (!route) {
        throw new NotFoundError(`Route not found: ${shortName}`);
    }
    ...
}
```
Apply the same shape in `addFavorite`: look up via `busDataRepository.getRouteById(entityId)` or `.getStopById(entityId)` depending on `entityType`; throw `NotFoundError` if `undefined`, otherwise `await favoritesRepository.upsertFavorite(deviceId, entityType, entityId)`.

**List/hydrate/filter/sort pattern to model `listFavorites` on** (lines 33-49, `getNearbyStops`) — shows the map/filter/sort idiom used in this codebase:
```typescript
return repository
    .getAllStops()
    .map((stop) => { ... })
    .filter((stop) => stop.distance <= radius)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count);
```
For `FavoritesService.listFavorites`: `await favoritesRepository.listFavorites(deviceId)`, then `.map()` each `FavoriteRecord` to hydrated entry via `busDataRepository.getRouteById`/`getStopById`, `.filter()` out `undefined` hydration results (per CONTEXT.md's "silently skipped" rule), result is already DESC-ordered by the repository's SQL `ORDER BY favorited_at DESC` — no extra sort needed since CONTEXT.md specifies single global `favoritedAt` DESC order matching repo output.

**`removeFavorite`** — no NotFoundError needed (unfavoriting a non-favorite is a no-op success per CONTEXT.md); simply `await favoritesRepository.deleteFavorite(deviceId, entityType, entityId)`.

---

### `src/server/api/repositories/FavoritesRecentsRepository.ts` — add `deleteFavorite` (repository, CRUD)

**Analog:** same file, `upsertFavorite` (lines 67-75) and `listFavorites` (lines 77-84) — extend with a sibling method following identical structure.

**Pattern to copy (prepared statement + assertInitialized guard)**:
```typescript
public async upsertFavorite(deviceId: string, entityType: EntityType, entityId: string): Promise<void> {
    this.assertInitialized();
    const favoritedAt = new Date().toISOString();
    (this.db as DatabaseInstance)
        .prepare(
            "INSERT INTO favorites (device_id, entity_type, entity_id, favorited_at) VALUES (@deviceId, @entityType, @entityId, @favoritedAt) ON CONFLICT (device_id, entity_type, entity_id) DO UPDATE SET favorited_at = @favoritedAt",
        )
        .run({ deviceId, entityType, entityId, favoritedAt });
}
```

**New method to add**, following this exact idiom (plain `DELETE`, no rows-affected check — per CONTEXT.md "no error/exception if zero rows are affected"):
```typescript
public async deleteFavorite(deviceId: string, entityType: EntityType, entityId: string): Promise<void> {
    this.assertInitialized();
    (this.db as DatabaseInstance)
        .prepare("DELETE FROM favorites WHERE device_id = ? AND entity_type = ? AND entity_id = ?")
        .run(deviceId, entityType, entityId);
}
```

Add `deleteFavorite` to any interface/type surface that mirrors this class's public API if one exists (none currently — the repository is consumed as a concrete class, per `import { FavoritesRecentsRepository } from "../repositories"` in `app.ts`).

## Shared Patterns

### Error mapping (404/500)
**Source:** `src/server/api/controllers/StopController.ts` lines 34-45 (extracted helper functions) and `src/server/api/controllers/BusRouteController.ts` lines 16-19 (inline equivalent)
**Apply to:** `FavoritesController.ts` — copy the `resolveErrorStatus`/`resolveErrorBody` helper pair (StopController's variant is preferred since it's already factored into reusable functions rather than inlined).

### Router mounting
**Source:** `src/server/api/routes/index.ts` lines 1-15
**Apply to:** `favoriteRoutes.ts` mounted as `router.use("/favorites", favoriteRoutes)`, appended to the existing `router.use("/routes", ...)` / `router.use("/predictions", ...)` / `router.use("/stops", ...)` block.

### Factory-function DI (never import repository singleton inside service)
**Source:** `src/server/api/routes/stopRoutes.ts` lines 1-7 — repository singleton resolved once at route-module load time (`BusDataRepository.getInstance()`), passed into `createStopService(...)`, result passed into `createStopController(...)`.
**Apply to:** `favoriteRoutes.ts` — resolve `FavoritesRecentsRepository.getInstance()` and `BusDataRepository.getInstance()` at module load, inject both into `createFavoritesService(...)`.

### Repository singleton lifecycle
**Source:** `src/server/app.ts` lines 2, 19-21 — `FavoritesRecentsRepository.getInstance()` is already initialized in `Promise.all([...])` before the server starts accepting requests. No changes needed to `app.ts` for this phase.

### Entity type / model reuse
**Source:** `src/server/api/models/PersistedEntity.ts` (full file) — `EntityType = "route" | "stop"` and `FavoriteRecord` are already defined and exported via the `models` barrel (`src/server/api/models/index.ts` line 3, `export * from "./PersistedEntity"`). New hydrated response types (e.g. `HydratedFavorite`) should live in this same file or a sibling model file and be re-exported via the barrel, following the `export * from "./X"` convention.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/server/api/middleware/requireDeviceId.ts` | middleware | request-response | No `middleware/` directory exists yet in this codebase — this is genuinely new infrastructure. Closest conceptual pattern is the inline 400-validation blocks in `StopController.getNearbyStops` (see excerpt above), adapted into standalone Express middleware calling `next()`. |

## Metadata

**Analog search scope:** `src/server/api/{controllers,services,repositories,routes,models,errors}` (full directory scan, no middleware directory exists)
**Files scanned:** 28 non-test `.ts` files under `src/server/`
**Pattern extraction date:** 2026-08-31
