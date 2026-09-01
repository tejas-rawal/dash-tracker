import type { ServiceAlert } from "../models/ServiceAlert";

// Inclusive boundary on both ends (D-Claude's-discretion / flagged assumption 2):
// an alert is active when start <= referenceTime <= end. A null bound is unbounded on that side.
function isAlertActive(alert: ServiceAlert, referenceTime: Date): boolean {
    const { start, end } = alert.activePeriod;

    if (start !== null && referenceTime < new Date(start)) {
        return false;
    }
    if (end !== null && referenceTime > new Date(end)) {
        return false;
    }

    return true;
}

export class ServiceAlertRepository {
    private alerts: Map<string, ServiceAlert> = new Map();

    private static instance: ServiceAlertRepository;

    private constructor() {}

    public static getInstance(): ServiceAlertRepository {
        if (!ServiceAlertRepository.instance) {
            ServiceAlertRepository.instance = new ServiceAlertRepository();
        }
        return ServiceAlertRepository.instance;
    }

    // Atomic full-replacement swap: builds a fresh staging Map, then assigns it in one
    // step so there is never a partially-updated store (supports "last write wins" under
    // concurrent poll ticks, see ServiceAlertPollService).
    public applyAlerts(alerts: ServiceAlert[]): void {
        const staging = new Map<string, ServiceAlert>();
        for (const alert of alerts) {
            staging.set(alert.id, alert);
        }
        this.alerts = staging;
    }

    // D-06: no assertInitialized() guard — an empty store is a valid state, not an error.
    public getActiveAlerts(referenceTime: Date = new Date()): ServiceAlert[] {
        return Array.from(this.alerts.values()).filter((alert) => isAlertActive(alert, referenceTime));
    }
}
