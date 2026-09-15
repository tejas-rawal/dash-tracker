import type { ServiceAlert } from "../models/ServiceAlert";
import type { ServiceAlertSummary } from "../models/ServiceAlertSummary";

// D-01: trims url/informedRouteIds/informedStopIds off the domain ServiceAlert, leaving only
// the fields a rider-facing response should carry.
export function mapToServiceAlertSummary(alert: ServiceAlert): ServiceAlertSummary {
    return {
        id: alert.id,
        cause: alert.cause,
        effect: alert.effect,
        headerText: alert.headerText,
        descriptionText: alert.descriptionText,
        activePeriod: alert.activePeriod,
    };
}

export function mapToServiceAlertSummaries(alerts: ServiceAlert[]): ServiceAlertSummary[] {
    return alerts.map(mapToServiceAlertSummary);
}
