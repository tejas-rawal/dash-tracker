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

export interface DashActivePeriod {
    start?: string | null;
    end?: string | null;
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
}

export interface DashAlertsApiResponse {
    entities?: DashAlertEntity[];
}
