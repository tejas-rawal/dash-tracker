# Codebase Structure

**Analysis Date:** 2026-08-20

## Directory Layout

```
dash-tracker/
├── .github/                    # GitHub Actions workflows
├── .planning/                  # Planning documents (architecture, structure, conventions, etc.)
├── src/
│   └── server/                 # Node.js/Express server
│       ├── app.ts              # Entry point — initializes repository and Express
│       ├── config/             # Environment, logging, shared HTTP client
│       │   ├── index.ts        # Barrel export
│       │   ├── environment.ts  # Zod-validated env vars
│       │   ├── axios.ts        # Configured axios instance with DASH API base URL & auth
│       │   └── logger.ts       # Winston logger
│       ├── test/               # Test helpers and app stub for testing
│       │   ├── setup.ts        # Sets required env vars before test runs
│       │   └── app.ts          # Express app without repository initialization (for testing)
│       └── api/                # API layer (routes, controllers, services, models, repository)
│           ├── routes/         # Express route handlers
│           │   ├── index.ts    # Main router — mounts route groups
│           │   ├── busRoutes.ts         # GET /api/v1/routes/* endpoints
│           │   ├── busRoutes.test.ts    # Route integration tests
│           │   ├── predictionRoutes.ts  # GET /api/v1/predictions endpoint
│           │   └── predictionRoutes.test.ts
│           ├── controllers/    # Request/response handling, error mapping
│           │   ├── BusRouteController.ts       # Handles route requests
│           │   ├── BusRouteController.test.ts
│           │   ├── PredictionController.ts     # Handles prediction requests
│           │   └── PredictionController.test.ts
│           ├── services/       # Business logic, data transformation, external API calls
│           │   ├── BusRouteService.ts         # Queries routes and stops
│           │   ├── BusRouteService.test.ts
│           │   ├── PredictionService.ts       # Calls DASH API for predictions
│           │   └── PredictionService.test.ts
│           ├── repositories/   # Data access layer
│           │   ├── index.ts    # Barrel export
│           │   ├── BusDataRepository.ts       # Singleton managing all route/stop data
│           │   └── BusDataRepository.test.ts
│           ├── models/         # Domain types and pure objects
│           │   ├── index.ts    # Barrel export
│           │   ├── BusRoute.ts              # Route domain class
│           │   ├── BusRoute.test.ts
│           │   ├── BusStop.ts               # Stop domain class
│           │   ├── BusStop.test.ts
│           │   ├── RouteDirection.ts        # Direction domain class
│           │   ├── RouteDirection.test.ts
│           │   └── Prediction.ts            # Prediction-related type definitions (no test)
│           ├── errors/         # Custom error classes
│           │   ├── index.ts
│           │   └── index.test.ts
│           └── helpers/        # Utility functions (currently empty)
├── package.json                # Dependencies, scripts, metadata
├── tsconfig.json               # TypeScript configuration (strict mode enabled)
├── vitest.config.mts           # Vitest test runner configuration
├── biome.json                  # Biome linter/formatter configuration
├── .prettierrc                 # Prettier formatting rules
├── README.md                   # Project overview
├── LICENSE                     # MIT license
└── .gitignore                  # Git ignore rules
```

## Directory Purposes

**`src/server/app.ts`:**
- Purpose: Application entry point
- Contains: Express app setup, middleware, repository initialization, server startup with graceful shutdown
- Key responsibility: Ensure repository is initialized before server starts accepting requests

**`src/server/config/`:**
- Purpose: Centralized configuration and shared instances
- Contains: Environment validation (Zod schema), logger (Winston), axios instance with DASH API auth
- Key files:
  - `environment.ts` — Zod schema validating DASH_API_BASE_URL, DASH_API_AGENCY, DASH_API_KEY, PORT
  - `axios.ts` — Pre-configured axios instance with base URL and Authorization header
  - `logger.ts` — Winston console logger with info level

**`src/server/test/`:**
- Purpose: Test infrastructure and setup
- Contains: Vitest setup that sets required env vars, test app without repository initialization
- Key files:
  - `setup.ts` — Loaded before tests to set DASH_API_BASE_URL, DASH_API_AGENCY, DASH_API_KEY, PORT
  - `app.ts` — Express app without repository initialization (used for integration testing routes)

**`src/server/api/routes/`:**
- Purpose: HTTP route definitions and endpoint setup
- Contains: Express Router instances, route definitions, controller instantiation with service chains
- Key pattern: Each route file creates service and controller instances via factory functions
- Key files:
  - `index.ts` — Main router that mounts sub-routers at /routes and /predictions
  - `busRoutes.ts` — GET /api/v1/routes/all, GET /api/v1/routes/:shortName
  - `predictionRoutes.ts` — GET /api/v1/predictions?stop=...

**`src/server/api/controllers/`:**
- Purpose: Request parsing, response formatting, error handling
- Contains: Factory functions returning handler objects with RequestHandler methods
- Key pattern: Parse request params, call service, catch typed errors and map to HTTP status
- Key files:
  - `BusRouteController.ts` — getAllRoutes(), getRoute(shortName)
  - `PredictionController.ts` — getPredictions() with query param validation

**`src/server/api/services/`:**
- Purpose: Business logic, data transformation, validation
- Contains: Factory functions that take repository as parameter
- Key pattern: Call repository queries, transform data, throw typed errors on validation failure
- Key files:
  - `BusRouteService.ts` — getAgencyRoutes(), getAgencyRoute(shortName), getAgencyStop(stopId), getRoutesForStop(stopId)
  - `PredictionService.ts` — getPredictionsForStop(stopId, options) — calls external DASH API

**`src/server/api/repositories/`:**
- Purpose: Data access and in-memory cache management
- Contains: Singleton BusDataRepository class
- Key responsibility: Fetch routes/stops from DASH API on startup, provide query methods for services
- Key files:
  - `BusDataRepository.ts` — Singleton managing routes and stops maps, initialize() method, query methods

**`src/server/api/models/`:**
- Purpose: Domain types and value objects
- Contains: Class definitions for BusRoute, BusStop, RouteDirection; interface definitions for Prediction, Destination, etc.
- Key pattern: Classes with constructor-based initialization and helper methods
- Key files:
  - `BusRoute.ts` — Domain class with getAllStops(), getDirectionById()
  - `BusStop.ts` — Domain class with getLocation()
  - `RouteDirection.ts` — Domain class with getFirstStop(), getLastStop(), getNumberOfStops()
  - `Prediction.ts` — Interfaces for Prediction, Destination, RoutePrediction (API responses) and DASH API types

**`src/server/api/errors/`:**
- Purpose: Custom error classes for typed error handling
- Contains: NotFoundError, UpstreamApiError classes
- Used by: Services (throw), controllers (catch and map to HTTP status)

**`src/server/api/helpers/`:**
- Purpose: Utility functions (not yet populated)
- Current state: Empty directory reserved for future helpers

## Key File Locations

**Entry Points:**
- `src/server/app.ts` — Main server entry point (run via `bun run dev-server` or `bun run start-server`)

**Configuration:**
- `src/server/config/environment.ts` — Environment variable schema and validation
- `src/server/config/axios.ts` — Configured HTTP client for DASH API requests
- `src/server/config/logger.ts` — Logging setup
- `tsconfig.json` — TypeScript compiler options (strict mode, ES2020 target, CommonJS module)
- `vitest.config.mts` — Vitest test runner configuration
- `biome.json` — Biome linter configuration (line width 120, indent 4)
- `.prettierrc` — Prettier formatting (via @jonahsnider/prettier-config)

**Core Logic:**
- `src/server/api/repositories/BusDataRepository.ts` — Singleton data source for all routes/stops
- `src/server/api/services/BusRouteService.ts` — Business logic for route queries
- `src/server/api/services/PredictionService.ts` — Business logic for prediction requests (calls DASH API)
- `src/server/api/models/` — Domain object definitions

**Testing:**
- `src/server/test/setup.ts` — Test environment setup
- `src/server/api/**/*.test.ts` — Co-located test files (one per source file)

## Naming Conventions

**Files:**
- Route handlers: PascalCase + `Controller` suffix (e.g., `BusRouteController.ts`)
- Services: PascalCase + `Service` suffix (e.g., `BusRouteService.ts`)
- Repository: PascalCase + `Repository` suffix (e.g., `BusDataRepository.ts`)
- Models: PascalCase class names (e.g., `BusRoute.ts`)
- Tests: Source file name + `.test.ts` suffix (e.g., `BusRoute.test.ts`)
- Routes: camelCase (e.g., `busRoutes.ts`, `predictionRoutes.ts`)

**Directories:**
- Plural for layers containing multiple files of the same type: `routes/`, `controllers/`, `services/`, `repositories/`, `models/`, `errors/`
- Singular for single-purpose directories: `config/`, `test/`, `api/`

**Functions:**
- Factory functions: `create{Component}` (e.g., `createBusRouteService`, `createBusRouteController`)
- Helpers/utilities: camelCase (e.g., `parseNumberParam`, `resolveErrorStatus`)
- Methods: camelCase (e.g., `getAgencyRoutes`, `getAllStops`, `getLocation`)

**Types/Interfaces:**
- Classes: PascalCase (e.g., `BusRoute`, `NotFoundError`)
- Interfaces: PascalCase (e.g., `BusRouteService`, `PredictionOptions`)
- Enums: PascalCase (e.g., `RouteType`)
- DASH API types: Prefixed with `Dash` (e.g., `DashApiResponse`, `DashPredictionData`)

**Variables:**
- Constants: SCREAMING_SNAKE_CASE (very rare in this codebase)
- Regular: camelCase (e.g., `mockRepo`, `stagingStops`, `shortName`)

## Where to Add New Code

**New Feature (e.g., add vehicle tracking):**
1. Define domain model in `src/server/api/models/Vehicle.ts` or add to existing model file
2. Create service in `src/server/api/services/VehicleService.ts` with factory function `createVehicleService(repository)`
3. Create controller in `src/server/api/controllers/VehicleController.ts` with factory function `createVehicleController(service)`
4. Create route file `src/server/api/routes/vehicleRoutes.ts` that instantiates service/controller and sets up routes
5. Mount route in `src/server/api/routes/index.ts` via `router.use('/vehicles', vehicleRoutes)`
6. Create tests for each layer: `*.test.ts` alongside source files
7. Update repository (`BusDataRepository.ts`) if new data type requires initialization

**New Data Type (e.g., add bus alerts):**
1. Define model class in `src/server/api/models/BusAlert.ts`
2. Add repository query methods in `BusDataRepository.ts` (if data is fetched on startup)
3. Create service factory that uses repository
4. Create controller and routes as above

**Utilities:**
- Shared helpers belong in `src/server/api/helpers/` with descriptive names (e.g., `dateFormatters.ts`, `validation.ts`)
- Test data factories belong in test files alongside tests (e.g., in `BusRoute.test.ts`, define `makeRoute()` helper)

**Error Types:**
- Add custom error classes to `src/server/api/errors/index.ts`
- Controller must handle the error type and map to appropriate HTTP status

## Special Directories

**`.planning/codebase/`:**
- Purpose: Architecture and structure documentation
- Generated: Yes (by gsd-map-codebase agent)
- Committed: Yes
- Contains: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, CONCERNS.md

**`dist/`:**
- Purpose: Compiled TypeScript output
- Generated: Yes (by `bun run build`)
- Committed: No (in .gitignore)
- How to generate: `bun run build`

**`node_modules/`:**
- Purpose: Package dependencies
- Generated: Yes (by `bun install`)
- Committed: No (in .gitignore)
- How to generate: `bun install`

**`.git/`:**
- Purpose: Git repository metadata
- Generated: Yes (by `git init` or `git clone`)
- Committed: No (version control metadata)

**`.github/`:**
- Purpose: GitHub Actions workflows
- Generated: No (manually created)
- Committed: Yes

---

*Structure analysis: 2026-08-20*
