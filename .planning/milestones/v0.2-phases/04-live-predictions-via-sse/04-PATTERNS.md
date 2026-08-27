# Phase 4: Live Predictions via SSE - Pattern Map

**Mapped:** 2026-08-27
**Files analyzed:** 6 (new/modified)
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/server/api/services/PredictionStreamService.ts` | service | event-driven (poll loop + subscriber fanout) | `src/server/api/services/StopService.ts` (factory shape) + `src/server/api/services/PredictionService.ts` (fetch/mapping reuse) | role-match |
| `src/server/api/controllers/PredictionStreamController.ts` | controller | streaming (SSE) | `src/server/api/controllers/PredictionController.ts` | role-match |
| `src/server/api/routes/predictionRoutes.ts` (modified) | route | request-response + streaming | `src/server/api/routes/predictionRoutes.ts` (itself, extend in place) | exact |
| `src/server/api/models/Prediction.ts` (modified — add `generatedAt` to response shapes) | model | transform | `src/server/api/models/Prediction.ts` (itself) | exact |
| `src/server/api/services/PredictionService.ts` (modified — stamp `generatedAt` on REST response) | service | CRUD/request-response | `src/server/api/services/PredictionService.ts` (itself) | exact |
| `src/server/api/errors/index.ts` (no change expected, reused) | utility | n/a | `src/server/api/errors/index.ts` | exact (reuse, not new) |

## Pattern Assignments

### `src/server/api/services/PredictionStreamService.ts` (service, event-driven)

**Analogs:** `src/server/api/services/StopService.ts` (factory + DI shape), `src/server/api/services/PredictionService.ts` (fetch delegate + error handling)

**Imports pattern** (from `StopService.ts` lines 1-4, adapted):
```typescript
import { logger } from "../../config";
import { NotFoundError, UpstreamApiError } from "../errors";
import type { BusDataRepository } from "../repositories";
import type { PredictionService } from "./PredictionService";
```
Note: `PredictionStreamService` takes `PredictionService` as a constructor param (not the repository directly) per D-05 — "calls into `PredictionService` for the actual upstream fetch." Repository access for stop validation happens inside `PredictionService.getPredictionsForStop` already, so the stream service does not need to re-validate — but if it needs to check stop existence before starting a loop, follow the `StopService.getStopsForRoute` NotFoundError-throw pattern (`src/server/api/services/StopService.ts` lines 17-20):
```typescript
const stop = repository.getStopById(stopId);
if (!stop) {
    throw new NotFoundError(`Stop not found: ${stopId}`);
}
```

**Factory function signature pattern** (`src/server/api/services/PredictionService.ts` lines 19, 101; `StopService.ts` lines 15, 51):
```typescript
export interface PredictionStreamService {
    subscribe(stopId: string, onUpdate: (payload: StopPredictionsResponse) => void): () => void;
    // subscribe returns an unsubscribe function; caller (controller) invokes it on req.on("close")
}

export function createPredictionStreamService(predictionService: PredictionService): PredictionStreamService {
    // internal Map<stopId, { timer: NodeJS.Timeout; subscribers: Set<...>; lastData?: StopPredictionsResponse }>
    return { subscribe };
}
```

**Poll loop delegation pattern** (reuse `PredictionService.getPredictionsForStop`, `src/server/api/services/PredictionService.ts` lines 75-99):
```typescript
async function poll(stopId: string): Promise<void> {
    try {
        const result = await predictionService.getPredictionsForStop(stopId);
        // stamp generatedAt (D-07/D-08), store as lastData, fan out to subscribers
    } catch (error) {
        logger.error(`Failed to poll predictions for stop ${stopId}: ${(error as Error).message}`);
        // D-04: swallow — keep serving lastData, do not close subscriber connections, retry next tick
    }
}
```

**Error handling pattern:** Per D-04, upstream poll failures are logged via `logger.error` (see `src/server/config/logger.ts` for the shared Winston instance, already used via `logger.info` in `PredictionService.ts` line 44) and NOT re-thrown to subscribers — this diverges from `PredictionService`'s throw-on-failure pattern (lines 83-85: `throw new UpstreamApiError(...)`) because SSE subscribers must not see connection-closing errors on transient failures. The initial-subscribe path (first fetch before any loop exists) MAY throw `NotFoundError`/`UpstreamApiError` since that maps to an HTTP error response before the stream upgrades (see controller below).

---

### `src/server/api/controllers/PredictionStreamController.ts` (controller, streaming)

**Analog:** `src/server/api/controllers/PredictionController.ts`

**Imports pattern** (lines 1-3):
```typescript
import type { Request, RequestHandler, Response } from "express";
import { NotFoundError, UpstreamApiError } from "../errors";
import type { PredictionStreamService } from "../services/PredictionStreamService";
```

**Query param validation pattern** (reuse `parseNumberParam` shape, lines 9-15 and controller body lines 44-54):
```typescript
function parseNumberParam(raw: unknown): number | undefined {
    if (raw === undefined) {
        return undefined;
    }
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

const getPredictionsStream: RequestHandler = async (req: Request, res: Response) => {
    const { stop } = req.query as Record<string, string | undefined>;
    if (!stop) {
        res.status(400).json({ error: "Bad Request", details: "stop parameter is required" });
        return;
    }
    // ... validate before upgrading to SSE, per code_context: "reuses this shape for the
    // initial connection-validation errors (e.g., unknown stop before upgrading to a stream)"
```

**Error-to-status mapping pattern** (lines 17-38, reuse verbatim for pre-stream validation errors):
```typescript
function resolveErrorStatus(error: unknown): number {
    if (error instanceof NotFoundError) {
        return 404;
    }
    if (error instanceof UpstreamApiError) {
        return 502;
    }
    return 500;
}

function resolveErrorBody(error: unknown): { error: string; details: string } {
    const details = error instanceof Error ? error.message : "Unknown error";
    let label: string;
    if (error instanceof NotFoundError) {
        label = "Not Found";
    } else if (error instanceof UpstreamApiError) {
        label = "Bad Gateway";
    } else {
        label = "Request Failed";
    }
    return { error: label, details };
}
```

**SSE-specific core pattern (new, no direct analog — standard Express SSE conventions per D-01/D-03/D-06):**
```typescript
const getPredictionsStream: RequestHandler = async (req: Request, res: Response) => {
    const { stop } = req.query as Record<string, string | undefined>;
    if (!stop) {
        res.status(400).json({ error: "Bad Request", details: "stop parameter is required" });
        return;
    }

    try {
        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        });

        const send = (payload: StopPredictionsResponse) => {
            res.write(`event: prediction\ndata: ${JSON.stringify(payload)}\n\n`); // D-03
        };

        const unsubscribe = streamService.subscribe(stop, send); // D-02: immediate push handled inside subscribe

        req.on("close", () => { // D-06
            unsubscribe();
            res.end();
        });
    } catch (error: unknown) {
        // Only reachable if subscribe() throws synchronously for invalid stop before headers sent
        res.status(resolveErrorStatus(error)).json(resolveErrorBody(error));
    }
};
```

---

### `src/server/api/routes/predictionRoutes.ts` (route, modified in place)

**Analog:** itself (existing file, extend rather than replace)

**Existing wiring pattern** (`src/server/api/routes/predictionRoutes.ts` lines 1-13, full file):
```typescript
import { Router } from "express";
import { createPredictionController } from "../controllers/PredictionController";
import { BusDataRepository } from "../repositories";
import { createPredictionService } from "../services/PredictionService";

const service = createPredictionService(BusDataRepository.getInstance());
const controller = createPredictionController(service);

const router = Router();

router.get("/", controller.getPredictions);

export default router;
```

**Extension pattern** — add the stream service/controller wiring alongside, mount the new SSE path per D-01 (Claude's discretion on exact path, e.g. `/stream`):
```typescript
import { createPredictionStreamController } from "../controllers/PredictionStreamController";
import { createPredictionStreamService } from "../services/PredictionStreamService";

const streamService = createPredictionStreamService(service); // reuses same PredictionService instance
const streamController = createPredictionStreamController(streamService);

router.get("/stream", streamController.getPredictionsStream); // exact path is Claude's discretion (D-01)
```

No changes needed to `src/server/api/routes/index.ts` — predictions already mounted at `/predictions` (lines 1-14), so the new route is reachable at `/api/v1/predictions/stream` (or whatever path chosen under D-01).

---

### `src/server/api/models/Prediction.ts` (model, modified)

**Analog:** itself — extend `StopPredictionsResponse` interface (lines 25-36) to add top-level `generatedAt` per D-07:
```typescript
export interface StopPredictionsResponse {
    success: boolean;
    generatedAt: string; // ISO 8601, e.g. "2026-08-27T14:20:15.042Z" — D-07, D-08
    data: {
        agencyKey: string;
        stop: {
            id: string;
            name: string;
            code: number;
        };
        routes: RoutePrediction[];
    };
}
```
No new interface needed for the SSE event payload — D-07 states the SSE `prediction` event uses the same shape (`{ success, generatedAt, data }`) as REST, so `StopPredictionsResponse` is reused directly as the SSE payload type.

---

### `src/server/api/services/PredictionService.ts` (service, modified — stamp `generatedAt`)

**Analog:** itself — modify the `getPredictionsForStop` return statement (lines 87-98):
```typescript
return {
    success: true,
    generatedAt: new Date().toISOString(), // D-07, D-08
    data: {
        agencyKey: dashResponse.data.agencyKey,
        stop: {
            id: stopId,
            name: stop.name,
            code: stop.code,
        },
        routes: mapToRoutePredictions(dashResponse.data.predictionsData),
    },
};
```
Per D-09, this call remains fully independent — no change to control flow, just an added field in the return payload. The stream service reuses this same stamped `generatedAt` per fetch (no separate stamping logic needed in `PredictionStreamService`).

## Shared Patterns

### Factory-function DI
**Source:** `src/server/api/services/StopService.ts` lines 15-52, `src/server/api/services/PredictionService.ts` lines 19-102
**Apply to:** `PredictionStreamService`, `PredictionStreamController`
```typescript
export function createX(dependency: Dependency): XInterface {
    function methodA() { /* ... */ }
    return { methodA };
}
```
Dependencies passed as parameters, never imported as globals (see CLAUDE.md "Do NOT import singletons directly in services").

### Error classification for HTTP status
**Source:** `src/server/api/controllers/PredictionController.ts` lines 17-38 (identical duplicate in `StopController.ts` lines 34-45)
**Apply to:** `PredictionStreamController` (for pre-stream-upgrade validation errors only — per D-04 the stream itself never emits an error event or closes on transient upstream failure)
```typescript
function resolveErrorStatus(error: unknown): number { /* NotFoundError -> 404, UpstreamApiError -> 502, else 500 */ }
function resolveErrorBody(error: unknown): { error: string; details: string } { /* ... */ }
```

### Numeric query param parsing
**Source:** `src/server/api/controllers/PredictionController.ts` lines 9-15 (`parseNumberParam`), `src/server/api/controllers/StopController.ts` lines 10-32 (`parseCoordinateParam`, `parsePositiveFloatParam`, `parseCountParam`)
**Apply to:** `PredictionStreamController` for any numeric query params (e.g. `number`, `route` passthrough to the stream)

### Custom error types
**Source:** `src/server/api/errors/index.ts` (full file, 14 lines)
**Apply to:** `PredictionStreamService` (throws `NotFoundError` for unknown stop before starting a loop; upstream fetch failures inside the poll loop are caught and logged per D-04, not re-thrown)

### Logger for failure logging
**Source:** `src/server/config/logger.ts` (Winston instance), usage example `src/server/api/services/PredictionService.ts` line 44 (`logger.info`)
**Apply to:** `PredictionStreamService` poll-loop failure path (D-04) — use `logger.error` with string interpolation per CLAUDE.md conventions: `logger.error(\`Failed to poll predictions for stop ${stopId}: ${message}\`)`

### Route mounting
**Source:** `src/server/api/routes/index.ts` (full file, 14 lines) — predictions already mounted at `/predictions`
**Apply to:** No change required; new SSE route added within `predictionRoutes.ts` under the existing mount.

## No Analog Found

None — every new file has a direct or close-role analog in the existing codebase (StopService/PredictionService for services, PredictionController/StopController for controllers, predictionRoutes.ts for routing). The SSE framing/streaming mechanics themselves have no in-repo precedent (first streaming endpoint in this project) and follow standard Express SSE conventions instead, as called out in `<specifics>` of 04-CONTEXT.md.

## Metadata

**Analog search scope:** `src/server/api/{services,controllers,routes,models,errors}/`, `src/server/config/`
**Files scanned:** 24 non-test TypeScript source files
**Pattern extraction date:** 2026-08-27
