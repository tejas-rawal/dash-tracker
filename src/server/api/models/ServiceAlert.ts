export interface ServiceAlertActivePeriod {
    start: string | null;
    end: string | null;
}

export interface ServiceAlert {
    id: string;
    cause?: string;
    effect?: string;
    headerText?: string;
    descriptionText?: string;
    url?: string;
    informedRouteIds: string[];
    informedStopIds: string[];
    activePeriod: ServiceAlertActivePeriod;
}

// One element of a checked activePeriods list; its bound values are validated in ServiceAlertService
// before use (Phase 15 D-03, D-16).
export interface DashActivePeriod {
    start?: unknown;
    end?: unknown;
}

// One element of a checked informedEntities list; only string ids are used (Phase 15 D-16).
export interface DashInformedEntity {
    routeId?: unknown;
    stopId?: unknown;
}

// Confirmed live shape (G-05-5): a flat, custom Swiftly/Alexandria alerts format, not the
// nested GTFS-RT-protobuf-derived shape originally assumed — no `alert` sub-object, and
// headerText/descriptionText/url are plain strings, not {translation:[...]} wrappers.
export interface DashAlertEntity {
    id: string;
    cause?: string;
    effect?: string;
    headerText?: string | null;
    descriptionText?: string | null;
    url?: string | null;
    // Both lists are unknown until ServiceAlertService checks each is an array of objects; the alert is
    // dropped otherwise (Phase 15 D-16).
    activePeriods?: unknown;
    informedEntities?: unknown;
    // DASH soft-deletes an alert by setting this and keeps it in the feed; never parsed, any
    // value other than null/undefined means deleted (ALRT-12).
    deletedAt?: unknown;
}

export interface DashAlertsApiResponse {
    entities?: DashAlertEntity[];
}
