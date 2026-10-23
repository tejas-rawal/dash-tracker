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

describe("TRUST_PROXY_HOPS", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("defaults server.trustProxyHops to 0 when TRUST_PROXY_HOPS is unset", async () => {
        // Arrange
        vi.stubEnv("TRUST_PROXY_HOPS", undefined);

        // Act
        const { environment } = await import("./environment");

        // Assert
        expect(environment.server.trustProxyHops).toBe(0);
    });

    it.each([
        { value: "0", expected: 0 },
        { value: "1", expected: 1 },
        { value: "2", expected: 2 },
    ])("reads TRUST_PROXY_HOPS=$value as $expected trusted hops", async ({ value, expected }) => {
        // Arrange
        vi.stubEnv("TRUST_PROXY_HOPS", value);

        // Act
        const { environment } = await import("./environment");

        // Assert
        expect(environment.server.trustProxyHops).toBe(expected);
    });

    it.each([
        { label: "empty", value: "" },
        { label: "padded with a space", value: " 1" },
        { label: "negative", value: "-1" },
        { label: "fractional", value: "1.5" },
        { label: "non-numeric", value: "abc" },
        { label: "a boolean word", value: "true" },
    ])("fails startup when TRUST_PROXY_HOPS is $label", async ({ value }) => {
        // Arrange
        vi.stubEnv("TRUST_PROXY_HOPS", value);

        // Act
        const loading = import("./environment");

        // Assert
        await expect(loading).rejects.toThrow(/Invalid environment configuration[\s\S]*TRUST_PROXY_HOPS/);
    });
});
