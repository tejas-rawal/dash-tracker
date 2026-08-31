import { describe, expect, it, vi } from "vitest";
import { NotFoundError } from "../errors";
import { BusRoute, BusStop, RouteType } from "../models";
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
});
