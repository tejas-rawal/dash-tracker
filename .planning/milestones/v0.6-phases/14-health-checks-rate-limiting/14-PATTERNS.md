# Phase 14: Health Checks & Rate Limiting - Pattern Map

**Mapped:** 2026-10-06
**Files analyzed:** 20 (10 new, 10 modified)
**Analogs found:** 19 / 20

> **Precedence note:** CONTEXT.md D-06/D-07/D-08/D-19 were revised at plan-phase and override RESEARCH.md:
> - `STALE_AFTER_MS = 3 * REFRESH_INTERVAL_MS + 5 * 60_000` (3h5m), not bare `3 * REFRESH_INTERVAL_MS`. RESEARCH Pattern 3's comment ("expires a few seconds before the third attempt") and its E2E boundary values (`T0 + 3h` / `T0 + 3h + 1`) are **obsolete**. The boundary is now `T0 + 3h5m` (ready, `dataAgeSeconds` 11100) vs `T0 + 3h5m + 1ms` (stale).
> - `BusDataRefreshService.ts` gets **one edit only**: `export` on `REFRESH_INTERVAL_MS`.
> - Both probes set `Cache-Control: no-store`. The readiness 503 sends **no** `Retry-After`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/server/api/middleware/upstreamRateLimit.ts` (new) | middleware | request-response (gate) | `src/server/api/middleware/requireDeviceId.ts` | role-match (library-configured, not hand-written) |
| `src/server/api/middleware/upstreamRateLimit.test.ts` (new) | test | request-response | `src/server/api/routes/dataNotReady.test.ts` (supertest) + `requireDeviceId.test.ts` (structure) | role-match |
| `src/server/api/services/HealthService.ts` (new) | service | transform (snapshot to report) | `src/server/api/services/VehicleService.ts` (factory + `BusDataRepository` DI) | role-match |
| `src/server/api/services/HealthService.test.ts` (new) | test | transform | `src/server/api/services/VehicleService.test.ts` (mock repo) + `BusDataRepository.test.ts:488-496` (fake Date) | exact |
| `src/server/api/models/Health.ts` (new, optional; see note) | model | n/a | `src/server/api/models/Vehicle.ts` (response types live in models) | exact |
| `src/server/api/controllers/HealthController.ts` (new) | controller | request-response | `src/server/api/controllers/VehicleController.ts` | exact |
| `src/server/api/controllers/HealthController.test.ts` (new) | test | request-response | `src/server/api/controllers/VehicleController.test.ts` | exact |
| `src/server/api/routes/healthRoutes.ts` (new) | route | request-response | `src/server/api/routes/vehicleRoutes.ts` | exact |
| `src/server/api/routes/healthRoutes.test.ts` (new) | test (E2E) | request-response | `src/server/api/routes/dataNotReady.test.ts`, `dataBootRetry.test.ts` | exact |
| `src/server/api/routes/rateLimit.test.ts` (new) | test (E2E) | request-response | `src/server/api/routes/dataNotReady.test.ts` (`it.each` row table) | exact |
| `src/server/api/routes/index.ts` (mod) | route | n/a | itself (lines 1-18) | exact |
| `src/server/api/routes/predictionRoutes.ts` (mod) | route | request-response | itself (lines 19-21) | exact |
| `src/server/api/routes/vehicleRoutes.ts` (mod) | route | request-response | itself (line 11) | exact |
| `src/server/api/services/BusDataRefreshService.ts` (mod: export only) | service | n/a | itself (line 6) | exact |
| `src/server/config/environment.ts` (mod) | config | n/a | itself (lines 14-22, 40-42) | exact |
| `src/server/config/environment.test.ts` (mod) | test | n/a | itself (lines 6-54, `DASH_API_TIMEOUT_MS` block) | exact |
| `src/server/app.ts` (mod) | config / entry | n/a | itself (lines 12-23) | exact |
| `src/server/test/app.ts` (mod) | test helper | n/a | itself (lines 4-11) | exact |
| `.env.example` (mod) | config / docs | n/a | itself (lines 1-5) | exact |
| `package.json` + `bun.lock` (mod) | config | n/a | none (dependency install) | no analog; use RESEARCH install command |

---

## Pattern Assignments

### `src/server/api/middleware/upstreamRateLimit.ts` (middleware, request-response gate)

**Analog:** `src/server/api/middleware/requireDeviceId.ts` (the only existing middleware; a per-route `RequestHandler` that ends the response with `{ error, details }` and doesn't call `next()`)

**Full analog** (lines 1-11):
```typescript
import type { NextFunction, Request, RequestHandler, Response } from "express";

export const requireDeviceId: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    const deviceId = req.headers["x-device-id"];
    const value = Array.isArray(deviceId) ? deviceId[0] : deviceId;
    if (value === undefined || value.trim().length === 0) {
        res.status(400).json({ error: "Bad Request", details: "X-Device-Id header is required" });
        return;
    }
    next();
};
```
Copy: `import type { ... } from "express"`, a named export, and a rejection body of `res.status(...).json({ error: "<HTTP reason>", details: "<message>" })` with no further logic after the response.

**Named-constant + "why" comment pattern** (`src/server/api/controllers/errorResponse.ts` lines 5-8):
```typescript
// A short fixed hint: the first route/stop load normally lands within seconds of DASH answering, and the
// value is deliberately not tied to the loader's backoff (D-03).
const RETRY_AFTER_SECONDS = 5;
const UNEXPECTED_ERROR_DETAILS = "An unexpected error occurred";
```
→ `UPSTREAM_RATE_LIMIT = 60` and `UPSTREAM_RATE_WINDOW_MS = 60_000` as module constants. SCREAMING_SNAKE module constants already pass Biome `style: all`, with no ignore comment needed.

**Logger import + message-only logging** (`errorResponse.ts` lines 2, 29-30):
```typescript
import { logger } from "../../config";
...
    const description = error instanceof Error ? (error.stack ?? error.message) : String(error);
    logger.error(`Unexpected error while handling a request: ${description}`);
```
→ The library `logger` adapter uses `error instanceof Error ? error.message : String(error)` (never the object). The warn line uses `${req.baseUrl}${req.path}` and **never** `originalUrl`/`url` (that would leak rider lat/lng; the comment at `errorResponse.ts:27-28` is the precedent for saying why).

**Core body:** No in-repo analog for the `rateLimit({...})` call. Use RESEARCH.md Pattern 1 verbatim (`createUpstreamRateLimiter()` factory with `windowMs`, `limit`, `standardHeaders: "draft-8"`, `legacyHeaders: false`, Winston `logger` adapter, a custom `handler` that warns on `(req as AugmentedRequest).rateLimit.used === UPSTREAM_RATE_LIMIT + 1`, then the module-level `export const upstreamRateLimiter = createUpstreamRateLimiter();`). Do **not** use `req.rateLimit.current`, which is untyped in v8. The handler must **not** set `Retry-After` itself; the library sets it before calling `handler`.

**Factory naming:** `createX` + exported interface/return type, following `createVehicleService` (`VehicleService.ts:16`). Here the return type is the library's `RateLimitRequestHandler`, so no custom interface is needed.

---

### `src/server/api/services/HealthService.ts` (service, transform)

**Analog:** `src/server/api/services/VehicleService.ts`

**Imports pattern** (lines 1-10). Type-only repository import from the barrel, never the singleton:
```typescript
import { axios, environment, logger } from "../../config";
import { NotFoundError, UpstreamApiError } from "../errors";
import type { ... VehiclePositionsResponse } from "../models/Vehicle";
import type { BusDataRepository } from "../repositories";
```
→ HealthService needs only `import type { BusDataRepository } from "../repositories";`, `import { REFRESH_INTERVAL_MS } from "./BusDataRefreshService";`, and (if the type goes in models) `import type { ReadinessReport } from "../models/Health";`. No `config` import: no logging, no axios.

**Interface + factory pattern** (lines 12-16, 91):
```typescript
export interface VehicleService {
    getVehiclePositions(options?: VehicleOptions): Promise<VehiclePositionsResponse>;
}

export function createVehicleService(repository: BusDataRepository): VehicleService {
    ...
    return { getVehiclePositions };
}
```
→ `export interface HealthService { getReadiness(): ReadinessReport; }` and `export function createHealthService(repository: BusDataRepository): HealthService`. The method is synchronous, since there's no I/O.

**ISO timestamp convention** (line 63, line 83): `new Date(...).toISOString()` / `generatedAt: new Date().toISOString()`. Readiness uses `lastLoadedAt.toISOString()` and `lastFailedAt?.toISOString() ?? null`.

**Input source.** The repository snapshot (`src/server/api/repositories/BusDataRepository.ts` lines 52-56, 102-109):
```typescript
export interface BusDataLoadState {
    lastLoadedAt?: Date;
    lastFailedAt?: Date;
    lastError?: string;
}
...
    /** Phase 14 readiness serializes this snapshot; "ready" means lastLoadedAt is defined. */
    public getLoadState(): BusDataLoadState {
        return {
            lastLoadedAt: this.lastLoadedAt === undefined ? undefined : new Date(this.lastLoadedAt.getTime()),
            lastFailedAt: this.lastFailedAt === undefined ? undefined : new Date(this.lastFailedAt.getTime()),
            lastError: this.lastError,
        };
    }
```
Destructure only `{ lastLoadedAt, lastFailedAt }`. Never read `lastError` (D-04).

**Constant derivation** (revised D-06/D-07). Comment style follows `BusDataRefreshService.ts:4-6` (trailing or preceding "why" comment, decision ID in parentheses):
```typescript
const REFRESH_INTERVAL_MS = 60 * 60_000; // hourly once loaded: DASH route/stop data changes rarely (D-09)
```
→ `const STALE_AFTER_MS = 3 * REFRESH_INTERVAL_MS + 5 * 60_000;` with a preceding comment. Refreshes are chained an interval after the previous attempt *settles*, so the 5-minute grace makes "unready only after three consecutive failed refreshes" literally true (D-06). Core logic: RESEARCH Pattern 3 body (never_loaded / stale with strict `>` / ready; `Math.max(0, ...)` clamp; `Math.floor(ageMs / 1000)`), replacing the constant and its comment.

---

### `src/server/api/models/Health.ts` (model, optional)

**Analog:** `src/server/api/models/Vehicle.ts`. Service response types (`VehiclePositionsResponse`, line 40) live in `models/`, and services import them with `import type`. Barrel: add `export * from "./Health";` to `src/server/api/models/index.ts` (alphabetical; current lines 1-9 run `BusRoute` ... `Vehicle`, so `Health` goes after `BusStop`).

Planner discretion: RESEARCH puts `ReadinessReport` inside `HealthService.ts`. `NearbyPredictionService.ts` (interface at line 70) shows service-local types are also accepted. Either works. The models file matches the `Vehicle.ts` precedent more closely.

---

### `src/server/api/controllers/HealthController.ts` (controller, request-response)

**Analog:** `src/server/api/controllers/VehicleController.ts` (lines 1-22)
```typescript
import type { Request, RequestHandler, Response } from "express";
import type { VehicleService } from "../services/VehicleService";
import { sendErrorResponse } from "./errorResponse";

export interface VehicleController {
    getVehiclePositions: RequestHandler;
}

export function createVehicleController(service: VehicleService): VehicleController {
    const getVehiclePositions: RequestHandler = async (req: Request, res: Response) => {
        const { route } = req.query as Record<string, string | undefined>;

        try {
            const result = await service.getVehiclePositions({ route });
            res.json(result);
        } catch (error: unknown) {
            sendErrorResponse(res, error);
        }
    };

    return { getVehiclePositions };
}
```
Copy: the type-only express imports, `export interface HealthController { getLiveness: RequestHandler; getReadiness: RequestHandler; }`, `createHealthController(service: HealthService): HealthController`, `const x: RequestHandler = (...) => {...}`, and `return { getLiveness, getReadiness };`.

Differences from the analog:
- Handlers are **synchronous** (no `async`): the service does no I/O.
- **Do not** import or call `sendErrorResponse`, and do not throw `DataNotReadyError`. Doing so would produce `{ error, details }` + `Retry-After: 5` instead of the D-03 body (and D-19 forbids Retry-After on readiness). Unparameterized `_req` follows `app.ts:18` (`(_req, res) =>`).
- Header-setting precedent: `errorResponse.ts:16`, `res.set("Retry-After", String(RETRY_AFTER_SECONDS));` → `res.set("Cache-Control", "no-store");` on **both** handlers, before `res.status(...)`.
- Liveness: `res.status(200).json({ status: "ok" })`. It doesn't touch `service`.
- Readiness: `const report = service.getReadiness(); res.status(report.status === "ready" ? 200 : 503).json(report);`

---

### `src/server/api/routes/healthRoutes.ts` (route)

**Analog:** `src/server/api/routes/vehicleRoutes.ts` (lines 1-13)
```typescript
import { Router } from "express";
import { createVehicleController } from "../controllers/VehicleController";
import { BusDataRepository } from "../repositories";
import { createVehicleService } from "../services/VehicleService";

const service = createVehicleService(BusDataRepository.getInstance());
const controller = createVehicleController(service);

const router = Router();

router.get("/", controller.getVehiclePositions);

export default router;
```
→ Same shape. The route module is the composition root (the only place `getInstance()` is called): `createHealthService(BusDataRepository.getInstance())` → `createHealthController(service)`, then `router.get("/live", controller.getLiveness); router.get("/ready", controller.getReadiness);`. Default export. No limiter (D-16).

---

### `src/server/api/routes/index.ts` (modify)

**Current** (lines 1-18): imports are alphabetical by module, and `router.use` lines are in registration order.
```typescript
import busRoutes from "./busRoutes";
import favoriteRoutes from "./favoriteRoutes";
import predictionRoutes from "./predictionRoutes";
...
router.use("/vehicles", vehicleRoutes);
```
→ Add `import healthRoutes from "./healthRoutes";` between `favoriteRoutes` and `predictionRoutes` (Biome `organizeImports` sorts), and `router.use("/health", healthRoutes);` (after line 16 is fine). No `router.use(limiter)` here.

---

### `src/server/api/routes/predictionRoutes.ts` and `vehicleRoutes.ts` (modify)

**Current** `predictionRoutes.ts` lines 1-8 (imports) and 19-21:
```typescript
router.get("/", controller.getPredictions);
router.get("/stream", streamController.getPredictionsStream);
router.get("/nearby", nearbyController.getNearbyPredictions);
```
**Current** `vehicleRoutes.ts` line 11: `router.get("/", controller.getVehiclePositions);`

**Middleware attachment precedent and the deliberate difference:** `favoriteRoutes.ts:14` and `recentRoutes.ts:14` attach `requireDeviceId` router-wide with `router.use(requireDeviceId);` (import at line 3: `import { requireDeviceId } from "../middleware/requireDeviceId";`). Copy the import style, but **not** `router.use`: D-16 requires attaching the limiter per handler, so insert the shared instance as the second argument of each `router.get`:
```typescript
import { upstreamRateLimiter } from "../middleware/upstreamRateLimit";
router.get("/", upstreamRateLimiter, controller.getPredictions);
```
Import placement: `../middleware/...` sorts between `../controllers/...` and `../repositories`. Import the **one** `upstreamRateLimiter` instance in both files (D-10), and never call `createUpstreamRateLimiter()` in a route module.

---

### `src/server/api/services/BusDataRefreshService.ts` (modify, export only)

Line 6:
```typescript
const REFRESH_INTERVAL_MS = 60 * 60_000; // hourly once loaded: DASH route/stop data changes rarely (D-09)
```
→ Add the `export` prefix. Change nothing else (D-08). `computeRetryDelayMs` (line 14) is already a named export from this module, so exporting from a service module is precedented.

---

### `src/server/config/environment.ts` (modify)

**Schema neighbors** (lines 14-22). Every key carries the `biome-ignore` line, and the "why" comment goes above it:
```typescript
    // Capped at Node's max timer delay: a larger value overflows AbortSignal.timeout, which then
    // aborts every DASH call after 1ms or throws, instead of failing startup here.
    // biome-ignore lint/style/useNamingConvention: env vars use SCREAMING_SNAKE_CASE by convention
    DASH_API_TIMEOUT_MS: z.coerce.number().int().positive().max(2_147_483_647).default(10000),
    // biome-ignore lint/style/useNamingConvention: env vars use SCREAMING_SNAKE_CASE by convention
    PORT: z.coerce.number().int().positive().default(3000),
    // biome-ignore lint/style/useNamingConvention: env vars use SCREAMING_SNAKE_CASE by convention
    DB_PATH: z.string().min(1).default("data/dash-tracker.sqlite"),
```
→ Add `TRUST_PROXY_HOPS` using RESEARCH Pattern 5's strict form: `z.string().regex(/^\d+$/, "TRUST_PROXY_HOPS must be a non-negative integer").default("0").transform(Number)`. Don't use `z.coerce.number()`, which turns `""` into `0`.

**Output object** (lines 40-42):
```typescript
    server: {
        port: parsed.data.PORT,
    },
```
→ `server: { port: parsed.data.PORT, trustProxyHops: parsed.data.TRUST_PROXY_HOPS }`. Startup failure is automatic via the existing `safeParse` → `throw new Error("Invalid environment configuration:...")` (lines 24-31). Don't add a separate check.

---

### `src/server/config/environment.test.ts` (modify)

**Analog:** its own `DASH_API_TIMEOUT_MS` block (lines 1-54). Copy the structure into a sibling `describe("TRUST_PROXY_HOPS", ...)`:
```typescript
vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));   // line 4, already present (file-level)

describe("DASH_API_TIMEOUT_MS", () => {
    beforeEach(() => { vi.resetModules(); });
    afterEach(() => { vi.unstubAllEnvs(); });

    it("defaults dashApi.timeoutMs to 10000 when DASH_API_TIMEOUT_MS is unset", async () => {
        // Arrange
        vi.stubEnv("DASH_API_TIMEOUT_MS", undefined);
        // Act
        const { environment } = await import("./environment");
        // Assert
        expect(environment.dashApi.timeoutMs).toBe(10000);
    });
    ...
    it.each([
        { label: "non-numeric", value: "abc" },
        ...
        { label: "empty", value: "" },
    ])("fails startup when DASH_API_TIMEOUT_MS is $label", async ({ value }) => {
        vi.stubEnv("DASH_API_TIMEOUT_MS", value);
        const loading = import("./environment");
        await expect(loading).rejects.toThrow(/Invalid environment configuration[\s\S]*DASH_API_TIMEOUT_MS/);
    });
});
```
Cases: unset → `0`, `"0"` → `0`, `"1"` → `1`. Fails for `""`, `" 1"`, `"-1"`, `"1.5"`, `"abc"`, `"true"`.

---

### `src/server/app.ts` and `src/server/test/app.ts` (modify)

**`app.ts` lines 12-23:**
```typescript
const app = express();
const port = environment.server.port;

// Middleware to parse JSON
app.use(express.json());
...
// V1 API
app.use("/api/v1", router);
```
→ Insert `app.set("trust proxy", environment.server.trustProxyHops);` after `const app = express();` and before `app.use("/api/v1", router)`, with a one-line "why" comment (an integer hop count, never `true`). `environment` is already imported (line 7).

**`test/app.ts` lines 1-11:** a hand copy of `app.ts` with no `config` import today. Mirror the same `app.set` line, adding `import { environment } from "../config";`. With the test env (`setup.ts` doesn't set `TRUST_PROXY_HOPS`), it resolves to `0`. Note: if `rateLimit.test.ts` wants per-test client IPs via `X-Forwarded-For`, it must override this on the shared app (`app.set("trust proxy", 1)` in that file) or use `resetKey` instead (see Shared Patterns: Test isolation).

---

### `.env.example` (modify)

Current lines 1-5 (`PORT=3000` ... `DASH_API_TIMEOUT_MS=10000`). This is the only place env vars are documented (`git grep DASH_API_TIMEOUT_MS` outside `src/` and `.planning` hits only this file). Append a comment line plus `TRUST_PROXY_HOPS=0`.

---

### `src/server/api/services/HealthService.test.ts` (test)

**Analog A, mock repo + `as never` cast** (`VehicleService.test.ts` lines 22-24, 48-50):
```typescript
const makeMockRepo = () => ({
    getRouteByShortName: vi.fn(),
});
...
            const mockRepo = makeMockRepo();
            const { getVehiclePositions } = createVehicleService(mockRepo as never);
```
→ `const makeMockRepo = (state: BusDataLoadState = {}) => ({ getLoadState: vi.fn().mockReturnValue(state) });`. No `vi.mock("../../config")` is needed (HealthService imports no config), but importing `BusDataRefreshService` pulls in `../../config`, so `setup.ts` env vars cover it.

**Analog B, fake Date only** (`BusDataRepository.test.ts` lines 488-496):
```typescript
    describe("getLoadState", () => {
        beforeEach(() => {
            // Only Date is faked, so promise resolution and timer behaviour are untouched.
            vi.useFakeTimers({ toFake: ["Date"] });
        });

        afterEach(() => {
            vi.useRealTimers();
        });
```
plus `vi.setSystemTime(T1)` per test (line 508). Hour constant naming: `const HOUR_MS = 3_600_000;` (`BusDataRefreshService.test.ts:10`).

Cases: never loaded (with and without `lastFailedAt`) → `not_ready` / `never_loaded` / nulls. Fresh → `ready`, no `reason` key. Exactly `STALE_AFTER_MS` (3h5m) → ready. `+1ms` → `stale`. `lastError` present in the mock state but absent from the report (`expect(report).not.toHaveProperty("lastError")`). Clock behind `lastLoadedAt` → `dataAgeSeconds` 0.

---

### `src/server/api/controllers/HealthController.test.ts` (test)

**Analog:** `VehicleController.test.ts` lines 1-31, 63-77:
```typescript
const makeMockRes = () => {
    const res = {
        json: vi.fn(),
        status: vi.fn(),
    } as unknown as Response;
    (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
    return res;
};
...
const makeMockService = () => ({
    getVehiclePositions: vi.fn(),
});
```
→ Add `set: vi.fn()` to `makeMockRes` (chainable like `status`), and use `makeMockService = () => ({ getReadiness: vi.fn() })` plus `makeReadinessReport(overrides)` as the `makeX` factory. Assert `res.set` was called with `("Cache-Control", "no-store")` on both handlers, status 200/503, the body passed through unchanged, `getLiveness` never calls `getReadiness`, and `res.set` is never called with `"Retry-After"` (D-19).

---

### `src/server/api/middleware/upstreamRateLimit.test.ts` (test)

**Structure analog:** `requireDeviceId.test.ts` (AAA comments, one `describe` per export). Unit-testing a library middleware with mock req/res is brittle, so drive a **minimal express app** with supertest instead (`import request from "supertest"`, `dataNotReady.test.ts:1`):
- `beforeEach`: `const app = express(); app.set("trust proxy", 1); app.get("/api/v1/predictions/nearby", createUpstreamRateLimiter(), (_req, res) => { res.json({ ok: true }); });` (a fresh instance per test means no bucket bleed).
- Logger spy pattern (`dataBootRetry.test.ts` lines 77-79, 86):
```typescript
        warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);
...
        vi.restoreAllMocks();
```
- Fake Date for window reset: `vi.useFakeTimers({ toFake: ["Date"] })`. Never use the default `toFake`, because supertest sockets hang (RESEARCH Pitfall 7).
- Assertions: 60 × 200 with `ratelimit` matching `/^"60-in-1min"; r=\d+; t=\d+$/`, `ratelimit-policy` present, no `x-ratelimit-*`. The 61st returns 429, body `{ error: "Too Many Requests", details: ... }`, and `retry-after` defined. A different `X-Forwarded-For` IP still gets 200. Warn is called exactly once across the 61st and 62nd requests, and `JSON.stringify(warnSpy.mock.calls)` doesn't contain `lat`/`lng` (the leak-check idiom from `dataBootRetry.test.ts:120-121`: `expect(logged).not.toContain("test-api-key")`).

---

### `src/server/api/routes/healthRoutes.test.ts` (E2E)

**Analog:** `dataNotReady.test.ts` lines 1-38 (supertest against `../../test/app`, the pre-load singleton per file):
```typescript
import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../../test/app";

// Nothing in this file ever loads route/stop data. vitest isolates modules per test file, so the
// BusDataRepository singleton every route module captured at import stays in its pre-load state for the
// whole file.
...
            const response = await client.get(path);

            // Assert
            expect(response.status).toBe(503);
            expect(response.headers["retry-after"]).toBe("5");
            expect(response.headers["content-type"]).toMatch(/application\/json/);
            expect(response.body).toEqual(NOT_READY_BODY);
```
For the loaded/stale cases, use `dataBootRetry.test.ts` lines 14-53, 63-74 (a fake DASH `http.createServer` on port 0, swapping `axios.defaults.baseURL` in `beforeAll`/`afterAll`), then `await BusDataRepository.getInstance().load()` under `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime(T0)`. Alternatively, `vi.spyOn(axios, "get")` (`predictionRoutes.test.ts:519-520`) to both feed the load and assert that probes make **zero** further `axios.get` calls. Since pre-load and post-load states conflict inside one file, order the tests (pre-load first) or split into two files, following the per-file isolation comment above.

Assert `cache-control: no-store` on both probes and `retry-after` **undefined** on the readiness 503 (D-19, the inverse of the `dataNotReady` assertion).

---

### `src/server/api/routes/rateLimit.test.ts` (E2E wiring)

**Analog:** `dataNotReady.test.ts` lines 11-38. An `it.each` row table of `{ label, path }` mapped to `[label, path]` tuples, with `"%s ..."` titles:
```typescript
const NOT_READY_ROWS: { label: string; path: string }[] = [
    { label: "GET /api/v1/predictions/stream", path: "/api/v1/predictions/stream?stop=stop-1" },
    ...
];
    it.each(NOT_READY_ROWS.map(({ label, path }) => [label, path]))(
        "%s answers 503 with Retry-After before the first route/stop load",
```
→ An `UNLIMITED_ROWS` table (`/routes/all`, `/routes/1A`, `/stops/nearby?...`, `/favorites` + `X-Device-Id`, `/recents` + `X-Device-Id`, `/health/live`, `/health/ready`): more than 60 requests each, never 429, `response.headers["ratelimit"]` undefined. Shared-bucket test: mix `/predictions`, `/vehicles`, and `/predictions/nearby` up to 60, then the next request on a different limited route returns 429. Leaving data unloaded makes `/predictions` and `/vehicles?route=` answer 503 without DASH calls (the limiter counts every status). Stub `axios.get` for `/nearby` and unfiltered `/vehicles` if they would hit DASH. Isolation: `beforeEach(() => upstreamRateLimiter.resetKey("127.0.0.1"))`.

---

## Shared Patterns

### Factory DI + composition root
**Source:** `src/server/api/routes/vehicleRoutes.ts` lines 6-7; `src/server/api/services/VehicleService.ts` lines 10, 16
**Apply to:** `healthRoutes.ts`, `HealthService.ts`, `HealthController.ts`
Services and controllers take dependencies as factory params, and repositories are imported `type`-only. Only route modules call `X.getInstance()`.

### Error body shape `{ error, details }`
**Source:** `src/server/api/controllers/errorResponse.ts` lines 12, 17, 21, 31; `src/server/api/middleware/requireDeviceId.ts` line 7
**Apply to:** the 429 handler in `upstreamRateLimit.ts` → `{ error: "Too Many Requests", details: "<human message>" }`
**Not applied to:** the readiness 503, which uses the D-03 body and never goes through `sendErrorResponse`.

### Message-only, secret- and location-safe logging
**Source:** `errorResponse.ts` lines 25-30; `BusDataRefreshService.ts` line 60 (`error instanceof Error ? error.message : "Unknown error"`)
**Apply to:** the limiter warn line and the library `logger` adapter. Never log an error object, `req.originalUrl`, or `req.url`. Use `${req.baseUrl}${req.path}`.

### Named constants with "why" comments and decision IDs
**Source:** `BusDataRefreshService.ts` lines 4-6; `errorResponse.ts` lines 5-8
**Apply to:** `UPSTREAM_RATE_LIMIT`, `UPSTREAM_RATE_WINDOW_MS` (D-12), `STALE_AFTER_MS` (D-06/D-07)

### Test conventions
**Source:** `VehicleController.test.ts` (AAA comments, `makeMockRes`/`makeMockService`/`makeX` factories), `dataBootRetry.test.ts` lines 76-87 (logger spies + `vi.restoreAllMocks()` in `afterEach`), `BusDataRepository.test.ts` lines 488-496 (Date-only fake timers)
**Apply to:** all new `*.test.ts`

### Test isolation for the shared limiter
**Source:** the per-file module isolation comment at `dataNotReady.test.ts` lines 5-7
**Apply to:** `rateLimit.test.ts`, plus any file that makes many requests to limited routes. Existing counts per file: `predictionRoutes.test.ts` has 24 limited-route requests, `upstreamTimeout.test.ts` 9, `dataNotReady.test.ts` 3, `dataReloadStream.test.ts` 2. All are under 60, so no existing test needs changes, but `predictionRoutes.test.ts` is the one to watch.

### Coverage scope
**Source:** `vitest.config.mts` line 13 excludes `src/server/app.ts` and `src/server/config/**` from coverage. The new middleware, service, controller, and route files **are** counted against the 80% thresholds, so each needs its own test file.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `package.json` / `bun.lock` | config | n/a | First new runtime dependency this milestone. Use the RESEARCH install command `~/.proto/tools/bun/1.3.14/bun add express-rate-limit@8.7.0 --minimum-release-age=604800` (not plain `bun install`; pinned Bun 1.0.31 writes the ignored `bun.lockb`). Then confirm `git diff --stat bun.lock package.json`. Precede it with a `checkpoint:human-verify` (legitimacy audit flagged recency). |
| Core `rateLimit({...})` configuration inside `upstreamRateLimit.ts` | middleware | request-response | No library-configured middleware exists yet. Use RESEARCH Pattern 1, wrapped in the `requireDeviceId.ts` conventions above. |

## Metadata

**Analog search scope:** `src/server/api/{routes,controllers,services,middleware,repositories,models}`, `src/server/config`, `src/server/test`, `.env.example`, `biome.json`, `vitest.config.mts`
**Files scanned:** 24 read in full or in part (all tracked; verified via `git ls-files`)
**Pattern extraction date:** 2026-10-06
