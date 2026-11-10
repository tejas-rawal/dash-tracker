# Phase 18: Server Toolchain & CORS - Pattern Map

**Mapped:** 2026-11-10
**Files analyzed:** 22
**Analogs found:** 20 / 22

All paths are relative to the repo root and git-tracked. Server source root: `apps/server/src/`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `.node-version` | config | n/a | itself (`20`) | exact |
| `package.json` (root) | config | n/a | itself | exact |
| `.github/workflows/ci.yml` | config | batch | itself (build job, lines 10-35) | exact |
| `.git-blame-ignore-revs` (new) | config | n/a | none | no analog |
| `biome.json` | config | n/a | itself | exact |
| `apps/server/package.json` | config | n/a | itself | exact |
| `apps/server/tsconfig.json` | config | n/a | itself | exact |
| `apps/server/tsconfig.typecheck.json` | config | n/a | itself | exact |
| `apps/server/src/createApp.ts` (new) | provider/factory | request-response | `apps/server/src/test/app.ts` + `app.ts` lines 12-27 | exact |
| `apps/server/src/app.ts` | entry point | event-driven | itself | exact |
| `apps/server/src/test/app.ts` | test helper | request-response | itself | exact |
| `apps/server/src/api/middleware/cors.ts` (new) | middleware | request-response | `apps/server/src/api/middleware/upstreamRateLimit.ts` | exact (library-wrapping factory) |
| `apps/server/src/api/middleware/cors.test.ts` (optional) | test | request-response | `apps/server/src/api/middleware/upstreamRateLimit.test.ts` | role-match |
| `apps/server/src/api/routes/cors.test.ts` (new, supertest matrix) | test | request-response | `apps/server/src/api/routes/rateLimit.test.ts` | exact |
| `apps/server/src/config/environment.ts` | config | transform | itself (`TRUST_PROXY_HOPS`) | exact |
| `apps/server/src/config/environment.test.ts` | test | transform | itself (`describe("TRUST_PROXY_HOPS")`) | exact |
| `apps/server/src/test/setup.ts` | test config | n/a | itself | exact |
| `apps/server/.env.example` | config | n/a | itself (`TRUST_PROXY_HOPS` comment line) | exact |
| `apps/server/src/api/models/BusRoute.ts` | model | n/a | itself | exact |
| `apps/server/src/api/repositories/BusDataRepository.ts` | repository | transform | itself (`RouteData`, `createRoute`, `parseDashNumber`) | exact |
| `apps/server/src/api/controllers/PredictionStreamController.ts` | controller | streaming | itself (line ~73 `writeHead`) — likely verify-only, no edit | exact |
| `.claude/CLAUDE.md`, `AGENTS.md`, `README.md` | docs | n/a | CLAUDE.md env-vars bullet | exact |

## Pattern Assignments

### `apps/server/src/createApp.ts` (new, factory)

**Analog:** `apps/server/src/test/app.ts` (whole file) — identical wiring to `app.ts` lines 12-27.
```typescript
import express from "express";
import router from "../api/routes";
import { environment } from "../config";

const app = express();
app.set("trust proxy", environment.server.trustProxyHops);
app.use(express.json());

app.get("/", (_req, res) => {
    res.jsonp({ message: "Hello World" });
});

app.use("/api/v1", router);

export default app;
```
Apply: export a named `createApp(): Express` (named exports preferred, explicit return type). Move the trust-proxy "why" comment from `app.ts` lines 14-16 along with it. CORS goes on the line right after `app.set("trust proxy", ...)` in the CORS commit (D-13), before `express.json()` and every router. Imports from `createApp.ts` are `./api/routes`, `./config` (relative, no aliases).

`app.ts` after extraction: keep lines 1-10 (`registerProcessErrorHandlers()` first), replace lines 12-27 with `const app = createApp();`, keep `const port = environment.server.port;` and everything from `SHUTDOWN_GRACE_MS` down unchanged.

`src/test/app.ts`: becomes `import { createApp } from "../createApp"; const app = createApp(); export default app;` so the 15 test files importing `../../test/app` need no edits (or drop the file and update the 15 importers; Engineering Principles favor removing the indirection — planner's call, but keep it one commit).

---

### `apps/server/src/api/middleware/cors.ts` (new, middleware)

**Analog:** `apps/server/src/api/middleware/upstreamRateLimit.ts`

Imports (lines 1-3):
```typescript
import type { NextFunction, Request, Response } from "express";
import { type AugmentedRequest, type Options, type RateLimitRequestHandler, rateLimit } from "express-rate-limit";
import { logger } from "../../config";
```
Core factory pattern (lines 14-19, 49-51): a `createX()` factory returning the library handler with documented constants, plus decisions referenced inline:
```typescript
export function createUpstreamRateLimiter(): RateLimitRequestHandler {
    return rateLimit({
        windowMs: UPSTREAM_RATE_WINDOW_MS,
        limit: UPSTREAM_RATE_LIMIT,
        // RateLimit + RateLimit-Policy (D-14). Must stay on: the library only sets Retry-After on a 429 while
        // standard or legacy headers are enabled.
        standardHeaders: "draft-8",
        legacyHeaders: false, // No X-RateLimit-* headers (D-14).
```
Apply: `export function createCorsMiddleware(allowedOrigins: readonly string[]): RequestHandler` wrapping `cors({ origin: [...allowedOrigins], exposedHeaders: [...] })`. Take origins as a parameter (DI, testable) and pass `environment.cors.allowedOrigins` from `createApp()`. Note: the limiter emits `RateLimit` and `RateLimit-Policy` (draft-8, line 19), so D-13's conditional applies: `exposedHeaders: ["Retry-After", "RateLimit", "RateLimit-Policy"]`. No `credentials`, no `allowedHeaders` (reflects `X-Device-Id`).

Second analog for a parameterized factory: `streamConcurrencyCap.ts` line 21 `export function createStreamConcurrencyCap(openStreams: Map<string, number> = new Map()): RequestHandler`.

---

### `apps/server/src/api/routes/cors.test.ts` (new, supertest matrix)

**Analog:** `apps/server/src/api/routes/rateLimit.test.ts`

Imports (lines 1-6):
```typescript
import type { Server } from "node:http";
import request from "supertest";
import { type MockInstance, afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { axios, logger } from "../../config";
import app from "../../test/app";
import { upstreamRateLimiter } from "../middleware/upstreamRateLimit";
```
Shared server (lines 78-83; rationale in `busRoutes.test.ts` lines 43-44: a per-request server plus keep-alive can land on a closed server):
```typescript
    beforeAll(async () => {
        server = app.listen(0);
        await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    });
    afterAll(async () => { /* server.close */ });
```
Row-table pattern (lines 17-26) — reuse for the D-14 matrix: `{ label, path }[]` rows, then `it.each`. The pre-load routes already answer 503 with `Retry-After: 5` (repository guard) without DASH, and `/predictions/stream?stop=stop-1` gives the 503 before SSE headers. For the shared-bucket 429 copy the exhaustion loop in this file; for the stream-cap 429 and SSE 200 see `apps/server/src/api/routes/streamCap.test.ts` and `src/test/streamClient.ts`. For the CORS test the app must be built with a known origin: `setup.ts` pins `CORS_ALLOWED_ORIGINS=http://localhost:8081`, so `test/app.ts` / `createApp()` picks it up. Assert: allowed `Origin` → `access-control-allow-origin` equals it and `access-control-expose-headers` contains `Retry-After`; disallowed origin and no `Origin` → header absent; `OPTIONS` preflight with `Access-Control-Request-Headers: X-Device-Id` → 204 and does not spend the bucket (check a following request's `RateLimit` remaining).

AAA comments (`// Arrange / // Act / // Assert`) as in `busRoutes.test.ts` lines 72-81.

---

### `apps/server/src/config/environment.ts` (modify)

**Analog:** the `TRUST_PROXY_HOPS` entry (string, refine, default, transform) and the export object.
```typescript
    // Number of trusted reverse proxies ... (D-17).
    // biome-ignore lint/style/useNamingConvention: env vars use SCREAMING_SNAKE_CASE by convention
    TRUST_PROXY_HOPS: z
        .string()
        .regex(/^\d+$/, "TRUST_PROXY_HOPS must be a non-negative integer")
        .default("0")
        .transform(Number),
});
```
Apply: `CORS_ALLOWED_ORIGINS: z.string().default("").transform(split/trim/filter).pipe(z.array(z.string().refine(isExactOrigin, ...)))` (or `superRefine` with `ctx.addIssue` naming the bad value) — the error must include the offending entry so the existing failure path prints it:
```typescript
if (!parsed.success) {
    const issues = parsed.error.issues
        .map((issue: z.ZodIssue) => `  ${issue.path.join(".")}: ${issue.message}`)
        .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
}
```
Export: add `cors: { allowedOrigins: parsed.data.CORS_ALLOWED_ORIGINS }` alongside `server`/`database`. The `biome-ignore` comment must stay (or be migrated by Biome 2 if the rule name changes).

### `apps/server/src/config/environment.test.ts` (modify)

**Analog:** `describe("TRUST_PROXY_HOPS")` lines 56-107: `vi.resetModules()` in `beforeEach`, `vi.stubEnv(name, value)`, `const { environment } = await import("./environment")`, valid rows asserting the value, invalid rows asserting
```typescript
await expect(loading).rejects.toThrow(/Invalid environment configuration[\s\S]*TRUST_PROXY_HOPS/);
```
Add a `describe("CORS_ALLOWED_ORIGINS")` with: unset → `[]`; `" http://localhost:8081, ,https://a.example "` → trimmed list; rejects `*`, `http://x.com/`, `http://x.com/path`, `http://u:p@x.com`, `ftp://x.com`, `x.com` (regex also matching the bad value).

### `apps/server/src/test/setup.ts` (modify)
Append in the same style: `process.env.CORS_ALLOWED_ORIGINS = "http://localhost:8081";` after `TRUST_PROXY_HOPS = "0"`.

### `apps/server/.env.example` (modify)
Follow the `TRUST_PROXY_HOPS` pattern: one `#` comment line explaining the why, then `CORS_ALLOWED_ORIGINS=http://localhost:8081`.

---

### `apps/server/src/api/models/BusRoute.ts` (modify)

Current constructor takes a typed data object and assigns fields 1:1:
```typescript
export class BusRoute {
    id: string;
    longName: string;
    shortName: string;
    name: string;
    type: RouteType;
    directions: RouteDirection[];

    constructor(data: { id: string; longName: string; shortName: string; name: string; type: RouteType; directions: RouteDirection[] }) {
```
Apply: add `color?: string; textColor?: string;` to fields and data param. Assign only when defined so `JSON.stringify` omits the key (D-17: "omits that field") — an `undefined` property is dropped by JSON serialization anyway, but a test should assert `not.toHaveProperty("color")` on the response body. `exactOptionalPropertyTypes` is false (tsconfig).

### `apps/server/src/api/repositories/BusDataRepository.ts` (modify)

`RouteData` (lines 7-14): add `color?: unknown; textColor?: unknown;` (unknown, because DASH data is coerced not trusted — same as `id: unknown`).

`createRoute` (lines 198-210):
```typescript
        return new BusRoute({
            id,
            longName: routeData.longName || "",
            shortName: routeData.shortName || "",
            name: routeData.name || "",
            type: routeData.type,
            directions,
        });
```
Apply: add a module-level pure helper next to `parseDashNumber` (line 33) / `requireId` (line 45), e.g. `function parseHexColor(value: unknown): string | undefined` returning the value only if it matches `/^[0-9a-fA-F]{6}$/`, else `undefined`. Never throw (unlike `requireId`, which rejects the load) — D-17. Pass `color: parseHexColor(routeData.color), textColor: parseHexColor(routeData.textColor)`.

Tests: repository load tests live in `apps/server/src/api/repositories/BusDataRepository.test.ts` (mocked axios payload); add rows for valid, missing, and malformed (`"#006899"`, `"06899"`, `123`) colors and assert `load()` still resolves.

Factories: `makeRoute` is defined locally per test file (e.g. `apps/server/src/api/routes/busRoutes.test.ts` lines 33-41; also `BusRoute.test.ts`, `BusRouteController.test.ts`, `healthRoutes.test.ts`, `StopService.test.ts`). Extend the one used by the new tests with optional `color`/`textColor` overrides rather than inline literals.

---

### `apps/server/src/api/controllers/PredictionStreamController.ts` (verify, probably no edit)

Lines ~72-78:
```typescript
            res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                // biome-ignore lint/style/useNamingConvention: HTTP header name, casing is fixed by the spec
                Connection: "keep-alive",
            });
```
`writeHead` merges headers set earlier with `res.setHeader`, which is what `cors` uses, so ACAO survives. Prove it with the matrix row; do not edit unless the test fails.

---

### Toolchain config files

**`apps/server/package.json`** scripts today:
```json
"start-server": "ts-node src/app.ts",
"dev-server": "nodemon --exec ts-node src/app.ts",
```
→ `tsx src/app.ts` / `tsx watch src/app.ts` (D-06). Deps to move to `devDependencies`: `@types/better-sqlite3`, `@types/express`, `@types/winston`; remove `nodemon`, `ts-node`; bump `tsx` (4.19.2), `typescript` (5.7.3), `@types/node` (20.17.6 → 24.x); swap `@tsconfig/node20` 20.1.4 → `@tsconfig/node24`. `@tsconfig/strictest` is a devDep but not extended by tsconfig today. Add `cors` to `dependencies`, `@types/cors` to devDeps, exact versions via `bun add`.

**`apps/server/tsconfig.json`**: currently does NOT extend anything (explicit `target: ES2020`, `module: CommonJS`, `moduleResolution: node` — `node` is deprecated in TS 6, expect an error there). Add `"extends": "@tsconfig/node24/tsconfig.json"`, keep `module: "CommonJS"` override, change `moduleResolution` to a TS 6-valid CJS value (`node16`/`nodenext` force module to match, so planner must verify the emit — research flag), add `"types": ["node"]`, keep `rootDir`, `outDir`, every strictness flag, `exclude` of `src/**/*.test.ts`. `tsconfig.typecheck.json` extends it with `noEmit` and re-includes tests — tests import from `vitest` explicitly, so no `vitest/globals`.

**Root `package.json`**: `"lint:fix": "biome check . --apply-unsafe"` → `biome check --write --unsafe .` (D-10); `@biomejs/biome` 1.9.4 → 2.5.x; add `"trustedDependencies": ["better-sqlite3", "@biomejs/biome", ...]` per `bun pm untrusted` (D-04).

**`biome.json`**: 1.9 schema with `files.ignore` (Biome 2 → `files.includes` with negations), `style.all: true`, `nursery.all: false` — `biome migrate --write` rewrites; `all` was removed in Biome 2 so migrate will expand it. Keep `noDefaultExport: "off"`, `noParameterProperties: "off"`, `noExplicitAny: "info"`.

**`.github/workflows/ci.yml`**: four jobs (build, lint, style, test), each the same block:
```yaml
      - name: Checkout Git repository
        uses: actions/checkout@v4
      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version-file: package.json
      - name: Install dependencies with Bun
        run: bun install --frozen-lockfile
      - name: Verify Bun pin and clean install
        run: |
          expected=$(node -p "require('./package.json').packageManager.split('@')[1]")
```
Insert `actions/setup-node` with `node-version-file: .node-version` before `bun install` in every job. Boot smoke: a step after Build that starts `node apps/server/dist/app.js` with dummy `DASH_API_*` env, polls `curl -fsS localhost:3000/api/v1/health/live`, then kills it.

## Shared Patterns

### Comments and decision references
Source: `upstreamRateLimit.ts`, `streamConcurrencyCap.ts`, `environment.ts`. Every constant/option has a "why" comment with a decision tag (`(D-13)`); a bare D-xx is this phase, older ones name the phase ("Phase 14 D-17"). `biome-ignore` must state the reason.

### Error envelope
`{ error, details }` bodies; `sendErrorResponse` in `apps/server/src/api/controllers/errorResponse.ts` sets `Retry-After: 5` on 503. CORS must not change bodies — only add headers.

### Env pinning in tests
`apps/server/src/test/setup.ts` pins every env var a local `.env` could leak; `environment.test.ts` uses `vi.resetModules()` + `vi.stubEnv` + dynamic import.

### Factory + DI
`createX()` factories, parameters for collaborators (`createStreamConcurrencyCap(openStreams)`), singletons only wired in `app.ts`/`createApp.ts`.

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `.git-blame-ignore-revs` | config | New file; format is one full SHA per line with a `#` comment above it |
| CI boot smoke step | config | No existing server-start step in CI; use the health endpoint `apps/server/src/api/routes/healthRoutes.ts` |

## Metadata

**Analog search scope:** `apps/server/src/{api,config,test}`, `apps/server/*.json`, root config, `.github/workflows`
**Files scanned:** ~25
**Pattern extraction date:** 2026-11-10
