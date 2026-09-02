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
    start?: number;
    end?: number;
}

export interface DashInformedEntity {
    // biome-ignore lint/style/useNamingConvention: mirrors the GTFS-RT service-alerts wire format (snake_case)
    route_id?: string;
    // biome-ignore lint/style/useNamingConvention: mirrors the GTFS-RT service-alerts wire format (snake_case)
    stop_id?: string;
}

export interface DashTranslation {
    text: string;
    language?: string;
}

export interface DashAlertTranslatedString {
    translation: DashTranslation[];
}

export interface DashAlert {
    // biome-ignore lint/style/useNamingConvention: mirrors the GTFS-RT service-alerts wire format (snake_case)
    active_period?: DashActivePeriod[];
    // biome-ignore lint/style/useNamingConvention: mirrors the GTFS-RT service-alerts wire format (snake_case)
    informed_entity?: DashInformedEntity[];
    cause?: string;
    effect?: string;
    // biome-ignore lint/style/useNamingConvention: mirrors the GTFS-RT service-alerts wire format (snake_case)
    header_text?: DashAlertTranslatedString;
    // biome-ignore lint/style/useNamingConvention: mirrors the GTFS-RT service-alerts wire format (snake_case)
    description_text?: DashAlertTranslatedString;
    url?: DashAlertTranslatedString;
}

export interface DashAlertEntity {
    id: string;
    alert: DashAlert;
}

export interface DashAlertsApiResponse {
    entities?: DashAlertEntity[];
}
