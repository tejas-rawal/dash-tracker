# Architecture Research: Favorited & Recent Routes (v0.3)

**Domain:** Adding persistent, device-scoped state to an existing layered Express/TypeScript API
**Researched:** 2026-08-31
**Confidence:** HIGH (grounded directly in this codebase's existing source — `BusDataRepository`, `StopService`/`StopController`, `app.ts`, `environment.ts` — cross-checked against current SQLite-driver guidance for Node 20)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                Routes                                     │
│  busRoutes.ts   predictionRoutes.ts   stopRoutes.ts   favoriteRoutes.ts*  │
│                                                        recentRoutes.ts*   │
│                                          requireDeviceId middleware* ─┐   │
├────────────────────────────────────────────────────────────────────┼────┤
│                              Controllers                             │   │
│  BusRouteController  PredictionController  StopController            │   │
│  PredictionStreamController          FavoriteController*  RecentController* │
│         │                    │            │                  │        │
│         │                    └──calls──►  RecentService* ◄───┘ (view-log side effect) │
├─────────┼────────────────────┼────────────┼──────────────────┼────────┤
│                               Services                                │
│  BusRouteService  PredictionService  StopService  PredictionStreamService │
│         │                    │            │                            │
│         │                    │            │       FavoriteService*  RecentService* │
├─────────┼────────────────────┼────────────┼──────────────────┼────────┤
│                              Repository                               │
│         └────────────────────┴────────────┘         │                │
│              BusDataRepository (singleton,         UserRouteDataRepository* │
│              in-memory, read-only after init)       (singleton, SQLite,     │
│                                                       read-write)            │
├──────────────────────────────────────────────────────────────────────┤
│  DASH public transit API (goswift.ly)         SQLite file (better-sqlite3)* │
└──────────────────────────────────────────────────────────────────────┘
```
`*` = new in v0.3.

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| `requireDeviceId` middleware | Extract/validate `X-Device-Id` header before it reaches any favorites/recents controller | New Express `RequestHandler`, mounted only on the two new routers |
| `FavoriteController` | Parse favorite add/remove/list requests, translate errors to HTTP status, format response | Mirrors `StopController` shape (per-controller `resolveErrorStatus`/`resolveErrorBody`) |
| `RecentController` | Handle `GET /recents` listing | Same shape, read-only |
| `FavoriteService` | Business rules for favoriting: validate route exists (via `BusDataRepository`), enforce ordering (most-recently-favorited-first), no cap | Factory function taking `UserRouteDataRepository` + `BusDataRepository` |
| `RecentService` | `logView(deviceId, routeId)` side-effect API + `listRecents(deviceId)` with full route detail hydration, enforces 5-item cap | Factory function taking `UserRouteDataRepository` + `BusDataRepository`; called from other controllers as a fire-and-forget side effect |
| `UserRouteDataRepository` | Singleton owning the one SQLite connection; stores/retrieves raw `(deviceId, routeId, timestamp)` rows for both favorites and recents; no business logic | Mirrors `BusDataRepository`'s singleton/`getInstance()`/`initialize()` shape, but backed by `better-sqlite3` instead of an in-memory `Map` |

## Recommended Project Structure

```
src/server/
├── api/
│   ├── middleware/                 # NEW — first middleware folder in the app
│   │   └── deviceId.ts             # requireDeviceId RequestHandler + Express.Request augmentation
│   ├── repositories/
│   │   ├── BusDataRepository.ts    # unchanged
│   │   ├── UserRouteDataRepository.ts   # NEW — SQLite-backed, favorites + recents
│   │   └── index.ts                # add UserRouteDataRepository export
│   ├── services/
│   │   ├── FavoriteService.ts      # NEW
│   │   ├── RecentService.ts        # NEW
│   │   └── ... (existing services unchanged)
│   ├── controllers/
│   │   ├── FavoriteController.ts   # NEW
│   │   ├── RecentController.ts     # NEW
│   │   └── PredictionController.ts / StopController.ts  # MODIFIED — take RecentService as 2nd DI param
│   ├── routes/
│   │   ├── favoriteRoutes.ts       # NEW — mounts requireDeviceId
│   │   ├── recentRoutes.ts         # NEW — mounts requireDeviceId
│   │   └── index.ts                # MODIFIED — wire the two new routers
│   ├── models/
│   │   └── UserRouteData.ts        # NEW — Favorite/RecentRoute domain types + FavoriteRepository row type
│   └── errors/
│       └── index.ts                # unchanged (NotFoundError, UpstreamApiError already sufficient)
├── config/
│   ├── environment.ts              # MODIFIED — add SQLITE_DB_PATH (optional, defaulted)
│   ├── sqlite.ts                   # NEW — better-sqlite3 Database factory + schema DDL, mirrors config/axios.ts's role
│   └── index.ts                    # MODIFIED — re-export sqlite config
└── app.ts                          # MODIFIED — parallel init of both repositories, close SQLite on shutdown
```

### Structure Rationale

- **`api/middleware/` is new** because nothing today sits between `express.json()` and the routers. Device-ID extraction is genuinely cross-cutting (every favorites/recents endpoint needs it) so it belongs as Express middleware, not duplicated per-controller parsing like `parseCoordinateParam`.
- **One repository, not two.** `BusDataRepository` already establishes the project's repository granularity: one repository per *data source*, exposing methods for multiple *entity types* within it (routes AND stops share one repository because they come from one DASH API call and one in-memory dataset). Favorites and recents are the same shape of situation — two entity types, one data source (one SQLite file, one connection, one schema). A single `UserRouteDataRepository` avoids two independent connection/lifecycle objects for what is really one physical database, and keeps the "repository = data source boundary" rule intact for the roadmap to reason about later (e.g., swapping to Postgres touches exactly one file).
- **Two services and two controllers, not one.** The project has *already made this exact call* for a related situation: "Stop discovery lives in a new `StopController`/`StopService` pair, not folded into `BusRouteController`/`BusRouteService`... Stop discovery is a distinct concern from route CRUD even though one URL nests under `/routes`" (Key Decision, Phase 3, shipped). Favoriting (explicit user action, CRUD-shaped) and recents (passive auto-logging, read-mostly) are equally distinct concerns that happen to share a repository — exactly like `StopService` and `BusRouteService` already share `BusDataRepository`. Splitting them keeps each service's public interface small and each controller's error-mapping table simple, and avoids one god-service mixing "add/remove a favorite" with "trim recents to 5 and log a view."
- **`config/sqlite.ts` is new**, parallel to `config/axios.ts`: `axios.ts` owns the one shared Axios client; `sqlite.ts` should own the one shared `better-sqlite3` `Database` instance + schema bootstrap, imported by `UserRouteDataRepository` the same way `BusDataRepository` imports `axios` from `../../config`.

## Architectural Patterns

### Pattern 1: Single shared repository, split service/controller pairs

**What:** One `UserRouteDataRepository` singleton owns the SQLite connection and exposes narrow, storage-shaped methods (`addFavorite`, `removeFavorite`, `listFavoritesByDevice`, `upsertRecentView`, `listRecentsByDevice`). `FavoriteService` and `RecentService` are each constructed via `createFavoriteService(userRouteDataRepository, busDataRepository)` / `createRecentService(userRouteDataRepository, busDataRepository)` — both take the *same* repository instance as a DI param, exactly like `createStopService(repository)` and `createPredictionService(repository)` both currently take the same `BusDataRepository` instance.

**When to use:** When two features share one physical data source but have independent business rules and independent public contracts.

**Trade-offs:** Slightly more files than a single `UserRouteService`, but matches the project's established Phase-3 precedent and keeps `RecentService`'s "hydrate full route + return only last 5" logic from leaking into `FavoriteService`'s "no cap, most-recent-first" logic.

**Example:**
```typescript
// api/repositories/UserRouteDataRepository.ts
export class UserRouteDataRepository {
    private db: Database.Database;
    private static instance: UserRouteDataRepository;
    private constructor(db: Database.Database) { this.db = db; }

    public static getInstance(): UserRouteDataRepository {
        if (!UserRouteDataRepository.instance) {
            UserRouteDataRepository.instance = new UserRouteDataRepository(createSqliteConnection());
        }
        return UserRouteDataRepository.instance;
    }

    public async initialize(): Promise<void> {
        this.db.exec(SCHEMA_DDL); // idempotent CREATE TABLE IF NOT EXISTS
    }

    public addFavorite(deviceId: string, routeId: string): void { /* INSERT OR IGNORE ... */ }
    public removeFavorite(deviceId: string, routeId: string): void { /* DELETE ... */ }
    public listFavoritesByDevice(deviceId: string): FavoriteRow[] { /* SELECT ... ORDER BY created_at DESC */ }
    public upsertRecentView(deviceId: string, routeId: string): void { /* INSERT ... ON CONFLICT DO UPDATE, then trim to 5 */ }
    public listRecentsByDevice(deviceId: string): RecentRow[] { /* SELECT ... ORDER BY viewed_at DESC LIMIT 5 */ }

    public close(): void { this.db.close(); }
}
```

### Pattern 2: Device-ID middleware with Express.Request augmentation

**What:** A single `requireDeviceId` middleware reads `X-Device-Id`, validates it (non-empty after trim, bounded length, e.g. ≤128 chars to block abuse), and either calls `next()` after attaching `req.deviceId` or responds `400` directly. Mounted only on the two new routers — not globally — since existing endpoints have no device concept.

**When to use:** Any cross-cutting request precondition needed by more than one controller.

**Trade-offs:** Requires a small `declare global { namespace Express { interface Request { deviceId: string } } }` augmentation (new pattern for this codebase, but standard Express/TS practice) so controllers can read `req.deviceId` with full typing instead of re-parsing the header. Because it's request-*shape* validation (like the existing inline `stop parameter is required` checks), it responds `400` directly rather than going through `NotFoundError`/`UpstreamApiError`, preserving the existing convention that those two error classes represent *domain* errors thrown by services, not malformed-request errors caught at the edge.

**Example:**
```typescript
// api/middleware/deviceId.ts
export const requireDeviceId: RequestHandler = (req, res, next) => {
    const raw = req.header("X-Device-Id");
    const deviceId = raw?.trim();
    if (!deviceId || deviceId.length > 128) {
        res.status(400).json({ error: "Bad Request", details: "X-Device-Id header is required" });
        return;
    }
    req.deviceId = deviceId;
    next();
};
```
```typescript
// api/routes/index.ts
router.use("/favorites", requireDeviceId, favoriteRoutes);
router.use("/recents", requireDeviceId, recentRoutes);
```

### Pattern 3: Recent-view logging as a controller-orchestrated side effect, not a service-to-service call

**What:** `PredictionController` and `StopController` (route-scoped lookup) each take an *additional* DI parameter, `RecentService`, alongside their existing service. After the primary service call succeeds and the response is sent, the controller fires `recentService.logView(req.deviceId, routeId)` without awaiting it into the response path, and logs (does not throw) on failure.

**When to use:** Whenever a cross-domain side effect (persistence) needs data (`X-Device-Id`) that only the controller has access to, and must never fail or delay the primary response.

**Trade-offs — and why this is a controller job, not a service job:**
- **Services don't have `Request`/`Response`.** `PredictionService`/`StopService` are pure functions of typed arguments; `deviceId` only exists as an HTTP header, extracted by middleware into `req`. Pushing it into `PredictionService.getPredictionsForStop(stopId, options)` would mean threading an unrelated, optional concern (device identity) through DASH-proxy business logic that has nothing to do with persistence — a layering violation in spirit even though not in the literal routes→controllers→services→repository chain.
- **No existing precedent for service-to-service calls.** Every current service takes exactly one repository as its DI dependency (`createPredictionService(repository)`, `createStopService(repository)`). Introducing `PredictionService` → `RecentService` calls would be a new, unprecedented dependency direction; controller → multiple services is not (a controller depending on more than one service is a normal DI composition, not a new pattern).
- **Failure isolation.** "Log a recent view" must never turn a working predictions/stop response into a 500 or add SQLite write latency to the DASH-proxy hot path. Keeping it in the controller, sent *after* `res.json(result)`, makes this explicit and easy to test in isolation (assert `res.json` was called before asserting `recentService.logView` was called).
- **`Core Value` alignment.** "Riders can always see accurate, near-real-time arrival predictions for their stop" is the product's stated Core Value — recents logging is a nice-to-have layered on top, and must not become a dependency of the critical path.

**Example:**
```typescript
// api/controllers/PredictionController.ts
export function createPredictionController(service: PredictionService, recentService: RecentService): PredictionController {
    const getPredictions: RequestHandler = async (req, res) => {
        // ...existing param parsing...
        try {
            const result = await service.getPredictionsForStop(stop, { number, route });
            res.json(result);
            // Fire-and-forget: never let recents logging affect the predictions response.
            const routeIds = route ? [route] : [...new Set(result.data.routes.map((r) => r.routeId))];
            for (const routeId of routeIds) {
                recentService.logView(req.deviceId, routeId).catch((err: unknown) => {
                    logger.warn(`Failed to log recent view for device ${req.deviceId}: ${String(err)}`);
                });
            }
        } catch (error: unknown) {
            res.status(resolveErrorStatus(error)).json(resolveErrorBody(error));
        }
    };
    return { getPredictions };
}
```

**Open question for phase planning (flagged, not resolved here):** when a predictions request has no `route` filter, a single stop can serve multiple routes (`StopPredictionsResponse.data.routes[]` is an array of `RoutePrediction`, each with its own `routeId`). The recommendation above logs a recent view for *every distinct route present in the response*. An alternative is to log only when the client passes an explicit `route` filter, and treat unfiltered stop lookups as "viewed the stop" rather than "viewed N routes." This is a product decision, not an architecture one — surface it during phase discussion.

## Data Flow

### Request Flow — add a favorite

```
POST /api/v1/favorites  { routeId }   Header: X-Device-Id
    ↓
requireDeviceId middleware → 400 if missing/invalid, else req.deviceId set
    ↓
FavoriteController.addFavorite → parses body, calls service
    ↓
FavoriteService.addFavorite(deviceId, routeId)
    → busDataRepository.getRouteById(routeId) — throws NotFoundError if route doesn't exist
    → userRouteDataRepository.addFavorite(deviceId, routeId)
    ↓
201 { routeId, favoritedAt }
```

### Request Flow — list favorites (with full route detail)

```
GET /api/v1/favorites   Header: X-Device-Id
    ↓
requireDeviceId → FavoriteController.listFavorites → FavoriteService.listFavorites(deviceId)
    → userRouteDataRepository.listFavoritesByDevice(deviceId)   [rows: routeId, created_at, DESC]
    → for each row: busDataRepository.getRouteById(routeId)      [hydrate full BusRoute]
    ↓
200 { data: BusRoute[] }  (already most-recently-favorited-first from the SQL ORDER BY)
```

### Request Flow — passive recent-view logging (piggybacked on predictions)

```
GET /api/v1/predictions?stop=123   Header: X-Device-Id
    ↓
requireDeviceId → PredictionController.getPredictions
    → PredictionService.getPredictionsForStop(...) → DASH API → response built
    → res.json(result)                              [response sent to rider — never blocked]
    → recentService.logView(deviceId, routeId) × N   [fire-and-forget, errors logged not thrown]
        → userRouteDataRepository.upsertRecentView(deviceId, routeId)
          [INSERT...ON CONFLICT bumps viewed_at; then DELETE trims to most-recent 5]
```

### Startup / Shutdown Flow

```
app.ts
    ↓
const busDataRepository = BusDataRepository.getInstance()
const userRouteDataRepository = UserRouteDataRepository.getInstance()
    ↓
Promise.all([busDataRepository.initialize(), userRouteDataRepository.initialize()])
    │  (independent data sources — DASH API fetch and SQLite open+schema — no ordering dependency,
    │   run concurrently instead of serially)
    ↓ .then
app.listen(port)
    ↓
shutdown() on SIGTERM/SIGINT:
    server.close(() => {
        userRouteDataRepository.close();   // NEW — better-sqlite3 db.close() flushes WAL, prevents corruption
        process.exit(0);
    })
    ↓ .catch (either init fails)
logger.error(...); process.exit(1)
```

### Key Data Flows

1. **Favorite CRUD:** client → middleware → `FavoriteController` → `FavoriteService` (validates route exists via `BusDataRepository`, enforces business rules) → `UserRouteDataRepository` (pure storage) → SQLite file.
2. **Recent auto-logging:** piggybacks on the *existing* prediction/stop-lookup request; the primary response is built and sent exactly as it is today, and the SQLite write happens as a decoupled, best-effort side effect afterward — this is the only flow that crosses from one vertical (predictions/stops) into another (recents), and it does so at the controller layer specifically to keep `PredictionService`/`StopService` untouched in their core responsibility.
3. **Recent listing (read path):** identical shape to favorite listing — `RecentService.listRecents(deviceId)` reads the (already-capped-at-5) rows from `UserRouteDataRepository`, hydrates each with `busDataRepository.getRouteById()`, returns full `BusRoute[]`.

## SQLite Driver & Schema

**Recommendation: `better-sqlite3` (+ `@types/better-sqlite3` dev dependency), not `node:sqlite` or `bun:sqlite`.** Confidence: HIGH.

- This project's runtime is Node 20 (`.node-version` = `20`, `tsconfig.json` targets `ES2020`/`CommonJS`, dev/start scripts run through `ts-node`, a Node-targeting tool — not through Bun's own JS engine). `node:sqlite` only reached Release Candidate stability in Node 22.5+; it is unavailable/unstable on Node 20, so it's not a safe choice for this project's stated Node version.
- `bun:sqlite` is Bun-runtime-specific and would only work if the server were executed by Bun's own JS engine rather than `node`/`ts-node`. Since `bun` is used here strictly as the package manager and script runner (invoking `ts-node`/`tsc`-built output on Node), depending on `bun:sqlite` would silently break `start-server`/`dev-server`/the compiled `dist` output whenever they run under plain Node — not a safe bet.
- `better-sqlite3` is the established, actively-maintained choice for exactly this situation (Node ≤21, synchronous API), ships prebuilt binaries via `prebuild-install` (no compiler toolchain needed on typical install), and its synchronous API matches this codebase's existing style — `BusDataRepository`'s post-`initialize()` getters are all synchronous; a synchronous SQLite driver keeps `UserRouteDataRepository`'s read methods synchronous too, avoiding unnecessary `await` noise in services that don't otherwise need it.

**Schema (idempotent DDL, no migration framework needed for v1):**
```sql
CREATE TABLE IF NOT EXISTS favorites (
    device_id  TEXT NOT NULL,
    route_id   TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (device_id, route_id)
);
CREATE INDEX IF NOT EXISTS idx_favorites_device_created ON favorites(device_id, created_at DESC);

CREATE TABLE IF NOT EXISTS recents (
    device_id  TEXT NOT NULL,
    route_id   TEXT NOT NULL,
    viewed_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (device_id, route_id)
);
CREATE INDEX IF NOT EXISTS idx_recents_device_viewed ON recents(device_id, viewed_at DESC);
```
- `route_id` is **not** a SQLite foreign key — the referenced `BusRoute` lives in `BusDataRepository`'s in-memory map, a different data source entirely. Existence is validated at the *service* layer (`busDataRepository.getRouteById(routeId)` before any write), consistent with how `PredictionService`/`StopService` already validate against `BusDataRepository` and throw `NotFoundError`.
- `PRIMARY KEY (device_id, route_id)` on `recents` makes re-viewing a route an `UPSERT` (bumps `viewed_at`) instead of a duplicate row — needed for a clean "trim to last 5 *distinct* routes" query: `DELETE FROM recents WHERE device_id = ? AND route_id NOT IN (SELECT route_id FROM recents WHERE device_id = ? ORDER BY viewed_at DESC LIMIT 5)`.
- No migration framework (Knex/Drizzle/umzug) is warranted for v1: this is the *first* schema, there's no prior version to migrate from, and `CREATE TABLE IF NOT EXISTS` run at every startup is fully sufficient and idempotent. Introducing a migration tool now would be exactly the kind of "speculative abstraction ahead of actual need" the project's engineering principles warn against — revisit only when a second schema revision is actually needed.

**Config additions (`config/environment.ts`, following the existing `PORT` pattern):**
```typescript
// biome-ignore lint/style/useNamingConvention: env vars use SCREAMING_SNAKE_CASE by convention
SQLITE_DB_PATH: z.string().min(1).default("./data/dash-tracker.db"),
```
Add `data/` (or the chosen path) to `.gitignore` alongside the existing `dotenv`/`coverage`/`dist` entries — the SQLite file is generated state, not source.

## Anti-Patterns

### Anti-Pattern 1: Two repositories for one physical database

**What people do:** Create `FavoriteRepository` and `RecentRepository` as separate singletons, each opening its own `better-sqlite3` connection to the same file.
**Why it's wrong:** Two connections to one SQLite file (especially in WAL mode) is unnecessary overhead and duplicated lifecycle code (two `initialize()`s, two `close()`s to wire into `app.ts`'s shutdown), and breaks the "one repository = one data source" boundary `BusDataRepository` already establishes.
**Do this instead:** One `UserRouteDataRepository` owning the connection, exposing separate method groups for favorites vs. recents — mirrors how `BusDataRepository` exposes separate method groups for routes vs. stops from one dataset.

### Anti-Pattern 2: Threading `deviceId` through `PredictionService`/`StopService`

**What people do:** Add a `deviceId` parameter to `getPredictionsForStop`/`getStopsForRoute` so the service itself can call into `RecentService` and log the view "in one place."
**Why it's wrong:** Couples DASH-proxy business logic to an unrelated persistence concern, forces every existing caller/test of those services to pass a value they don't otherwise need, and — worse — makes the prediction/stop response's success implicitly dependent on a SQLite write succeeding unless very carefully isolated inside the service (easy to get wrong; a thrown error inside `getPredictionsForStop` after the DASH call succeeds would incorrectly surface as a 500/502 to the rider).
**Do this instead:** Keep `deviceId` at the edge (middleware → `req.deviceId` → controller). Controllers already sit at the layer that has both the request context and the freedom to orchestrate a best-effort side effect after the primary response is sent.

### Anti-Pattern 3: Blocking the response on the recents write

**What people do:** `await recentService.logView(...)` before `res.json(result)`, so a slow or failing SQLite write adds latency to — or breaks — the predictions/stop response.
**Why it's wrong:** Violates the product's stated Core Value (always-available, accurate predictions) for the sake of a secondary feature (recents).
**Do this instead:** Send the response first, then fire the log call as a detached promise with its own `.catch(logger.warn)`.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| DASH API (existing) | Unchanged — `BusDataRepository` remains the sole consumer | No change from this milestone |
| SQLite file (new) | Local file, opened once at startup via `better-sqlite3`, owned by `UserRouteDataRepository`/`config/sqlite.ts` | Zero external ops burden (no server process); path via `SQLITE_DB_PATH` env var, defaulted |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `FavoriteController`/`RecentController` ↔ `requireDeviceId` middleware | Express middleware chain, `req.deviceId` | New Express `Request` augmentation required |
| `FavoriteService`/`RecentService` ↔ `BusDataRepository` | Direct DI (existing repository, read-only) | Used to validate route existence and to hydrate full `BusRoute` objects for list responses — no changes to `BusDataRepository` itself |
| `FavoriteService`/`RecentService` ↔ `UserRouteDataRepository` | Direct DI (new repository) | Repository stays "dumb" — pure storage, no cross-repository joins |
| `PredictionController`/`StopController` ↔ `RecentService` | New controller-level DI, fire-and-forget call after response is sent | The only place this milestone touches existing v0.2 code paths |

## Suggested Build Order

Dependencies flow bottom-up (schema before repository before service before controller before routes), and the device-ID middleware must exist before any endpoint that needs it:

1. **Config + schema plumbing:** `SQLITE_DB_PATH` in `environment.ts`, `config/sqlite.ts` (connection factory + DDL constant), `.gitignore` entry for the DB file. No behavior yet — just makes a connection obtainable and testable in isolation.
2. **`UserRouteDataRepository`:** singleton, `initialize()`/`close()`, favorites CRUD methods, recents upsert+trim+list methods. Unit-testable against a real in-memory `:memory:` SQLite DB (fast, no mocking needed — `better-sqlite3` supports `:memory:` natively, a good fit for this project's existing preference for real behavior over over-mocking).
3. **`app.ts` wiring:** `Promise.all([...])` init, `close()` on shutdown. Verify server still boots with both stores initialized before building anything on top.
4. **`requireDeviceId` middleware:** independent of the above, can be built/tested in parallel with steps 1–3. Needed before any new route is reachable.
5. **`FavoriteService` + `FavoriteController` + `favoriteRoutes.ts`:** the simpler, fully self-contained vertical (no cross-cutting into existing controllers). Ship and verify end-to-end (add/remove/list) before touching recents.
6. **`RecentService` (read path only) + `RecentController` + `recentRoutes.ts`:** `listRecents(deviceId)` against whatever rows exist — buildable/testable independent of the auto-logging hook.
7. **Auto-logging hook:** modify `PredictionController` (and `StopController.getStopsForRoute`) to take `RecentService` as an added DI param and fire `logView` after the response is sent. Last step because it's the only change to existing, already-shipped v0.2 code, and depends on `RecentService` existing first (step 6). Resolve the "single route vs. all routes in an unfiltered predictions response" question (see Pattern 3) before this step.

This order lets favorites ship as a fully working, independently-verifiable vertical slice before recents' auto-logging touches any existing controller — minimizing risk to the v0.2 prediction/stop code paths this milestone must not regress.

## Sources

- Primary source (HIGH confidence): this repository's existing code — `src/server/app.ts`, `src/server/api/repositories/BusDataRepository.ts`, `src/server/api/controllers/StopController.ts`, `src/server/api/controllers/PredictionController.ts`, `src/server/api/controllers/PredictionStreamController.ts`, `src/server/api/services/StopService.ts`, `src/server/config/environment.ts`, `src/server/api/models/Prediction.ts`, `.node-version`, `tsconfig.json`, `package.json`, `.planning/PROJECT.md` (Key Decisions table, v0.3 requirements)
- [better-sqlite3 (GitHub)](https://github.com/WiseLibs/better-sqlite3) — synchronous API, transaction support, production-hardened
- [@types/better-sqlite3 (npm)](https://www.npmjs.com/package/@types/better-sqlite3) — type definitions still required (better-sqlite3 does not ship its own `.d.ts`)
- [Node.js Built-in SQLite (node:sqlite): 2026 Production Guide](https://www.hirenodejs.com/blog/nodejs-builtin-sqlite-node-sqlite-2026) — confirms `node:sqlite` reached RC/Stability 1.2 only in Node 22.5+, not available on Node 20
- [SQLite Driver Benchmark: better-sqlite3, node:sqlite, libSQL, Turso](https://sqg.dev/blog/sqlite-driver-benchmark/) — confirms API/design similarity and relative maturity between `better-sqlite3` and `node:sqlite`

---
*Architecture research for: dash-tracker v0.3 — Favorited & Recent Routes*
*Researched: 2026-08-31*
