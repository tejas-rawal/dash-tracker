# Phase 15: Alert & Nearby Data Hygiene - Pattern Map

**Mapped:** 2026-10-07
**Files analyzed:** 6 (3 source modified, 2 tests extended, 1 optional new cross-layer test)
**Analogs found:** 6 / 6

All paths below are git-tracked (`git ls-files src/server` verified). No mirrors.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/server/api/models/ServiceAlert.ts` (modify: `DashAlertEntity.deletedAt`) | model | transform (upstream shape) | itself, `DashAlertEntity` lines 28-40 | exact (self) |
| `src/server/api/services/ServiceAlertService.ts` (modify: deleted filter, date validation, per-alert drop + warn) | service | batch ingestion / transform | `src/server/api/services/VehicleService.ts` lines 40-51 (per-item drop + warn naming id); `NearbyPredictionService.ts` lines 128-136 (filter + warn) | role + data-flow match |
| `src/server/api/services/ServiceAlertService.test.ts` (extend) | test | batch / transform | itself (fixtures lines 19-32), `VehicleService.test.ts` lines 217-235 (warn-count + id assertion) | exact |
| `src/server/api/services/NearbyPredictionService.ts` (modify: `isValidNearbyEntry`) | service (guard) | request-response / transform | itself, `isValidPrediction` lines 24-35 and `isValidNearbyEntry` lines 37-60 | exact (self) |
| `src/server/api/services/NearbyPredictionService.test.ts` (extend) | test | request-response | itself, `describe("malformed entries")` lines 490-564 (`it.each` table) | exact |
| Optional: `src/server/api/routes/alertHygiene.test.ts` (new, cross-layer: real `ServiceAlertService` → real `ServiceAlertRepository` → route/stop/nearby endpoints) | test (integration) | request-response over fake DASH | `src/server/api/routes/dataReload.test.ts` (fake DASH HTTP server); `predictionRoutes.test.ts` lines 500-581 (real alert singleton on nearby) | role-match |

Not modified (D-06, D-14, context): `ServiceAlertRepository.ts`, `ServiceAlertPollService.ts`, `filterValidEntries`, `describeEntry`, `parseDashResponse`.

---

## Pattern Assignments

### `src/server/api/models/ServiceAlert.ts` (model, transform)

**Analog:** itself. Current `DashAlertEntity` (lines 28-40):
```typescript
// Confirmed live shape (G-05-5): a flat, custom Swiftly/Alexandria alerts format, not the
// nested GTFS-RT-protobuf-derived shape originally assumed — no `alert` sub-object, and
// headerText/descriptionText/url are plain strings, not {translation:[...]} wrappers.
export interface DashAlertEntity {
    id: string;
    cause?: string;
    effect?: string;
    headerText?: string | null;
    descriptionText?: string | null;
    url?: string | null;
    activePeriods?: DashActivePeriod[];
    informedEntities?: DashInformedEntity[];
}
```
`DashActivePeriod` (lines 18-21) is `start?: string | null; end?: string | null;`.

**Change (D-08):** add `deletedAt?: unknown;` to `DashAlertEntity` only. `ServiceAlert` (lines 6-16) does NOT gain a field (D-05). No existing model in `src/server/api/models/` uses `unknown` yet (grep confirmed), so this is the first; keep a one-line "why" comment (value is never parsed; any non-null value means deleted).

**Typecheck note for planner (tests run with `--typecheck`):** D-03 treats a non-string `start`/`end` as malformed. With `DashActivePeriod` typed `string | null`, a test fixture like `{ start: 123 }` will not typecheck through `makeDashAlertEntity(overrides: Partial<DashAlertEntity>)`. Two options (Claude's discretion):
1. Widen `DashActivePeriod.start/end` to `unknown` (honest about upstream, matches `deletedAt?: unknown`), and the validator narrows them; or
2. Keep the type and cast in the test, mirroring the nearby test's `Record<string, unknown>` + `as DashNearbyPredictionData` pattern (`NearbyPredictionService.test.ts` lines 27-53).

---

### `src/server/api/services/ServiceAlertService.ts` (service, batch ingestion)

**Analog A (self, to be modified):**

Imports (lines 1-9):
```typescript
import { axios, environment, logger } from "../../config";
import { UpstreamApiError } from "../errors";
import type {
    DashActivePeriod,
    DashAlertEntity,
    DashAlertsApiResponse,
    ServiceAlert,
    ServiceAlertActivePeriod,
} from "../models/ServiceAlert";
```

Structural guard that stays (D-07), lines 53-55:
```typescript
function isValidDashAlertEntity(entity: unknown): entity is DashAlertEntity {
    return typeof entity === "object" && entity !== null && typeof (entity as DashAlertEntity).id === "string";
}
```

The bug being fixed: `deriveActiveWindow` (lines 57-78) calls `new Date(s).getTime()` with no NaN check, so `new Date(NaN).toISOString()` throws `RangeError` and fails the whole poll:
```typescript
// D-02: multiple active_period entries collapse to earliest start / latest end.
// D-03: zero/undefined periods -> {start: null, end: null} (always-active, never expires).
function deriveActiveWindow(periods: DashActivePeriod[] | undefined): ServiceAlertActivePeriod {
    if (!periods || periods.length === 0) {
        return { start: null, end: null };
    }

    const starts = periods.map((p) => p.start).filter((s): s is string => s != null);
    const anyOpenEnded = periods.some((p) => p.end == null);
    const ends = periods.map((p) => p.end).filter((e): e is string => e != null);

    return {
        start:
            starts.length > 0
                ? new Date(Math.min(...starts.map((s) => new Date(s).getTime()))).toISOString()
                : null,
        end:
            !anyOpenEnded && ends.length > 0
                ? new Date(Math.max(...ends.map((e) => new Date(e).getTime()))).toISOString()
                : null,
    };
}
```
Note the existing comments' "D-02/D-03" refer to Phase 8 decisions, not Phase 15's; don't collide when adding new comments.

`mapToServiceAlert` (lines 80-99) calls `deriveActiveWindow(entity.activePeriods)` at line 97.

Insertion point, `fetchAlerts` (lines 101-122). The new per-alert filter goes between the `every(isValidDashAlertEntity)` check (line 115) and the `map` (line 121):
```typescript
if (!response.entities.every(isValidDashAlertEntity)) {
    throw new UpstreamApiError(
        "DASH API returned a malformed service alerts response (entity item is malformed)",
    );
}

return response.entities.map(mapToServiceAlert);
```
Required order per entity: (1) `deletedAt != null` → drop silently (D-08, D-09, D-10); (2) any period with a present `start`/`end` that is non-string or `Number.isNaN(new Date(s).getTime())` → drop the whole alert + one `logger.warn` naming the alert id and which bound (D-02, D-03, D-04); (3) otherwise map. `null`/`undefined` bounds stay unbounded.

**Analog B: per-item drop + warn naming the id.** `src/server/api/services/VehicleService.ts` lines 40-51:
```typescript
function mapToVehiclePositions(vehicles: DashVehicle[]): VehiclePosition[] {
    return vehicles
        .filter((vehicle) => {
            const valid =
                isValidCoordinate(vehicle.loc?.lat) &&
                isValidCoordinate(vehicle.loc?.lon) &&
                isValidCoordinate(vehicle.loc?.time);
            if (!valid) {
                logger.warn(`Dropping vehicle ${vehicle.id} with invalid loc data`);
            }
            return valid;
        })
        .map((vehicle) => ({ /* ... */ }));
}
```
Copy this shape (filter → warn → map). Suggested warn wording in the same voice: ``logger.warn(`Dropping service alert ${entity.id} with malformed activePeriods ${bound}`)`` where `bound` is `"start"` / `"end"`. Message-only: never interpolate the raw entity or raw date value (Phase 12 D-06/D-12).

**Analog C: typed guard helpers.** `NearbyPredictionService.ts` lines 16-22 (module-level, outside the factory):
```typescript
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}
```
A small `isParseableDate(value: unknown): boolean` (or a helper returning the bad bound) can follow the same `typeof`-based style. No Zod (Phase 11 D-18 style).

---

### `src/server/api/services/ServiceAlertService.test.ts` (test)

**Analog:** itself.

Config mock + imports (lines 1-17):
```typescript
import { describe, expect, it, vi } from "vitest";
import { UpstreamApiError } from "../errors";
import type { DashAlertEntity, DashAlertsApiResponse } from "../models/ServiceAlert";

vi.mock("../../config", () => ({
    axios: { get: vi.fn() },
    environment: {
        dashApi: { agency: "alexandria-dash", baseUrl: "https://api.goswift.ly", apiKey: "key" },
        server: { port: 3000 },
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { axios, logger } from "../../config";
import { createServiceAlertService } from "./ServiceAlertService";

const mockAxiosGet = vi.mocked(axios.get);
```

Fixtures to extend (lines 19-32). Extend these; don't invent a new shape:
```typescript
const makeDashAlertEntity = (overrides: Partial<DashAlertEntity> = {}, id = "alert-1"): DashAlertEntity => ({
    id,
    activePeriods: [{ start: "2023-11-14T22:13:20.000Z", end: "2023-11-14T23:13:20.000Z" }],
    informedEntities: [{ routeId: "route-1", stopId: "stop-1" }],
    cause: "MAINTENANCE",
    effect: "DETOUR",
    headerText: "Detour on Route 1",
    descriptionText: "Bus detoured due to road work",
    ...overrides,
});

const makeDashAlertsApiResponse = (entities: DashAlertEntity[] = []): DashAlertsApiResponse => ({ entities });
```

Test shape (Arrange/Act/Assert comments, one factory per test), lines 179-196:
```typescript
it("collapses two active period entries to {start: earliest start, end: latest end} (D-02)", async () => {
    // Arrange
    const entity = makeDashAlertEntity({ activePeriods: [ /* ... */ ] });
    mockAxiosGet.mockResolvedValue({ data: makeDashAlertsApiResponse([entity]) });
    const { fetchAlerts } = createServiceAlertService();

    // Act
    const [alert] = await fetchAlerts();

    // Assert
    expect(alert.activePeriod.start).toBe("2023-11-14T19:13:20.000Z");
});
```

D-07 regression already covered (keep these passing): lines 311-327, a `null` entity or one missing `id` → `rejects.toThrow(UpstreamApiError)`.

**Required infra change:** this file has **no `beforeEach(vi.clearAllMocks)`**, and `vitest.config.mts` sets no `clearMocks`/`restoreMocks`. The existing test at line 74-85 already calls `logger.warn`. Any new `toHaveBeenCalledTimes` / `not.toHaveBeenCalled` assertion on `logger.warn` needs either a `beforeEach(() => { vi.clearAllMocks(); })` (copy `NearbyPredictionService.test.ts` lines 142-144 and add `beforeEach` to the vitest import) or a per-test `mockClear()` (copy `VehicleService.test.ts` line 219: `mockLoggerWarn.mockClear();`). Prefer the `beforeEach` because it's file-wide. Add `const mockLoggerWarn = vi.mocked(logger.warn);` next to `mockAxiosGet`.

**Warn assertion pattern:** `VehicleService.test.ts` lines 217-235:
```typescript
expect(result.data.vehicles).toEqual([]);
expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining("1550"));
```

Cases the planner should cover (map to decisions):
- `deletedAt` set to a past ISO date, future ISO date, garbled string, `""`, a number, `{}` → dropped, other alerts kept, `mockLoggerWarn` not called (D-08, D-09). `it.each` table style, see the nearby test lines 493-553.
- `deletedAt: null` / omitted → kept (D-08).
- Deleted + malformed date → dropped with no warn (D-10).
- Malformed `start` only, `end` only, non-string bound (number), one bad period among good periods → whole alert dropped, exactly one warn containing the alert id, sibling alerts returned (D-01, D-02, D-04).
- Non-ISO but parseable string (for example `"2025-03-09 13:00"` or an RFC 2822 date) → kept (D-03: strict ISO not required).
- Output invariant (D-06): for every returned alert, `activePeriod.start`/`end` is `null` or `new Date(x).toISOString() === x`.
- Two consecutive `fetchAlerts()` calls with the same bad alert → two warns (stateless, D-04).

---

### `src/server/api/services/NearbyPredictionService.ts` (service guard)

**Analog:** itself.

Style to copy, `isValidPrediction` (lines 24-35):
```typescript
// Checks exactly the five fields the shared mapping copies. Values are never coerced, so a
// wrong-typed field rejects the prediction rather than being served as a made-up arrival.
function isValidPrediction(prediction: unknown): boolean {
    return (
        isRecord(prediction) &&
        isFiniteNumber(prediction.min) &&
        isFiniteNumber(prediction.sec) &&
        isFiniteNumber(prediction.time) &&
        typeof prediction.tripId === "string" &&
        typeof prediction.vehicleId === "string"
    );
}
```

Function to extend, `isValidNearbyEntry` (lines 37-60):
```typescript
function isValidNearbyEntry(entry: unknown): entry is DashNearbyPredictionData {
    if (!isRecord(entry)) {
        return false;
    }
    const { stopId, distanceToStop, destinations } = entry;
    return (
        typeof stopId === "string" &&
        stopId !== "" &&
        typeof distanceToStop === "number" &&
        Number.isFinite(distanceToStop) &&
        distanceToStop >= 0 &&
        Array.isArray(destinations) &&
        destinations.every(
            (destination) =>
                isRecord(destination) &&
                Array.isArray(destination.predictions) &&
                destination.predictions.every(isValidPrediction),
        )
    );
}
```
Additions:
- D-11: destructure `routeId, routeName, routeShortName, stopName`, each a non-empty string (`typeof x === "string" && x !== ""`, same as `stopId`). A module-level `isNonEmptyString(value: unknown): value is string` next to `isRecord`/`isFiniteNumber` (lines 16-22) is allowed (Claude's discretion) and can also replace the inline `stopId` check.
- D-12: `isFiniteNumber(stopCode)`.
- D-13: inside the `destinations.every(...)` callback, add `isNonEmptyString(destination.directionId) && isNonEmptyString(destination.headsign)`.
- Update the comment block (lines 37-40) to say the guard now also covers the display fields that `groupByStop` (lines 144-150: `entry.stopName`, `entry.stopCode`) and `mapToRoutePrediction` copy.

Keep unchanged (D-14, D-15): `describeEntry` (lines 62-68), `filterValidEntries` (lines 128-136, single `logger.warn(\`Dropping malformed nearby prediction entry (${describeEntry(entry)})\`)`), and `parseDashResponse` agencyKey check (lines 120-124).

---

### `src/server/api/services/NearbyPredictionService.test.ts` (test)

**Analog:** itself.

Mock setup (lines 6-20). This file already has `beforeEach(() => { vi.clearAllMocks(); })` at lines 142-144 and `mockLoggerWarn` at line 20.

Fixture (lines 27-53). It accepts `Record<string, unknown>` overrides and casts, so wrong-typed values typecheck:
```typescript
const makeDashNearbyPredictionData = (overrides: Record<string, unknown> = {}): DashNearbyPredictionData =>
    ({
        routeShortName: "30",
        routeName: "30 - DUKE",
        routeId: "30",
        stopId: "548",
        stopName: "King St + N Washington St",
        stopCode: 4000858,
        destinations: [ /* two live destinations */ ],
        distanceToStop: 46.5,
        ...overrides,
    }) as DashNearbyPredictionData;
```

Extend the existing table in `describe("malformed entries")`, lines 493-564. Add rows only, because the assertion body already proves "drops, warns once, keeps valid entries":
```typescript
it.each([
    { label: "a numeric stopId", entry: makeDashNearbyPredictionData({ stopId: 548 }) },
    { label: "an empty stopId", entry: makeDashNearbyPredictionData({ stopId: "" }) },
    { label: "a missing stopId", entry: makeDashNearbyPredictionData({ stopId: undefined }) },
    // ...
])("drops an entry with $label, warns once, and keeps valid entries", async ({ entry }) => {
    // Arrange
    resolveUpstream(makeDashNearbyApiResponse([entry, validEntry()]));
    const { getNearbyPredictions } = createNearbyPredictionService(makeMockAlertRepo() as never);
    // Act
    const result = await getNearbyPredictions(LAT, LNG);
    // Assert
    expect(result.data.stops.map((stop) => stop.id)).toEqual(["561"]);
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
});
```
New rows: missing / empty / numeric for each of `routeId`, `routeName`, `routeShortName`, `stopName`; `stopCode` as a string `"4000858"`, `null`, `NaN`, `Infinity`, missing; a destination with an empty or missing `directionId`, an empty or numeric `headsign`, and a bad second destination (copy the two-destination row at lines 540-552). Keep `stopCode: 0` / negative as **valid** (D-12: no integer or sign rule), which could be one positive test.

Warn-text test (D-14 unchanged): optionally assert `expect(mockLoggerWarn).toHaveBeenCalledWith("Dropping malformed nearby prediction entry (stop 548, route 30)")` for a bad `stopName` row. A missing `routeShortName` renders as `route unknown` via `describeEntry`.

**D-15 (agencyKey) coverage already exists, so no new test is needed:**
- Unit: `NearbyPredictionService.test.ts` lines 461-487, `it.each` rows `"a body without data.agencyKey"` (lines 472-475) and `"a non-string agencyKey"` (lines 476-479) → `rejects.toBeInstanceOf(UpstreamApiError)`.
- Happy-path copy: lines 421-436 (`result.data.agencyKey).toBe("other-agency")`).
- Route-level 502 mapping for malformed bodies: `predictionRoutes.test.ts` lines 618-629 (missing `predictionsData`). There is no route-level agencyKey-specific case, but the unit coverage plus the shared `UpstreamApiError` → 502 mapping in `errorResponse.ts` is enough.

---

### Optional: `src/server/api/routes/alertHygiene.test.ts` (integration test, new)

Only needed if the planner wants success criterion 1 proven end to end (ingestion → repository → route/stop/nearby responses). Because filtering happens at one choke point (D-05), service-level tests plus the existing consumer tests are logically enough. Today **no test chains real `ServiceAlertService.fetchAlerts()` output into an endpoint**.

**Analog A (fake DASH HTTP server + real singletons):** `src/server/api/routes/dataReload.test.ts`.
- Server: lines 9-26 (`startFakeDash`, URL switch on `req.url`, mutable `reply`). Extend the switch for `/real-time/test-agency/gtfs-rt-alerts/v2?format=json` (agency is `test-agency` from `src/server/test/setup.ts`).
- Route fixture: lines 28-49 (`makeDashRoute`, `routesReply`).
- Lifecycle: lines 58-79 (point `axios.defaults.baseURL` at the fake server, spy and silence `logger.info/warn/error`, `vi.restoreAllMocks()` in `afterEach`).
- Flow: `await BusDataRepository.getInstance().load()`, then `ServiceAlertRepository.getInstance().applyAlerts(await createServiceAlertService().fetchAlerts())`, then `request(app).get("/api/v1/routes/1A")` (route alerts via `BusRouteService.attachAlerts`, `BusRouteService.ts` line 20), `/api/v1/routes/1A/stops` (stop alerts, `StopService.ts` line 23), and `/api/v1/stops/nearby?...` (`StopService.ts` line 55).
- Singleton caveat (dataReload line 81, upstreamTimeout lines 55-56): every route module shares the singletons `test/app.ts` was built on, so use a new file rather than adding to `dataReload.test.ts` / `upstreamTimeout.test.ts`. `upstreamTimeout.test.ts` relies on data never loading.

**Analog B (real alert singleton on the nearby endpoint):** `predictionRoutes.test.ts` lines 515-581. It uses `vi.spyOn(axios, "get")`, `ServiceAlertRepository.getInstance().applyAlerts([...])`, and an `afterEach` that resets with `applyAlerts([])`. A nearby case in the new file can mirror lines 566-581 with alerts produced by the real `fetchAlerts()` (one deleted, one malformed-date, one good) and assert that only the good id appears on the stop.

**Analog C (real service wired to the real repo):** `upstreamTimeout.test.ts` lines 196-199: `createServiceAlertPollService(createServiceAlertService(), ServiceAlertRepository.getInstance())`.

---

## Shared Patterns

### Message-only warn logging
**Source:** `VehicleService.ts` line 48, `NearbyPredictionService.ts` line 132, `ServiceAlertPollService.ts` lines 26-27.
**Apply to:** the new malformed-date warn in `ServiceAlertService`.
Format: `Dropping <thing> <id> <reason>`, as a template string with an id and a short reason. Never log raw upstream objects or values (Phase 12 D-06/D-12). The deleted-alert drop logs nothing (D-09).

### Hand-rolled `typeof` guards (no Zod)
**Source:** `NearbyPredictionService.ts` lines 16-35 (`isRecord`, `isFiniteNumber`, `isValidPrediction`); `VehicleService.ts` lines 36-38 (`isValidCoordinate`).
**Apply to:** the date-validity helper in `ServiceAlertService` and `isNonEmptyString` in `NearbyPredictionService`. These are module-level pure functions with `value: unknown` params and type-predicate returns.

### Filter-and-warn per item, keep the rest
**Source:** `NearbyPredictionService.filterValidEntries` lines 128-136; `VehicleService.mapToVehiclePositions` lines 40-51.
**Apply to:** the `fetchAlerts()` per-alert drop (D-01). This deliberately contrasts with the whole-poll `UpstreamApiError` throw kept for missing ids (D-07, lines 115-119).

### Logger mocking in unit tests
**Source:** `vi.mock("../../config", () => ({ ..., logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))` in `ServiceAlertService.test.ts` lines 5-12, `NearbyPredictionService.test.ts` lines 6-13, and `ServiceAlertPollService.test.ts` lines 4-6; `const mockLoggerWarn = vi.mocked(logger.warn);` in `NearbyPredictionService.test.ts` line 20. Reset with `beforeEach(() => { vi.clearAllMocks(); })` (Nearby lines 142-144).
**Integration tests:** `vi.spyOn(logger, "warn").mockImplementation(() => logger)` + `vi.restoreAllMocks()` (`dataReload.test.ts` lines 71-79).

### Test style
Arrange / Act / Assert comments in every test; `it.each([{ label, ... }])("... $label ...")` tables for guard variants; factory fixtures (`makeX`) with overrides, never inline full literals.

## No Analog Found

None. Every file has a direct analog. The only gap is a missing **existing** end-to-end test of ingestion → endpoint for alerts (see the optional integration test above).

## Metadata

**Analog search scope:** `src/server/api/{models,services,repositories,routes}`, `src/server/test`, `vitest.config.mts`
**Files scanned:** 14 (ServiceAlert.ts, ServiceAlertService(.test).ts, NearbyPredictionService(.test).ts, ServiceAlertRepository.ts, ServiceAlertPollService(.test).ts, VehicleService(.test).ts, predictionRoutes.test.ts, upstreamTimeout.test.ts, dataReload.test.ts, busRoutes.test.ts, BusRouteService.ts, StopService.ts, serviceAlertMapping.ts, test/app.ts, test/setup.ts)
**Pattern extraction date:** 2026-10-07
