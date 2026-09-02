# Phase 7: Recents (Routes & Stops) - Context

**Gathered:** 2026-08-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Riders' real route and stop lookups are automatically tracked as recents — deduped (bump-to-top), capped at 5 combined entries per device, type-tagged and hydrated — as a side effect of REST prediction lookups only. The auto-logging side effect must never slow down or break the underlying prediction response, and must never fire for SSE stream subscriptions.

</domain>

<decisions>
## Implementation Decisions

### Device ID on the prediction endpoint
- **D-01:** `GET /api/v1/predictions` stays exactly as it is today — no `requireDeviceId` middleware is added to `predictionRoutes.ts`. If `X-Device-Id` is absent (or empty/whitespace), the recent-logging side effect is silently skipped: no 400, no error, no recent recorded. — **Reversibility:** reversible — purely additive; requiring the header later is a small router change with no data migration.
- **D-02:** When `X-Device-Id` IS present, resolve it the same way `FavoritesController.resolveDeviceId` does (read `req.headers["x-device-id"]`, take first element if array).

### Fire-and-forget logging (never delays or breaks the response)
- **D-03:** In `PredictionService.getPredictionsForStop`, build the full `StopPredictionsResponse` first, then invoke the recents-logging call WITHOUT awaiting it, attaching a `.catch()` that only logs a warning via the existing Winston `logger`. Return the response immediately — the recents write races the response and can never add latency or fail the request. — **Reversibility:** reversible — a local implementation detail inside the service, no contract exposed.
- **D-04:** The fire-and-forget call only fires for the REST controller path — do NOT add any recents-logging call inside `PredictionStreamService`/`PredictionStreamController`. This is what satisfies "opening an SSE subscription never logs a recent" (RECENT-06) — the logging call site simply doesn't exist on that path, not a conditional check.
- **D-05:** Route recent (RECENT-01) is logged only when the caller passed an explicit `route` param to `getPredictionsForStop` — mirrors the existing `options.route !== undefined` check already used for building the DASH API URL. Stop recent (RECENT-02) is always logged (the `stop` param is always explicit per the existing controller validation that 400s without it).

### Cap-at-5 eviction
- **D-06:** Eviction lives inside `FavoritesRecentsRepository`'s upsert-recent call, not in the service. After the `INSERT ... ON CONFLICT DO UPDATE` upsert, run a single follow-up `DELETE FROM recents WHERE device_id = ? AND id NOT IN (SELECT id FROM recents WHERE device_id = ? ORDER BY viewed_at DESC LIMIT 5)` (or equivalent) in the same method — callers (the service) never need to think about the cap. — **Reversibility:** costly — **rationale:** once old recents rows are evicted they're gone; if the cap policy changes later (e.g. raising the limit) there's no way to recover previously-evicted rows, only to change behavior going forward.
- **D-07:** The existing `upsertRecent(deviceId, entityType, entityId)` method signature on `FavoritesRecentsRepository` (built in Phase 5) is reused as-is — this phase only adds the eviction logic inside it (or immediately after, same transaction/call) and adds any new methods needed for listing.

### Recents List Endpoint
- **D-08:** Mirror the Favorites pattern exactly: new `RecentsService`, `RecentsController`, `recentRoutes.ts` mounted at `/recents` in `routes/index.ts`, with `requireDeviceId` middleware mounted on that router (listing recents DOES require a device ID — only the auto-log side effect on predictions is optional-device).
- **D-09:** `GET /api/v1/recents` returns a combined, hydrated, type-tagged list ordered most-recently-viewed-first: `{ entityType, viewedAt, entity }[]` — same nested shape as `HydratedFavorite` but with `viewedAt` instead of `favoritedAt`. A recent whose entity no longer resolves in `BusDataRepository` is silently skipped from the list (same as favorites). Empty list returns `200 []`.

### Claude's Discretion
- Exact TypeScript types/interfaces (`HydratedRecent`, `RecentRecord` already exists from Phase 5 — reuse it), service/controller method names, and test structure are left to planning/implementation, following CLAUDE.md conventions (named exports, explicit return types, `createXService`/`createXController` factory DI).
- Whether the fire-and-forget recents call happens for the route entity, the stop entity, or both in a single call vs two separate calls is an implementation detail — the invariant is: no `await`, `.catch()` swallows/logs errors, response is unaffected.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — RECENT-01 through RECENT-06 (full requirement text); requirements-to-phase mapping table

### Prior phase decisions this phase mirrors/extends
- `.planning/phases/06-favorites-routes-stops/06-CONTEXT.md` — Favorites decisions this phase's device-ID handling, controller/service/route shape, and list-hydration pattern directly mirror
- `.planning/phases/05-sqlite-persistence-foundation/` — SQLite repository foundation; `recents` table schema and `upsertRecent`/`listRecents` methods already exist here

### Existing code this phase extends
- `src/server/api/repositories/FavoritesRecentsRepository.ts` — add eviction logic to `upsertRecent`; reuse `listRecents`
- `src/server/api/middleware/requireDeviceId.ts` — reuse for the new `/recents` router; do NOT apply to `/predictions`
- `src/server/api/services/PredictionService.ts` — add fire-and-forget logging call inside `getPredictionsForStop`
- `src/server/api/controllers/PredictionController.ts` — resolve optional device ID here (or in the service) and pass it through
- `src/server/api/services/FavoritesService.ts` / `FavoritesController.ts` / `routes/favoriteRoutes.ts` — direct pattern templates for `RecentsService` / `RecentsController` / `recentRoutes.ts`

No external specs beyond REQUIREMENTS.md — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `FavoritesRecentsRepository.upsertRecent` / `listRecents` (Phase 5): already implement the bump-to-top upsert and ordered listing for recents — this phase adds eviction and wires them up end-to-end.
- `requireDeviceId` middleware: reusable as-is for the new `/recents` router.
- `HydratedFavorite`-style nested hydration pattern in `FavoritesService.listFavorites` (map + filter undefined for entities no longer resolvable): directly reusable for recents hydration.

### Established Patterns
- Factory-function DI: `createXService(repository, ...)`, `createXController(service)` — no direct singleton imports inside services/controllers.
- Controllers read `X-Device-Id` via a local `resolveDeviceId(req)` helper, not an augmented `Request` type.
- Repository methods take `(deviceId, entityType, entityId)` positional args and use named `@param` SQLite bind parameters.

### Integration Points
- `PredictionService.getPredictionsForStop` is the single integration point where recents auto-logging attaches — it already has `stopId` and `options.route` available, and already resolves the validated `BusStop` via `getValidatedStop`.
- `routes/index.ts` needs one more `router.use("/recents", recentRoutes)` line, following the `/favorites` pattern exactly.

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond the decisions above — the user confirmed mirroring the Favorites pattern exactly for the new list endpoint, with the two Phase-7-specific deviations being: (1) prediction lookups keep the device ID optional, and (2) the write is fire-and-forget, not awaited.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 7-Recents (Routes & Stops)*
*Context gathered: 2026-08-31*
