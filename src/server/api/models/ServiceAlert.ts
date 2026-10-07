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

// Upstream values are validated in ServiceAlertService before use (Phase 15 D-03).
export interface DashActivePeriod {
    start?: unknown;
    end?: unknown;
}

export interface DashInformedEntity {
    routeId?: string;
    stopId?: string;
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
    activePeriods?: DashActivePeriod[];
    informedEntities?: DashInformedEntity[];
    // DASH soft-deletes an alert by setting this and keeps it in the feed; never parsed, any
    // value other than null/undefined means deleted (ALRT-12).
    deletedAt?: unknown;
}

export interface DashAlertsApiResponse {
    entities?: DashAlertEntity[];
}
