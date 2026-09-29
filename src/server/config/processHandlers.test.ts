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
});
