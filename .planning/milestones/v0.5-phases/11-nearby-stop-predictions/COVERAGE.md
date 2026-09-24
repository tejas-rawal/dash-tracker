# API Coverage — DASH / Swiftly (api.goswift.ly, agency alexandria-dash)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

Phase 11 integrates exactly one Swiftly capability, `predictions-near-location`. Every other Swiftly capability is recorded below as OPT-OUT for this phase, with a reason. Capabilities that earlier phases already integrated are marked as unchanged here. The rows for `predictions-near-location` are split by request parameter and response field, so the partial surface is an explicit decision rather than a silent gap.

| capability | decision | reason |
|---|---|---|
| predictions-near-location | INTEGRATE | |
| predictions-near-location:lat-lon | INTEGRATE | |
| predictions-near-location:meters | INTEGRATE | |
| predictions-near-location:number | INTEGRATE | |
| predictions-near-location:distanceToStop | INTEGRATE | |
| predictions-near-location:route-filter | OPT-OUT | explicitly out of scope — NEAR-11 deferred to Future in REQUIREMENTS.md |
| predictions-near-location:blockId | OPT-OUT | not needed yet — CONTEXT D-05 ignores it; exposing it would change the /predictions and SSE shapes (deferred idea) |
| predictions-near-location:live-stream | OPT-OUT | explicitly out of scope — NEAR-10 (SSE nearby stream) deferred; REST only in v0.5 |
| predictions (by stop) | OPT-OUT | already integrated (v0.2 Phase 4 / quick 260915-fc8); unchanged by this phase apart from sharing the extracted mapping helper |
| vehicles | OPT-OUT | already integrated (Phase 10); unchanged by this phase |
| gtfs-rt-alerts/v2 | OPT-OUT | already integrated (v0.4 Phase 8); this phase only reads the existing ServiceAlertRepository |
| info/routes | OPT-OUT | already integrated (BusDataRepository startup load); not used by the nearby path (D-07) |
| gtfs-rt-trip-updates | OPT-OUT | not needed — the JSON predictions endpoints already cover arrival times |
| gtfs-rt-vehicle-positions | OPT-OUT | not needed — the JSON vehicles endpoint (Phase 10) already covers positions |
| historical / analytics APIs (run times, on-time performance) | OPT-OUT | explicitly out of scope — the product is real-time rider predictions only |
