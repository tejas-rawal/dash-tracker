<!-- GSD:project-start source:PROJECT.md -->

## Project

**dash-tracker**

dash-tracker is a Node.js/Express REST API that proxies and structures data from the DASH public transit API (goswift.ly), exposing bus routes and arrival predictions through a layered architecture (routes → controllers → services → repositories). This milestone is not about new features — it's a dev-tooling cleanup to consolidate the lint/format toolchain before further feature work resumes.

**Core Value:** A single, unambiguous command for linting and formatting — no redundant tools, no drift between what CI checks and what a contributor runs locally.

### Constraints

- **Tooling**: Biome must remain the linter (existing `biome.json` config — 120 char line width, 4-space indent, `noDefaultExport` disabled) — no reason to replace it, only to stop pairing it with Prettier
- **Compatibility**: Build step (`tsc` → `dist/`) and test runner (Vitest) are out of scope and must keep working unchanged after the lint/format swap

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- TypeScript 5.7.3 - Backend API and server code
- JavaScript (via Node.js) - Runtime execution
- None

## Runtime

- Node.js (version specified via .node-version: 20)
- Bun 1.0.31 - Primary package manager for all installs and script execution
- Lockfile: `bun.lockb` (present, also `package-lock.json` for npm compatibility)

## Frameworks

- Express 4.21.2 - REST API framework for routes, controllers, and middleware
- Zod 3.24.0 - TypeScript-first schema validation for environment variables and data structures
- Axios 1.7.9 - HTTP client for upstream DASH API calls with custom headers and base URL configuration
- Winston 3.17.0 - Structured logging to console with configurable levels
- ts-node 10.9.2 - Executes TypeScript directly without compilation step
- tsx 4.19.2 - Alternative TypeScript executor (dev dependency)

## Key Dependencies

- @types/express 5.0.0 - TypeScript type definitions for Express.js
- @types/node 20.17.6 - TypeScript type definitions for Node.js APIs
- @types/winston 2.4.4 - TypeScript type definitions for Winston logging
- dotenv 16.4.7 - Loads environment variables from `.env` file at startup
- nodemon 3.1.9 - Watches TypeScript files and automatically restarts server during development
- Vitest 2.1.5 - Unit and integration test framework with TypeScript support
- @vitest/coverage-v8 2.1.5 - Code coverage reporting using V8 engine
- supertest 7.2.2 - HTTP assertion library for testing Express routes and controllers
- @types/supertest 7.2.0 - TypeScript type definitions for supertest

## Configuration

- Variables are validated at startup via Zod schema in `src/server/config/environment.ts`
- Required environment variables:
- Missing or invalid variables crash the application immediately at startup
- TypeScript configuration: `tsconfig.json`
- Biome configuration: `biome.json`

## Linting & Formatting

- Biome 1.9.4 (`@biomejs/biome`)
- Prettier 3.3.3

## Test Configuration

- Vitest 2.1.5
- Configuration: `vitest.config.mts`
- Test files: Co-located with source code using `.test.ts` suffix
- Setup file: `src/server/test/setup.ts` runs before all tests to set required environment variables
- Coverage thresholds enforced: 80% minimum on branches, functions, lines, and statements

## Platform Requirements

- Node.js 20+ (per `.node-version` file)
- Bun 1.0.31+ (package manager)
- TypeScript compiler (ts-node or tsx for runtime)
- Node.js 20+ (ES2020 compiled output)
- Environment variables configured (DASH_API_BASE_URL, DASH_API_AGENCY, DASH_API_KEY, optional PORT)
- Network access to upstream DASH API

## Build Output

- Compiled JavaScript: `dist/` directory
- Type definitions: `dist/*.d.ts` files
- Main entry: `dist/index.js` (compiled from `src/server/app.ts`)

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- Classes: PascalCase (`BusRoute.ts`, `BusStop.ts`, `NotFoundError.ts`)
- Factory functions: lowercase with `.ts` (`busRoutes.ts`, `app.ts`)
- Test files: Same name as source + `.test.ts` suffix (`BusRoute.test.ts`)
- Configuration: lowercase (`logger.ts`, `axios.ts`, `environment.ts`)
- Directories: lowercase with hyphens for multi-word paths (`src/server/api/repositories/`, `src/server/config/`)
- camelCase: `getAgencyRoutes()`, `createBusRouteService()`, `getAllStops()`, `getDirectionById()`
- Factory functions: `createX` pattern (`createBusRouteService`, `createBusRouteController`)
- Private methods: Prefix with underscore (convention, not enforced by TypeScript)
- camelCase: `mockRepo`, `mockService`, `mockAxiosGet`, `routes`, `stopIds`
- Constants: Use camelCase or UPPER_SNAKE_CASE for truly constant values
- Test data factories: `makeX` pattern (`makeStop()`, `makeRoute()`, `makeMockRepo()`)
- PascalCase for classes: `BusRoute`, `BusStop`, `NotFoundError`, `UpstreamApiError`
- PascalCase for interfaces: `BusRouteService`, `BusRouteController`
- Enums: PascalCase with PascalCase values: `RouteType.Bus`, `RouteType.Subway`, `RouteType.Tram`, `RouteType.Rail`
- Type aliases: PascalCase
- Named exports preferred: `export { BusRoute, BusStop }`
- Barrel files: `src/server/api/models/index.ts` exports all model classes
- Default exports allowed: Routes use `export default router`
- Factory functions: Exported as named exports (`export function createBusRouteService(...)`)

## Code Style

- **Tool:** Prettier with `@jonahsnider/prettier-config`
- **Line width:** 120 characters
- **Indentation:** 4 spaces
- **Quote style:** Double quotes (`"`) for strings; single quotes (`'`) for JSX attributes
- **Semicolons:** Required (Prettier enforces)
- **Trailing commas:** auto (Prettier default)
- **Tool:** Biome v1.9.4
- **Config file:** `biome.json`
- **Key rules:**
- **Run:** `bun run lint` (check), `bun run lint:fix` (auto-fix unsafe issues)
- **Enabled:** All strict mode options active
- **Key settings:**
- **Target:** ES2020
- **Module:** CommonJS

## Import Organization

- No path aliases configured — use relative paths throughout
- Root is `src/server/` for API files
- Use `../` to navigate up directory structure

## Error Handling

## Logging

- Log at startup: `logger.info('Server is running on port 3000')`
- Log on error: `logger.error('Failed to initialize application data: ${message}')`
- Log graceful shutdown: `logger.info('Server is gracefully shutting down')`
- Use string interpolation for context: `logger.error('Failed to ${action}: ${reason}')`
- Application startup/shutdown
- External API calls (in repositories)
- Error conditions
- Not on every function call (avoid noise)

## Comments

- Use sparingly; code should be self-documenting
- Explain "why" not "what": `// graceful shutdown` (good), `// call close()` (bad)
- Keep business logic clear: `const stopIds = new Set<string>();` (self-documenting)
- Biome ignore: `// biome-ignore lint/style/noDefaultExport: This must be a default export`
- TypeScript error ignore: `// @ts-expect-error accessing private static for test isolation`

## Function Design

- Use typed object parameters when multiple arguments: 
- Single parameter or simple types: direct parameters OK
- Always annotate return type explicitly: `(): BusRoute[]`
- Return domain objects from services, not raw data
- Return `undefined` for "not found" in repositories, throw in services
- Throw custom errors for exceptional conditions
- Mark with `async` keyword
- Return `Promise<T>` explicitly
- Use `await` for all Promises
- Handle errors with try-catch or `.catch()`

## Module Design

- Use named exports for most code: `export function createBusRouteService(...)`
- Use default export only for route handlers and barrel files
- Create barrel files (`index.ts`) to export groups: `src/server/api/models/index.ts`
- Location: `src/server/api/models/index.ts`, `src/server/api/errors/index.ts`
- Purpose: Centralize exports for cleaner imports
- Example:
- Do NOT import singletons directly in services
- Accept dependencies as constructor/factory function parameters
- Wires dependency graph in route handlers: `src/server/api/routes/busRoutes.ts`

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

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

- No layer skipping — requests flow down through all layers in order
- Dependency injection via factory functions — no global imports of singletons in services/controllers
- Singleton repository initialized before server starts accepting requests
- Custom error types for typed error propagation (`NotFoundError`, `UpstreamApiError`)
- Models own domain logic (e.g., `BusRoute.getAllStops()`, `RouteDirection.getLastStop()`)

## Layers

- Purpose: Map HTTP endpoints to controllers, instantiate service/controller chains
- Location: `src/server/api/routes/`
- Contains: Express Router instances and route definitions
- Depends on: Controllers, Services, Repository singleton
- Used by: Express app in `src/server/app.ts`
- Purpose: Handle request parsing, parameter validation, error-to-HTTP-status mapping, response formatting
- Location: `src/server/api/controllers/`
- Contains: Factory functions that return handler objects with request handlers
- Depends on: Services, custom error classes
- Used by: Routes
- Purpose: Business logic, data validation, API URL building, response transformation
- Location: `src/server/api/services/`
- Contains: Factory functions that take repository as parameter, return service objects
- Depends on: Repository (via parameter), Models, Config (logger, axios for Prediction service), Errors
- Used by: Controllers
- Purpose: Single source of truth for all data access. Owns fetching from DASH API on startup, maintains in-memory maps of routes/stops, provides queries for services
- Location: `src/server/api/repositories/BusDataRepository.ts`
- Contains: Singleton class with initialization logic, data processing, public query methods
- Depends on: Models (to construct domain objects), Config (axios, logger, environment)
- Used by: Routes and Services (via DI)
- Purpose: Define domain types, provide helper methods on domain objects
- Location: `src/server/api/models/`
- Contains: Class definitions (BusRoute, BusStop, RouteDirection) and interface definitions (Prediction, Destination, etc.)
- Depends on: Nothing — pure domain objects
- Used by: Repository (for constructing objects), Services (for return types), Controllers (for serialization)
- Purpose: Environment validation, shared client instances, logging
- Location: `src/server/config/`
- Contains: Environment schema validation (Zod), axios instance with DASH API base URL and auth headers, Winston logger
- Depends on: External libraries (dotenv, zod, axios, winston)
- Used by: Repository, Services, App startup
- Purpose: Initialize Express, set up middleware, create singleton repository, start server after initialization succeeds
- Location: `src/server/app.ts`
- Contains: Express setup, repository initialization with error handling, graceful shutdown hooks
- Depends on: Routes, Repository singleton, Config
- Used by: Node runtime (via package.json scripts)

## Data Flow

### Primary Request Path: Get Bus Routes

### Secondary Path: Get Specific Route

### Prediction Request Path: Get Arrival Predictions for a Stop

- Routes and stops are loaded once during startup in `BusDataRepository.initialize()`
- In-memory maps (`routes`, `routesByShortName`, `stops`) are read-only for requests
- Repository can be manually refreshed via `repository.refreshData()` (not exposed via API currently)
- Predictions are fetched on demand from DASH API (no caching)

## Key Abstractions

- Purpose: Single authoritative source for all route/stop data. Owns the initialization contract and prevents multiple DASH API calls.
- Examples: `src/server/api/repositories/BusDataRepository.ts`
- Pattern: Singleton with private constructor. Double-checked locking for `initialize()` to prevent concurrent initialization.
- Purpose: Create service and controller instances with explicit dependencies instead of global imports
- Examples: `createBusRouteService(repository)`, `createBusRouteController(service)`, `createPredictionService(repository)`
- Pattern: Functions that accept dependencies as parameters and return objects with public methods
- Purpose: Encapsulate domain data and provide helper methods
- Examples: `BusRoute`, `BusStop`, `RouteDirection` classes in `src/server/api/models/`
- Pattern: Constructor-based instantiation with private/public fields. Methods like `getAllStops()`, `getDirectionById()` for querying related data.
- Purpose: Allow typed error handling in controllers and services
- Examples: `NotFoundError`, `UpstreamApiError` in `src/server/api/errors/index.ts`
- Pattern: Custom Error subclasses with `name` property for instanceof checks and error message strings
- Purpose: Define API response shapes separate from domain models
- Examples: `StopPredictionsResponse`, `RoutePrediction`, `Destination` interfaces in `src/server/api/models/Prediction.ts`
- Pattern: Interfaces for API responses, separate from DASH API response types (which have `Dash` prefix)

## Entry Points

- Location: `src/server/app.ts`
- Triggers: `bun run dev-server` or `bun run start-server` (via package.json scripts)
- Responsibilities:
- **GET /api/v1/routes/all** → Returns all bus routes
- **GET /api/v1/routes/:shortName** → Returns single route by short name
- **GET /api/v1/predictions** → Returns arrival predictions for a stop

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

```typescript

```

### Catching All Errors Generically

```typescript

```

### Mixing API Response Types with Domain Models

- `DashApiResponse` (what DASH API returns)
- `DashPredictionData`, `DashDestination` (DASH API shapes)
- `StopPredictionsResponse` (what service returns)
- Mapping happens in `PredictionService.getPredictionsForStop()` via `mapToRoutePredictions()` and `mapToDestinations()`

## Error Handling

- Services throw custom Error subclasses (`NotFoundError`, `UpstreamApiError`) when validation or external API calls fail
- Controllers catch errors and map to HTTP status codes and response bodies
- Unknown errors default to 500
- Error details are included in response body for debugging

```typescript

```

## Cross-Cutting Concerns

- `BusDataRepository` for fetch/refresh operations
- `PredictionService` for API calls
- `app.ts` for startup/shutdown
- Environment variables validated at startup via Zod in `src/server/config/environment.ts`
- Request parameters validated in controllers (e.g., `parseNumberParam()` in `PredictionController`)
- Domain data validated in repository during parsing (e.g., `Number.parseFloat()` for coordinates, error on NaN)

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
