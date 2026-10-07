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

    // Phase 15 D-08: the value is never parsed, so a garbled timestamp still counts as deleted (fails safe).
    function isDeleted(entity: DashAlertEntity): boolean {
        return entity.deletedAt !== null && entity.deletedAt !== undefined;
    }

    function isParseableDate(value: unknown): value is string {
        return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
    }

    // A bound is malformed when present and not a parseable date string; null/undefined stay
    // unbounded and strict ISO-8601 is not required (Phase 15 D-03). One bad bound in any period
    // condemns the whole alert, because the collapsed window could no longer be trusted (Phase 15 D-02).
    function findMalformedBound(periods: DashActivePeriod[] | undefined): "start" | "end" | undefined {
        for (const period of periods ?? []) {
            if (period.start !== null && period.start !== undefined && !isParseableDate(period.start)) {
                return "start";
            }
            if (period.end !== null && period.end !== undefined && !isParseableDate(period.end)) {
                return "end";
            }
        }
        return undefined;
    }

    // D-02: multiple active_period entries collapse to earliest start / latest end.
    // D-03: zero/undefined periods -> {start: null, end: null} (always-active, never expires).
    function deriveActiveWindow(periods: DashActivePeriod[] | undefined): ServiceAlertActivePeriod {
        if (!periods || periods.length === 0) {
            return { start: null, end: null };
        }

        // Periods arrive pre-validated by findMalformedBound, so every bound kept here parses and
        // toISOString cannot throw.
        const starts = periods.map((p) => p.start).filter(isParseableDate);
        const anyOpenEnded = periods.some((p) => p.end == null);
        const ends = periods.map((p) => p.end).filter(isParseableDate);

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

        // Alerts are filtered here, at ingestion, so the repository only ever stores clean alerts
        // and one choke point covers every route, stop and nearby response (Phase 15 D-05).
        // Soft-deleted alerts are a routine feed state, so dropping them is silent (Phase 15 D-09), and
        // the deleted check runs first so a deleted alert with a bad date never warns (Phase 15 D-10).
        // A malformed-date alert is dropped on its own because alerts are an enrichment and must not
        // freeze every update (Phase 15 D-01, deliberately unlike the all-or-nothing route/stop load);
        // an entity without an id still fails the whole poll above (Phase 15 D-07).
        const alerts: ServiceAlert[] = [];
        for (const entity of response.entities) {
            if (isDeleted(entity)) {
                continue;
            }
            const malformedBound = findMalformedBound(entity.activePeriods);
            if (malformedBound !== undefined) {
                logger.warn(
                    `Dropping service alert ${entity.id} with a malformed activePeriods ${malformedBound} date`,
                );
                continue;
            }
            alerts.push(mapToServiceAlert(entity));
        }
        return alerts;
    }

    return { fetchAlerts };
}
