# API Coverage — DASH/Swiftly Service Alerts

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

**Endpoint under audit:** DASH/Swiftly GTFS-RT service-alerts feed (exact path not yet confirmed in `INTEGRATIONS.md` or public docs — see the flagged assumption in `05-01-PLAN.md` Task 1). Capability surface below is the standard GTFS-RT `Alert` message shape (per the `gtfs-realtime.proto` spec, which Swiftly's real-time feeds implement), since that spec — not any DASH-specific wrapper — defines what the endpoint can expose.

| capability | decision | reason |
|---|---|---|
| fetch full alerts feed (single-shot snapshot) | INTEGRATE | Core capability — ALRT-01. |
| `informed_entity[].route_id` (affected route ids) | INTEGRATE | Required — ALRT-03 "affected route(s)". |
| `informed_entity[].stop_id` (affected stop ids) | INTEGRATE | Required — ALRT-03 "affected stop(s)". |
| `active_period[]` start/end, collapsed to one window | INTEGRATE | Required — ALRT-03/ALRT-04, per CONTEXT.md D-02/D-03. |
| `cause` (raw passthrough string) | INTEGRATE | Required — ALRT-03 "severity/cause", per D-04 (no enum). |
| `effect` (raw passthrough string) | INTEGRATE | Required — ALRT-03 "severity/cause", per D-04 (no enum). |
| `header_text` / `description_text` (first available translation) | INTEGRATE | Required — ALRT-03 "description". |
| `url` (link to more info) | INTEGRATE | Low-cost optional passthrough field alongside cause/effect/description; no reason to drop a free, already-typed field. |
| entity `id` (alert identifier) | INTEGRATE | Required to key the in-memory store / dedupe on refresh. |
| server-side route/stop filtering (query params) | OPT-OUT | GTFS-RT alert feeds are full-feed snapshots with no server-side filtering support in the spec; this phase fetches the whole feed and filters server-side in-memory instead (ALRT-04's active-window filter). |
| pagination / cursor | OPT-OUT | GTFS-RT is a single-response snapshot per poll; no pagination concept exists in the spec. |
| `informed_entity[].trip_id` / `agency_id` / `route_type` / `direction_id` | OPT-OUT | ALRT-03 scopes affected-entity capture to route(s)/stop(s) only; no Phase 6 requirement (ALRT-05..09, which embed alerts into route/stop/prediction responses) consumes trip/agency/route-type/direction-scoped alerts. Can be added later without an architecture change if a future phase needs them. |
| multiple-language `translation[]` entries (i18n) | OPT-OUT | dash-tracker has no i18n/Accept-Language handling anywhere else in the codebase; first available translation is used, matching existing project scope. |
| `alert.image` (media/image URL) | OPT-OUT | Not referenced by ALRT-01..04; no client rendering surface exists yet to consume it (Phase 6 embeds JSON fields, not media). |
| `severity_level` (GTFS-RT enum: UNKNOWN/INFO/WARNING/SEVERE) | OPT-OUT | Explicitly deferred per CONTEXT.md D-05 — no derived/typed severity in this phase, raw `cause`/`effect` passthrough only. |
