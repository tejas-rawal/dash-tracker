import { logger } from "./logger";

// Only the stack (whose first line is the name and message) or the string form is logged, never the
// reason object itself: an axios error carries config.headers.Authorization, which is DASH_API_KEY
// (D-12, T-11-01).
function describeReason(reason: unknown): string {
    if (reason instanceof Error) {
        return reason.stack ?? reason.message;
    }
    return String(reason);
}

export function registerProcessErrorHandlers(): void {
    // Registering this listener is also what overrides Node 20's default of crashing on an unhandled
    // rejection. It deliberately does not exit: a stray rejection must not take the server down for
    // every rider (D-10).
    process.on("unhandledRejection", (reason: unknown): void => {
        logger.error(`Unhandled promise rejection: ${describeReason(reason)}`);
    });

    // A synchronous throw that escapes leaves unknown state, so the process still exits. The only change
    // from Node's default is that the crash is logged through Winston instead of a raw stderr dump (D-11).
    process.on("uncaughtException", (error: Error): void => {
        logger.error(`Uncaught exception: ${describeReason(error)}`);
        process.exit(1);
    });
}
