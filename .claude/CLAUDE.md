<!-- GSD:project-start source:PROJECT.md -->

## Project

**dash-tracker**

dash-tracker is a Node.js/Express REST API that proxies and structures data from the DASH public transit API (goswift.ly), exposing bus routes and arrival predictions through a layered architecture (routes → controllers → services → repositories). v0.1 shipped a dev-tooling cleanup: the lint/format toolchain is now Biome-only, and the whole repo conforms to it. Feature work resumes from a clean, single-tool baseline.

<!-- GSD:project-end -->

## Commands

- **Install:** `bun install --frozen-lockfile` at the repo root, with Bun 1.3.14 from the root `packageManager` (proto resolves it locally, setup-bun in CI). The text `bun.lock` is the only lockfile, and the root `bunfig.toml` enforces the hoisted linker, exact specifiers and a 7-day minimum release age. To add a dependency, run `bun add <package>@<version>` with an exact version inside the workspace directory that uses it (for example `apps/server`).
- **Dev server:** `bun run dev:server` from the root. It runs the `dev-server` script in `apps/server` (nodemon + ts-node, auto-restart on change); stop it with Ctrl-C.
- **Build:** `bun run build` fans out to every workspace; in `apps/server` it runs `rm -rf dist && tsc` and writes `apps/server/dist/`.
- **Start without building:** `bun run --cwd apps/server start-server` (ts-node).
- **Type-check:** `bun run typecheck` fans out to every workspace. In `apps/server` it runs `tsc -p tsconfig.typecheck.json`, which type-checks the server source and every `*.test.ts` without emitting; `build` compiles from `tsconfig.json`, which keeps tests out of `dist/`.
- **Lint:** `bun run lint` (check) / `bun run lint:fix` (auto-fix unsafe issues). Biome runs once from the root and covers every workspace and the root files.
- **Format:** `bun run format` (check) / `bun run format:write` (write) — identical to lint commands; Biome is the sole tool and runs once from the root over every workspace.
- **Test:** `bun run test` (vitest --run --typecheck) / `bun run test:coverage` (adds coverage; 80% threshold enforced; report in `apps/server/coverage/`) fan out to every workspace. Always use `bun run test`; `bun test` starts Bun's own test runner instead of Vitest.
- **Run a single test file:** `bun run --filter @dash-tracker/server test -- src/api/models/BusRoute.test.ts` from the root, or `bun run test -- src/api/models/BusRoute.test.ts` inside `apps/server`.
- **Local config:** the server reads `apps/server/.env` (start from `apps/server/.env.example`) and keeps its SQLite database in `apps/server/data/`. One-time move: if you have an env file or a `data/` directory at the repo root from before the monorepo, move both into `apps/server` by hand; there is no migration script.

## Testing

- Framework: Vitest. Test files live alongside source files (`.test.ts`).
- `apps/server/src/test/setup.ts` sets the required env vars and pins `TRUST_PROXY_HOPS=0` before every test run.
- Use `vi.mock()` for module-level mocking. Reset singleton instances in `beforeEach`/`afterEach` to prevent test bleed.
- Test data factories (e.g., `makeStop`, `makeRoute`) are defined in test helpers — prefer them over inline object literals.
- Coverage thresholds: 80% on branches, functions, lines, and statements.

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

- TypeScript 5.7.3, Node 20 (`.node-version`), Bun 1.3.14 (root `packageManager`) as package manager, workspace manager and script runner; hoisted linker; the text `bun.lock` is the only lockfile
- Monorepo: root `package.json` `workspaces: ["apps/*"]`; the API is `apps/server` (`@dash-tracker/server`); root `test`, `test:coverage`, `build` and `typecheck` fan out with `bun run --filter './apps/*'`; root `lint` and `format` run Biome once
- Express 4.21.2, Zod 3.25.76 (env/data validation), Axios 1.7.9 (DASH API client), Winston 3.17.0 (logging)
- Biome 1.9.4 — sole lint + format tool (root `biome.json`; 120 char width, 4-space indent, `noDefaultExport` off); Prettier fully removed
- Vitest 3.2.6 with `@vitest/coverage-v8` 3.2.6 — tests co-located as `*.test.ts`; config at `apps/server/vitest.config.mts`
- Build: `tsc` → `apps/server/dist/` (ES2020, CommonJS, strict mode)
- Required env vars (Zod-validated at startup, crash on missing/invalid): `DASH_API_BASE_URL`, `DASH_API_AGENCY`, `DASH_API_KEY`; optional `PORT`, `DASH_API_TIMEOUT_MS`, `DB_PATH`, `TRUST_PROXY_HOPS` (trusted reverse-proxy hop count for the client IP, default 0); see `apps/server/.env.example`
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

- Naming: PascalCase classes/interfaces (`BusRoute`, `NotFoundError`, `BusRouteService`); camelCase functions/vars; `createX` factory pattern (`createBusRouteService`); `makeX` test-data factories; barrel files re-export via `index.ts`
- Style: Biome-enforced — 120 char width, 4-space indent, double quotes, required semicolons, trailing commas
- Imports: no path aliases — relative paths only, rooted at `apps/server/src/`
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
| **Routes** | Map HTTP paths to controllers | `apps/server/src/api/routes/busRoutes.ts`, `predictionRoutes.ts` |
| **Controllers** | Parse requests, map errors to HTTP status, format responses | `apps/server/src/api/controllers/BusRouteController.ts`, `PredictionController.ts` |
| **Services** | Business logic, validation, DASH API URL building | `apps/server/src/api/services/BusRouteService.ts`, `PredictionService.ts` |
| **Repository** | Singleton in-memory data source, fetches from DASH API | `apps/server/src/api/repositories/BusDataRepository.ts` |
| **Models** | Domain types (`BusRoute`, `BusStop`, `RouteDirection`, `Prediction`) | `apps/server/src/api/models/` |
| **Config** | Env validation (Zod), axios client, Winston logger | `apps/server/src/config/` |

- `BusDataRepository` is a singleton (`getInstance()`) whose only fetch path is `load()`: it validates the whole DASH routes payload and then swaps routes, short names and stops in one synchronous step, or rejects and changes nothing, so the last good copy keeps serving; `getLoadState()` records `lastLoadedAt`, `lastFailedAt` and a message-only `lastError`; `BusDataRefreshService` drives `load()` in the background with chained, never-overlapping `setTimeout` attempts (capped exponential backoff with jitter until the first success, then hourly); predictions are fetched live from DASH API on every request (uncached)
- Error mapping: every controller maps errors through one helper, `sendErrorResponse` (`apps/server/src/api/controllers/errorResponse.ts`): `NotFoundError` → 404, `DataNotReadyError` → 503 with `Retry-After: 5`, `UpstreamApiError` → 502, anything else → 500 with the fixed details "An unexpected error occurred" (logged, never echoed); services throw and controllers translate
- DASH-shaped API types (`Dash*`) are kept separate from service response types (`StopPredictionsResponse`, etc.) — mapping happens explicitly in `PredictionService`
- Entry point `apps/server/src/app.ts`: registers process error handlers → opens SQLite (fatal on failure) → listens → starts the route/stop loader and the alert poll in the background, so DASH never blocks listen and data-dependent endpoints answer 503 until the first load; SIGTERM/SIGINT stop both loops before the server closes
- Endpoints: `GET /api/v1/routes/all`, `GET /api/v1/routes/:shortName`, `GET /api/v1/routes/:shortName/stops`, `GET /api/v1/stops/nearby?lat&lng&radius&count`, `GET /api/v1/predictions?stop&route&number`, `GET /api/v1/predictions/nearby?lat&lng&radius&number`, `GET /api/v1/predictions/stream?stop` (SSE), `GET /api/v1/vehicles?route`, `GET /api/v1/favorites`, `POST /api/v1/favorites`, `DELETE /api/v1/favorites/:entityType/:entityId`, `GET /api/v1/recents`, `GET /api/v1/health/live`, `GET /api/v1/health/ready`. Favorites and recents require an `X-Device-Id` header; `GET /api/v1/predictions` also records a recent when `X-Device-Id` is sent
- Rate limiting: one shared `express-rate-limit` bucket (`apps/server/src/api/middleware/upstreamRateLimit.ts`, 60 requests per minute per client IP) sits in front of the routes that call DASH live (`/predictions`, `/predictions/nearby`, `/predictions/stream`, `/vehicles`) and answers 429 `{ error, details }` with `Retry-After`; in-memory endpoints and the health probes are never limited, and the client IP honors `TRUST_PROXY_HOPS`; `/predictions/stream` also passes a per-IP concurrent-stream cap (`apps/server/src/api/middleware/streamConcurrencyCap.ts`, 5 open streams per client IP, checked after the bucket so every connect still spends it) that answers 429 `{ error, details }` with `Retry-After: 5`, never touches an open stream, and frees a slot when the stream's response closes
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
