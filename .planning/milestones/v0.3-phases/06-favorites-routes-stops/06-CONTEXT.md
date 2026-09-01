# Phase 6: Favorites (Routes & Stops) - Context

**Gathered:** 2026-08-31
**Status:** Ready for planning

<domain>
## Phase Boundary

The Favorites HTTP surface for routes and stops: add, remove, and list, scoped by anonymous `X-Device-Id`. This phase builds the service/controller/route layer on top of the `FavoritesRecentsRepository` delivered in Phase 5, adding the one repository method Phase 5 didn't need (delete). It does not touch Recents (Phase 7) and must not modify any existing v0.2 code path (routes, stop discovery, predictions, SSE).

</domain>

<decisions>
## Implementation Decisions

### Device ID Validation & Middleware
- Dedicated Express middleware (`requireDeviceId`) in a new `src/server/api/middleware/` directory, mounted only on the favorites router.
- "Missing" means either an absent `X-Device-Id` header OR an empty/whitespace-only value — both reject with 400.
- The controller reads `req.headers["x-device-id"]` directly rather than stashing onto an augmented `Request` type — middleware's only job is to validate and 400 early.
- 400 error responses reuse the existing shape: `{ error: "Bad Request", details: "..." }` (matches `StopController`'s pattern).

### Favorite/Unfavorite Endpoints & Contracts
- `POST /api/v1/favorites` with body `{ entityType, entityId }` to favorite.
- `DELETE /api/v1/favorites/:entityType/:entityId` to unfavorite.
- `GET /api/v1/favorites` to list.
- `entityId` must resolve to a real route/stop via `BusDataRepository.getRouteById`/`getStopById` before favoriting — unknown ID returns 404.
- `entityType` must be exactly `"route"` or `"stop"` (case-sensitive); anything else is 400.
- Favoriting an already-favorited entity, and unfavoriting a non-favorited entity, both succeed with `200 { success: true }` — no distinct "created" status.

### List & Hydration
- A favorited entity that no longer resolves in `BusDataRepository` (e.g. a route removed upstream) is silently skipped from the returned list — no error, no stub entry.
- The combined list is ordered by `favoritedAt` DESC across both entity types (single global order, not grouped by type).
- Each list entry is hydrated in a nested shape: `{ entityType, favoritedAt, entity: {...full BusRoute or BusStop object} }` — nesting avoids field collisions between the two entity shapes.
- Empty favorites list returns `200 []`, never 404.

### Repository Additions & Service/Route Wiring
- Add `deleteFavorite(deviceId, entityType, entityId)` to `FavoritesRecentsRepository` — a plain SQL `DELETE`, no error/exception if zero rows are affected (this is what makes unfavorite-a-non-favorite a no-op success).
- New `src/server/api/routes/favoriteRoutes.ts`, mounted at `/favorites` in `routes/index.ts`, following the existing `busRoutes`/`stopRoutes` pattern.
- New `FavoritesService` hydrates directly from `BusDataRepository` (`getRouteById`/`getStopById`) rather than routing through `BusRouteService`/`StopService` — avoids adding a dependency between feature services for a simple lookup.
- `FavoritesRecentsRepository` stays as one class covering both favorites and recents (as already built in Phase 5); this phase only extends it with the favorites delete method. Recents-side methods are Phase 7's concern.

### Claude's Discretion
- Exact TypeScript types/interfaces for the hydrated favorite response, controller/service method names, and test structure are left to planning/implementation, following CLAUDE.md conventions (named exports, explicit return types, `createXService`/`createXController` factory DI).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/ROADMAP.md` §Phase 6 — goal, dependencies, and the 5 success criteria this phase must satisfy
- `.planning/REQUIREMENTS.md` — FAV-01 through FAV-05, DEVICE-01

### Existing Patterns to Mirror
- `src/server/api/controllers/StopController.ts` — controller error-handling pattern (`resolveErrorStatus`/`resolveErrorBody`), `RequestHandler` typing, factory function shape
- `src/server/api/repositories/FavoritesRecentsRepository.ts` — existing `upsertFavorite`/`listFavorites` methods to extend with `deleteFavorite`; singleton `getInstance()`/`initialize()` lifecycle already wired into `src/server/app.ts`
- `src/server/api/repositories/BusDataRepository.ts` — `getRouteById(id)`/`getStopById(id)` for hydration and existence checks; must not be modified
- `src/server/api/routes/stopRoutes.ts` and `src/server/api/routes/index.ts` — router mounting pattern to follow for the new `favoriteRoutes.ts`
- `src/server/api/errors/index.ts` — `NotFoundError` (→ 404 mapping) for the entity-existence check on favorite
- `src/server/api/models/PersistedEntity.ts` — existing `EntityType`, `FavoriteRecord` types to build on

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `FavoritesRecentsRepository.getInstance()` — already initialized in `app.ts` (Promise.all alongside `BusDataRepository`), already exposes `upsertFavorite`/`listFavorites`; only `deleteFavorite` needs to be added.
- `BusDataRepository.getInstance().getRouteById(id)` / `.getStopById(id)` — synchronous in-memory lookups, already populated at startup, exactly what hydration needs.
- `NotFoundError`/error-mapping pattern from `StopController`/`BusRouteController` — reuse directly for the entity-existence 404 case.

### Established Patterns
- Layered flow: routes → controllers → services → repository, DI via factory functions (`createXService(repository)`), never importing a repository singleton directly inside a service.
- Named exports, `PascalCase` classes/interfaces, camelCase functions, explicit return types, `Promise<T>` for async methods.
- Controllers parse/validate request shape and map errors to HTTP status; services hold business logic and throw typed errors; repositories return `undefined` for "not found" (per `BusDataRepository`) or, in the case of `FavoritesRecentsRepository`, complete silently for no-op writes/deletes.

### Integration Points
- `src/server/api/routes/index.ts` — add `router.use("/favorites", favoriteRoutes)`.
- `src/server/api/repositories/index.ts` — barrel already exports `FavoritesRecentsRepository`; no change needed beyond the new method.
- No new middleware directory currently exists (`src/server/api/middleware/` doesn't exist yet — Phase 6 creates it for `requireDeviceId`).

</code_context>

<specifics>
## Specific Ideas

No further specific behavioral requirements beyond what's captured above.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. Recents (auto-tracking, last-5 cap, dedicated recents endpoints) is explicitly Phase 7 and was not discussed here.

</deferred>

---

*Phase: 6-Favorites (Routes & Stops)*
*Context gathered: 2026-08-31*
