import type { BusDataRepository } from "../repositories";

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
        return {
            status: "ready",
            dataAgeSeconds: Math.floor(ageMs / 1000),
            lastLoadedAt: lastLoadedAt.toISOString(),
            lastFailedAt: failedAt,
        };
    }

    return { getReadiness };
}
