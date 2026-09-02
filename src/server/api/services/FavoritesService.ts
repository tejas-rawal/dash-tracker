import { NotFoundError } from "../errors";
import type { BusRoute, BusStop, EntityType, HydratedFavorite } from "../models";
import type { BusDataRepository } from "../repositories/BusDataRepository";
import type { FavoritesRecentsRepository } from "../repositories/FavoritesRecentsRepository";

export interface FavoritesService {
    addFavorite(deviceId: string, entityType: EntityType, entityId: string): Promise<void>;
    removeFavorite(deviceId: string, entityType: EntityType, entityId: string): Promise<void>;
    listFavorites(deviceId: string): Promise<HydratedFavorite[]>;
}

export function createFavoritesService(
    favoritesRepository: FavoritesRecentsRepository,
    busDataRepository: BusDataRepository,
): FavoritesService {
    function resolveEntity(entityType: EntityType, entityId: string): BusRoute | BusStop | undefined {
        return entityType === "route"
            ? busDataRepository.getRouteById(entityId)
            : busDataRepository.getStopById(entityId);
    }

    async function addFavorite(deviceId: string, entityType: EntityType, entityId: string): Promise<void> {
        const entity = resolveEntity(entityType, entityId);
        if (!entity) {
            throw new NotFoundError(`${entityType} not found: ${entityId}`);
        }
        await favoritesRepository.upsertFavorite(deviceId, entityType, entityId);
    }

    async function removeFavorite(deviceId: string, entityType: EntityType, entityId: string): Promise<void> {
        await favoritesRepository.deleteFavorite(deviceId, entityType, entityId);
    }

    async function listFavorites(deviceId: string): Promise<HydratedFavorite[]> {
        const records = await favoritesRepository.listFavorites(deviceId);
        return records
            .map((record): HydratedFavorite | undefined => {
                const entity = resolveEntity(record.entityType, record.entityId);
                return entity ? { entityType: record.entityType, favoritedAt: record.favoritedAt, entity } : undefined;
            })
            .filter((entry): entry is HydratedFavorite => entry !== undefined);
    }

    return { addFavorite, removeFavorite, listFavorites };
}
