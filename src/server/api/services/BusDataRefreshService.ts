import { logger } from "../../config";
import type { BusDataRepository } from "../repositories";

const INITIAL_RETRY_DELAY_MS = 1_000; // first boot retry ceiling, doubling per consecutive failure
const MAX_RETRY_DELAY_MS = 60_000; // a long DASH outage is still retried about once a minute
export const REFRESH_INTERVAL_MS = 60 * 60_000; // hourly once loaded: DASH route/stop data changes rarely (D-09)

/**
 * Equal jitter: every delay is at least half its ceiling, so below the cap consecutive logged delays never
 * shrink (SC1's increasing delays stay visible) while restarted instances still spread out. Once capped,
 * delays stay between half the cap and the cap. Very large attempt counts cap at MAX_RETRY_DELAY_MS
 * because Math.min absorbs an infinite power of two.
 */
export function computeRetryDelayMs(attempt: number, random: () => number = Math.random): number {
    const ceiling = Math.min(MAX_RETRY_DELAY_MS, INITIAL_RETRY_DELAY_MS * 2 ** (attempt - 1));
    return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

export interface BusDataRefreshService {
    start(): void;
    stop(): void;
}

export function createBusDataRefreshService(repository: BusDataRepository): BusDataRefreshService {
    let timer: NodeJS.Timeout | undefined;
    let started = false;
    let stopped = false;
    let hasLoaded = false;
    let consecutiveFailures = 0;

    // D-10: the next attempt is chained only after the current one settles, so attempts never overlap
    // even when one takes the full DASH deadline. That is why this loop does not reuse the alert poll's
    // repeating timer.
    function schedule(delayMs: number): void {
        if (stopped) {
            return;
        }
        timer = setTimeout(() => {
            timer = undefined;
            void runAttempt();
        }, delayMs);
    }

    // One log line per attempt (D-08), never at error level, and never giving up (D-06).
    async function runAttempt(): Promise<void> {
        try {
            const { routeCount, stopCount } = await repository.load();
            if (hasLoaded) {
                logger.info(`Route/stop data refreshed: ${routeCount} routes, ${stopCount} stops`);
            } else {
                logger.info(
                    `Route/stop data loaded on attempt ${consecutiveFailures + 1}: ${routeCount} routes, ${stopCount} stops`,
                );
            }
            hasLoaded = true;
            consecutiveFailures = 0;
            schedule(REFRESH_INTERVAL_MS);
        } catch (error) {
            consecutiveFailures += 1;
            const message = error instanceof Error ? error.message : "Unknown error";
            const delayMs = hasLoaded ? REFRESH_INTERVAL_MS : computeRetryDelayMs(consecutiveFailures);
            logger.warn(
                `Route/stop data ${hasLoaded ? "refresh" : "load"} attempt ${consecutiveFailures} failed: ${message}; next attempt in ${delayMs}ms`,
            );
            schedule(delayMs);
        }
    }

    function start(): void {
        if (started || stopped) {
            return;
        }
        started = true;
        void runAttempt(); // immediate first attempt, fire-and-forget like the alert poll
    }

    // An attempt already in flight still settles and logs its one line, but schedule() refuses to arm
    // another timer once stopped (D-15).
    function stop(): void {
        stopped = true;
        clearTimeout(timer);
        timer = undefined;
    }

    return { start, stop };
}
