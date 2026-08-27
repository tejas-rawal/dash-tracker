This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Package manager:** Bun (v1.0.31). Use `bun` for all installs and script execution.

```bash
bun run dev-server      # Start server with nodemon auto-reload
bun run start-server    # Run server once via ts-node
bun run build           # Compile TypeScript to dist/
bun run lint            # Biome linter check
bun run lint:fix        # Biome linter with unsafe auto-fixes
bun run format          # Prettier check
bun run format:write    # Prettier write
bun run test            # Vitest with typecheck (all tests)
bun run test:coverage   # Tests + coverage report (80% threshold)
```

**Run a single test file:**
```bash
bun run test -- src/server/api/models/BusRoute.test.ts
```

## Architecture

This is a Node.js/Express REST API that proxies and structures data from the DASH public transit API (goswift.ly).

**Layered architecture** — strict top-down flow with no layer skipping:

```
routes → controllers → services → repositories → external DASH API
```

- **`src/server/app.ts`** — Entry point. Initializes the repository singleton, then starts Express. The server does not accept requests until the repository has loaded its data.
- **`src/server/config/`** — Zod-validated environment config (`environment.ts`), Axios instance pre-configured with DASH API base URL and auth headers (`axios.ts`), Winston logger.
- **`src/server/api/repositories/BusDataRepository.ts`** — Singleton (`getInstance()`) that owns all in-memory bus route and stop data fetched from the upstream API on startup.
- **`src/server/api/services/`** — Business logic. Created via factory functions (e.g., `createBusRouteService(repo)`) that accept repository/dependencies as parameters — no global imports of the singleton inside services.
- **`src/server/api/controllers/`** — Request/response handling. Also factory functions (e.g., `createBusRouteController(service)`).
- **`src/server/api/models/`** — Pure TypeScript types + factory functions (`createRoute`, `createStop`, etc.) for constructing domain objects from raw API data.
- **`src/server/api/errors/`** — Custom error classes (`NotFoundError`, `UpstreamApiError`) used for typed error propagation from service to controller.

**Dependency injection pattern:** The singleton is created once in `app.ts` and passed down through factory functions. Services and controllers never import the singleton directly — this keeps them testable.

## Testing

- Framework: Vitest. Test files live alongside source files (`.test.ts`).
- `src/server/test/setup.ts` sets required env vars before test runs.
- Use `vi.mock()` for module-level mocking. Reset singleton instances in `beforeEach`/`afterEach` to prevent test bleed.
- Test data factories (e.g., `makeStop`, `makeRoute`) are defined in test helpers — prefer them over inline object literals.
- Coverage thresholds: 80% on branches, functions, lines, and statements.

## Tooling Conventions

- **TypeScript** strict mode is fully enabled (`noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`, etc.). Target: ES2020, module: CommonJS.
- **Biome** handles linting (line width 120, 4-space indent). `noDefaultExport` rule is disabled — default exports are allowed.
- **Prettier** handles formatting (config via `@jonahsnider/prettier-config`).
- **Environment variables** — `DASH_API_BASE_URL`, `DASH_API_AGENCY`, and `DASH_API_KEY` are required. `PORT` defaults to 3000. All validated at startup via Zod; missing vars crash immediately.

## Engineering Principles

- Do not preserve backward compatibility. Remove obsolete paths instead of adding compatibility layers, fallbacks, or migrations.
- Choose the simplest implementation that fully meets the current requirements. Avoid speculative abstractions, configuration, and indirection.
- Grow the system in layers. Start from the smallest version that works end to end, and add each new capability on top of a product that already works. Never trade a working product for unfinished complexity.
- Keep components modular and concerns clearly separated.
- Prefer established, well-maintained libraries when they reduce overall complexity or improve reliability. Do not reimplement common functionality without a clear reason.
- Lean on the dependencies already in the project before writing your own implementation or adding packages. Do not assume a library lacks a capability without checking its documentation and types.
- Make architectural decisions for the long term. Do not accept a stopgap that only works for now and is meant to be replaced later.
