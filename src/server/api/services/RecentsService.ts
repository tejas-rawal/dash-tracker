import type { BusRoute, BusStop, EntityType, HydratedRecent } from "../models";
import type { BusDataRepository } from "../repositories/BusDataRepository";
import type { FavoritesRecentsRepository } from "../repositories/FavoritesRecentsRepository";

export interface RecentsService {
    listRecents(deviceId: string): Promise<HydratedRecent[]>;
}

export function createRecentsService(
    recentsRepository: FavoritesRecentsRepository,
    busDataRepository: BusDataRepository,
): RecentsService {
    function resolveEntity(entityType: EntityType, entityId: string): BusRoute | BusStop | undefined {
        return entityType === "route"
            ? busDataRepository.getRouteById(entityId)
            : busDataRepository.getStopById(entityId);
    }

    async function listRecents(deviceId: string): Promise<HydratedRecent[]> {
        const records = await recentsRepository.listRecents(deviceId);
        return records
            .map((record): HydratedRecent | undefined => {
                const entity = resolveEntity(record.entityType, record.entityId);
                return entity ? { entityType: record.entityType, viewedAt: record.viewedAt, entity } : undefined;
            })
            .filter((entry): entry is HydratedRecent => entry !== undefined);
    }

    return { listRecents };
}
