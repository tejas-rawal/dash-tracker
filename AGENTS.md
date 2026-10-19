# dash-tracker

dash-tracker is a Node.js/Express REST API that proxies and structures data from the DASH public transit API (goswift.ly), exposing bus routes and arrival predictions through a layered architecture (routes → controllers → services → repositories). v0.1 shipped a dev-tooling cleanup: the lint/format toolchain is now Biome-only, and the whole repo conforms to it. Feature work resumes from a clean, single-tool baseline.

## Commands

- **Install:** `bun install --frozen-lockfile`, run with Bun 1.3.14 (for example `~/.proto/tools/bun/1.3.14/bun`) rather than the `packageManager`-pinned `bun@1.0.31`. The tracked lockfile is the text `bun.lock`; 1.0.31 ignores it and writes the git-ignored binary `bun.lockb`, so the committed lockfile would go stale. Add a dependency with Bun 1.3.14 as an exact pin behind a 7-day release-age gate: `bun add <package>@<version> --minimum-release-age=604800`. The `bun run` scripts below run under the pinned 1.0.31.
- **Dev server:** `bun run dev-server` (nodemon + ts-node, auto-restart on change)
- **Build:** `bun run build` (`rm -rf dist && tsc` → `dist/`)
- **Start built server:** `bun run start-server` (ts-node, no build step)
- **Lint:** `bun run lint` (check) / `bun run lint:fix` (auto-fix unsafe issues)
- **Format:** `bun run format` (check) / `bun run format:write` (write) — identical to lint commands; Biome is the sole tool
- **Test:** `bun run test` (vitest --run --typecheck) / `bun run test:coverage` (adds coverage; 80% threshold enforced)

## Technology Stack

- TypeScript 5.7.3, Node 20, Bun as package manager and script runner: the tracked lockfile is the text `bun.lock`, installed and updated with Bun 1.3.14; `packageManager` pins `bun@1.0.31`, which runs the `bun run` scripts but writes the git-ignored binary `bun.lockb` if used to install
- Express 4.21.2, Zod 3.24.0 (env/data validation), Axios 1.7.9 (DASH API client), Winston 3.17.0 (logging)
- Biome 1.9.4 — sole lint + format tool (`biome.json`; 120 char width, 4-space indent, `noDefaultExport` off); Prettier fully removed
- Vitest 3.2.6 — tests co-located as `*.test.ts`
- Build: `tsc` → `dist/` (ES2020, CommonJS, strict mode)
- Required env vars (Zod-validated at startup, crash on missing/invalid): `DASH_API_BASE_URL`, `DASH_API_AGENCY`, `DASH_API_KEY`; optional `PORT`, `DASH_API_TIMEOUT_MS`, `DB_PATH`, `TRUST_PROXY_HOPS` (trusted reverse-proxy hop count for the client IP, default 0); see `.env.example`

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

- `BusDataRepository` is a singleton (`getInstance()`) whose only fetch path is `load()`: it validates the whole DASH routes payload and then swaps routes, short names and stops in one synchronous step, or rejects and changes nothing, so the last good copy keeps serving; `getLoadState()` records `lastLoadedAt`, `lastFailedAt` and a message-only `lastError`; `BusDataRefreshService` drives `load()` in the background with chained, never-overlapping `setTimeout` attempts (capped exponential backoff with jitter until the first success, then hourly); predictions are fetched live from DASH API on every request (uncached)
- Error mapping: every controller maps errors through one helper, `sendErrorResponse` (`src/server/api/controllers/errorResponse.ts`): `NotFoundError` → 404, `DataNotReadyError` → 503 with `Retry-After: 5`, `UpstreamApiError` → 502, anything else → 500 with the fixed details "An unexpected error occurred" (logged, never echoed); services throw and controllers translate
- DASH-shaped API types (`Dash*`) are kept separate from service response types (`StopPredictionsResponse`, etc.) — mapping happens explicitly in `PredictionService`
- Entry point `src/server/app.ts`: registers process error handlers → opens SQLite (fatal on failure) → listens → starts the route/stop loader and the alert poll in the background, so DASH never blocks listen and data-dependent endpoints answer 503 until the first load; SIGTERM/SIGINT stop both loops before the server closes
- Endpoints: `GET /api/v1/routes/all`, `GET /api/v1/routes/:shortName`, `GET /api/v1/predictions?stop&route&number`, `GET /api/v1/health/live`, `GET /api/v1/health/ready`
- Rate limiting: one shared `express-rate-limit` bucket (`src/server/api/middleware/upstreamRateLimit.ts`, 60 requests per minute per client IP) sits in front of the routes that call DASH live (`/predictions`, `/predictions/nearby`, `/predictions/stream`, `/vehicles`) and answers 429 `{ error, details }` with `Retry-After`; in-memory endpoints and the health probes are never limited, and the client IP honors `TRUST_PROXY_HOPS`; `/predictions/stream` also passes a per-IP concurrent-stream cap (`src/server/api/middleware/streamConcurrencyCap.ts`, 5 open streams per client IP, checked after the bucket so every connect still spends it) that answers 429 `{ error, details }` with `Retry-After: 5`, never touches an open stream, and frees a slot when the stream's response closes

## Engineering Principles

- Do not preserve backward compatibility. Remove obsolete paths instead of adding compatibility layers, fallbacks, or migrations.
- Choose the simplest implementation that fully meets the current requirements. Avoid speculative abstractions, configuration, and indirection.
- Grow the system in layers. Start from the smallest version that works end to end, and add each new capability on top of a product that already works. Never trade a working product for unfinished complexity.
- Keep components modular and concerns clearly separated.
- Prefer established, well-maintained libraries when they reduce overall complexity or improve reliability. Do not reimplement common functionality without a clear reason.
- Lean on the dependencies already in the project before writing your own implementation or adding packages. Do not assume a library lacks a capability without checking its documentation and types.
- Make architectural decisions for the long term. Do not accept a stopgap that only works for now and is meant to be replaced later.
