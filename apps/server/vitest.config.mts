import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// biome-ignore lint/style/noDefaultExport: This must be a default export
export default defineConfig({
    test: {
        root: dirname(fileURLToPath(import.meta.url)),
        globals: true,
        setupFiles: ["src/test/setup.ts"],
        coverage: {
            include: ["src/**/*.ts"],
            exclude: ["src/**/*.test.ts", "src/test/**", "src/app.ts", "src/config/**"],
            thresholds: {
                branches: 80,
                functions: 80,
                lines: 80,
                statements: 80,
            },
        },
    },
});
