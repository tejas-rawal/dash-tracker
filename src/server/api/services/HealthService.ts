import type { BusDataRepository } from "../repositories";
import { REFRESH_INTERVAL_MS } from "./BusDataRefreshService";

// Readiness drops only after three consecutive refreshes have failed, so one DASH blip never pulls the
// instance from rotation (D-06/D-07). Each refresh is scheduled one REFRESH_INTERVAL_MS after the previous
// attempt settles, so three bare intervals would expire just before the third failed refresh even starts.
// The grace absorbs those attempt durations, each bounded by the DASH timeout. A module constant, not an
// env var, derived from the refresh interval so the two cannot drift (13 D-07).
const STALE_GRACE_MS = 5 * 60_000;
export const STALE_AFTER_MS = 3 * REFRESH_INTERVAL_MS + STALE_GRACE_MS;

export interface ReadinessReport {
    status: "ready" | "not_ready";
    reason?: "never_loaded" | "stale";
    dataAgeSeconds: number | null;
    lastLoadedAt: string | null;
    lastFailedAt: string | null;
}

export interface HealthService {
    getReadiness(): ReadinessReport;
}

export function createHealthService(repository: BusDataRepository): HealthService {
    function getReadiness(): ReadinessReport {
        // The error-message field is deliberately not read: the probe is public and upstream text must not
        // leak (D-04).
        const { lastLoadedAt, lastFailedAt } = repository.getLoadState();
        const failedAt = lastFailedAt?.toISOString() ?? null;

        if (lastLoadedAt === undefined) {
            return {
                status: "not_ready",
                reason: "never_loaded",
                dataAgeSeconds: null,
                lastLoadedAt: null,
                lastFailedAt: failedAt,
            };
        }

        // A clock stepped backwards must not report a negative age.
        const ageMs = Math.max(0, Date.now() - lastLoadedAt.getTime());
        const fields = {
            dataAgeSeconds: Math.floor(ageMs / 1000),
            lastLoadedAt: lastLoadedAt.toISOString(),
            lastFailedAt: failedAt,
        };

        // Strict: data aged exactly STALE_AFTER_MS is still ready.
        if (ageMs > STALE_AFTER_MS) {
            return { status: "not_ready", reason: "stale", ...fields };
        }
        return { status: "ready", ...fields };
    }

    return { getReadiness };
}
