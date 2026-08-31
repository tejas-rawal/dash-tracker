import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { testDbPath: TEST_DB_PATH } = vi.hoisted(() => {
    // Use require() instead of the module-level ES imports below: vi.hoisted() factories
    // run before those imports are bound, so referencing them here would hit the TDZ.
    // biome-ignore lint/style/useNodejsImportProtocol: require() target must be a bare specifier here
    const nodeOs: typeof import("node:os") = require("os");
    // biome-ignore lint/style/useNodejsImportProtocol: require() target must be a bare specifier here
    const nodePath: typeof import("node:path") = require("path");
    // biome-ignore lint/style/useNodejsImportProtocol: require() target must be a bare specifier here
    const nodeCrypto: typeof import("node:crypto") = require("crypto");
    return {
        testDbPath: nodePath.join(nodeOs.tmpdir(), `dash-tracker-test-${nodeCrypto.randomUUID()}.sqlite`),
    };
});

vi.mock("../../config", () => ({
    environment: {
        database: { path: TEST_DB_PATH },
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { FavoritesRecentsRepository } from "./FavoritesRecentsRepository";

describe("FavoritesRecentsRepository", () => {
    let repo: FavoritesRecentsRepository;

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset the singleton so each test gets a fresh instance
        // @ts-expect-error accessing private static for test isolation
        FavoritesRecentsRepository.instance = undefined;
        repo = FavoritesRecentsRepository.getInstance();
    });

    afterEach(() => {
        // @ts-expect-error accessing private static for test isolation
        FavoritesRecentsRepository.instance = undefined;
        for (const p of [TEST_DB_PATH, `${TEST_DB_PATH}-wal`, `${TEST_DB_PATH}-shm`]) {
            rmSync(p, { force: true });
        }
    });

    describe("getInstance", () => {
        it("always returns the same singleton instance", () => {
            // Arrange & Act
            const instance1 = FavoritesRecentsRepository.getInstance();
            const instance2 = FavoritesRecentsRepository.getInstance();

            // Assert
            expect(instance1).toBe(instance2);
        });
    });

    describe("initialize", () => {
        it("creates the underlying SQLite file", async () => {
            // Act
            await repo.initialize();

            // Assert
            expect(existsSync(TEST_DB_PATH)).toBe(true);
        });

        it("creates both the favorites and recents tables", async () => {
            // Arrange
            await repo.initialize();

            // Act
            const db2 = new Database(TEST_DB_PATH, { readonly: true });
            const rows = db2.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
                name: string;
            }[];
            db2.close();

            // Assert
            const tableNames = rows.map((row) => row.name);
            expect(tableNames).toContain("favorites");
            expect(tableNames).toContain("recents");
        });

        it("sets journal_mode to WAL", async () => {
            // Arrange
            await repo.initialize();

            // Act
            const db2 = new Database(TEST_DB_PATH, { readonly: true });
            const mode = db2.pragma("journal_mode", { simple: true });
            db2.close();

            // Assert
            expect(mode).toBe("wal");
        });

        it("does not throw when called twice in sequence", async () => {
            // Act & Assert
            await repo.initialize();
            await expect(repo.initialize()).resolves.not.toThrow();
        });
    });

    describe("close", () => {
        it("does not throw when called without a prior initialize() call", async () => {
            // Act & Assert
            await expect(repo.close()).resolves.not.toThrow();
        });
    });

    describe("favorites", () => {
        beforeEach(async () => {
            await repo.initialize();
        });

        it("writes and reads back a favorite", async () => {
            // Act
            await repo.upsertFavorite("device-a", "route", "route-1");
            const favorites = await repo.listFavorites("device-a");

            // Assert
            expect(favorites).toHaveLength(1);
            expect(favorites[0]).toMatchObject({ entityType: "route", entityId: "route-1" });
        });

        it("stores both entity types in the same table for one device", async () => {
            // Act
            await repo.upsertFavorite("device-a", "stop", "stop-1");
            await repo.upsertFavorite("device-a", "route", "route-1");
            const favorites = await repo.listFavorites("device-a");

            // Assert
            expect(favorites).toHaveLength(2);
        });

        it("upserts idempotently, updating the timestamp on a repeated write", async () => {
            // Act
            await repo.upsertFavorite("device-a", "route", "route-1");
            const [first] = await repo.listFavorites("device-a");
            await new Promise((resolve) => setTimeout(resolve, 5));
            await repo.upsertFavorite("device-a", "route", "route-1");
            const favorites = await repo.listFavorites("device-a");

            // Assert
            expect(favorites).toHaveLength(1);
            expect(favorites[0].favoritedAt).not.toBe(first.favoritedAt);
        });

        it("never leaks one device's favorites into another device's read", async () => {
            // Arrange
            await repo.upsertFavorite("device-a", "route", "route-1");

            // Act
            const favoritesForB = await repo.listFavorites("device-b");

            // Assert
            expect(favoritesForB).toEqual([]);
        });
    });

    describe("deleteFavorite", () => {
        beforeEach(async () => {
            await repo.initialize();
        });

        it("resolves without throwing when deleting a device+entity that was never favorited", async () => {
            // Act & Assert
            await expect(repo.deleteFavorite("device-a", "route", "route-1")).resolves.not.toThrow();
        });

        it("leaves listFavorites returning [] for a device with no favorites after a no-op delete", async () => {
            // Act
            await repo.deleteFavorite("device-a", "route", "route-1");
            const favorites = await repo.listFavorites("device-a");

            // Assert
            expect(favorites).toEqual([]);
        });

        it("removes exactly the favorited row after a prior upsertFavorite for the same triple", async () => {
            // Arrange
            await repo.upsertFavorite("device-a", "route", "route-1");

            // Act
            await repo.deleteFavorite("device-a", "route", "route-1");
            const favorites = await repo.listFavorites("device-a");

            // Assert
            expect(favorites).toEqual([]);
        });

        it("does not remove a different device's favorite for the same entity", async () => {
            // Arrange
            await repo.upsertFavorite("device-a", "route", "route-1");
            await repo.upsertFavorite("device-b", "route", "route-1");

            // Act
            await repo.deleteFavorite("device-a", "route", "route-1");

            // Assert
            const favoritesForB = await repo.listFavorites("device-b");
            expect(favoritesForB).toHaveLength(1);
        });
    });

    describe("recents", () => {
        beforeEach(async () => {
            await repo.initialize();
        });

        it("writes and reads back a recent", async () => {
            // Act
            await repo.upsertRecent("device-a", "stop", "stop-1");
            const recents = await repo.listRecents("device-a");

            // Assert
            expect(recents).toHaveLength(1);
            expect(recents[0]).toMatchObject({ entityType: "stop", entityId: "stop-1" });
        });

        it("stores both entity types in the same table for one device", async () => {
            // Act
            await repo.upsertRecent("device-a", "stop", "stop-1");
            await repo.upsertRecent("device-a", "route", "route-1");
            const recents = await repo.listRecents("device-a");

            // Assert
            expect(recents).toHaveLength(2);
        });

        it("upserts idempotently, updating the timestamp on a repeated write", async () => {
            // Act
            await repo.upsertRecent("device-a", "stop", "stop-1");
            const [first] = await repo.listRecents("device-a");
            await new Promise((resolve) => setTimeout(resolve, 5));
            await repo.upsertRecent("device-a", "stop", "stop-1");
            const recents = await repo.listRecents("device-a");

            // Assert
            expect(recents).toHaveLength(1);
            expect(recents[0].viewedAt).not.toBe(first.viewedAt);
        });

        it("never leaks one device's recents into another device's read", async () => {
            // Arrange
            await repo.upsertRecent("device-a", "stop", "stop-1");

            // Act
            const recentsForB = await repo.listRecents("device-b");

            // Assert
            expect(recentsForB).toEqual([]);
        });
    });

    describe("concurrency", () => {
        beforeEach(async () => {
            await repo.initialize();
        });

        it("handles concurrent bump-to-top writes to the same device+entity without throwing or duplicating rows", async () => {
            // Arrange
            const beforeBurst = new Date().toISOString();

            // Act
            const results = await Promise.all(
                Array.from({ length: 25 }, () => repo.upsertRecent("device-a", "stop", "stop-1")),
            );

            // Assert
            expect(results).toHaveLength(25);
            const rows = await repo.listRecents("device-a");
            expect(rows).toHaveLength(1);
            expect(rows[0].entityId).toBe("stop-1");
            expect(rows[0].entityType).toBe("stop");
            expect(rows[0].viewedAt >= beforeBurst).toBe(true);
        });

        it("isolates concurrent writes across two different devices for the same entity", async () => {
            // Act
            await Promise.all([
                ...Array.from({ length: 12 }, () => repo.upsertRecent("device-a", "route", "route-9")),
                ...Array.from({ length: 12 }, () => repo.upsertRecent("device-b", "route", "route-9")),
            ]);

            // Assert
            const recentsForA = await repo.listRecents("device-a");
            const recentsForB = await repo.listRecents("device-b");
            expect(recentsForA).toHaveLength(1);
            expect(recentsForA[0].entityId).toBe("route-9");
            expect(recentsForB).toHaveLength(1);
            expect(recentsForB[0].entityId).toBe("route-9");
        });

        it("handles concurrent favorite/unfavorite writes to the same device+entity without throwing SQLITE_BUSY", async () => {
            // Act
            const results = await Promise.allSettled(
                Array.from({ length: 25 }, (_, i) =>
                    i % 2 === 0
                        ? repo.upsertFavorite("device-a", "stop", "stop-1")
                        : repo.deleteFavorite("device-a", "stop", "stop-1"),
                ),
            );

            // Assert
            expect(results).toHaveLength(25);
            expect(results.every((result) => result.status === "fulfilled")).toBe(true);
        });
    });
});
