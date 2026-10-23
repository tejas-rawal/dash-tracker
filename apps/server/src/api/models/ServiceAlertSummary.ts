import type { BusRoute } from "./BusRoute";
import type { ServiceAlertActivePeriod } from "./ServiceAlert";

// D-01: a trimmed, public response-shape view of a ServiceAlert — omits url,
// informedRouteIds, and informedStopIds, which are redundant once an alert is
// already attached to a specific route/stop.
export interface ServiceAlertSummary {
    id: string;
    cause?: string;
    effect?: string;
    headerText?: string;
    descriptionText?: string;
    activePeriod: ServiceAlertActivePeriod;
}

export type RouteWithAlerts = BusRoute & { alerts: ServiceAlertSummary[] };

// Defined here (rather than in Plan 06-02) so both plans share one source file.
export interface StopWithAlerts {
    id: string;
    name: string;
    code: number;
    lat: number;
    lon: number;
    alerts: ServiceAlertSummary[];
}
