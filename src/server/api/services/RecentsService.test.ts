import { describe, expect, it, vi } from "vitest";
import { BusRoute, BusStop, type RecentRecord, RouteType } from "../models";
import { createRecentsService } from "./RecentsService";

const makeRoute = (id = "route-1") =>
    new BusRoute({
        id,
        longName: `Route ${id} Long`,
        shortName: id,
        name: `Route ${id}`,
        type: RouteType.Bus,
        directions: [],
    });

const makeStop = (id = "stop-1") => new BusStop({ id, name: `Stop ${id}`, code: 101, lat: 38.8, lon: -77.1 });

const makeMockRecentsRepository = () => ({
    upsertRecent: vi.fn(),
    listRecents: vi.fn(),
});

const makeMockBusDataRepository = () => ({
    getRouteById: vi.fn(),
    getStopById: vi.fn(),
});

describe("RecentsService", () => {
    describe("listRecents", () => {
        const makeRecentRecord = (entityType: "route" | "stop", entityId: string, viewedAt: string): RecentRecord => ({
            deviceId: "device-a",
            entityType,
            entityId,
            viewedAt,
        });

        it("returns [] for a device with zero recent rows", async () => {
            // Arrange
            const mockRecentsRepo = makeMockRecentsRepository();
            const mockBusDataRepo = makeMockBusDataRepository();
            mockRecentsRepo.listRecents.mockResolvedValue([]);
            const { listRecents } = createRecentsService(mockRecentsRepo as never, mockBusDataRepo as never);

            // Act
            const result = await listRecents("device-a");

            // Assert
            expect(result).toEqual([]);
        });

        it("returns hydrated {entityType, viewedAt, entity} entries for a mixed route+stop list", async () => {
            // Arrange
            const mockRecentsRepo = makeMockRecentsRepository();
            const mockBusDataRepo = makeMockBusDataRepository();
            const route = makeRoute("route-1");
            const stop = makeStop("stop-1");
            mockRecentsRepo.listRecents.mockResolvedValue([
                makeRecentRecord("route", "route-1", "2026-08-31T10:00:00.000Z"),
                makeRecentRecord("stop", "stop-1", "2026-08-31T09:00:00.000Z"),
            ]);
            mockBusDataRepo.getRouteById.mockReturnValue(route);
            mockBusDataRepo.getStopById.mockReturnValue(stop);
            const { listRecents } = createRecentsService(mockRecentsRepo as never, mockBusDataRepo as never);

            // Act
            const result = await listRecents("device-a");

            // Assert
            expect(result).toEqual([
                { entityType: "route", viewedAt: "2026-08-31T10:00:00.000Z", entity: route },
                { entityType: "stop", viewedAt: "2026-08-31T09:00:00.000Z", entity: stop },
            ]);
        });

        it("preserves the repository's DESC order across mixed entity types without re-sorting", async () => {
            // Arrange
            const mockRecentsRepo = makeMockRecentsRepository();
            const mockBusDataRepo = makeMockBusDataRepository();
            mockRecentsRepo.listRecents.mockResolvedValue([
                makeRecentRecord("route", "route-1", "2026-08-31T12:00:00.000Z"),
                makeRecentRecord("stop", "stop-1", "2026-08-31T11:00:00.000Z"),
                makeRecentRecord("route", "route-2", "2026-08-31T10:00:00.000Z"),
            ]);
            mockBusDataRepo.getRouteById.mockImplementation((id: string) => makeRoute(id));
            mockBusDataRepo.getStopById.mockImplementation((id: string) => makeStop(id));
            const { listRecents } = createRecentsService(mockRecentsRepo as never, mockBusDataRepo as never);

            // Act
            const result = await listRecents("device-a");

            // Assert
            const timestamps = result.map((entry) => entry.viewedAt);
            expect(timestamps).toEqual([...timestamps].sort().reverse());
            expect(timestamps).toEqual([
                "2026-08-31T12:00:00.000Z",
                "2026-08-31T11:00:00.000Z",
                "2026-08-31T10:00:00.000Z",
            ]);
        });

        it("silently omits an entry whose entityId no longer resolves via BusDataRepository", async () => {
            // Arrange
            const mockRecentsRepo = makeMockRecentsRepository();
            const mockBusDataRepo = makeMockBusDataRepository();
            mockRecentsRepo.listRecents.mockResolvedValue([
                makeRecentRecord("route", "route-1", "2026-08-31T10:00:00.000Z"),
                makeRecentRecord("route", "gone-route", "2026-08-31T09:00:00.000Z"),
            ]);
            mockBusDataRepo.getRouteById.mockImplementation((id: string) =>
                id === "route-1" ? makeRoute("route-1") : undefined,
            );
            const { listRecents } = createRecentsService(mockRecentsRepo as never, mockBusDataRepo as never);

            // Act
            const result = await listRecents("device-a");

            // Assert
            expect(result).toHaveLength(1);
            expect(result[0]?.entity).toEqual(makeRoute("route-1"));
        });

        it("returns all 100 entries with no cap/slice when all 100 mocked records resolve", async () => {
            // Arrange
            const mockRecentsRepo = makeMockRecentsRepository();
            const mockBusDataRepo = makeMockBusDataRepository();
            const records = Array.from({ length: 100 }, (_, i) =>
                makeRecentRecord("route", `route-${i}`, new Date(2026, 0, 1, 0, 0, i).toISOString()),
            );
            mockRecentsRepo.listRecents.mockResolvedValue(records);
            mockBusDataRepo.getRouteById.mockImplementation((id: string) => makeRoute(id));
            const { listRecents } = createRecentsService(mockRecentsRepo as never, mockBusDataRepo as never);

            // Act
            const result = await listRecents("device-a");

            // Assert
            expect(result).toHaveLength(100);
        });
    });
});
