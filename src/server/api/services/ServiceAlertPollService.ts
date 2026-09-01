import { logger } from "../../config";
import type { ServiceAlertRepository } from "../repositories/ServiceAlertRepository";
import type { ServiceAlertService } from "./ServiceAlertService";

const POLL_INTERVAL_MS = 5 * 60_000; // 5 min, vs. PredictionStreamService's 30s prediction poll

export interface ServiceAlertPollService {
    start(): void;
}

export function createServiceAlertPollService(
    service: ServiceAlertService,
    repository: ServiceAlertRepository,
): ServiceAlertPollService {
    // No overlap guard between ticks (flagged assumption 1): each setInterval tick fires an
    // independent, unawaited pollAlerts() call. ServiceAlertRepository.applyAlerts()'s atomic
    // Map swap means the last-completing fetch wins, with no torn/partial state, if ticks overlap.
    async function pollAlerts(): Promise<void> {
        try {
            const alerts = await service.fetchAlerts();
            repository.applyAlerts(alerts);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            logger.error(`Failed to poll service alerts: ${message}`);
        }
    }

    function start(): void {
        void pollAlerts(); // immediate first fetch, fire-and-forget (D-07)
        setInterval(() => {
            void pollAlerts();
        }, POLL_INTERVAL_MS);
    }

    return { start };
}
