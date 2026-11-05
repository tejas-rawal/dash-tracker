import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { environment, logger } from "../../config";
import type { EntityType, FavoriteRecord, RecentRecord } from "../models";

type DatabaseInstance = InstanceType<typeof Database>;

const BUSY_TIMEOUT_MS = 5000;

const FAVORITES_TABLE_SQL =
    "CREATE TABLE IF NOT EXISTS favorites (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL, entity_type TEXT NOT NULL CHECK (entity_type IN ('route', 'stop')), entity_id TEXT NOT NULL, favorited_at TEXT NOT NULL, UNIQUE (device_id, entity_type, entity_id))";

const RECENTS_TABLE_SQL =
    "CREATE TABLE IF NOT EXISTS recents (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL, entity_type TEXT NOT NULL CHECK (entity_type IN ('route', 'stop')), entity_id TEXT NOT NULL, viewed_at TEXT NOT NULL, UNIQUE (device_id, entity_type, entity_id))";

export class FavoritesRecentsRepository {
    private db: DatabaseInstance | null = null;
    private isInitialized = false;

    private static instance: FavoritesRecentsRepository;

    private constructor() {}

    // Singleton pattern
    public static getInstance(): FavoritesRecentsRepository {
        if (!FavoritesRecentsRepository.instance) {
            FavoritesRecentsRepository.instance = new FavoritesRecentsRepository();
        }
        return FavoritesRecentsRepository.instance;
    }

    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            mkdirSync(dirname(environment.database.path), { recursive: true });
            this.db = new Database(environment.database.path);
            this.db.pragma("journal_mode = WAL");
            this.db.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
            this.db.exec(FAVORITES_TABLE_SQL);
            this.db.exec(RECENTS_TABLE_SQL);
            this.isInitialized = true;
            logger.info(`FavoritesRecentsRepository initialized at ${environment.database.path}`);
        } catch (error) {
            this.handleError("initialize", error);
        }
    }

    public async close(): Promise<void> {
        if (!this.db) {
            return;
        }

        try {
            this.db.close();
            this.db = null;
            this.isInitialized = false;
            logger.info("FavoritesRecentsRepository connection closed");
        } catch (error) {
            this.handleError("close", error);
        }
    }

    public async upsertFavorite(deviceId: string, entityType: EntityType, entityId: string): Promise<void> {
        this.assertInitialized();
        const favoritedAt = new Date().toISOString();
        (this.db as DatabaseInstance)
            .prepare(
                "INSERT INTO favorites (device_id, entity_type, entity_id, favorited_at) VALUES (@deviceId, @entityType, @entityId, @favoritedAt) ON CONFLICT (device_id, entity_type, entity_id) DO UPDATE SET favorited_at = @favoritedAt",
            )
            .run({ deviceId, entityType, entityId, favoritedAt });
    }

    public async deleteFavorite(deviceId: string, entityType: EntityType, entityId: string): Promise<void> {
        this.assertInitialized();
        (this.db as DatabaseInstance)
            .prepare("DELETE FROM favorites WHERE device_id = ? AND entity_type = ? AND entity_id = ?")
            .run(deviceId, entityType, entityId);
    }

    public async listFavorites(deviceId: string): Promise<FavoriteRecord[]> {
        this.assertInitialized();
        return (this.db as DatabaseInstance)
            .prepare(
                "SELECT device_id AS deviceId, entity_type AS entityType, entity_id AS entityId, favorited_at AS favoritedAt FROM favorites WHERE device_id = ? ORDER BY favorited_at DESC",
            )
            .all(deviceId) as FavoriteRecord[];
    }

    public async upsertRecent(deviceId: string, entityType: EntityType, entityId: string): Promise<void> {
        this.assertInitialized();
        const viewedAt = new Date().toISOString();
        (this.db as DatabaseInstance)
            .prepare(
                "INSERT INTO recents (device_id, entity_type, entity_id, viewed_at) VALUES (@deviceId, @entityType, @entityId, @viewedAt) ON CONFLICT (device_id, entity_type, entity_id) DO UPDATE SET viewed_at = @viewedAt",
            )
            .run({ deviceId, entityType, entityId, viewedAt });
        (this.db as DatabaseInstance)
            .prepare(
                "DELETE FROM recents WHERE device_id = @deviceId AND id NOT IN (SELECT id FROM recents WHERE device_id = @deviceId ORDER BY viewed_at DESC, id DESC LIMIT 5)",
            )
            .run({ deviceId });
    }

    public async listRecents(deviceId: string): Promise<RecentRecord[]> {
        this.assertInitialized();
        return (this.db as DatabaseInstance)
            .prepare(
                "SELECT device_id AS deviceId, entity_type AS entityType, entity_id AS entityId, viewed_at AS viewedAt FROM recents WHERE device_id = ? ORDER BY viewed_at DESC",
            )
            .all(deviceId) as RecentRecord[];
    }

    private handleError(action: "initialize" | "close", error: unknown): never {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error(`Failed to ${action} FavoritesRecentsRepository: ${message}`);
        throw new Error(`Failed to ${action} FavoritesRecentsRepository: ${message}`);
    }

    private assertInitialized(): void {
        if (!this.isInitialized || !this.db) {
            throw new Error(
                "FavoritesRecentsRepository has not been initialized. Call initialize() before accessing data.",
            );
        }
    }
}
