import type { BusRoute } from "./BusRoute";
import type { BusStop } from "./BusStop";

export type EntityType = "route" | "stop";

export interface FavoriteRecord {
    deviceId: string;
    entityType: EntityType;
    entityId: string;
    favoritedAt: string;
}

export interface RecentRecord {
    deviceId: string;
    entityType: EntityType;
    entityId: string;
    viewedAt: string;
}

export interface HydratedFavorite {
    entityType: EntityType;
    favoritedAt: string;
    entity: BusRoute | BusStop;
}
