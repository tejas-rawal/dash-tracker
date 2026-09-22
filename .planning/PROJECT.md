# dash-tracker

## What This Is

dash-tracker is a Node.js/Express REST API that proxies and structures data from the DASH public transit API (goswift.ly), exposing bus routes, stop discovery, arrival predictions, active service alerts, and anonymous device-scoped favorites/recents — via both REST and a live Server-Sent Events feed — through a layered architecture (routes → controllers → services → repositories). v0.1 shipped a dev-tooling cleanup (Biome-only lint/format); v0.2 shipped the first real feature set (stop discovery + live SSE predictions); v0.3 added SQLite-backed favorites (routes and stops, no cap) and auto-tracked recents (last 5 per device), both scoped by an anonymous `X-Device-Id` header with no auth system; v0.4 shipped GTFS-RT service alerts, embedded directly into route and stop responses so riders can see when what they're looking at is actually disrupted.

## Core Value

Riders can always see accurate, near-real-time arrival predictions for their stop.

## Current State

**Shipped:** v0.4 Service Alerts (2026-09-08) — riders now see active service alerts (detours, disruptions, stop closures) embedded directly in route (`/routes/all`, `/routes/:shortName`) and stop (`/routes/:shortName/stops`, `/stops/nearby`) responses, refreshed on a dedicated 5-minute background poll independent of the 30s prediction poll. Four milestones shipped to date (v0.1 tooling cleanup, v0.2 stop discovery + live SSE predictions, v0.3 favorites/recents, v0.4 service alerts).

**Since v0.4:** Phase 10 (Solidify vehicle position work, completed 2026-09-22) hardened the `GET /api/v1/vehicles` endpoint that had landed as a quick task (260915-fc8) without discussion/research/plan-checking — corrected `DashVehicle`/`VehiclePosition` to match DASH's real nested `loc` payload (verified against a live SFMTA response), added repository-backed 404 route validation, and fixed two code-review-caught bugs in the malformed-coordinate safety filter. Not part of a new milestone — a standalone backlog item promoted from the v0.4 blockers list.

## Next Milestone Goals

*(TBD — run `/gsd-new-milestone` to define the next milestone. Backlog candidates: ADHR-01 schedule adherence (SEED-002); ALRT-09/10/11 deferred alerts work; any v2 requirements deferred from v0.3 (see PERS-01..05 in `.planning/milestones/v0.3-REQUIREMENTS.md`); the Expo/React Native frontend.)*

<details>
<summary>v0.4 Service Alerts — original milestone goal (for reference)</summary>

**Goal:** Surface DASH/Swiftly's GTFS-RT service alerts (detours, disruptions, stop closures) so riders can see when a route or stop is affected, instead of only seeing an ETA for a bus that isn't actually coming.

**Target features:**
- New `ServiceAlert` model + repository fetch against the DASH service-alerts endpoint, mirroring the existing `BusRoute`/`PredictionService` pattern (repo fetch, model, service/controller layer, factory-function DI)
- Background poll loop for alerts on a dedicated 5-minute interval, separate from the 30s prediction poll
- Alerts embedded into existing route, stop, and REST prediction responses (no new dedicated alerts endpoint, no SSE stream changes)

</details>

<details>
<summary>Archived: v0.3 Favorited & Recent Routes milestone goal (shipped 2026-09-01)</summary>

**Goal:** Riders can save routes AND stops they care about, and jump back into ones they recently viewed, scoped per device, through this backend — so a home screen can take them straight to either.

**Target features:**
- Anonymous device-ID-scoped favorites, covering both routes and stops (add/remove, no cap, most-recently-favorited-first)
- Auto-tracked recents, covering both routes and stops (last 5 per device, logged on explicit-route/stop REST prediction lookups only — not unfiltered stop lookups, not SSE subscriptions)
- SQLite-backed persistence via a new repository layer, following the existing routes → controllers → services → repository architecture

</details>

## Requirements

### Validated

- ✓ REST API proxies DASH transit API for bus routes and arrival predictions — existing
- ✓ Layered architecture (routes → controllers → services → repositories) with factory-function DI — existing
- ✓ TypeScript strict mode, compiled via `tsc` to `dist/` (ES2020, CommonJS) — existing
- ✓ Vitest test suite with 80% coverage thresholds — existing
- ✓ Biome is the sole tool for both linting and formatting (`biome check`/`biome check --write`) — v0.1
- ✓ Prettier, `@jonahsnider/prettier-config`, and `prettier-plugin-packagejson` fully removed (dependency, config, scripts) — v0.1
- ✓ `package.json` scripts (`lint`, `lint:fix`, `format`, `format:write`) updated to reflect the single-tool flow — v0.1
- ✓ Full codebase reformatted under Biome's formatter with zero outstanding diffs, landed as its own commit separate from the config/dependency change — v0.1
- ✓ Stop discovery: list stops for a given route (`GET /api/v1/routes/:shortName/stops`, grouped by direction) — Phase 3
- ✓ Stop discovery: find nearby stops by lat/lng (`GET /api/v1/stops/nearby`, radius + result-count bound, haversine distance) — Phase 3
- ✓ Live predictions via Server-Sent Events, subscribed per stop (`GET /api/v1/predictions/stream?stop={id}`) — v0.2 Phase 4
- ✓ Shared per-stop upstream poll loop (30s), started on first subscriber and stopped when idle — v0.2 Phase 4
- ✓ REST predictions endpoint retained as fallback/initial-load path, fully independent of SSE — v0.2 Phase 4
- ✓ `generatedAt` freshness timestamp added to REST and SSE prediction payloads — v0.2 Phase 4
- ✓ SQLite-backed persistence layer for favorites/recents, isolated behind a repository (no changes to existing DASH proxy repository) — v0.3 Phase 5
- ✓ Anonymous device-ID-scoped favorites: add/remove a route OR stop as favorite, list favorites with full details, most-recently-favorited-first, no cap — v0.3 Phase 6
- ✓ Auto-tracked recents (routes and stops): last 5 per device, logged automatically on explicit-route/stop REST prediction lookups (not unfiltered stop lookups, not SSE subscriptions), list with full details — v0.3 Phase 7
- ✓ Fetch and cache GTFS-RT service alerts from the DASH/Swiftly API on a dedicated background poll (~5 min) — v0.4 Phase 8
- ✓ New `ServiceAlert` model representing a single alert (affected routes/stops, description, active window) — v0.4 Phase 8
- ✓ Embed active alerts on `GET /api/v1/routes/all` and `/routes/:shortName` responses — v0.4 Phase 9
- ✓ Embed active alerts on `GET /api/v1/routes/:shortName/stops` and `/stops/nearby` responses — v0.4 Phase 9

### Active

*(none — fresh requirements defined at next milestone kickoff via `/gsd-new-milestone`)*

### Out of Scope

- The Expo/React Native frontend app itself — this repo is intended to eventually house both backend and frontend (monorepo, not separate repos), but the app is deferred to a future milestone
- Offline caching and countdown animation UI — client-side concerns that land with the future Expo milestone
- Replacing `tsc` as the build tool (e.g. with Vite/esbuild) — Vite is a frontend bundler/dev server and doesn't fit compiling this Node/Express backend; not part of this cleanup
- Replacing Vitest — it's a test runner only, unrelated to lint/format consolidation
- Schedule adherence (SEED-002, on-time performance vs. schedule) — companion idea to service alerts but deliberately deferred to its own future milestone
- A standalone alerts-browsing endpoint (e.g. `GET /api/v1/alerts`) — alerts are embedded into existing route/stop responses only for v0.4
- Pushing alert updates over the SSE prediction stream — SSE carries prediction updates only; alerts stay REST-only for now
- Embedding active alerts on `GET /api/v1/predictions` (REST) responses (ALRT-09) — deferred to v2; a stop/route's own response already carries its active alerts via Phase 9's embedding, so a duplicate flag/array on the predictions response was judged redundant — Phase 9 D-05

## Context

- This repo is intended to eventually house both the backend API and the Expo/React Native frontend (monorepo by design, not separate repos) — the frontend itself is planned for a future milestone
- The Expo app will consume this API for near-real-time bus arrivals: 30-second refresh cadence, offline caching, and an animated countdown UI (client-side concerns, out of scope until that milestone)
- Existing codebase mapped in `.planning/codebase/` (STACK.md, ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, INTEGRATIONS.md, CONCERNS.md) — predates v0.2, not yet refreshed with Phase 3/4 additions
- Shipped v0.1: Biome is now the sole lint/format tool (Prettier fully removed), entire repo reformatted to it
- Shipped v0.2 (2026-08-27): stop discovery (`StopService`/`StopController`) plus a live SSE predictions feed (`PredictionStreamService`/`PredictionStreamController`) with a shared per-stop poll loop and `generatedAt` freshness on both REST and SSE — 217/217 tests pass, ~97% coverage on new code, `bun run build`/`bun run lint` clean
- Package manager is Bun; TypeScript target ES2020/CommonJS, strict mode fully enabled
- Known tech debt: `lint:fix`'s `--apply-unsafe` flag is deprecated by Biome 1.9.4 in favor of `--write --unsafe` (non-blocking, flagged in Phase 1 code review); 15 pre-existing Biome warnings remain by design (Axios `baseURL` naming, `*.test.ts` filename convention, intentional non-Error throws in tests) — see 02-CONTEXT.md D-02
- Known tech debt (v0.2): `PredictionStreamController`'s initial SSE write is guarded only against synchronous throws — a mid-write client-socket error surfaces asynchronously via an `'error'` event, which no handler currently catches anywhere in `src/server` (no `res.on("error", ...)` or process-level `unhandledRejection` handler). Flagged as residual Warning WR-05 in `.planning/phases/04-live-predictions-via-sse/04-REVIEW.md` after a 3-iteration code-review fix cycle that closed 3 Critical race/leak bugs and 4 other Warnings; does not violate any LIVE-01..05 requirement as scoped
- Note: an unrelated, pre-existing uncommitted fix to `BusDataRepository.ts` (dedupe `initialize()`/`refreshData()` load paths, commit `b52c130`) was swept into the v0.2 execution history by the automated code-review-fix pipeline picking up dirty working-tree state — not part of Phase 3/4 scope, flagged to the user during execution, left in place as a correct fix
- Shipped v0.3 Phase 6 (2026-08-31): anonymous device-scoped Favorites HTTP API (`POST`/`DELETE`/`GET /api/v1/favorites`) on top of Phase 5's `FavoritesRecentsRepository`, plus a new `requireDeviceId` middleware (reusable by Phase 7 Recents) and `FavoritesService`/`FavoritesController` pattern for Phase 7 to mirror — 284/284 tests pass, existing v0.2 endpoints verified untouched
- Known tech debt (v0.3 Phase 6): `FavoritesController.unfavorite` doesn't trim/validate `entityId` the way `favorite` does, and `favorite`'s `entityId` is trim-validated but the untrimmed value is what's persisted/looked up — both whitespace-padded-id edge cases, non-blocking, flagged as WR-01/WR-03 in `.planning/milestones/v0.3-phases/06-favorites-routes-stops/06-REVIEW.md`
- Shipped v0.3 Phase 7 (2026-09-01): automatic recents tracking — every prediction lookup fire-and-forget-logs its stop (and, when an explicit route filter is given, its route) as a recent via `FavoritesRecentsRepository`, capped at 5 combined entries per device (oldest-evicted-first), listable via `GET /api/v1/recents` (`RecentsService`/`RecentsController`, mirroring the Phase 6 Favorites pattern); SSE stream path untouched; 313/313 tests pass. Code review caught a pre-ship BLOCKER (CR-01): route recents were written keyed by the client-supplied route *short name* (e.g. `"1A"`) but read back via `getRouteById`, which is keyed by internal route id — every route recent silently vanished from the response. Fixed same-session by resolving short name → internal id (`getRouteByShortName(...)?.id`) before persisting, matching the convention `FavoritesService`/`RecentsService.resolveEntity` already assumes for routes.
- Known tech debt (v0.3 Phase 7): `RecentsController.resolveDeviceId` unsafely casts the device-id header to `string` with no in-controller guard (relies entirely on `requireDeviceId` middleware ordering); its `NotFoundError`→404 branch is currently unreachable since `RecentsService.listRecents` never throws; device-id header parsing logic is duplicated across `RecentsController`/`PredictionController`/`requireDeviceId` middleware/`FavoritesController`; the recents cap (`5`) is a magic number embedded in a SQL string rather than a named constant; `resolveEntity` is duplicated verbatim between `RecentsService` and `FavoritesService` — all non-blocking, flagged as WR-02/WR-03/IN-01/IN-02/IN-03 in `.planning/milestones/v0.3-phases/07-recents-routes-stops/07-REVIEW.md`
- Known tech debt (Phase 9): `RouteWithAlerts` (`BusRoute & { alerts }`) is built via object spread over a `BusRoute` class instance, which loses its prototype methods (`getAllStops`, `getDirectionById`) even though the static type doesn't reflect that — a latent type-unsoundness (WR-01 in `09-REVIEW.md`), no live call site hits it today
- Known tech debt (Phase 9): `ServiceAlertRepository.isAlertActive`'s date-boundary checks fail open (treat the alert as active) on a malformed `activePeriod` date string rather than excluding/logging it, since `NaN` comparisons are always false (WR-02 in `09-REVIEW.md`)
- v0.4 originates from a planted seed (SEED-001) captured in a prior session, itself from research over the Swiftly API docs cross-checked against the DASH real-time API already integrated here; this worktree treated v0.4 as the next milestone after v0.2 independent of the then-unmerged v0.3 (Favorited & Recent Routes) branch — v0.4's phases were renumbered from 5-6 to 8-9 when both branches were merged into `main`, to keep phase numbering continuous
- Shipped v0.4 Phase 8 (2026-09-04): `ServiceAlertService`/`ServiceAlertRepository`/`ServiceAlertPollService` ingest GTFS-RT service alerts from DASH/Swiftly's `gtfs-rt-alerts/v2?format=json` endpoint on a dedicated 5-minute poll, independent of the 30s prediction poll; alerts are filtered to only the currently-active window in-memory. Took 6 gap-closure rounds to reach the real live payload shape — the endpoint is a flat, custom Swiftly/Alexandria JSON format (bare top-level array, camelCase fields, ISO-8601 dates), not the nested GTFS-RT-protobuf-derived `{entities:[...]}` envelope with `{translation:[...]}` wrappers that early rounds assumed from an unreliable auto-generated API-doc example. Ingestion-only phase — no HTTP surface yet, wired into responses in Phase 9. 255/255 tests pass, `bun run build` clean, 0 open security threats (12/12 closed, see `08-SECURITY.md`)
- Shipped v0.4 Phase 9 (2026-09-08), completing the v0.4 milestone: alerts embedded onto `GET /api/v1/routes/all`, `/routes/:shortName`, `/routes/:shortName/stops`, and `/stops/nearby` via a new trimmed `ServiceAlertSummary` response type and `ServiceAlertRepository.getActiveAlertsForRoute`/`getActiveAlertsForStop`, wired into `BusRouteService`/`StopService` via factory-DI. ALRT-09 (predictions) was descoped mid-phase to v2 — a route/stop's own response already carries its alerts, making a predictions-side duplicate redundant. 283/283 tests pass, 98% coverage, 0 open security threats (6/6 closed, see `09-SECURITY.md`). Code review surfaced 2 non-blocking warnings carried forward as tech debt (see Constraints/tech-debt note below). Human UAT confirmed the atomic Map-swap concurrency reasoning for the 5-minute alert-refresh poll.

## Constraints

- **Tooling**: Biome must remain the linter (existing `biome.json` config — 120 char line width, 4-space indent, `noDefaultExport` disabled) — no reason to replace it, only to stop pairing it with Prettier
- **Compatibility**: Build step (`tsc` → `dist/`) and test runner (Vitest) are out of scope and must keep working unchanged after the lint/format swap

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Drop Prettier, standardize on Biome for lint + format | Biome already includes a formatter; running Prettier alongside it is pure redundancy | Shipped Phase 1 |
| Keep `tsc` for build | Standard, dependency-free way to compile TS → CommonJS for a Node server; Vite is a frontend-oriented bundler and a poor fit here | Confirmed Phase 1 (build unaffected) |
| Land the mass reformat as its own commit | Keeps the tooling/config change reviewable separately from the resulting whitespace/style diff | ✓ Shipped Phase 2 |
| Leave `lint`/`lint:fix` scripts untouched in Phase 1 | They already invoked Biome and were the reference pattern for the new `format`/`format:write` scripts | ✓ Shipped Phase 1 — surfaced one follow-up: `lint:fix`'s `--apply-unsafe` flag is deprecated by Biome 1.9.4 in favor of `--write --unsafe` (non-blocking, logged in code review) |
| Preserve the 15 pre-existing Biome warnings unchanged (no renames, no suppressions) during the Phase 2 reformat | Keeps the reformat purely cosmetic and scoped; fixing warnings is a separate, deliberate decision | ✓ Shipped Phase 2 |
| Replace Core Value with a product-level statement ("Riders can always see accurate, near-real-time arrival predictions for their stop") | The v0.1 Core Value ("single command for lint/format") was scoped to that tooling cleanup, not a lasting product value; v0.2 is the first feature milestone | ✓ Good — Shipped v0.2 |
| Use Server-Sent Events (not WebSocket) for live predictions, with REST retained as fallback | SSE is one-way push over plain HTTP — simplest fit for this Express app and easy for the future Expo client to consume; bidirectional messaging isn't needed yet | ✓ Good — Shipped Phase 4 |
| Server runs one shared 30s upstream poll per subscribed stop, stopping when idle | Decouples client refresh cadence from per-client polling; protects upstream DASH API from being hammered by many simultaneous phone clients | ✓ Good — Shipped Phase 4, verified concurrency-safe after a 3-iteration code-review fix cycle (see Context) |
| This repo will eventually house both backend and Expo/React Native frontend (monorepo) | User doesn't want to manage separate repos; frontend build itself deferred to a future milestone | — Pending (unchanged by v0.2, still the plan for next milestone) |
| Stop discovery lives in a new `StopController`/`StopService` pair, not folded into `BusRouteController`/`BusRouteService` | Stop discovery is a distinct concern from route CRUD even though one URL nests under `/routes`; splitting it out later would touch call sites and tests | ✓ Shipped Phase 3 |
| `GET /:shortName/stops` groups stops by direction (`[{ directionId, title, stops }]`) instead of a deduped flat list | Response shape is a public contract — flattening later would be a breaking change for client apps; iterating `route.directions` preserves real sequence order that `getAllStops()` loses | ✓ Shipped Phase 3 |
| Nearby-search radius/distance in miles, default radius 0.5mi, default count 10 (cap 50), results sorted ascending by distance | Matches how a rider thinks about "how far," and bounds response size against a dense stop dataset | ✓ Shipped Phase 3 |
| Favorites/recents identity is an anonymous device ID sent via `X-Device-Id` header, no auth system | Backend serves multiple clients, so favorites can't live in per-device local storage alone; full accounts are unnecessary complexity for v1 and the device ID becomes a natural foreign key if real accounts are added later | ✓ Shipped Phase 6 |
| Favorites/recents persisted in SQLite behind a new repository, isolated from the existing DASH-proxy `BusDataRepository` | Zero ops (file-based, no external service), fits the existing repository-pattern architecture, easy to swap for Postgres later without touching services/controllers | ✓ Shipped Phase 5/6 |
| Unfavorite is a plain SQL DELETE with no rows-affected check, and repository upsert uses `INSERT ... ON CONFLICT DO UPDATE` | Makes both favorite-an-already-favorited and unfavorite-a-non-favorite true no-op successes without a read-then-write race | ✓ Shipped Phase 6 |
| Recents are auto-logged on any prediction/stop lookup rather than requiring a dedicated "log view" call | Reflects actual usage automatically; avoids relying on clients to remember to call a separate endpoint | ✓ Shipped Phase 7 |
| Route recents are persisted keyed by the route's internal `id`, resolved from the client-supplied short name at write time, not the short name itself | Matches the id-keyed lookup `resolveEntity`/`getRouteById` already uses for route favorites and recents hydration — keeping one canonical identifier avoids a write/read mismatch (caught as CR-01 in code review) | ✓ Shipped Phase 7 |
| Request `?format=json` explicitly from the DASH/Swiftly `gtfs-rt-alerts/v2` endpoint | Endpoint defaults to protobuf-binary with no format parameter; JSON is opt-in per Swiftly's own docs | ✓ Shipped Phase 8 — root-caused after 3 prior gap-closure rounds treated symptoms (string-body parsing, entity/entities rename) without addressing why the body wasn't JSON |
| Accept a bare top-level JSON array (no `{entities:[...]}` envelope) as the alerts payload, confirmed via a temporary live-boot diagnostic log rather than re-guessing from API docs | The real live shape is a flat, custom Swiftly/Alexandria format, not the nested GTFS-RT-protobuf-derived shape an auto-generated doc example implied | ✓ Shipped Phase 8 |
| Embed a trimmed alert summary (id/cause/effect/headerText/descriptionText/activePeriod), omitting `url`/`informedRouteIds`/`informedStopIds` | Those fields are redundant once an alert is attached to a specific route/stop, and keeping them off the wire limits public exposure to only what riders need | ✓ Shipped Phase 9 |
| Match alerts to routes/stops via internal `BusRoute.id`/`BusStop.id` (DASH's own ID space), not `shortName`/`code` | Same ID space GTFS-RT `informedEntities.routeId`/`.stopId` already populate on ingestion (Phase 8) — no re-derivation needed | ✓ Shipped Phase 9 |
| Drop agency-wide alerts (no informed route/stop at all) from route/stop responses in v0.4 | Scoping to explicitly-informed entities keeps the matching logic simple; a later phase can add agency-wide surfacing without touching it | ✓ Shipped Phase 9 |
| Defer ALRT-09 (alerts on predictions responses) to v2 | A stop/route's own response already carries its active alerts via Phase 9's embedding — a duplicate flag/array on the predictions response was judged redundant | ✓ Deferred — moved out of v0.4 scope |
| `VehicleService` gains repository-backed `getRouteByShortName` route validation before any DASH fetch, matching `BusRouteService`'s existing 404 pattern | Quick task 260915-fc8 had forwarded an unvalidated client-supplied route string straight to the DASH API; validating first closes that and gives correct 404s | ✓ Shipped Phase 10 |
| Coordinate/timestamp safety filter in `mapToVehiclePositions` uses `typeof value === "number" && Number.isFinite(value)`, not `!Number.isNaN(...)` | Code review (CR-01/CR-02) found the NaN-only check missed missing/undefined/null lat/lon and let a malformed `loc.time` crash the entire request instead of just dropping the one bad vehicle | ✓ Shipped Phase 10 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

---
*Last updated: 2026-09-22 after Phase 10*

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-08 after v0.4 milestone*
