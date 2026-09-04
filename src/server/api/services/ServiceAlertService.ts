import { axios, environment, logger } from "../../config";
import { UpstreamApiError } from "../errors";
import type {
    DashActivePeriod,
    DashAlertEntity,
    DashAlertsApiResponse,
    ServiceAlert,
    ServiceAlertActivePeriod,
} from "../models/ServiceAlert";

export interface ServiceAlertService {
    fetchAlerts(): Promise<ServiceAlert[]>;
}

const MALFORMED_BODY_MESSAGE = "DASH API returned a malformed service alerts response (body is not an object)";

export function createServiceAlertService(): ServiceAlertService {
    function buildDashApiUrl(): string {
        const { agency } = environment.dashApi;
        const params = new URLSearchParams({ format: "json" });
        return `/real-time/${agency}/gtfs-rt-alerts/v2?${params.toString()}`;
    }

    async function fetchFromDashApi(): Promise<DashAlertsApiResponse> {
        const url = buildDashApiUrl();
        logger.info(`Fetching service alerts from DASH API: ${url}`);
        const response = await axios.get(url);

        let body: unknown = response.data;
        // Some upstream responses may still arrive as a JSON-encoded string served under a
        // Content-Type axios doesn't recognize as JSON (e.g. text/plain), which skips axios's
        // default JSON-parsing response transform — this guards that real case even though
        // format=json is now explicitly requested above.
        if (typeof body === "string") {
            try {
                body = JSON.parse(body);
            } catch {
                throw new UpstreamApiError(`${MALFORMED_BODY_MESSAGE} — string body failed JSON.parse`);
            }
        }

        if (body === null || typeof body !== "object") {
            throw new UpstreamApiError(MALFORMED_BODY_MESSAGE);
        }

        // Confirmed live shape (G-05-5): a bare top-level array of entities, with no
        // {entities:[...]} envelope. The pre-existing envelope shape is still supported
        // for any body that arrives as a plain object instead.
        const entities = Array.isArray(body) ? (body as DashAlertEntity[]) : (body as DashAlertsApiResponse).entities;
        return { entities };
    }

    function isValidDashAlertEntity(entity: unknown): entity is DashAlertEntity {
        return typeof entity === "object" && entity !== null && typeof (entity as DashAlertEntity).id === "string";
    }

    // D-02: multiple active_period entries collapse to earliest start / latest end.
    // D-03: zero/undefined periods -> {start: null, end: null} (always-active, never expires).
    function deriveActiveWindow(periods: DashActivePeriod[] | undefined): ServiceAlertActivePeriod {
        if (!periods || periods.length === 0) {
            return { start: null, end: null };
        }

        const starts = periods.map((p) => p.start).filter((s): s is string => s != null);
        const anyOpenEnded = periods.some((p) => p.end == null);
        const ends = periods.map((p) => p.end).filter((e): e is string => e != null);

        return {
            start:
                starts.length > 0
                    ? new Date(Math.min(...starts.map((s) => new Date(s).getTime()))).toISOString()
                    : null,
            end:
                !anyOpenEnded && ends.length > 0
                    ? new Date(Math.max(...ends.map((e) => new Date(e).getTime()))).toISOString()
                    : null,
        };
    }

    function mapToServiceAlert(entity: DashAlertEntity): ServiceAlert {
        const informedRouteIds = (entity.informedEntities ?? [])
            .map((ie) => ie.routeId)
            .filter((id): id is string => id !== undefined);
        const informedStopIds = (entity.informedEntities ?? [])
            .map((ie) => ie.stopId)
            .filter((id): id is string => id !== undefined);

        return {
            id: entity.id,
            cause: entity.cause,
            effect: entity.effect,
            headerText: entity.headerText ?? undefined,
            descriptionText: entity.descriptionText ?? undefined,
            url: entity.url ?? undefined,
            informedRouteIds,
            informedStopIds,
            activePeriod: deriveActiveWindow(entity.activePeriods),
        };
    }

    async function fetchAlerts(): Promise<ServiceAlert[]> {
        const response = await fetchFromDashApi();

        if (response.entities === undefined) {
            logger.warn("No service alerts found in API response");
            return [];
        }

        if (!Array.isArray(response.entities)) {
            throw new UpstreamApiError(
                "DASH API returned a malformed service alerts response (entities is not an array)",
            );
        }

        if (!response.entities.every(isValidDashAlertEntity)) {
            throw new UpstreamApiError(
                "DASH API returned a malformed service alerts response (entity item is malformed)",
            );
        }

        return response.entities.map(mapToServiceAlert);
    }

    return { fetchAlerts };
}
