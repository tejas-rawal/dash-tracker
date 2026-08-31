import { describe, expect, it, vi } from "vitest";
import { NotFoundError } from "../errors";
import { BusRoute, BusStop, type FavoriteRecord, RouteType } from "../models";
import { createFavoritesService } from "./FavoritesService";

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

const makeMockFavoritesRepository = () => ({
    upsertFavorite: vi.fn(),
    listFavorites: vi.fn(),
    deleteFavorite: vi.fn(),
});

const makeMockBusDataRepository = () => ({
    getRouteById: vi.fn(),
    getStopById: vi.fn(),
});

describe("FavoritesService", () => {
    describe("addFavorite", () => {
        it("calls busDataRepository.getRouteById when entityType is route", async () => {
            // Arrange
            const mockFavoritesRepo = makeMockFavoritesRepository();
            const mockBusDataRepo = makeMockBusDataRepository();
            mockBusDataRepo.getRouteById.mockReturnValue(makeRoute("route-1"));
            const { addFavorite } = createFavoritesService(mockFavoritesRepo as never, mockBusDataRepo as never);

            // Act
            await addFavorite("device-a", "route", "route-1");

            // Assert
            expect(mockBusDataRepo.getRouteById).toHaveBeenCalledWith("route-1");
        });

        it("calls busDataRepository.getStopById when entityType is stop", async () => {
            // Arrange
            const mockFavoritesRepo = makeMockFavoritesRepository();
            const mockBusDataRepo = makeMockBusDataRepository();
            mockBusDataRepo.getStopById.mockReturnValue(makeStop("stop-1"));
            const { addFavorite } = createFavoritesService(mockFavoritesRepo as never, mockBusDataRepo as never);

            // Act
            await addFavorite("device-a", "stop", "stop-1");

            // Assert
            expect(mockBusDataRepo.getStopById).toHaveBeenCalledWith("stop-1");
        });

        it("throws NotFoundError with entityType and entityId in the message when the route lookup returns undefined", async () => {
            // Arrange
            const mockFavoritesRepo = makeMockFavoritesRepository();
            const mockBusDataRepo = makeMockBusDataRepository();
            mockBusDataRepo.getRouteById.mockReturnValue(undefined);
            const { addFavorite } = createFavoritesService(mockFavoritesRepo as never, mockBusDataRepo as never);

            // Act & Assert
            await expect(addFavorite("device-a", "route", "unknown-route")).rejects.toThrowError(NotFoundError);
            await expect(addFavorite("device-a", "route", "unknown-route")).rejects.toThrowError(
                "route not found: unknown-route",
            );
        });

        it("throws NotFoundError when the stop lookup returns undefined", async () => {
            // Arrange
            const mockFavoritesRepo = makeMockFavoritesRepository();
            const mockBusDataRepo = makeMockBusDataRepository();
            mockBusDataRepo.getStopById.mockReturnValue(undefined);
            const { addFavorite } = createFavoritesService(mockFavoritesRepo as never, mockBusDataRepo as never);

            // Act & Assert
            await expect(addFavorite("device-a", "stop", "unknown-stop")).rejects.toThrowError(
                "stop not found: unknown-stop",
            );
        });

        it("does not call favoritesRepository.upsertFavorite when the entity does not resolve", async () => {
            // Arrange
            const mockFavoritesRepo = makeMockFavoritesRepository();
            const mockBusDataRepo = makeMockBusDataRepository();
            mockBusDataRepo.getRouteById.mockReturnValue(undefined);
            const { addFavorite } = createFavoritesService(mockFavoritesRepo as never, mockBusDataRepo as never);

            // Act
            await expect(addFavorite("device-a", "route", "unknown-route")).rejects.toThrowError(NotFoundError);

            // Assert
            expect(mockFavoritesRepo.upsertFavorite).not.toHaveBeenCalled();
        });

        it("calls favoritesRepository.upsertFavorite with deviceId, entityType, entityId on success", async () => {
            // Arrange
            const mockFavoritesRepo = makeMockFavoritesRepository();
            const mockBusDataRepo = makeMockBusDataRepository();
            mockBusDataRepo.getRouteById.mockReturnValue(makeRoute("route-1"));
            const { addFavorite } = createFavoritesService(mockFavoritesRepo as never, mockBusDataRepo as never);

            // Act
            await addFavorite("device-a", "route", "route-1");

            // Assert
            expect(mockFavoritesRepo.upsertFavorite).toHaveBeenCalledWith("device-a", "route", "route-1");
        });
    });

    describe("removeFavorite", () => {
        it("calls favoritesRepository.deleteFavorite with deviceId, entityType, entityId", async () => {
            // Arrange
            const mockFavoritesRepo = makeMockFavoritesRepository();
            const mockBusDataRepo = makeMockBusDataRepository();
            const { removeFavorite } = createFavoritesService(mockFavoritesRepo as never, mockBusDataRepo as never);

            // Act
            await removeFavorite("device-a", "route", "route-1");

            // Assert
            expect(mockFavoritesRepo.deleteFavorite).toHaveBeenCalledWith("device-a", "route", "route-1");
        });

        it("resolves without throwing for a device+entity that was never favorited", async () => {
            // Arrange
            const mockFavoritesRepo = makeMockFavoritesRepository();
            const mockBusDataRepo = makeMockBusDataRepository();
            const { removeFavorite } = createFavoritesService(mockFavoritesRepo as never, mockBusDataRepo as never);

            // Act & Assert
            await expect(removeFavorite("device-a", "stop", "unknown-stop")).resolves.not.toThrow();
        });

        it("does not perform any existence check via busDataRepository", async () => {
            // Arrange
            const mockFavoritesRepo = makeMockFavoritesRepository();
            const mockBusDataRepo = makeMockBusDataRepository();
            const { removeFavorite } = createFavoritesService(mockFavoritesRepo as never, mockBusDataRepo as never);

            // Act
            await removeFavorite("device-a", "route", "route-1");

            // Assert
            expect(mockBusDataRepo.getRouteById).not.toHaveBeenCalled();
            expect(mockBusDataRepo.getStopById).not.toHaveBeenCalled();
        });
    });

    describe("listFavorites", () => {
        const makeFavoriteRecord = (
            entityType: "route" | "stop",
            entityId: string,
            favoritedAt: string,
        ): FavoriteRecord => ({ deviceId: "device-a", entityType, entityId, favoritedAt });

        it("returns [] for a device with zero favorite rows", async () => {
            // Arrange
            const mockFavoritesRepo = makeMockFavoritesRepository();
            const mockBusDataRepo = makeMockBusDataRepository();
            mockFavoritesRepo.listFavorites.mockResolvedValue([]);
            const { listFavorites } = createFavoritesService(mockFavoritesRepo as never, mockBusDataRepo as never);

            // Act
            const result = await listFavorites("device-a");

            // Assert
            expect(result).toEqual([]);
        });

        it("returns hydrated {entityType, favoritedAt, entity} entries for a mixed route+stop list", async () => {
            // Arrange
            const mockFavoritesRepo = makeMockFavoritesRepository();
            const mockBusDataRepo = makeMockBusDataRepository();
            const route = makeRoute("route-1");
            const stop = makeStop("stop-1");
            mockFavoritesRepo.listFavorites.mockResolvedValue([
                makeFavoriteRecord("route", "route-1", "2026-08-31T10:00:00.000Z"),
                makeFavoriteRecord("stop", "stop-1", "2026-08-31T09:00:00.000Z"),
            ]);
            mockBusDataRepo.getRouteById.mockReturnValue(route);
            mockBusDataRepo.getStopById.mockReturnValue(stop);
            const { listFavorites } = createFavoritesService(mockFavoritesRepo as never, mockBusDataRepo as never);

            // Act
            const result = await listFavorites("device-a");

            // Assert
            expect(result).toEqual([
                { entityType: "route", favoritedAt: "2026-08-31T10:00:00.000Z", entity: route },
                { entityType: "stop", favoritedAt: "2026-08-31T09:00:00.000Z", entity: stop },
            ]);
        });

        it("preserves the repository's DESC order across mixed entity types without re-sorting", async () => {
            // Arrange
            const mockFavoritesRepo = makeMockFavoritesRepository();
            const mockBusDataRepo = makeMockBusDataRepository();
            mockFavoritesRepo.listFavorites.mockResolvedValue([
                makeFavoriteRecord("route", "route-1", "2026-08-31T12:00:00.000Z"),
                makeFavoriteRecord("stop", "stop-1", "2026-08-31T11:00:00.000Z"),
                makeFavoriteRecord("route", "route-2", "2026-08-31T10:00:00.000Z"),
            ]);
            mockBusDataRepo.getRouteById.mockImplementation((id: string) => makeRoute(id));
            mockBusDataRepo.getStopById.mockImplementation((id: string) => makeStop(id));
            const { listFavorites } = createFavoritesService(mockFavoritesRepo as never, mockBusDataRepo as never);

            // Act
            const result = await listFavorites("device-a");

            // Assert
            const timestamps = result.map((entry) => entry.favoritedAt);
            expect(timestamps).toEqual([...timestamps].sort().reverse());
            expect(timestamps).toEqual([
                "2026-08-31T12:00:00.000Z",
                "2026-08-31T11:00:00.000Z",
                "2026-08-31T10:00:00.000Z",
            ]);
        });

        it("silently omits an entry whose entityId no longer resolves via BusDataRepository", async () => {
            // Arrange
            const mockFavoritesRepo = makeMockFavoritesRepository();
            const mockBusDataRepo = makeMockBusDataRepository();
            mockFavoritesRepo.listFavorites.mockResolvedValue([
                makeFavoriteRecord("route", "route-1", "2026-08-31T10:00:00.000Z"),
                makeFavoriteRecord("route", "gone-route", "2026-08-31T09:00:00.000Z"),
            ]);
            mockBusDataRepo.getRouteById.mockImplementation((id: string) =>
                id === "route-1" ? makeRoute("route-1") : undefined,
            );
            const { listFavorites } = createFavoritesService(mockFavoritesRepo as never, mockBusDataRepo as never);

            // Act
            const result = await listFavorites("device-a");

            // Assert
            expect(result).toHaveLength(1);
            expect(result[0]?.entity).toEqual(makeRoute("route-1"));
        });

        it("returns all 100 entries with no cap/slice when all 100 mocked records resolve", async () => {
            // Arrange
            const mockFavoritesRepo = makeMockFavoritesRepository();
            const mockBusDataRepo = makeMockBusDataRepository();
            const records = Array.from({ length: 100 }, (_, i) =>
                makeFavoriteRecord("route", `route-${i}`, new Date(2026, 0, 1, 0, 0, i).toISOString()),
            );
            mockFavoritesRepo.listFavorites.mockResolvedValue(records);
            mockBusDataRepo.getRouteById.mockImplementation((id: string) => makeRoute(id));
            const { listFavorites } = createFavoritesService(mockFavoritesRepo as never, mockBusDataRepo as never);

            // Act
            const result = await listFavorites("device-a");

            // Assert
            expect(result).toHaveLength(100);
        });
    });
});
