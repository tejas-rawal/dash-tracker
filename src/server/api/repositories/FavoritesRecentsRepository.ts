import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { environment, logger } from "../../config";

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

    private handleError(action: "initialize" | "close", error: unknown): never {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error(`Failed to ${action} FavoritesRecentsRepository: ${message}`);
        throw new Error(`Failed to ${action} FavoritesRecentsRepository: ${message}`);
    }
}
