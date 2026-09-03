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

        // TEMPORARY diagnostic to confirm the real live top-level shape (G-05-5); Task 3 of
        // 05-06-PLAN.md removes this once the shape is confirmed via a human-reported boot.
        logger.warn(`SERVICE-ALERTS-SHAPE-DIAG typeof body=${typeof body} body=${JSON.stringify(body).slice(0, 2000)}`);

        if (body === null || typeof body !== "object" || Array.isArray(body)) {
            throw new UpstreamApiError(MALFORMED_BODY_MESSAGE);
        }
        return body as DashAlertsApiResponse;
    }

    function isValidDashAlertEntity(entity: unknown): entity is DashAlertEntity {
        return (
            typeof entity === "object" &&
            entity !== null &&
            typeof (entity as DashAlertEntity).id === "string" &&
            typeof (entity as DashAlertEntity).alert === "object" &&
            (entity as DashAlertEntity).alert !== null
        );
    }

    // D-02: multiple active_period entries collapse to earliest start / latest end.
    // D-03: zero/undefined periods -> {start: null, end: null} (always-active, never expires).
    function deriveActiveWindow(periods: DashActivePeriod[] | undefined): ServiceAlertActivePeriod {
        if (!periods || periods.length === 0) {
            return { start: null, end: null };
        }

        const starts = periods.map((p) => p.start).filter((s): s is number => s !== undefined);
        const anyOpenEnded = periods.some((p) => p.end === undefined);
        const ends = periods.map((p) => p.end).filter((e): e is number => e !== undefined);

        return {
            start: starts.length > 0 ? new Date(Math.min(...starts) * 1000).toISOString() : null,
            end: !anyOpenEnded && ends.length > 0 ? new Date(Math.max(...ends) * 1000).toISOString() : null,
        };
    }

    function mapToServiceAlert(entity: DashAlertEntity): ServiceAlert {
        const { alert } = entity;

        const informedRouteIds = (alert.informed_entity ?? [])
            .map((ie) => ie.route_id)
            .filter((id): id is string => id !== undefined);
        const informedStopIds = (alert.informed_entity ?? [])
            .map((ie) => ie.stop_id)
            .filter((id): id is string => id !== undefined);

        return {
            id: entity.id,
            cause: alert.cause,
            effect: alert.effect,
            headerText: alert.header_text?.translation?.[0]?.text,
            descriptionText: alert.description_text?.translation?.[0]?.text,
            url: alert.url?.translation?.[0]?.text,
            informedRouteIds,
            informedStopIds,
            activePeriod: deriveActiveWindow(alert.active_period),
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
