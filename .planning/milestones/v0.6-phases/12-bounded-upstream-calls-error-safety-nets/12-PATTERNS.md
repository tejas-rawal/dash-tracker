# Phase 12: Bounded Upstream Calls & Error Safety Nets - Pattern Map

**Mapped:** 2026-09-29
**Files analyzed:** 12 (4 new, 8 modified; 2 of the modified are optional/discretionary)
**Analogs found:** 11 / 12

All paths below are git-tracked source (verified with `git ls-files`). All paths are relative to repo root.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/server/config/environment.ts` (modify) | config | transform (env → typed config) | itself: `PORT` entry lines 14-15, `dashApi` object lines 30-34 | exact |
| `src/server/config/axios.ts` (modify) | config / middleware (axios interceptors) | request-response | `src/server/api/services/NearbyPredictionService.ts` lines 96-110 (message-only wrap) | role-match (logic being generalized) |
| `src/server/config/axios.test.ts` (new) | test (integration, real socket) | request-response | `src/server/api/routes/predictionRoutes.test.ts` lines 1-4, 212-245 (real `http` + `listen(0)`), plus `NearbyPredictionService.test.ts` lines 450-470 (key-leak assertions) | role-match |
| `src/server/config/processHandlers.ts` (new, discretionary; or inline in `app.ts`) | utility / bootstrap | event-driven | `src/server/app.ts` lines 39-54 (`process.on` + message-only logging) and `ServiceAlertPollService.ts` (factory + logger shape) | role-match |
| `src/server/config/processHandlers.test.ts` (new, if extracted) | test | event-driven | `src/server/api/services/ServiceAlertPollService.test.ts` lines 1-50 (logger-only `vi.mock("../../config")`) | role-match |
| `src/server/app.ts` (modify) | entry point | event-driven | itself lines 1-6, 21-31 | exact |
| `src/server/api/controllers/PredictionStreamController.ts` (modify) | controller | streaming (SSE) | itself lines 47-50, 63-88 | exact |
| `src/server/api/controllers/PredictionStreamController.test.ts` (modify) | test | streaming | itself lines 7-30, 88-107 | exact |
| `src/server/api/services/NearbyPredictionService.ts` (modify, D-07) | service | request-response | `src/server/api/services/PredictionService.ts` lines 54-59 (un-wrapped fetch) | exact |
| `src/server/api/services/NearbyPredictionService.test.ts` (modify) | test | request-response | `src/server/api/services/PredictionService.test.ts` lines 302-314 | exact |
| `src/server/api/routes/predictionRoutes.test.ts` (modify, forced) | test (route integration) | request-response | itself lines 477-490, 568-577 | exact |
| `src/server/api/repositories/BusDataRepository.ts` (optional) | repository | CRUD / batch load | itself lines 103-143 | exact |
| `.env.example` (optional) | config doc | n/a | itself lines 1-4 | exact |

---

## Pattern Assignments

### `src/server/config/environment.ts` (config, transform)

**Analog:** the same file, the `PORT` entry and the `dashApi` object.

**Schema entry to copy** (lines 14-15). Every env var carries the biome-ignore comment:
```typescript
    // biome-ignore lint/style/useNamingConvention: env vars use SCREAMING_SNAKE_CASE by convention
    PORT: z.coerce.number().int().positive().default(3000),
```
New entry (D-02): `DASH_API_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),` with the same comment line above it. Put it next to the other `DASH_API_*` keys (after line 13).

**Exposure object** (lines 29-34). Add `timeoutMs: parsed.data.DASH_API_TIMEOUT_MS` inside `dashApi`:
```typescript
export const environment = {
    dashApi: {
        baseUrl: parsed.data.DASH_API_BASE_URL,
        agency: parsed.data.DASH_API_AGENCY,
        apiKey: parsed.data.DASH_API_KEY,
    },
```
Failure path (lines 20-27): `safeParse` then `throw new Error("Invalid environment configuration:...")`. No change needed. An invalid value fails startup for free.

**Test-mock impact:** service tests mock `../../config` with a literal `environment.dashApi` object (e.g. `NearbyPredictionService.test.ts` lines 6-13, `VehicleService.test.ts` lines 5-12). Those services never read `timeoutMs`, so the mocks can stay as they are. Only code that reads `environment.dashApi.timeoutMs` (the axios module) needs the real value.

---

### `src/server/config/axios.ts` (config/interceptor, request-response)

**Current file** (lines 1-8, whole file):
```typescript
import axios from "axios";
import { environment } from "./environment";

const { dashApi } = environment;

// Create a custom instance of axios
export const axiosInstance = axios.create({ baseURL: dashApi.baseUrl });
axiosInstance.defaults.headers.common.Authorization = dashApi.apiKey;
```
Exported as `axios` from `src/server/config/index.ts` line 3 (`export { axiosInstance as axios } from "./axios";`). Keep that export name, since all 5 call sites import `{ axios } from "../../config"`.

**Pattern to generalize** (from `src/server/api/services/NearbyPredictionService.ts` lines 101-109). This is the message-only wrap that becomes the response-error interceptor (D-05/D-06):
```typescript
        try {
            const response = await axios.get(url);
            return response.data;
        } catch (error: unknown) {
            // Only the message may leave this block: axios errors carry config.headers.Authorization,
            // which is DASH_API_KEY, so the error object is never logged or rethrown.
            const message = error instanceof Error ? error.message : "Unknown error";
            throw new UpstreamApiError(`DASH API request failed for nearby predictions: ${message}`);
        }
```
Apply in the interceptor:
- Keep the `error instanceof Error ? error.message : "Unknown error"` idiom. It's used everywhere (app.ts line 52, ServiceAlertPollService line 23, PredictionStreamService lines 39/44).
- Keep the "why" comment about `config.headers.Authorization` = `DASH_API_KEY` (T-11-01), because the reason must live next to the code.
- Timeout branch message: `DASH API request timed out after ${dashApi.timeoutMs}ms` (D-08). Other failures: `DASH API request failed: ${message}`.
- Never pass the axios error as `cause` or spread it (D-06). `UpstreamApiError`'s constructor only takes `message: string` (`src/server/api/errors/index.ts` lines 8-13), which enforces this.

**Import for UpstreamApiError** (Claude's discretion, allowed): `import { UpstreamApiError } from "../api/errors";`. Relative paths only, no aliases (CLAUDE.md). There's no cycle risk: `src/server/api/errors/index.ts` has zero imports.

**Per-request signal (D-04 pitfall):** create `AbortSignal.timeout(dashApi.timeoutMs)` inside a `axiosInstance.interceptors.request.use((config) => ...)` callback, never on `axios.create({...})` or `defaults`. The codebase has no existing interceptor analog, so the planner should use axios 1.7.x docs/types (`node_modules/axios/index.d.ts`) for `InternalAxiosRequestConfig`, `isAxiosError`, `AxiosError.ECONNABORTED` / `ERR_CANCELED` / `ETIMEDOUT`.

**Style constraints:** explicit return types on the interceptor functions, 4-space indent, double quotes, trailing commas (Biome).

---

### `src/server/config/axios.test.ts` (new test, request-response over a real socket)

**No config tests exist yet.** Note that `vitest.config.mts` excludes `src/server/config/**` and `src/server/app.ts` from coverage, so this test is for behavior, not for coverage numbers.

**Real-socket pattern** (from `src/server/api/routes/predictionRoutes.test.ts` lines 1-4, 216-217):
```typescript
import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
...
        const server = app.listen(0);
        const port = (server.address() as AddressInfo).port;
```
For a "blackholed DASH" (success criterion #1: connection accepted, no response), use a `net.createServer()` (or `http.createServer` that never calls `res.end`) listening on port 0. Point the real `axiosInstance` at it (per-request absolute URL, or temporarily set `axiosInstance.defaults.baseURL` and restore it in `afterEach`), then assert:
- rejects with `UpstreamApiError`
- message matches `/timed out after \d+ms/`
- message doesn't contain `"test-api-key"` (the value `src/server/test/setup.ts` line 3 sets for `DASH_API_KEY`)

**Timeout length in tests:** the default is 10000 ms. Either set `process.env.DASH_API_TIMEOUT_MS` in `src/server/test/setup.ts` (lines 1-4 pattern: `process.env.X = "..."`) to something like `"200"`, or read `environment.dashApi.timeoutMs` lazily inside the interceptor so a test can override it. CONTEXT says setup.ts only changes "if a test wants a short timeout". This test does, so a setup.ts change is justified.

**Key-leak assertion to copy** (from `src/server/api/services/NearbyPredictionService.test.ts` lines 450-470):
```typescript
            const networkError = Object.assign(new Error("connect ECONNREFUSED"), {
                // biome-ignore lint/style/useNamingConvention: mirrors the real axios header that carries DASH_API_KEY
                config: { headers: { Authorization: "super-secret-key" } },
            });
            ...
            const error = await getNearbyPredictions(LAT, LNG).catch((caught: unknown) => caught);

            // Assert
            expect(error).toBeInstanceOf(UpstreamApiError);
            expect((error as Error).message).toContain("connect ECONNREFUSED");
            expect((error as Error).message).not.toContain("super-secret-key");
```
Also cover: connection refused (listen, then close, then request to that port) produces the generic `DASH API request failed:` message; a non-2xx response (server replies 503) produces `UpstreamApiError`; and two consecutive requests both succeed against a responsive server (this guards the D-04 "single shared signal" pitfall).

**Test body style:** `// Arrange` / `// Act` / `// Assert` comments in every `it` (used across all test files, e.g. `errors/index.test.ts`).

---

### `src/server/config/processHandlers.ts` (new, discretionary; utility, event-driven)

**Placement:** Claude's discretion. Recommend a small module exporting `registerProcessErrorHandlers(): void` so it's testable. `app.ts` is excluded from coverage and has side effects at import time, which makes it hard to test.

**Existing `process.on` usage** (`src/server/app.ts` lines 39-49):
```typescript
        // graceful shutdown
        const shutdown = () => {
            server.close(async () => {
                await favoritesRecentsRepository.close();
                logger.info("Server is gracefully shutting down");
                process.exit(0);
            });
        };

        process.on("SIGTERM", shutdown);
        process.on("SIGINT", shutdown);
```

**Message-only logging idiom** (`src/server/app.ts` lines 51-54):
```typescript
    .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error(`Failed to initialize application data: ${message}`);
        process.exit(1);
    });
```
Adapt for D-12: log `reason.message` + `reason.stack` when `reason instanceof Error`, else `String(reason)`. Never pass the reason object itself to Winston (`logger.error(msg, reason)` would serialize axios config and leak the key).
- `unhandledRejection`: `logger.error(...)`, no exit (D-10).
- `uncaughtException`: `logger.error(...)`, then `process.exit(1)` (D-11).

**Import convention:** within `src/server/config/`, import siblings directly, e.g. `import { logger } from "./logger";` (see `axios.ts` line 2, `import { environment } from "./environment";`). If exported from the barrel, add `export * from "./processHandlers";` to `src/server/config/index.ts` (lines 1-3 pattern).

**Factory/closure shape reference** (`src/server/api/services/ServiceAlertPollService.ts` lines 18-26): a try/catch that logs `Failed to ...: ${message}` at `logger.error`, with an explicit `: void` / `: Promise<void>` return type.

---

### `src/server/config/processHandlers.test.ts` (new test, event-driven)

**Analog:** `src/server/api/services/ServiceAlertPollService.test.ts` lines 1-9. It mocks only the logger:
```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
...
vi.mock("../../config", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from "../../config";
import { createServiceAlertPollService } from "./ServiceAlertPollService";
```
For a file inside `config/`, mock the sibling path instead: `vi.mock("./logger", () => ({ logger: { error: vi.fn(), ... } }))`.

The codebase has no existing analog for testing `process.on` handlers. Suggested approach: `vi.spyOn(process, "on")` to capture the registered listeners (then invoke them directly), and `vi.spyOn(process, "exit").mockImplementation((() => undefined) as never)` for the `uncaughtException` path. Restore in `afterEach` (CLAUDE.md: reset shared state to prevent test bleed). Assert that the logged string doesn't contain a secret carried on a fake reason object (reuse the `Object.assign(new Error(...), { config: { headers: { Authorization: "super-secret-key" } } })` fixture from `NearbyPredictionService.test.ts` lines 452-455).

---

### `src/server/app.ts` (modify, entry point)

**Imports** (lines 1-6):
```typescript
import express from "express";
import { BusDataRepository, FavoritesRecentsRepository, ServiceAlertRepository } from "./api/repositories";
import router from "./api/routes";
import { createServiceAlertPollService } from "./api/services/ServiceAlertPollService";
import { createServiceAlertService } from "./api/services/ServiceAlertService";
import { environment, logger } from "./config";
```
Add the handler registration to the `./config` import and call it **before** line 22 (`BusDataRepository.getInstance()`) and line 31 (`serviceAlertPollService.start()`), ideally right after the imports or right after `const app = express();`. Leave lines 51-55 (init `.catch` then `process.exit(1)`) unchanged. Phase 13 replaces that.

**Comment style reference** (lines 25-26), a short "why" comment with decision IDs:
```typescript
// Service alerts poll is boot-triggered and fully independent of BusDataRepository's
// startup-blocking init chain below (D-06/D-07) — it never awaits or gates app.listen().
```

---

### `src/server/api/controllers/PredictionStreamController.ts` (modify, streaming)

**Early close tracking** (lines 47-50). This is where the `res.on("error")` listener should also be attached so it covers errors before or around `writeHead`:
```typescript
        let closed = false;
        req.on("close", () => {
            closed = true;
        });
```

**Post-subscribe checks and existing disconnect cleanup** (lines 63-88):
```typescript
        const { initialPayload, unsubscribe } = subscription;

        if (closed || req.destroyed) {
            unsubscribe();
            return;
        }

        try {
            res.writeHead(200, { ... });
            send(initialPayload);
        } catch (writeError: unknown) {
            const message = writeError instanceof Error ? writeError.message : "Unknown error";
            logger.error(`Failed to write initial SSE frame for stop ${stop}: ${message}`);
            unsubscribe();
            return;
        }

        req.on("close", () => {
            unsubscribe();
            res.end();
        });
```
Change per D-13/D-14:
- Pull `unsubscribe(); res.end();` into one idempotent closure (e.g. `let cleanedUp = false; const cleanup = (): void => { if (cleanedUp) return; cleanedUp = true; unsubscribe(); res.end(); };`) and use it from both `req.on("close")` and `res.on("error")`.
- The error log is `logger.warn(\`SSE response error for stop ${stop}: ${message}\`)` with the same `instanceof Error ? .message : "Unknown error"` idiom. Log the message only, never the error object.
- Because `subscription` doesn't exist yet at line 47, an error that arrives before subscribe resolves has to be recorded the same way `closed` is (set a flag that the `closed || req.destroyed` check at line 65 also reads). The planner picks the exact placement, as CONTEXT allows.

**No `PredictionStreamService` change (D-15).** Reference only, `src/server/api/services/PredictionStreamService.ts` lines 49-60, where `unsubscribeFrom` is already idempotent:
```typescript
    function unsubscribeFrom(stopId: string, onUpdate: Subscriber): void {
        const entry = loops.get(stopId);
        if (!entry) {
            return;
        }

        entry.subscribers.delete(onUpdate);
        if (entry.subscribers.size === 0) {
            clearInterval(entry.timer);
            loops.delete(stopId);
        }
    }
```

---

### `src/server/api/controllers/PredictionStreamController.test.ts` (modify, streaming)

**Mock res/req factories** (lines 7-30). Extend `makeMockRes` with an `on` that captures `"error"`, mirroring how `makeMockReq` captures `"close"`:
```typescript
const makeMockRes = () => {
    const res = {
        writeHead: vi.fn(),
        write: vi.fn(),
        status: vi.fn(),
        json: vi.fn(),
        end: vi.fn(),
    } as unknown as Response;
    (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
    return res;
};

const makeMockReq = (query: Record<string, string> = {}) => {
    let closeCallback: (() => void) | undefined;
    const req = {
        query,
        on: vi.fn((event: string, callback: () => void) => {
            if (event === "close") {
                closeCallback = callback;
            }
        }),
    } as unknown as Request;
    return { req, triggerClose: () => closeCallback?.() };
};
```
Note that `makeMockReq` keeps only the **last** `"close"` callback registered, since both lines 48 and 85 register one. If the controller's registrations change, update the capture (e.g. store an array and fire them all) so `triggerClose` still drives the cleanup path.

**Test template to copy** (lines 88-107):
```typescript
        it("invokes unsubscribe and ends the response when the request closes", async () => {
            // Arrange
            const mockStreamService = makeMockStreamService();
            const unsubscribe = vi.fn();
            mockStreamService.subscribe.mockResolvedValue({
                initialPayload: makeStopPredictionsResponse("stop-1"),
                unsubscribe,
            });
            const { getPredictionsStream } = createPredictionStreamController(mockStreamService);
            const { req, triggerClose } = makeMockReq({ stop: "stop-1" });
            const res = makeMockRes();
            await getPredictionsStream(req, res, vi.fn());

            // Act
            triggerClose();

            // Assert
            expect(unsubscribe).toHaveBeenCalledTimes(1);
            expect(res.end).toHaveBeenCalledTimes(1);
        });
```
New cases:
- error, then cleanup runs once and `logger.warn` is called with the stop id
- error then close: `unsubscribe` and `res.end` each still called exactly once
- error while subscribe is pending (copy the deferred-promise pattern from lines 109-137): `writeHead` is not called and `unsubscribe` is called once

This file doesn't mock `../../config` today. Add `vi.mock("../../config", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))` using the pattern from `ServiceAlertPollService.test.ts` lines 4-6 so the test can assert on the warn call.

---

### `src/server/api/services/NearbyPredictionService.ts` (modify, D-07)

**Target shape** (copy from `src/server/api/services/PredictionService.ts` lines 54-59):
```typescript
    async function fetchFromDashApi(stopId: string, options: PredictionOptions): Promise<DashApiResponse> {
        const url = buildDashApiUrl(stopId, options);
        logger.info(`Fetching predictions from DASH API: ${url}`);
        const response = await axios.get(url);
        return response.data as DashApiResponse;
    }
```
In `NearbyPredictionService.ts`, lines 101-109 (the `try { ... } catch { throw new UpstreamApiError(...) }`) collapse to `const response = await axios.get(url); return response.data;`. Keep lines 97-100 as they are, including the "rider's coordinates are deliberately kept out of the log line" comment. Keep the `UpstreamApiError` import (line 2): `parseDashResponse` (lines 112-128) still throws it for content errors.

---

### `src/server/api/services/NearbyPredictionService.test.ts` (modify)

**Test to rewrite:** lines 450-470 ("wraps a network error as UpstreamApiError once, without leaking the API key"). In this file `axios` is a `vi.fn()` mock (lines 6-14), so interceptors never run here. After D-07 the service propagates the raw rejection. Replace it with the propagation test used by sibling services (`src/server/api/services/PredictionService.test.ts` lines 302-314):
```typescript
        it("throws when the DASH API call rejects", async () => {
            // Arrange
            ...
            mockAxiosGet.mockRejectedValue(new Error("network error"));
            ...
            // Act & Assert
            await expect(getPredictionsForStop("stop-1")).rejects.toThrow("network error");
        });
```
Same wording is used in `VehicleService.test.ts` lines 151-159 and `ServiceAlertService.test.ts` lines 170-177. The key-leak assertion moves to `src/server/config/axios.test.ts`. Keep the `success: false` test (lines 441-448) and the `it.each` malformed-body cases (lines 472-493) unchanged.

---

### `src/server/api/routes/predictionRoutes.test.ts` (modify, forced by D-07)

**This breaks unless changed.** `vi.spyOn(axios, "get")` (lines 479-490) replaces the instance method, which **bypasses interceptors**:
```typescript
    let getSpy: MockInstance;

    beforeEach(() => {
        getSpy = vi.spyOn(axios, "get");
    });

    afterEach(() => {
        getSpy.mockRestore();
        ServiceAlertRepository.getInstance().applyAlerts([]);
    });
```
The test at lines 568-577 then gets a 500, not a 502, because it asserts on the removed service-level message:
```typescript
    it("responds with 502 when the upstream request fails at the network level", async () => {
        // Arrange
        getSpy.mockRejectedValue(new Error("connect ECONNREFUSED"));
        ...
        expect(response.status).toBe(502);
        expect(response.body.error).toBe("Bad Gateway");
        expect(response.body.details).toContain("DASH API request failed for nearby predictions");
    });
```
Options for the planner:
- (a) Make the spy reject with `new UpstreamApiError("DASH API request failed: connect ECONNREFUSED")`, which simulates the interceptor's output, and assert `details` contains `"DASH API request failed"`.
- (b) Better for success criterion #1: add an end-to-end "blackholed DASH" case (no spy) that points the real `axios` instance at a local non-responding server and asserts 502, `details` matching `/timed out after/`, and no `"test-api-key"` in the body. You can run this once each for `/predictions`, `/predictions/nearby`, and `/vehicles`. There's no `vehicleRoutes.test.ts` yet, so a vehicles case would go in a new file or in this one.

---

### `src/server/api/repositories/BusDataRepository.ts` (optional, discretionary)

**Current catch** (lines 139-142), already message-only:
```typescript
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            logger.error(`Failed to fetch and process data: ${message}`);
            throw new Error(`Failed to fetch and process data: ${message}`);
```
Then `handleLoadError` (lines 97-100) wraps it again (`Failed to initialize bus data: ...`). With the interceptor, a timeout at boot logs as `Failed to fetch and process data: DASH API request timed out after 10000ms`, which satisfies "startup timeout shows up as a logged error". No change is required. `BusDataRepository.test.ts` lines 140-146 (`rejects.toThrow("Failed to initialize bus data")`) still passes because `axios` is mocked there.

`ServiceAlertPollService.ts` lines 19-25 already catches and logs `Failed to poll service alerts: ${message}`, so an alert-poll timeout is logged with no change.

---

### `.env.example` (optional)

Lines 1-4 list only the required vars plus `PORT`. `DB_PATH` (optional, defaulted) is not listed, so adding `DASH_API_TIMEOUT_MS=10000` is optional. If it's added, put it after `DASH_API_KEY` in the same `KEY=value` form.

---

## Shared Patterns

### Message-only error extraction (secret safety, T-11-01 / D-06 / D-12)
**Source:** `src/server/app.ts` line 52, `src/server/api/services/NearbyPredictionService.ts` lines 105-107
**Apply to:** axios interceptor, process handlers, SSE `res.on("error")` handler
```typescript
const message = error instanceof Error ? error.message : "Unknown error";
```
Never pass an error or reason object as a Winston metadata argument, never use it as `cause`, and never spread it.

### Winston logging
**Source:** `src/server/config/logger.ts` lines 1-7 (`winston.format.simple()`, console transport); import via `import { logger } from "../../config";` from `api/**`, or `import { logger } from "./logger";` inside `config/`
**Levels:** `logger.error` for process-level failures (D-10/D-11); `logger.warn` for SSE client-side socket errors (D-13, the same level `NearbyPredictionService.ts` line 134 uses for routine, non-fatal conditions).
**Format:** a single template string, `"Failed to <action> ...: ${message}"` / `"... for stop ${stopId}: ${message}"`.

### Error → HTTP mapping (unchanged, D-09)
**Source:** `src/server/api/controllers/PredictionStreamController.ts` lines 11-19. The same shape is in `PredictionController.ts` lines 27-28, `VehicleController.ts` lines 13-14, and `NearbyPredictionController.ts` line 41.
```typescript
    if (error instanceof UpstreamApiError) {
        return 502;
    }
```
No controller edits. The interceptor only has to throw `UpstreamApiError`.

### Test config mocking
**Source:** `src/server/api/services/VehicleService.test.ts` lines 5-15
```typescript
vi.mock("../../config", () => ({
    axios: { get: vi.fn() },
    environment: {
        dashApi: { agency: "alexandria-dash", baseUrl: "https://api.goswift.ly", apiKey: "key" },
        server: { port: 3000 },
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { axios, environment, logger } from "../../config";
```
**Apply to:** unit tests that need a mocked logger or axios. Tests of the interceptor itself must **not** mock axios. They should import the real `axiosInstance` (env comes from `src/server/test/setup.ts`).

### Test structure
**Source:** all `*.test.ts` files: `describe` / `it` with `// Arrange`, `// Act`, `// Assert` comments; `beforeEach(() => { vi.clearAllMocks(); })` (`NearbyPredictionService.test.ts` lines 143-145); `makeX` factories for fixtures.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| axios request/response interceptors in `src/server/config/axios.ts` | config/middleware | request-response | No axios interceptors exist anywhere in the repo. Use axios 1.7.x types (`node_modules/axios/index.d.ts`) for `interceptors.request.use` / `interceptors.response.use`, `isAxiosError`, and the `AxiosError` code constants. The error-wrapping *logic* does have an analog (see above). |
| `process.on("unhandledRejection" / "uncaughtException")` tests | test | event-driven | No existing test spies on `process.on` or `process.exit`. Use `vi.spyOn(process, ...)` and restore in `afterEach`. |
| Environment schema tests | test | transform | No tests for `environment.ts` exist, and `config/**` is excluded from coverage. If one is added, it needs `vi.resetModules()` + `vi.stubEnv()` + dynamic `await import("./environment")`, which the codebase doesn't use yet. |

## Metadata

**Analog search scope:** `src/server/config/`, `src/server/api/{services,controllers,repositories,routes,errors}/`, `src/server/app.ts`, `src/server/test/`, `vitest.config.mts`, `.env.example`
**Files scanned:** 24
**Pattern extraction date:** 2026-09-29
