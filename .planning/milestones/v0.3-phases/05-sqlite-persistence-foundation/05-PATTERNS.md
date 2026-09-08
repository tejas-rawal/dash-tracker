# Phase 5: SQLite Persistence Foundation - Pattern Map

**Mapped:** 2026-08-31
**Files analyzed:** 6
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|-----------------|---------------|
| `src/server/api/repositories/FavoritesRecentsRepository.ts` (name TBD by planner) | repository | CRUD | `src/server/api/repositories/BusDataRepository.ts` | role-match (singleton lifecycle shape; different data flow — sync SQLite CRUD vs. async in-memory fetch/cache) |
| `src/server/api/repositories/FavoritesRecentsRepository.test.ts` | test | CRUD | `src/server/api/repositories/BusDataRepository.test.ts` | role-match |
| `src/server/config/environment.ts` (modified) | config | transform | itself (existing file, extend in place) | exact |
| `src/server/app.ts` (modified) | config/bootstrap | request-response | itself (existing file, extend in place) | exact |
| `src/server/config/logger.ts` | utility | — | used as-is, no modification | exact (consume only) |
| `src/server/api/errors/index.ts` | utility (errors) | — | consult for error-class naming convention if a new error type is needed | exact (consume/extend only) |

## Pattern Assignments

### `src/server/api/repositories/FavoritesRecentsRepository.ts` (repository, CRUD)

**Analog:** `src/server/api/repositories/BusDataRepository.ts`

**Imports pattern** (lines 1-3):
```typescript
import { axios, environment, logger } from "../../config";
// BusDataRepository.ts
import { BusRoute, BusStop, RouteDirection, type RouteType } from "../models";
```
New file should follow the same relative-import-from-barrel convention, e.g.:
```typescript
import Database from "better-sqlite3";
import { environment, logger } from "../../config";
```

**Singleton lifecycle pattern** (lines 30-63):
```typescript
export class BusDataRepository {
    private isInitialized = false;
    private initializationPromise: Promise<void> | null = null;

    private static instance: BusDataRepository;

    private constructor() {}

    // Singleton pattern
    public static getInstance(): BusDataRepository {
        if (!BusDataRepository.instance) {
            BusDataRepository.instance = new BusDataRepository();
        }
        return BusDataRepository.instance;
    }

    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = this.fetchAndProcessData()
            .then((data) => this.applyData(data))
            .catch((error) => this.handleLoadError("initialize", error));

        return this.initializationPromise;
    }
```
Mirror the shape (`private constructor`, `private static instance`, `getInstance()`, `initialize()` guarded by `isInitialized`), but adapt for the CONTEXT.md decisions:
- `initialize()` should open the `better-sqlite3` connection synchronously, run `CREATE TABLE IF NOT EXISTS` for `favorites` and `recents`, set `PRAGMA journal_mode = WAL` and `PRAGMA busy_timeout = <ms>` — still return `Promise<void>` per CLAUDE.md's "async functions return Promise<T>" convention, wrapping the sync work.
- Add a `close(): Promise<void>` method (no analog in `BusDataRepository` — it has none since the DASH API needs no explicit teardown). Should call the underlying `Database#close()` and reset `isInitialized`.
- No `refreshData()` equivalent is needed — favorites/recents don't get bulk-refreshed from an upstream API.

**Error handling pattern** (lines 96-101, `handleLoadError`):
```typescript
private handleLoadError(action: "initialize" | "refresh", error: unknown): never {
    this.initializationPromise = null;
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Failed to ${action} bus data: ${message}`);
    throw new Error(`Failed to ${action} bus data: ${message}`);
}
```
Reuse the `error instanceof Error ? error.message : "Unknown error"` idiom and `logger.error(...)` + rethrow-wrapped-Error shape for any init/close failure paths.

**Guard-before-access pattern** (lines 229-233, `assertInitialized`):
```typescript
private assertInitialized(): void {
    if (!this.isInitialized) {
        throw new Error("BusDataRepository has not been initialized. Call initialize() before accessing data.");
    }
}
```
Apply the same guard at the top of every public CRUD method (`upsertFavorite`, `listFavorites`, `removeFavorite`, `upsertRecent`, `listRecents`) to fail fast if called before `initialize()`.

**Public method signature style** (lines 236-264):
```typescript
public getAllRoutes(): BusRoute[] {
    this.assertInitialized();
    return Array.from(this.routes.values());
}

public getRouteById(id: string): BusRoute | undefined {
    this.assertInitialized();
    return this.routes.get(id);
}
```
Per CLAUDE.md ("repositories return `undefined` for 'not found'"), any single-row lookup method should return `T | undefined`, not throw. Per D-05/D-07, the write path (`upsertFavorite`/`upsertRecent`) should wrap a single `INSERT ... ON CONFLICT (device_id, entity_type, entity_id) DO UPDATE` statement and expose it as `Promise<void>` even though `better-sqlite3` is sync internally — this satisfies the DI/async-boundary conventions in CLAUDE.md and matches D-07's "Promise-wrapping async API" requirement for the concurrency test.

**Barrel export** — add to `src/server/api/repositories/index.ts` following its existing single-line `export * from "./X"` convention:
```typescript
export * from "./BusDataRepository";
```

---

### `src/server/api/repositories/FavoritesRecentsRepository.test.ts` (test, CRUD)

**Analog:** `src/server/api/repositories/BusDataRepository.test.ts`

**Singleton reset pattern** (lines 51-62):
```typescript
beforeEach(() => {
    vi.clearAllMocks();
    // Reset the singleton so each test gets a fresh instance
    // @ts-expect-error accessing private static for test isolation
    BusDataRepository.instance = undefined;
    repo = BusDataRepository.getInstance();
});

afterEach(() => {
    // @ts-expect-error accessing private static for test isolation
    BusDataRepository.instance = undefined;
});
```
Reuse this exact `@ts-expect-error`-annotated private-static-reset idiom for singleton isolation between tests. Per D-06, `beforeEach`/`afterEach` should additionally create/remove a real temp SQLite file (e.g. `path.join(os.tmpdir(), 'dash-tracker-test-${randomUUID()}.sqlite')`) rather than mocking `better-sqlite3` — this is a deliberate deviation from `BusDataRepository.test.ts`'s `vi.mock("../../config", ...)` approach, since D-06 explicitly requires exercising real on-disk WAL/locking behavior, not a mock.

**Config mocking pattern** (lines 5-12) — still applicable for the `environment.database.path` value (mock only `environment`, not the DB driver itself):
```typescript
vi.mock("../../config", () => ({
    axios: { get: vi.fn() },
    environment: {
        dashApi: { agency: "test-agency", baseUrl: "https://api.test.example.com", apiKey: "key" },
        server: { port: 3000 },
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
```
Adapt to mock `environment.database.path` pointing at the per-test temp file path, and keep `logger` mocked the same way to silence output while still allowing assertions on `logger.error`/`logger.info` calls if needed.

**Concurrency test pattern (new — no direct analog)**: per D-07, use `Promise.all([...many upsertFavorite calls for same device+entity...])`, then assert: (1) no rejection, (2) `listFavorites` returns exactly one row for that device+entity, (3) its timestamp reflects the last logical write. No existing test in the codebase exercises concurrent writes — this is new ground, but should follow the same `describe`/`it`/Arrange-Act-Assert comment style seen throughout `BusDataRepository.test.ts` (see lines 76-80 for the comment convention).

---

### `src/server/config/environment.ts` (config, transform) — MODIFY IN PLACE

**Existing schema pattern** (lines 7-16):
```typescript
const environmentSchema = z.object({
    // biome-ignore lint/style/useNamingConvention: env vars use SCREAMING_SNAKE_CASE by convention
    DASH_API_BASE_URL: z.string().min(1, "DASH_API_BASE_URL must not be empty"),
    ...
    // biome-ignore lint/style/useNamingConvention: env vars use SCREAMING_SNAKE_CASE by convention
    PORT: z.coerce.number().int().positive().default(3000),
});
```
Per D-02, add:
```typescript
    // biome-ignore lint/style/useNamingConvention: env vars use SCREAMING_SNAKE_CASE by convention
    DB_PATH: z.string().min(1).default("data/dash-tracker.sqlite"),
```
directly below `PORT`, following the identical `biome-ignore` comment + optional/`.default(...)` shape called out in D-02.

**Exported object pattern** (lines 27-36):
```typescript
export const environment = {
    dashApi: {
        baseUrl: parsed.data.DASH_API_BASE_URL,
        agency: parsed.data.DASH_API_AGENCY,
        apiKey: parsed.data.DASH_API_KEY,
    },
    server: {
        port: parsed.data.PORT,
    },
};
```
Add a new `database` sub-object (per CONTEXT.md's `environment.database.path` naming):
```typescript
    database: {
        path: parsed.data.DB_PATH,
    },
```

---

### `src/server/app.ts` (bootstrap) — MODIFY IN PLACE

**Existing init/shutdown sequence** (lines 19-43):
```typescript
// Initialize repository data before accepting requests
const repository = BusDataRepository.getInstance();
repository
    .initialize()
    .then(() => {
        const server = app.listen(port, () => {
            logger.info(`Server is running on port ${port}`);
        });

        // graceful shutdown
        const shutdown = () => {
            server.close(() => {
                logger.info("Server is gracefully shutting down");
                process.exit(0);
            });
        };

        process.on("SIGTERM", shutdown);
        process.on("SIGINT", shutdown);
    })
    .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error(`Failed to initialize application data: ${message}`);
        process.exit(1);
    });
```
Per D-03, wire the new repository's `initialize()` alongside (not inside) `BusDataRepository`'s init — e.g. `Promise.all([busDataRepository.initialize(), favoritesRecentsRepository.initialize()])` — and add its `close()` call inside the existing `shutdown` closure before/alongside `server.close(...)`. Keep the same `error instanceof Error ? error.message : "Unknown error"` idiom for the `.catch` handler, and the same `process.exit(0)`/`process.exit(1)` semantics for shutdown/failure.

---

## Shared Patterns

### Singleton `getInstance()`/`initialize()` lifecycle
**Source:** `src/server/api/repositories/BusDataRepository.ts` lines 30-63
**Apply to:** The new SQLite-backed repository class
```typescript
private static instance: BusDataRepository;
private constructor() {}
public static getInstance(): BusDataRepository { ... }
public async initialize(): Promise<void> { ... }
```

### Error message idiom
**Source:** `src/server/api/repositories/BusDataRepository.ts` lines 96-101, 139-143
**Apply to:** All catch blocks in the new repository and its `close()`/`initialize()` methods
```typescript
const message = error instanceof Error ? error.message : "Unknown error";
logger.error(`Failed to ${action}: ${message}`);
throw new Error(`Failed to ${action}: ${message}`);
```

### Guard-before-access
**Source:** `src/server/api/repositories/BusDataRepository.ts` lines 229-233
**Apply to:** Every public CRUD method on the new repository
```typescript
private assertInitialized(): void {
    if (!this.isInitialized) {
        throw new Error("<RepoName> has not been initialized. Call initialize() before accessing data.");
    }
}
```

### Zod env-schema extension
**Source:** `src/server/config/environment.ts` lines 7-16, 27-36
**Apply to:** `DB_PATH` addition
```typescript
// biome-ignore lint/style/useNamingConvention: env vars use SCREAMING_SNAKE_CASE by convention
DB_PATH: z.string().min(1).default("data/dash-tracker.sqlite"),
```

### Winston logging on startup/shutdown
**Source:** `src/server/config/logger.ts` (whole file, 8 lines) + usage in `BusDataRepository.ts` (`logger.info`, `logger.error`) and `app.ts` (`logger.info("Server is running on port...")`, `logger.error("Failed to initialize...")`)
**Apply to:** New repository's `initialize()`/`close()` — log connection open/close and PRAGMA setup at `info` level; log failures at `error` level. Do not log per-write noise (CLAUDE.md: "not per-call noise").

### Barrel re-export convention
**Source:** `src/server/api/repositories/index.ts` (`export * from "./BusDataRepository";`)
**Apply to:** New repository file — add its own `export * from "./<NewRepositoryFile>";` line to the same barrel.

### Test singleton isolation
**Source:** `src/server/api/repositories/BusDataRepository.test.ts` lines 51-62
**Apply to:** New repository's test file — reset `private static instance` via `@ts-expect-error`-annotated assignment in `beforeEach`/`afterEach`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| SQLite schema DDL (`CREATE TABLE ... UNIQUE(device_id, entity_type, entity_id)`, `PRAGMA journal_mode = WAL`, `PRAGMA busy_timeout`) | migration/config | batch | No existing SQL/schema code in the codebase — `BusDataRepository` only builds in-memory `Map`s from a REST API, never touches a database. Implement per D-04/D-05 directly from `better-sqlite3` docs. |
| Concurrent `Promise.all` UPSERT test (D-07) | test | event-driven | No existing test in the codebase exercises concurrent writes; the closest structural analog (`BusDataRepository.test.ts`) only tests sequential fetch/init flows. Follow its `describe`/`it` structure and Arrange-Act-Assert comments, but the concurrency assertions themselves are new. |

## Metadata

**Analog search scope:** `src/server/api/repositories/`, `src/server/config/`, `src/server/api/errors/`, `src/server/app.ts`
**Files scanned:** `BusDataRepository.ts`, `BusDataRepository.test.ts`, `environment.ts`, `logger.ts`, `axios.ts`, `errors/index.ts`, `repositories/index.ts`, `config/index.ts`, `app.ts`
**Pattern extraction date:** 2026-08-31
