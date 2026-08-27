<!-- GSD:project-start source:PROJECT.md -->

## Project

**dash-tracker**

dash-tracker is a Node.js/Express REST API that proxies and structures data from the DASH public transit API (goswift.ly), exposing bus routes and arrival predictions through a layered architecture (routes → controllers → services → repositories). v0.1 shipped a dev-tooling cleanup: the lint/format toolchain is now Biome-only, and the whole repo conforms to it. Feature work resumes from a clean, single-tool baseline.

<!-- GSD:project-end -->

## Commands

- **Install:** `bun install`
- **Dev server:** `bun run dev-server` (nodemon + ts-node, auto-restart on change)
- **Build:** `bun run build` (`rm -rf dist && tsc` → `dist/`)
- **Start built server:** `bun run start-server` (ts-node, no build step)
- **Lint:** `bun run lint` (check) / `bun run lint:fix` (auto-fix unsafe issues)
- **Format:** `bun run format` (check) / `bun run format:write` (write) — identical to lint commands; Biome is the sole tool
- **Test:** `bun run test` (vitest --run --typecheck) / `bun run test:coverage` (adds coverage; 80% threshold enforced)
- **Run a single test file:** `bun run test -- src/server/api/models/BusRoute.test.ts`

## Testing

- Framework: Vitest. Test files live alongside source files (`.test.ts`).
- `src/server/test/setup.ts` sets required env vars before test runs.
- Use `vi.mock()` for module-level mocking. Reset singleton instances in `beforeEach`/`afterEach` to prevent test bleed.
- Test data factories (e.g., `makeStop`, `makeRoute`) are defined in test helpers — prefer them over inline object literals.
- Coverage thresholds: 80% on branches, functions, lines, and statements.

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

- TypeScript 5.7.3, Node 20, Bun 1.0.31 (package manager — `bun.lockb`)
- Express 4.21.2, Zod 3.24.0 (env/data validation), Axios 1.7.9 (DASH API client), Winston 3.17.0 (logging)
- Biome 1.9.4 — sole lint + format tool (`biome.json`; 120 char width, 4-space indent, `noDefaultExport` off); Prettier fully removed
- Vitest 2.1.5 — tests co-located as `*.test.ts`
- Build: `tsc` → `dist/` (ES2020, CommonJS, strict mode)
- Required env vars (Zod-validated at startup, crash on missing/invalid): `DASH_API_BASE_URL`, `DASH_API_AGENCY`, `DASH_API_KEY`, optional `PORT`
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

- Naming: PascalCase classes/interfaces (`BusRoute`, `NotFoundError`, `BusRouteService`); camelCase functions/vars; `createX` factory pattern (`createBusRouteService`); `makeX` test-data factories; barrel files re-export via `index.ts`
- Style: Biome-enforced — 120 char width, 4-space indent, double quotes, required semicolons, trailing commas
- Imports: no path aliases — relative paths only, rooted at `src/server/`
- Logging (Winston): startup/shutdown, external API calls, error conditions — not per-call noise
- Comments: sparse, explain "why" not "what"; `biome-ignore`/`@ts-expect-error` comments must state the reason
- Functions: explicit return types; typed object params for multi-arg calls; async functions return `Promise<T>` and are awaited; repositories return `undefined` for "not found", services throw
- Modules: named exports preferred (default export only for route handlers/barrels); DI via factory-function parameters — never import the repository singleton directly inside a service
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

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
<!-- GSD:architecture-end -->

## Engineering Principles

- Do not preserve backward compatibility. Remove obsolete paths instead of adding compatibility layers, fallbacks, or migrations.
- Choose the simplest implementation that fully meets the current requirements. Avoid speculative abstractions, configuration, and indirection.
- Grow the system in layers. Start from the smallest version that works end to end, and add each new capability on top of a product that already works. Never trade a working product for unfinished complexity.
- Keep components modular and concerns clearly separated.
- Prefer established, well-maintained libraries when they reduce overall complexity or improve reliability. Do not reimplement common functionality without a clear reason.
- Lean on the dependencies already in the project before writing your own implementation or adding packages. Do not assume a library lacks a capability without checking its documentation and types.
- Make architectural decisions for the long term. Do not accept a stopgap that only works for now and is meant to be replaced later.

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
