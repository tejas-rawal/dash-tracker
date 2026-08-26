# dash-tracker

dash-tracker is a Node.js/Express REST API that proxies and structures data from the DASH public transit API (goswift.ly), exposing bus routes and arrival predictions through a layered architecture (routes → controllers → services → repositories). v0.1 shipped a dev-tooling cleanup: the lint/format toolchain is now Biome-only, and the whole repo conforms to it. Feature work resumes from a clean, single-tool baseline.

**Core value:** A single, unambiguous command for linting and formatting — no redundant tools, no drift between what CI checks and what a contributor runs locally.

**Constraints:**

- Biome must remain the linter (`biome.json` — 120 char line width, 4-space indent, `noDefaultExport` disabled) — no reason to replace it, only to stop pairing it with Prettier
- Build step (`tsc` → `dist/`) and test runner (Vitest) are out of scope and must keep working unchanged after the lint/format swap

## Commands

- **Install:** `bun install`
- **Dev server:** `bun run dev-server` (nodemon + ts-node, auto-restart on change)
- **Build:** `bun run build` (`rm -rf dist && tsc` → `dist/`)
- **Start built server:** `bun run start-server` (ts-node, no build step)
- **Lint:** `bun run lint` (check) / `bun run lint:fix` (auto-fix unsafe issues)
- **Format:** `bun run format` (check) / `bun run format:write` (write) — identical to lint commands; Biome is the sole tool
- **Test:** `bun run test` (vitest --run --typecheck) / `bun run test:coverage` (adds coverage; 80% threshold enforced)

## Technology Stack

- TypeScript 5.7.3, Node 20, Bun 1.0.31 (package manager — `bun.lockb`)
- Express 4.21.2, Zod 3.24.0 (env/data validation), Axios 1.7.9 (DASH API client), Winston 3.17.0 (logging)
- Biome 1.9.4 — sole lint + format tool (`biome.json`; 120 char width, 4-space indent, `noDefaultExport` off); Prettier fully removed
- Vitest 2.1.5 — tests co-located as `*.test.ts`
- Build: `tsc` → `dist/` (ES2020, CommonJS, strict mode)
- Required env vars (Zod-validated at startup, crash on missing/invalid): `DASH_API_BASE_URL`, `DASH_API_AGENCY`, `DASH_API_KEY`, optional `PORT`

## Conventions

- Naming: PascalCase classes/interfaces (`BusRoute`, `NotFoundError`, `BusRouteService`); camelCase functions/vars; `createX` factory pattern (`createBusRouteService`); `makeX` test-data factories; barrel files re-export via `index.ts`
- Style: Biome-enforced — 120 char width, 4-space indent, double quotes, required semicolons, trailing commas
- Imports: no path aliases — relative paths only, rooted at `src/server/`
- Logging (Winston): startup/shutdown, external API calls, error conditions — not per-call noise
- Comments: sparse, explain "why" not "what"; `biome-ignore`/`@ts-expect-error` comments must state the reason
- Functions: explicit return types; typed object params for multi-arg calls; async functions return `Promise<T>` and are awaited; repositories return `undefined` for "not found", services throw
- Modules: named exports preferred (default export only for route handlers/barrels); DI via factory-function parameters — never import the repository singleton directly inside a service

## Architecture

Layered, strict top-down flow, no skipping: **Routes → Controllers → Services → Repository → Models**. DI via factory functions everywhere (`createBusRouteService(repository)`, etc.) — never import the repository singleton directly inside a service/controller.

| Component | Responsibility | File |
|-----------|----------------|------|
| **Routes** | Map HTTP paths to controllers | `src/server/api/routes/busRoutes.ts`, `predictionRoutes.ts` |
| **Controllers** | Parse requests, map errors to HTTP status, format responses | `src/server/api/controllers/BusRouteController.ts`, `PredictionController.ts` |
| **Services** | Business logic, validation, DASH API URL building | `src/server/api/services/BusRouteService.ts`, `PredictionService.ts` |
| **Repository** | Singleton in-memory data source, fetches from DASH API | `src/server/api/repositories/BusDataRepository.ts` |
| **Models** | Domain types (`BusRoute`, `BusStop`, `RouteDirection`, `Prediction`) | `src/server/api/models/` |
| **Config** | Env validation (Zod), axios client, Winston logger | `src/server/config/` |

- `BusDataRepository` is a singleton (`getInstance()`), populated once via `initialize()` before `app.ts` starts accepting requests; in-memory maps are read-only afterward (no cache invalidation); predictions are fetched live from DASH API on every request (uncached)
- Error mapping: `NotFoundError` → 404, `UpstreamApiError` → 502, unknown → 500 (controllers catch and translate; services throw)
- DASH-shaped API types (`Dash*`) are kept separate from service response types (`StopPredictionsResponse`, etc.) — mapping happens explicitly in `PredictionService`
- Entry point `src/server/app.ts`: init repository → start Express → graceful shutdown on SIGTERM/SIGINT
- Endpoints: `GET /api/v1/routes/all`, `GET /api/v1/routes/:shortName`, `GET /api/v1/predictions?stop&route&number`
