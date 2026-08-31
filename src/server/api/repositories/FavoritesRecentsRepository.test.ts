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
});
