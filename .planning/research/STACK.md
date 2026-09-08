# Stack Research

**Domain:** Embedded SQLite persistence for a Node/Express + TypeScript backend (favorited & recent routes)
**Researched:** 2026-08-31
**Confidence:** HIGH

## Critical Finding First: This App Runs on Node, Not the Bun Runtime

Bun (`1.0.31`, pinned via `packageManager` in `package.json`) is used here **only as the package manager** (`bun install`, `bun run <script>`). Every actual script — `dev-server` (`nodemon --exec ts-node ...`), `start-server` (`ts-node ...`), `build` (`tsc`), `test` (`vitest`) — shells out to `ts-node`/`tsc`/`vitest`, all of which execute under the **Node.js runtime** (project targets Node 20 via `@tsconfig/node20`, confirmed locally at `v20.20.2`). `bun:sqlite` is a Bun-runtime built-in module — it does not exist under `node`/`ts-node`/`vitest` processes and **cannot be imported here**, regardless of how appealing "zero extra dependency" sounds. This single fact eliminates `bun:sqlite` as a candidate and is the most important thing for the roadmap to know before scoping this milestone.

Node's own built-in `node:sqlite` is also not an option: it landed experimental in Node 22.5+, and this project is pinned to Node 20.

That leaves a native/N-API SQLite driver installed as a regular npm dependency. `better-sqlite3` is that driver.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `better-sqlite3` | `^12.11.1` | Synchronous, native SQLite3 driver | The de facto standard Node SQLite driver: prebuilt binaries, no async ceremony for what is a purely local, low-latency embedded DB, and — critically — this exact major line (`12.x`) is the last one whose `engines` field explicitly supports `node: "20.x"`. **Do not install `^13.x`** (current npm `latest` tag): as of `13.0.0` the package's `engines` field requires `node: ">=22"` and will fail (or at minimum warn/behave unpredictably) against this project's Node 20 baseline. Pin `^12.11.1` deliberately, not "latest". |
| `@types/better-sqlite3` | `^9.6.0` | TypeScript type definitions for `better-sqlite3` | `better-sqlite3` ships no bundled `.d.ts` (checked: `types` field absent from its `package.json`); this is the standard DefinitelyTyped package everyone pairs with it. Install as a `devDependency`, matching how `@types/supertest` is already handled in this repo. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | `^3.24.0` (already a dependency — no new install) | Validate the `X-Device-Id` header and favorite/recent request payloads before they touch the repository | Existing convention: Zod is already used for env/data validation in this codebase. Validate device ID shape (e.g., non-empty string, reasonable length/format) at the controller boundary before it reaches the SQLite layer — keeps bad input out of prepared-statement parameters and matches the "services throw / controllers translate" error convention already in place. |

No additional runtime libraries are needed. Do not add a query builder, connection pool, or migration framework for this milestone — see "What NOT to Use" below.

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Vitest (`2.1.5`, already installed) | Test the new repository/service/controller layers | No new test tooling needed. `better-sqlite3` opens an in-memory DB by opening `:memory:` as the "filename" — this is synchronous, fast, and requires zero mocking of the driver itself (see Testability section). |
| `@vitest/coverage-v8` (already installed) | Enforce the existing 80% coverage threshold on the new SQLite repository code | Unchanged; SQLite code is plain sync JS/TS and covers normally. |

## Installation

```bash
# Core
bun add better-sqlite3@^12.11.1

# Dev dependency
bun add -D @types/better-sqlite3@^9.6.0
```

No other installs required — `zod`, `vitest`, `@vitest/coverage-v8`, `typescript`, and `biome` are already in place and need no version changes for this feature.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| `better-sqlite3` | `bun:sqlite` | Only if this project ever migrates its *execution* (not just package management) to the actual Bun runtime — i.e., `dev-server`/`start-server`/`test` scripts stop shelling out through `ts-node`/`vitest`-on-Node and instead run natively under `bun run app.ts` / `bun test`. Not the case today; would be a separate, larger infra decision outside this milestone's scope. |
| `better-sqlite3` | `node:sqlite` (built-in) | Once the project's Node baseline moves to 22+ (it's on `@tsconfig/node20` / Node 20 today) and the team wants to drop the native-binary dependency entirely. Worth revisiting at the next Node upgrade, not now. |
| `better-sqlite3` (raw driver + hand-rolled repository) | `drizzle-orm` (+ `drizzle-kit` for migrations) | If/when the schema grows non-trivially complex (many tables, relations, frequent schema churn) and the team wants typed query building and a migration CLI. For two small tables (favorites, recents) with simple CRUD, Drizzle's schema DSL, migration generator, and additional TS build-time codegen step are pure overhead relative to a couple of hand-written prepared statements — and this project has zero ORM anywhere today, so introducing one here would be a first-of-its-kind pattern for a feature that doesn't need it. |
| `better-sqlite3` (sync API) | `sqlite3` (async, callback-based npm package) | Never, for this project — `sqlite3` is slower, callback-based (fighting this codebase's `async`/`await`-everywhere convention for no benefit, since the underlying I/O is still local-disk-fast), and is generally considered legacy relative to `better-sqlite3` in the current Node ecosystem. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| `better-sqlite3@13.x` / `@latest` | `engines.node` is `>=22`; this project's toolchain (`@tsconfig/node20`, local Node `v20.20.2`) is Node 20. Installing `latest` blindly is the single easiest way to break `bun install`/CI on this project. | Pin `^12.11.1` explicitly in `package.json`, which lists `node: "20.x \|\| 22.x \|\| ..."` in its own `engines` field. |
| `bun:sqlite` | Not available outside the Bun *runtime*; every script in this repo executes under Node via `ts-node`/`vitest`/`tsc`. Importing it will throw a module-not-found error at runtime. | `better-sqlite3` (npm dependency, works under Node). |
| `drizzle-orm` / any ORM (`prisma`, `typeorm`, `sequelize`, `kysely`) | Codebase has zero ORM usage anywhere and an explicit engineering principle to avoid speculative abstraction/indirection; two small tables with basic CRUD don't need a query builder, schema DSL, or generated migration tooling. Also would require a build-time codegen step (`drizzle-kit generate`) that doesn't exist in this project's `tsc`-only build pipeline. | Hand-rolled repository using `better-sqlite3` prepared statements directly — mirrors the plain-object style already used in `BusDataRepository`. |
| A standalone migration framework (`umzug`, `db-migrate`, `knex` migrations, `drizzle-kit`) | This milestone introduces exactly two new tables (`favorites`, `recents`) with no prior schema to migrate from. A migration runner/CLI is infrastructure for schema churn over time — premature for the current scope. | Idempotent `CREATE TABLE IF NOT EXISTS ...` DDL executed once at repository `initialize()`, the same moment `BusDataRepository.initialize()` already runs before the Express server starts accepting requests. If the schema needs versioned migrations later (e.g., adding columns to production data), that's a deliberate future decision, not a day-one requirement. |
| `sqlite3` (npm package, async/callback API) | Older, slower, callback-style API; largely superseded by `better-sqlite3` in current Node projects for embedded/local use cases. | `better-sqlite3`. |

## Stack Patterns by Variant

**For this milestone (dev/prod persistence):**
- Open a file-based SQLite DB via `better-sqlite3` at a path controlled by a new env var (e.g. `DASH_DB_PATH`, following the existing Zod-validated env pattern in `src/server/config/`), defaulting to something like `./data/dash-tracker.db`.
- Run schema DDL (`CREATE TABLE IF NOT EXISTS favorites (...)`, `CREATE TABLE IF NOT EXISTS recents (...)`) immediately after opening the connection, before the repository is considered "initialized" — same lifecycle position as `BusDataRepository.initialize()` in `app.ts`'s startup sequence.
- Enable `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON` on connection open — standard `better-sqlite3` recommendations for a single-process embedded server (WAL improves concurrent read/write behavior under Node's event loop; foreign keys aren't strictly required for two flat tables but cost nothing and guard against future joins).

**For tests (Vitest):**
- Open `better-sqlite3` against the literal string `":memory:"` instead of a file path. This is fully synchronous, requires no `vi.mock()` of the driver itself, leaves no files on disk, and gives full test isolation for free.
- Follow the existing "reset singleton instances in `beforeEach`/`afterEach`" convention: construct a fresh `:memory:` `Database` instance per test (or per test file) and re-run the schema DDL against it, exactly the way `BusDataRepository`'s tests already reset repository state between tests. Do not share one in-memory DB instance across tests — each `:memory:` connection is a distinct, empty database.
- Because `better-sqlite3` is synchronous, no async mocking is needed to fake DB latency; wrap repository methods in `async`/`Promise<T>`-returning signatures purely to match this codebase's existing convention ("async functions return `Promise<T>` and are awaited"), not because the underlying calls are actually asynchronous.
- Test-data factories (`makeFavorite`, `makeRecent`, following the existing `makeStop`/`makeRoute` pattern) should build plain row objects, not depend on the DB being open — insert them via the repository under test.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| `better-sqlite3@^12.11.1` | Node `20.x \| 22.x \| 23.x \| 24.x \| 25.x \| 26.x` (per its own `engines` field) | Matches this project's Node 20 target (`@tsconfig/node20`, local `v20.20.2`). Confirmed via direct `npm view` inspection — do not trust "latest" without checking `engines` again if this dependency is ever bumped. |
| `better-sqlite3@^12.11.1` | `typescript@^5.7.3` (project's pinned version) | `@types/better-sqlite3@^9.6.0` targets the stable `better-sqlite3` API surface (synchronous `Database`, `prepare()`, `.run()`/`.get()`/`.all()`) which has been stable across the 7.x–12.x line; no TS strict-mode friction expected given this project's `strict: true` + `@tsconfig/strictest` config. |
| `better-sqlite3` (native/N-API module) | Bun as **package manager only** | `bun install` fetches and (if needed) rebuilds native modules the same way `npm`/`yarn` would since Bun 1.x supports npm-compatible native module installs; this is unaffected by the fact execution happens under Node, since installation and execution are separate concerns here. |

## Sources

- npm registry (`npm view better-sqlite3`, `npm view better-sqlite3@12.11.1 engines`, `npm view @types/better-sqlite3`) — HIGH confidence, primary source, verified 2026-08-31 directly against the registry, including per-major `engines` fields (`11.x`: unrestricted, `12.x`: `20.x || 22.x || ...`, `13.x`: `>=22` only).
- `better-sqlite3` GitHub repository (WiseLibs/better-sqlite3) — referenced via web search for N-API/version-history context; HIGH confidence (official source repo).
- Project files inspected directly: `package.json`, `tsconfig.json`, `src/server/api/repositories/BusDataRepository.ts`/`.test.ts`/`index.ts`, `.claude/CLAUDE.md`, `.planning/PROJECT.md` — used to confirm the Node-vs-Bun-runtime execution model and existing repository/testing conventions this new layer must match.

---
*Stack research for: SQLite-backed persistence for favorited/recent routes (dash-tracker v0.3)*
*Researched: 2026-08-31*
