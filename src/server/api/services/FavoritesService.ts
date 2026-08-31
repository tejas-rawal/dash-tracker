import { NotFoundError } from "../errors";
import type { BusRoute, BusStop, EntityType } from "../models";
import type { BusDataRepository } from "../repositories/BusDataRepository";
import type { FavoritesRecentsRepository } from "../repositories/FavoritesRecentsRepository";

export interface FavoritesService {
    addFavorite(deviceId: string, entityType: EntityType, entityId: string): Promise<void>;
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

    return { addFavorite };
}
