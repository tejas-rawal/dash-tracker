import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A developer's local .env must not leak into these assertions; environment.ts calls dotenv.config() on load.
vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));

describe("DASH_API_TIMEOUT_MS", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("defaults dashApi.timeoutMs to 10000 when DASH_API_TIMEOUT_MS is unset", async () => {
        // Arrange
        vi.stubEnv("DASH_API_TIMEOUT_MS", undefined);

        // Act
        const { environment } = await import("./environment");

        // Assert
        expect(environment.dashApi.timeoutMs).toBe(10000);
    });

    it("reads DASH_API_TIMEOUT_MS as a whole number of milliseconds", async () => {
        // Arrange
        vi.stubEnv("DASH_API_TIMEOUT_MS", "2500");

        // Act
        const { environment } = await import("./environment");

        // Assert
        expect(environment.dashApi.timeoutMs).toBe(2500);
    });

    it.each([
        { label: "non-numeric", value: "abc" },
        { label: "zero", value: "0" },
        { label: "negative", value: "-1" },
        { label: "fractional", value: "1.5" },
        { label: "empty", value: "" },
        { label: "above the max timer delay", value: "2147483648" },
    ])("fails startup when DASH_API_TIMEOUT_MS is $label", async ({ value }) => {
        // Arrange
        vi.stubEnv("DASH_API_TIMEOUT_MS", value);

        // Act
        const loading = import("./environment");

        // Assert
        await expect(loading).rejects.toThrow(/Invalid environment configuration[\s\S]*DASH_API_TIMEOUT_MS/);
    });
});
