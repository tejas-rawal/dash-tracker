# Coding Conventions

**Analysis Date:** 2026-08-20

## Naming Patterns

**Files:**
- Classes: PascalCase (`BusRoute.ts`, `BusStop.ts`, `NotFoundError.ts`)
- Factory functions: lowercase with `.ts` (`busRoutes.ts`, `app.ts`)
- Test files: Same name as source + `.test.ts` suffix (`BusRoute.test.ts`)
- Configuration: lowercase (`logger.ts`, `axios.ts`, `environment.ts`)
- Directories: lowercase with hyphens for multi-word paths (`src/server/api/repositories/`, `src/server/config/`)

**Functions & Methods:**
- camelCase: `getAgencyRoutes()`, `createBusRouteService()`, `getAllStops()`, `getDirectionById()`
- Factory functions: `createX` pattern (`createBusRouteService`, `createBusRouteController`)
- Private methods: Prefix with underscore (convention, not enforced by TypeScript)

**Variables:**
- camelCase: `mockRepo`, `mockService`, `mockAxiosGet`, `routes`, `stopIds`
- Constants: Use camelCase or UPPER_SNAKE_CASE for truly constant values
- Test data factories: `makeX` pattern (`makeStop()`, `makeRoute()`, `makeMockRepo()`)

**Types & Classes:**
- PascalCase for classes: `BusRoute`, `BusStop`, `NotFoundError`, `UpstreamApiError`
- PascalCase for interfaces: `BusRouteService`, `BusRouteController`
- Enums: PascalCase with PascalCase values: `RouteType.Bus`, `RouteType.Subway`, `RouteType.Tram`, `RouteType.Rail`
- Type aliases: PascalCase

**Module Exports:**
- Named exports preferred: `export { BusRoute, BusStop }`
- Barrel files: `src/server/api/models/index.ts` exports all model classes
- Default exports allowed: Routes use `export default router`
- Factory functions: Exported as named exports (`export function createBusRouteService(...)`)

## Code Style

**Formatting & Linting:**
- **Tool:** Biome v1.9.4 (`@biomejs/biome`) — sole linter and formatter, config in `biome.json`
- **Line width:** 120 characters
- **Indentation:** 4 spaces
- **Quote style:** Double quotes (`"`) for strings; single quotes (`'`) for JSX attributes
- **Semicolons:** Required
- **Trailing commas:** all (Biome default)
- **Key lint rules:** `style/all: true`, `noParameterProperties: off`, `noDefaultExport: off`, `suspicious/noExplicitAny: info`
- **Run:** `bun run lint` (check), `bun run lint:fix` (auto-fix unsafe issues)

**TypeScript Strict Mode:**
- **Enabled:** All strict mode options active
- **Key settings:**
  - `noImplicitAny: true` — all expressions must have explicit types
  - `noUnusedLocals: true` — unused variables cause errors
  - `noUnusedParameters: true` — unused function parameters cause errors
  - `noImplicitReturns: true` — all code paths must return a value
  - `noFallthroughCasesInSwitch: true` — fallthrough cases prohibited
  - `forceConsistentCasingInFileNames: true` — file path case consistency enforced
- **Target:** ES2020
- **Module:** CommonJS

## Import Organization

**Order (top to bottom):**
1. Type imports with `import type { ... }` for TypeScript types
2. Module imports from dependencies (express, axios, winston)
3. Module imports from own layers (config, models, services)
4. Barrel imports from index files

**Example:**
```typescript
import type { Request, Response } from 'express';
import type { BusRouteService } from '../services/BusRouteService';
import { NotFoundError } from '../errors';
import { BusRoute, BusStop } from '../models';
```

**Path Aliases:**
- No path aliases configured — use relative paths throughout
- Root is `src/server/` for API files
- Use `../` to navigate up directory structure

## Error Handling

**Strategy:** Typed error throwing with custom error classes

**Patterns:**

**Custom Error Classes** (`src/server/api/errors/index.ts`):
```typescript
export class NotFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NotFoundError';
    }
}

export class UpstreamApiError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UpstreamApiError';
    }
}
```

**In Services:** Throw custom errors for domain-level failures
```typescript
function getAgencyRoute(shortName: string): BusRoute {
    const route = repository.getRouteByShortName(shortName);
    if (!route) {
        throw new NotFoundError(`Route not found: ${shortName}`);
    }
    return route;
}
```

**In Controllers:** Catch errors and map to HTTP responses
```typescript
const getAllRoutes: RequestHandler = (_req: Request, res: Response) => {
    try {
        const routes = service.getAgencyRoutes();
        res.json(routes);
    } catch (error: unknown) {
        res.status(error instanceof NotFoundError ? 404 : 500).json({
            error: error instanceof NotFoundError ? 'Not Found' : 'Request Failed',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
};
```

**Type Guard Pattern:** Always use `error instanceof Error` to safely access `.message`

## Logging

**Framework:** Winston v3.17.0

**Configuration** (`src/server/config/logger.ts`):
```typescript
export const logger = winston.createLogger({
    level: 'info',
    format: winston.format.simple(),
    transports: [new winston.transports.Console()]
});
```

**Patterns:**
- Log at startup: `logger.info('Server is running on port 3000')`
- Log on error: `logger.error('Failed to initialize application data: ${message}')`
- Log graceful shutdown: `logger.info('Server is gracefully shutting down')`
- Use string interpolation for context: `logger.error('Failed to ${action}: ${reason}')`

**When to Log:**
- Application startup/shutdown
- External API calls (in repositories)
- Error conditions
- Not on every function call (avoid noise)

## Comments

**File-Level Comment:**
```typescript
// BusDataRepository.ts
```
Add filename at the top of each file for clarity.

**JSDoc for Public Methods:**
```typescript
/**
 * Returns the lat-long location of the stop as an object.
 * @returns An object with `lat` and `lon` properties.
 */
getLocation(): { lat: number, lon: number } {
    return { lat: this.lat, lon: this.lon };
}
```

**Inline Comments:**
- Use sparingly; code should be self-documenting
- Explain "why" not "what": `// graceful shutdown` (good), `// call close()` (bad)
- Keep business logic clear: `const stopIds = new Set<string>();` (self-documenting)

**Ignore Comments:**
- Biome ignore: `// biome-ignore lint/style/noDefaultExport: This must be a default export`
- TypeScript error ignore: `// @ts-expect-error accessing private static for test isolation`

## Function Design

**Size:** Keep functions small and focused (typically < 20 lines)

**Parameters:**
- Use typed object parameters when multiple arguments: 
```typescript
constructor(data: {
    id: string;
    name: string;
    code: number;
    lat: number;
    lon: number;
})
```

- Single parameter or simple types: direct parameters OK
```typescript
function getRouteByShortName(shortName: string): BusRoute | undefined
```

**Return Values:**
- Always annotate return type explicitly: `(): BusRoute[]`
- Return domain objects from services, not raw data
- Return `undefined` for "not found" in repositories, throw in services
- Throw custom errors for exceptional conditions

**Async Functions:**
- Mark with `async` keyword
- Return `Promise<T>` explicitly
- Use `await` for all Promises
- Handle errors with try-catch or `.catch()`

## Module Design

**Exports:**
- Use named exports for most code: `export function createBusRouteService(...)`
- Use default export only for route handlers and barrel files
- Create barrel files (`index.ts`) to export groups: `src/server/api/models/index.ts`

**Barrel Files:**
- Location: `src/server/api/models/index.ts`, `src/server/api/errors/index.ts`
- Purpose: Centralize exports for cleaner imports
- Example:
```typescript
// src/server/api/models/index.ts
export { BusRoute } from './BusRoute';
export { BusStop } from './BusStop';
export { RouteType } from './BusRoute';
```

**Factory Function Pattern:**
Services and controllers use factory functions, not class constructors:

```typescript
// Service factory
export interface BusRouteService {
    getAgencyRoutes(): BusRoute[];
    getAgencyRoute(shortName: string): BusRoute;
}

export function createBusRouteService(repository: BusDataRepository): BusRouteService {
    function getAgencyRoutes(): BusRoute[] {
        return repository.getAllRoutes();
    }
    return { getAgencyRoutes, getAgencyRoute, ... };
}
```

**Dependency Injection:**
- Do NOT import singletons directly in services
- Accept dependencies as constructor/factory function parameters
- Wires dependency graph in route handlers: `src/server/api/routes/busRoutes.ts`

**Singleton Pattern** (Repository only):
```typescript
export class BusDataRepository {
    private static instance: BusDataRepository | undefined;

    static getInstance(): BusDataRepository {
        if (!BusDataRepository.instance) {
            BusDataRepository.instance = new BusDataRepository();
        }
        return BusDataRepository.instance;
    }
}
```

---

*Convention analysis: 2026-08-20*
