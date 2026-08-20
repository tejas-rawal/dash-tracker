<!-- refreshed: 2026-08-20 -->
# Architecture

**Analysis Date:** 2026-08-20

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                     HTTP Requests (Express)                  │
├──────────────────┬──────────────────┬───────────────────────┤
│   BusRoutes      │   Predictions    │   Root Handler        │
│  `src/server/    │  `src/server/    │   `src/server/        │
│   api/routes/    │   api/routes/    │    app.ts`            │
│   busRoutes.ts`  │   prediction     │                       │
│                  │   Routes.ts`     │                       │
└────────┬─────────┴────────┬─────────┴──────────┬────────────┘
         │                  │                     │
         ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Controllers (Request/Response Handlers)         │
│  BusRouteController `src/server/api/controllers/`           │
│  PredictionController                                        │
└────────┬──────────────────┬──────────────────────────────────┘
         │                  │
         ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│                 Services (Business Logic)                    │
│  BusRouteService `src/server/api/services/`                │
│  PredictionService                                           │
└────────┬──────────────────┬──────────────────────────────────┘
         │                  │
         └────────┬─────────┘
                  ▼
┌─────────────────────────────────────────────────────────────┐
│       Repository Layer (Data Access & Aggregation)          │
│       BusDataRepository `src/server/api/repositories/`      │
│       Singleton instance initialized in app.ts              │
└────────┬──────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│              Domain Models (Pure Objects)                    │
│  BusRoute, BusStop, RouteDirection, Prediction Interfaces   │
│  `src/server/api/models/`                                    │
└────────┬──────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│         External DASH API (goswift.ly)                      │
│  Via axios instance with auth headers                        │
│  `src/server/config/axios.ts`                                │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| **Routes** | Map HTTP paths to controllers | `src/server/api/routes/busRoutes.ts`, `predictionRoutes.ts` |
| **Controllers** | Parse requests, handle responses, map errors to HTTP status | `src/server/api/controllers/BusRouteController.ts`, `PredictionController.ts` |
| **Services** | Implement business logic, validate data, coordinate operations | `src/server/api/services/BusRouteService.ts`, `PredictionService.ts` |
| **Repository** | Manage in-memory data, fetch from upstream API, provide queries | `src/server/api/repositories/BusDataRepository.ts` |
| **Models** | Define domain types, encapsulate data structures | `src/server/api/models/BusRoute.ts`, `BusStop.ts`, `RouteDirection.ts`, `Prediction.ts` |
| **Config** | Environment validation, logging, HTTP client setup | `src/server/config/` |
| **App** | Entry point, initialize repository, start Express server | `src/server/app.ts` |

## Pattern Overview

**Overall:** Layered architecture with strict top-down dependency flow

**Key Characteristics:**
- No layer skipping — requests flow down through all layers in order
- Dependency injection via factory functions — no global imports of singletons in services/controllers
- Singleton repository initialized before server starts accepting requests
- Custom error types for typed error propagation (`NotFoundError`, `UpstreamApiError`)
- Models own domain logic (e.g., `BusRoute.getAllStops()`, `RouteDirection.getLastStop()`)

## Layers

**Routes Layer:**
- Purpose: Map HTTP endpoints to controllers, instantiate service/controller chains
- Location: `src/server/api/routes/`
- Contains: Express Router instances and route definitions
- Depends on: Controllers, Services, Repository singleton
- Used by: Express app in `src/server/app.ts`

**Controllers Layer:**
- Purpose: Handle request parsing, parameter validation, error-to-HTTP-status mapping, response formatting
- Location: `src/server/api/controllers/`
- Contains: Factory functions that return handler objects with request handlers
- Depends on: Services, custom error classes
- Used by: Routes

**Services Layer:**
- Purpose: Business logic, data validation, API URL building, response transformation
- Location: `src/server/api/services/`
- Contains: Factory functions that take repository as parameter, return service objects
- Depends on: Repository (via parameter), Models, Config (logger, axios for Prediction service), Errors
- Used by: Controllers

**Repository Layer:**
- Purpose: Single source of truth for all data access. Owns fetching from DASH API on startup, maintains in-memory maps of routes/stops, provides queries for services
- Location: `src/server/api/repositories/BusDataRepository.ts`
- Contains: Singleton class with initialization logic, data processing, public query methods
- Depends on: Models (to construct domain objects), Config (axios, logger, environment)
- Used by: Routes and Services (via DI)

**Models Layer:**
- Purpose: Define domain types, provide helper methods on domain objects
- Location: `src/server/api/models/`
- Contains: Class definitions (BusRoute, BusStop, RouteDirection) and interface definitions (Prediction, Destination, etc.)
- Depends on: Nothing — pure domain objects
- Used by: Repository (for constructing objects), Services (for return types), Controllers (for serialization)

**Config Layer:**
- Purpose: Environment validation, shared client instances, logging
- Location: `src/server/config/`
- Contains: Environment schema validation (Zod), axios instance with DASH API base URL and auth headers, Winston logger
- Depends on: External libraries (dotenv, zod, axios, winston)
- Used by: Repository, Services, App startup

**App Entry Point:**
- Purpose: Initialize Express, set up middleware, create singleton repository, start server after initialization succeeds
- Location: `src/server/app.ts`
- Contains: Express setup, repository initialization with error handling, graceful shutdown hooks
- Depends on: Routes, Repository singleton, Config
- Used by: Node runtime (via package.json scripts)

## Data Flow

### Primary Request Path: Get Bus Routes

1. **HTTP GET /api/v1/routes/all** → Route handler in `src/server/api/routes/busRoutes.ts`
2. Route delegates to `BusRouteController.getAllRoutes()` in `src/server/api/controllers/BusRouteController.ts`
3. Controller calls `service.getAgencyRoutes()` in `src/server/api/services/BusRouteService.ts`
4. Service queries `repository.getAllRoutes()` in `src/server/api/repositories/BusDataRepository.ts`
5. Repository returns cached array of `BusRoute` objects from `src/server/api/models/BusRoute.ts`
6. Service returns routes unchanged
7. Controller serializes to JSON and sends **200** response

**No external API call occurs** — data was fetched during `repository.initialize()` in `src/server/app.ts` before server started.

### Secondary Path: Get Specific Route

1. **HTTP GET /api/v1/routes/:shortName** → Route in `busRoutes.ts`
2. Controller extracts `shortName` param, calls `service.getAgencyRoute(shortName)`
3. Service calls `repository.getRouteByShortName(shortName)`
4. If not found, service throws `NotFoundError` → Controller catches and sends **404**
5. If found, service returns route, controller serializes to JSON and sends **200**

### Prediction Request Path: Get Arrival Predictions for a Stop

1. **HTTP GET /api/v1/predictions?stop=STOP_ID&route=ROUTE_ID&number=3** → Route in `src/server/api/routes/predictionRoutes.ts`
2. Controller in `src/server/api/controllers/PredictionController.ts`:
   - Validates required `stop` parameter (400 if missing)
   - Parses `number` parameter as positive integer (400 if invalid format)
   - Calls `service.getPredictionsForStop(stop, { number, route })`
3. Service in `src/server/api/services/PredictionService.ts`:
   - Validates stop exists in repository (`getStopById()`) — throws `NotFoundError` if not
   - Builds DASH API URL with query params in `buildDashApiUrl()`
   - **Calls external DASH API** via `axios.get()` to `/real-time/{agency}/predictions?stop=...`
   - Maps response via `mapToRoutePredictions()` and `mapToDestinations()` helper functions
   - Checks `dashResponse.success` — if false, throws `UpstreamApiError`
   - Returns structured `StopPredictionsResponse` with stop info and routes array
4. Controller catches errors and maps to HTTP status:
   - `NotFoundError` → **404**
   - `UpstreamApiError` → **502** (Bad Gateway)
   - Other errors → **500**
5. Success response is **200** with JSON body

**State Management:**
- Routes and stops are loaded once during startup in `BusDataRepository.initialize()`
- In-memory maps (`routes`, `routesByShortName`, `stops`) are read-only for requests
- Repository can be manually refreshed via `repository.refreshData()` (not exposed via API currently)
- Predictions are fetched on demand from DASH API (no caching)

## Key Abstractions

**BusDataRepository (Singleton):**
- Purpose: Single authoritative source for all route/stop data. Owns the initialization contract and prevents multiple DASH API calls.
- Examples: `src/server/api/repositories/BusDataRepository.ts`
- Pattern: Singleton with private constructor. Double-checked locking for `initialize()` to prevent concurrent initialization.

**Factory Functions for Dependency Injection:**
- Purpose: Create service and controller instances with explicit dependencies instead of global imports
- Examples: `createBusRouteService(repository)`, `createBusRouteController(service)`, `createPredictionService(repository)`
- Pattern: Functions that accept dependencies as parameters and return objects with public methods

**Domain Models as Classes:**
- Purpose: Encapsulate domain data and provide helper methods
- Examples: `BusRoute`, `BusStop`, `RouteDirection` classes in `src/server/api/models/`
- Pattern: Constructor-based instantiation with private/public fields. Methods like `getAllStops()`, `getDirectionById()` for querying related data.

**Error Type Hierarchy:**
- Purpose: Allow typed error handling in controllers and services
- Examples: `NotFoundError`, `UpstreamApiError` in `src/server/api/errors/index.ts`
- Pattern: Custom Error subclasses with `name` property for instanceof checks and error message strings

**Response Data Transfer Objects (Interfaces):**
- Purpose: Define API response shapes separate from domain models
- Examples: `StopPredictionsResponse`, `RoutePrediction`, `Destination` interfaces in `src/server/api/models/Prediction.ts`
- Pattern: Interfaces for API responses, separate from DASH API response types (which have `Dash` prefix)

## Entry Points

**Application Entry Point:**
- Location: `src/server/app.ts`
- Triggers: `bun run dev-server` or `bun run start-server` (via package.json scripts)
- Responsibilities:
  1. Import and configure Express
  2. Import router (which instantiates services/controllers)
  3. Instantiate singleton repository via `BusDataRepository.getInstance()`
  4. Call `repository.initialize()` to fetch and cache all routes/stops from DASH API
  5. Start Express server only after initialization completes
  6. Set up graceful shutdown handlers for SIGTERM/SIGINT

**HTTP Entry Points (Routes):**
- **GET /api/v1/routes/all** → Returns all bus routes
  - Controller: `BusRouteController.getAllRoutes`
  - Service: `BusRouteService.getAgencyRoutes()`
- **GET /api/v1/routes/:shortName** → Returns single route by short name
  - Controller: `BusRouteController.getRoute`
  - Service: `BusRouteService.getAgencyRoute(shortName)`
- **GET /api/v1/predictions** → Returns arrival predictions for a stop
  - Controller: `PredictionController.getPredictions`
  - Service: `PredictionService.getPredictionsForStop(stopId, options)`
  - Query params: `stop` (required), `route` (optional), `number` (optional)

## Architectural Constraints

- **Initialization blocking:** Server does not accept requests until `repository.initialize()` completes. This ensures all route/stop data is loaded before any request is processed.
- **No data mutations:** Routes, stops, and directions are treated as immutable after initialization. Mutations would require refactoring to add cache invalidation.
- **Single DASH API instance:** Axios instance is configured once in `src/server/config/axios.ts` with base URL and auth headers pre-set. All services use this shared instance.
- **Singleton repository:** Repository is accessed globally via `getInstance()`, but the singleton is created and passed down via DI in routes, not imported directly by services/controllers. This balances testability with the "one data source" requirement.
- **In-memory only:** No persistent data store. All data is lost on shutdown. Routes/stops are re-fetched on startup.
- **Eager loading:** All routes/stops loaded on startup. Lazy loading not supported.
- **No cross-route service sharing:** Each route handler creates its own service instance in the route file (e.g., `createBusRouteService(repo)` in `busRoutes.ts`). This means multiple instances of the same service exist, but they all reference the same singleton repository, so data is consistent.

## Anti-Patterns

### Global Singleton Imports in Services

**What happens:** If a service imports `BusDataRepository.getInstance()` directly instead of receiving it as a parameter, it couples the service to the repository implementation.

**Why it's wrong:** Makes services harder to test (can't inject mocks), and hides dependencies in the code.

**Do this instead:** Use factory functions that accept repository as a parameter: `export function createBusRouteService(repository: BusDataRepository): BusRouteService`

Example of correct pattern in `src/server/api/services/BusRouteService.ts`:
```typescript
export function createBusRouteService(repository: BusDataRepository): BusRouteService {
    function getAgencyRoute(shortName: string): BusRoute {
        const route = repository.getRouteByShortName(shortName);
        if (!route) {
            throw new NotFoundError(`Route not found: ${shortName}`);
        }
        return route;
    }
    return { getAgencyRoute };
}
```

### Catching All Errors Generically

**What happens:** If controllers catch all errors as `unknown` and map them all to 500, upstream API errors (should be 502) or validation errors (should be 400) get misclassified.

**Why it's wrong:** Clients can't distinguish between server bugs and transient API failures or bad input.

**Do this instead:** Throw typed errors (NotFoundError, UpstreamApiError) and handle them explicitly in controllers.

Example in `src/server/api/controllers/PredictionController.ts`:
```typescript
function resolveErrorStatus(error: unknown): number {
    if (error instanceof NotFoundError) return 404;
    if (error instanceof UpstreamApiError) return 502;
    return 500;
}
```

### Mixing API Response Types with Domain Models

**What happens:** If the DASH API response type is used directly in a service's return type, changes to the DASH API schema force changes to service contracts.

**Why it's wrong:** Services should expose stable types. When DASH API changes, only the mapping logic should change, not the service interface.

**Do this instead:** Use separate types for DASH API responses (prefixed `Dash*`) and domain responses, with explicit mapping in the service.

Example in `src/server/api/models/Prediction.ts`:
- `DashApiResponse` (what DASH API returns)
- `DashPredictionData`, `DashDestination` (DASH API shapes)
- `StopPredictionsResponse` (what service returns)
- Mapping happens in `PredictionService.getPredictionsForStop()` via `mapToRoutePredictions()` and `mapToDestinations()`

## Error Handling

**Strategy:** Explicit typed errors with centralized mapping in controllers

**Patterns:**
- Services throw custom Error subclasses (`NotFoundError`, `UpstreamApiError`) when validation or external API calls fail
- Controllers catch errors and map to HTTP status codes and response bodies
- Unknown errors default to 500
- Error details are included in response body for debugging

Example from `src/server/api/controllers/PredictionController.ts`:
```typescript
try {
    const result = await service.getPredictionsForStop(stop, { number, route });
    res.json(result);
} catch (error: unknown) {
    res.status(resolveErrorStatus(error)).json(resolveErrorBody(error));
}
```

## Cross-Cutting Concerns

**Logging:** Winston logger configured in `src/server/config/logger.ts`. Used in:
- `BusDataRepository` for fetch/refresh operations
- `PredictionService` for API calls
- `app.ts` for startup/shutdown

**Validation:** Three levels:
- Environment variables validated at startup via Zod in `src/server/config/environment.ts`
- Request parameters validated in controllers (e.g., `parseNumberParam()` in `PredictionController`)
- Domain data validated in repository during parsing (e.g., `Number.parseFloat()` for coordinates, error on NaN)

**Authentication:** DASH API key passed as Authorization header on all requests via axios instance in `src/server/config/axios.ts`

---

*Architecture analysis: 2026-08-20*
