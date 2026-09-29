import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./logger", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from "./logger";
import { registerProcessErrorHandlers } from "./processHandlers";

// The process.on mock keeps the handlers off the real vitest worker process, where a real
// unhandledRejection listener would swallow vitest's own failure reporting. Restoring right away
// leaves vitest's own process.on calls unaffected.
function captureProcessListeners(): Map<string, (...args: never[]) => void> {
    const listeners = new Map<string, (...args: never[]) => void>();
    const onSpy = vi.spyOn(process, "on").mockImplementation(((event: string, listener: (...args: never[]) => void) => {
        listeners.set(event, listener);
        return process;
    }) as never);
    registerProcessErrorHandlers();
    onSpy.mockRestore();
    return listeners;
}

describe("registerProcessErrorHandlers", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("logs an unhandled rejection through Winston and keeps the process running", () => {
        // Arrange
        const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
        const listeners = captureProcessListeners();
        const onUnhandledRejection = listeners.get("unhandledRejection") as (reason: unknown) => void;

        // Act
        onUnhandledRejection(new Error("boom"));

        // Assert
        expect(logger.error).toHaveBeenCalledTimes(1);
        const [message] = vi.mocked(logger.error).mock.calls[0] as unknown[];
        expect(String(message).startsWith("Unhandled promise rejection: Error: boom")).toBe(true);
        expect(exitSpy).not.toHaveBeenCalled();
    });

    it("registers both process error listeners", () => {
        // Arrange & Act
        const listeners = captureProcessListeners();

        // Assert
        expect([...listeners.keys()].sort()).toEqual(["uncaughtException", "unhandledRejection"]);
    });

    it("logs an uncaught exception through Winston before exiting with code 1", () => {
        // Arrange
        const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
        const listeners = captureProcessListeners();
        const onUncaughtException = listeners.get("uncaughtException") as (error: Error) => void;

        // Act
        onUncaughtException(new Error("kaboom"));

        // Assert
        expect(logger.error).toHaveBeenCalledTimes(1);
        const [message] = vi.mocked(logger.error).mock.calls[0] as unknown[];
        expect(String(message).startsWith("Uncaught exception: Error: kaboom")).toBe(true);
        expect(exitSpy).toHaveBeenCalledTimes(1);
        expect(exitSpy).toHaveBeenCalledWith(1);
        const logOrder = vi.mocked(logger.error).mock.invocationCallOrder[0] as number;
        const exitOrder = exitSpy.mock.invocationCallOrder[0] as number;
        expect(logOrder).toBeLessThan(exitOrder);
    });

    it.each<{ label: string; reason: unknown; includes: string; exact: string | null }>([
        {
            label: "a secret-bearing axios-style Error",
            reason: Object.assign(new Error("Request failed with status code 503"), {
                // biome-ignore lint/style/useNamingConvention: mirrors the real axios header that carries DASH_API_KEY
                config: { headers: { Authorization: "super-secret-key" } },
            }),
            includes: "Request failed with status code 503",
            exact: null,
        },
        {
            label: "a string",
            reason: "plain failure",
            includes: "plain failure",
            exact: "Unhandled promise rejection: plain failure",
        },
        {
            label: "an object",
            reason: { token: "super-secret-key" },
            includes: "[object Object]",
            exact: "Unhandled promise rejection: [object Object]",
        },
        {
            label: "undefined",
            reason: undefined,
            includes: "undefined",
            exact: "Unhandled promise rejection: undefined",
        },
    ])("logs only the message and stack for $label, never the reason object", ({ reason, includes, exact }) => {
        // Arrange
        const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
        const listeners = captureProcessListeners();
        const onUnhandledRejection = listeners.get("unhandledRejection") as (reason: unknown) => void;

        // Act
        onUnhandledRejection(reason);

        // Assert
        expect(logger.error).toHaveBeenCalledTimes(1);
        const call = vi.mocked(logger.error).mock.calls[0] as unknown[];
        expect(call).toHaveLength(1);
        const message = String(call[0]);
        expect(message).toContain(includes);
        expect(message).not.toContain("super-secret-key");
        if (exact !== null) {
            expect(message).toBe(exact);
        }
        expect(exitSpy).not.toHaveBeenCalled();
    });
});
