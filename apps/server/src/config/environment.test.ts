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

describe("CORS_ALLOWED_ORIGINS", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("defaults cors.allowedOrigins to no origin when CORS_ALLOWED_ORIGINS is unset", async () => {
        // Arrange: setup.ts pins the variable, so unset it explicitly.
        vi.stubEnv("CORS_ALLOWED_ORIGINS", undefined);

        // Act
        const { environment } = await import("./environment");

        // Assert
        expect(environment.cors.allowedOrigins).toEqual([]);
    });

    it.each([
        { label: "empty", value: "", expected: [] },
        { label: "only commas and spaces", value: " , ,", expected: [] },
        { label: "a single origin", value: "http://localhost:8081", expected: ["http://localhost:8081"] },
        {
            label: "a padded pair",
            value: " http://localhost:8081 , https://app.example.com ",
            expected: ["http://localhost:8081", "https://app.example.com"],
        },
        { label: "a non-default port", value: "https://app.example:8443", expected: ["https://app.example:8443"] },
        {
            label: "a duplicate",
            value: "http://a.example,http://a.example",
            expected: ["http://a.example", "http://a.example"],
        },
    ])("reads CORS_ALLOWED_ORIGINS given $label", async ({ value, expected }) => {
        // Arrange
        vi.stubEnv("CORS_ALLOWED_ORIGINS", value);

        // Act
        const { environment } = await import("./environment");

        // Assert
        expect(environment.cors.allowedOrigins).toEqual(expected);
    });

    it.each([
        { label: "a wildcard", value: "*", entry: "*" },
        { label: "a trailing slash", value: "http://localhost:8081/", entry: "http://localhost:8081/" },
        { label: "a path", value: "http://x.example/path", entry: "http://x.example/path" },
        { label: "a query", value: "http://x.example?q=1", entry: "http://x.example?q=1" },
        { label: "a fragment", value: "http://x.example#top", entry: "http://x.example#top" },
        { label: "credentials", value: "http://u:p@x.example", entry: "http://u:p@x.example" },
        { label: "a non-http scheme", value: "ftp://x.example", entry: "ftp://x.example" },
        { label: "a bare host", value: "x.example", entry: "x.example" },
        { label: "the literal null", value: "null", entry: "null" },
        { label: "an explicit default port", value: "http://localhost:80", entry: "http://localhost:80" },
        { label: "an uppercase host", value: "http://LOCALHOST:8081", entry: "http://LOCALHOST:8081" },
        { label: "one bad entry among good ones", value: "http://localhost:8081,*", entry: "*" },
    ])("fails startup naming the entry when CORS_ALLOWED_ORIGINS has $label", async ({ value, entry }) => {
        // Arrange
        vi.stubEnv("CORS_ALLOWED_ORIGINS", value);

        // Act
        const loading = import("./environment");

        // Assert
        await expect(loading).rejects.toThrow(/Invalid environment configuration[\s\S]*CORS_ALLOWED_ORIGINS/);
        await expect(loading).rejects.toThrow(entry);
    });
});
