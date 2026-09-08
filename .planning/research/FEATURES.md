# Feature Research

**Domain:** Anonymous-identity favorites & recents for a transit-data backend API
**Researched:** 2026-08-31
**Confidence:** MEDIUM (well-established API design conventions; general-web sources were shallow/generic — see Sources — but corroborate well-known patterns from transit apps like Citymapper, Google Maps, Transit App, and CTA/MTA companion apps, and from standard "recently viewed" implementations, e.g. Salesforce's Recent Items API and e-commerce recently-viewed rails)

## Feature Landscape

### Table Stakes (Users Expect These)

Features a rider expects from any "starred routes" / "recent routes" experience. Missing these makes the feature feel broken or half-built.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Add a route to favorites | Core interaction — every transit app (Citymapper stars, Google Maps saved stops, Transit App pins) lets you mark a route/stop | LOW | `POST` keyed on device ID + route identifier (`shortName`). Must be idempotent — favoriting an already-favorited route should not error or create a duplicate. |
| Remove a route from favorites | Symmetric to add; unfavoriting is used as often as favoriting | LOW | `DELETE` keyed the same way. Removing a non-favorited route should be a no-op success (idempotent), not a 404 — clients shouldn't have to track state to safely call it. |
| List favorites with full route details | A bare list of route IDs forces the client into N+1 lookups against `GET /routes/:shortName`; defeats the purpose of a "my routes" screen | LOW–MEDIUM | Join favorites rows against the in-memory `BusDataRepository` route data at request time so the response is self-sufficient (same shape as the existing routes endpoints) plus a `favoritedAt` timestamp. |
| Favorites ordered most-recently-favorited-first | Matches the explicit requirement and matches user mental model ("what did I just add") — same ordering convention as recents | LOW | `ORDER BY favorited_at DESC` in SQLite; no client-side sort needed. |
| Auto-tracked recent routes (no explicit "log view" call) | Users don't think in terms of "logging a view" — they just use predictions/stops; the system should infer intent from usage, same as browser history or Amazon's recently-viewed rail | MEDIUM | Must be triggered as a side effect inside existing `PredictionService`/`StopService` request paths (or their controllers) — not a new endpoint. Needs to be async/non-blocking so a slow write to SQLite never delays a prediction response. |
| Recents deduped, most-recent view bumps to top | This is the single biggest UX trap and also the standard convention (Salesforce Recent Items, e-commerce "recently viewed") — re-viewing route 22 for the fifth time in a day should not fill all 5 slots with route 22 | LOW–MEDIUM | Requires an `UPSERT` (`INSERT ... ON CONFLICT(device_id, route_short_name) DO UPDATE SET viewed_at = ...`), not a naive `INSERT`. See Pitfalls below. |
| Recents capped at last 5, oldest evicted | Explicit requirement; also matches "recent" mental model — a recents list that grows unbounded stops being "recent" | LOW | Enforce the cap at write time (delete rows beyond rank 5 for that device) rather than truncating at read time, so the table doesn't grow unbounded across all devices. |
| List recents with full route details | Same rationale as favorites list — client shouldn't have to re-fetch route data per recent entry | LOW–MEDIUM | Same join pattern as favorites list. |
| Anonymous device-scoped identity via header | Multi-client backend (future Expo app + potentially others) cannot rely on local-only storage if the intent is "your favorites travel with you across app reinstalls/devices sharing an ID" — explicit `X-Device-Id` requirement in scope | LOW | Treat the header as an opaque client-generated identifier (e.g., UUID), never validated for format beyond presence/non-empty; missing header is a 4xx, not a silent fallback. |
| Consistent error handling matching existing layers | Existing convention: `NotFoundError` → 404, `UpstreamApiError` → 502, unknown → 500 | LOW | A favorite/recent referencing a route that no longer exists in `BusDataRepository` (e.g. DASH removed a route) needs an explicit decision — see Pitfalls. |

### Differentiators (Competitive Advantage)

None of these are required for v1 MVP scope, but they're the natural "not yet, and here's why not" list — useful for the roadmap to explicitly defer rather than silently forget.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Manual favorite reordering / drag-and-drop | Lets power users pin their most-used route first instead of relying on recency | MEDIUM | Requires an explicit `sortOrder` or fractional-index column and a reorder endpoint — real complexity for a v1 with no cap and no UI yet. **Explicitly out of scope per requirements** (ordering is derived, not stored). |
| Favorite folders / tags / grouping | Useful once users have 10+ favorites (e.g. "home commute" vs "weekend") | MEDIUM–HIGH | New junction schema, new endpoints; nothing in current requirements suggests users have enough routes to need grouping (a metro area realistically has dozens of routes total). |
| Cross-device sync beyond the device ID | "I favorited on my phone, now show it on my tablet" | N/A — already solved | The device-ID-as-identity model already gives this for free if the same ID is reused; a *differentiator* would be linking multiple device IDs to one identity (real accounts), which is explicitly deferred per PROJECT.md ("device ID becomes a natural foreign key if real accounts are added later"). |
| Push/notification when a favorited route has a service alert | High retention value for a transit app | HIGH | Needs a notification delivery mechanism (push tokens, APNs/FCM) that doesn't exist anywhere in this backend yet — a different milestone entirely. |
| Recents that span other read types (e.g. "recently viewed stops" not just routes) | Richer personalization | LOW–MEDIUM | Requirements say "recent **routes**" specifically; broadening to stops is a plausible v1.1 extension of the same schema (add an `entity_type` column) but is scope creep for this milestone. |
| Favorite-aware prediction batching (single call for all favorited routes' predictions) | Would let a future "home screen" show live arrivals for every favorite in one request | MEDIUM | Valuable once the Expo client exists and needs a dashboard view; premature now since no client consumes this yet and the existing `/predictions` endpoint already takes multiple params. |

### Anti-Features (Commonly Requested, Often Problematic)

Flagged explicitly so the roadmap and future contributors don't drift into them mid-implementation.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Combined single `/favorites-and-recents` endpoint | Seems convenient — "one call, one screen" | Couples two resources with different write triggers (explicit user action vs. auto-logged side effect), different cardinalities (unbounded vs. capped at 5), and different semantics (idempotent add/remove vs. auto-eviction). Conflates concerns and makes each harder to test/reason about independently, contrary to the "keep components modular" principle | **Two separate endpoints** — `GET /api/v1/devices/:deviceId/favorites` (or header-scoped `GET /api/v1/favorites`) and `GET /api/v1/recents` — each independently cacheable/testable, mirroring how `BusRouteController` and `StopController` are already split by concern even though both nest under routes |
| A dedicated "log a view" endpoint that clients must call | Feels more explicit/controllable from a client's perspective, and is easier to unit test in isolation | Explicitly rejected by the requirements ("no separate log view endpoint") — it relies on every client remembering to call it, which real client apps (especially a future non-Expo integrator) will forget or get wrong, silently breaking recents for that client only | Auto-log as a side effect of existing prediction/stop-lookup service calls, so recents are correct by construction for every current and future client |
| Storing full route payload (denormalized snapshot) on the favorite/recent row | Avoids a join, feels "simpler" | Snapshot goes stale the moment DASH route data changes (name, path, etc.) and duplicates the source of truth that already lives in `BusDataRepository`; violates the existing architecture's single-repository-per-concern boundary | Store only `deviceId` + `routeShortName` (+ timestamp), resolve full route details by joining against `BusDataRepository` at read time — same pattern the codebase already uses for everything else |
| Validating/authenticating the device ID (format checks, signature, server-issued tokens) | Feels more "secure," prevents ID guessing/squatting | No accounts exist; there's nothing sensitive behind a favorites list (route names are public data), so cryptographic identity is solving a threat that doesn't exist yet and adds real complexity (token issuance endpoint, storage, rotation) for zero MVP value | Treat `X-Device-Id` as an opaque, client-generated, non-secret identifier; require presence and reasonable non-empty format, nothing more |
| A cap/limit on favorites (mirroring the 5-item recents cap) | Symmetry with recents, and it bounds table growth | Explicit requirement says **no cap** on favorites — a rider's set of "routes I care about" is a deliberate, bounded-by-nature user action (nobody manually favorites hundreds of routes), unlike recents which is auto-generated and needs eviction to stay meaningful | Leave favorites uncapped; if unbounded growth ever becomes a real problem (it won't at this scale — a metro system has dozens, not thousands, of routes), revisit later with actual data |
| Silent fallback / anonymous-anonymous default when `X-Device-Id` header is missing (e.g. a shared "no device" bucket) | Seems more forgiving for a first integration attempt | Silently pools unrelated clients' favorites/recents into one shared record, which is worse than an explicit error — a client bug becomes indistinguishable from correct behavior and corrupts a stranger's-looking-like-shared data | Require the header; return a clear 4xx (e.g. 400) when absent, matching how the existing app already crashes loudly on missing required env vars rather than silently defaulting |
| Deleting a favorite/recent row when the underlying DASH route disappears (cascading delete on every route refresh) | Feels like tidy referential integrity | `BusDataRepository`'s in-memory data is refreshed/replaced periodically from DASH; wiring a cascade from that repository into the new favorites/recents repository couples two repositories that the architecture explicitly keeps isolated ("no changes to existing DASH proxy repository") | Leave the favorites/recents row as-is; when resolving route details at read time, if the route is no longer found in `BusDataRepository`, either omit that entry from the response or include it with a `routeAvailable: false`-style flag — a controller/service-layer decision, not a repository-coupling one |

## Feature Dependencies

```
Favorites (add/remove/list)
    └──requires──> SQLite persistence layer (new repository)
    └──requires──> Full route detail resolution ──from──> BusDataRepository (existing, read-only)

Recents (auto-log/list)
    └──requires──> SQLite persistence layer (new repository)          [same table infra as favorites, separate table]
    └──requires──> Full route detail resolution ──from──> BusDataRepository (existing, read-only)
    └──triggered by──> PredictionService request path (existing)
    └──triggered by──> StopService request path (existing)

Both Favorites and Recents
    └──require──> Device identity resolution (X-Device-Id header parsing/validation, new small middleware/util)

Recents auto-log ──conflicts with (ordering)──> naive INSERT-only recent-view logging
    (must be UPSERT-based bump-to-top, not append-only, to satisfy "last 5, no duplicate spam" requirement)
```

### Dependency Notes

- **Favorites and Recents both require the SQLite persistence layer**, but as two distinct tables (or two logically distinct concerns even if physically one DB file) — not one shared table, because their write semantics differ (explicit idempotent toggle vs. auto-logged eviction). Both should land in the same phase as the persistence layer, since neither is useful without it.
- **Both require device identity resolution** — this is a small, shared piece of infrastructure (parse `X-Device-Id`, reject if missing) that both features depend on identically. Build it once, use in both controllers, likely as Express middleware so it's enforced consistently rather than re-implemented per controller.
- **Both require joining against the existing `BusDataRepository`** to hydrate full route details in list responses — this is a read-only dependency on existing, already-stable code; no changes needed there, per PROJECT.md's explicit constraint ("no changes to existing DASH proxy repository").
- **Recents auto-log depends on existing prediction/stop lookup service paths** (`PredictionService`, `StopService`, and by extension `PredictionStreamService` if SSE subscriptions should also count — a decision worth pinning down explicitly, since SSE connections are long-lived and "viewed" differently than a single REST call). This is the one place new code reaches *into* existing service logic rather than sitting purely alongside it, so it's the highest-risk integration point for regressions in the existing v0.2 prediction/stop features.
- **Recents' bump-to-top/UPSERT behavior conflicts with a naive append-only log design** — call this out explicitly in the phase plan so whoever implements it doesn't default to `INSERT` and get five duplicate rows for one frequently-checked route.

## MVP Definition

### Launch With (v1) — scoped exactly to this milestone

- [ ] `POST`/`DELETE` favorite by route (device-scoped, idempotent both directions) — the whole point of the feature
- [ ] `GET` favorites list, most-recently-favorited-first, full route details, no cap — required for a client to render anything
- [ ] Auto-log recent route on prediction lookup and on stop lookup, UPSERT/bump-to-top semantics, capped at 5 — required by explicit spec, and the auto-trigger is the part most likely to be gotten wrong if deferred/rushed
- [ ] `GET` recents list, most-recent-first, full route details — same rationale as favorites list
- [ ] SQLite repository behind the same layered architecture (routes → controllers → services → repository), isolated from `BusDataRepository`
- [ ] `X-Device-Id` required-header handling with a clear 4xx on absence

### Add After Validation (v1.x)

- [ ] Include stop-level context in recents (which stop was being checked, not just which route) — only worth doing once there's a real client UI to consume it and a concrete UX need surfaces
- [ ] Favorite-aware batched predictions endpoint — worth doing once the Expo client's home-screen design is settled

### Future Consideration (v2+)

- [ ] Real accounts / cross-device-ID linking — explicitly deferred in PROJECT.md; device ID is designed to become a foreign key later
- [ ] Manual favorite ordering (drag-and-drop) — needs a UI to even be meaningful; premature before any client exists
- [ ] Folders/tags for favorites — only relevant once favorite counts are large enough to need organizing, unlikely at this domain's route-count scale
- [ ] Notifications on favorited-route service alerts — a different milestone's worth of infrastructure (push delivery)

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|----------------------|----------|
| Add/remove favorite | HIGH | LOW | P1 |
| List favorites (hydrated) | HIGH | LOW–MEDIUM | P1 |
| Auto-log recent (UPSERT, capped) | HIGH | MEDIUM | P1 |
| List recents (hydrated) | HIGH | LOW–MEDIUM | P1 |
| Device-ID middleware | HIGH (enabling) | LOW | P1 |
| Batched favorites-predictions endpoint | MEDIUM | MEDIUM | P3 |
| Favorite reordering | LOW (at this route-count scale) | MEDIUM | P3 |
| Folders/tags | LOW | MEDIUM–HIGH | P3 |
| Push notifications on alerts | MEDIUM–HIGH (later) | HIGH | P3 |

**Priority key:**
- P1: Must have for launch (this milestone)
- P2: Should have, add when possible (none identified for this milestone — scope is tightly and correctly bounded)
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Citymapper / Transit App (mobile transit apps) | Salesforce Recent Items API (backend precedent) | Our Approach |
|---------|--------------------------------------------------|---------------------------------------------------|--------------|
| Favoriting | Star icon on a route/stop, instantly toggled, unlimited saves | N/A (no favorites concept) | Same instant-toggle idempotent add/remove, unlimited, device-scoped instead of account-scoped |
| Recents | "Recent searches"/"recently viewed" rail, capped list, most-recent-first, re-view bumps existing entry rather than duplicating | Recent Items resource explicitly re-orders on repeat access rather than duplicating, capped list size | Same bump-to-top + cap-at-5 semantics, but auto-triggered server-side from actual API usage rather than client-reported "view" events |
| Identity | Account-based (Google/Apple sign-in) or fully local device storage, no in-between | Account-based (Salesforce org user) | Deliberately in-between: anonymous device ID as a lightweight identity that's still server-persisted (unlike pure local storage) and account-upgradeable later (unlike pure account systems) |

## Sources

- General REST resource-design conventions (plural nouns, HTTP verb mapping, DTO responses over raw entities) — [REST API Design: 18 Proven Best Practices](https://medium.com/@js_9757/rest-api-design-18-proven-best-practices-for-clean-and-efficient-endpoints-a295ba46c514), [REST API Best Practices – freeCodeCamp](https://www.freecodecamp.org/news/rest-api-best-practices-rest-endpoint-design-examples/) — confidence: LOW (general web, unverified against this domain specifically, but consistent with widely-known conventions already used elsewhere in this codebase)
- Recently-viewed / bump-to-top precedent — [Salesforce Recent Items REST API Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/resources_recent_items.htm), [Amazon Recently Viewed Items system design write-up](https://shekhargulati.com/2019/09/05/system-design-design-the-amazon-recently-viewed-items-page-api/) — confidence: LOW (general web) but corroborates a well-established, widely-implemented UX pattern independently observable in most consumer apps (browsers, e-commerce, transit apps)
- Anonymous device-identity pattern precedent — [Mixpanel: Identifying Users (device_id)](https://docs.mixpanel.com/docs/tracking-methods/id-management/identifying-users-simplified) — confidence: LOW (analytics-SDK context, adapted by analogy rather than directly transit-domain-specific)
- SQLite foreign-key/schema mechanics — [SQLite Foreign Key Support (sqlite.org)](https://sqlite.org/foreignkeys.html) — confidence: MEDIUM (official SQLite documentation)
- Domain-general knowledge of mobile transit-app UX conventions (Citymapper, Google Maps Transit, Transit App starred/recent routes) — model prior knowledge, not independently re-verified this session; flagged for spot-check if the roadmap wants a closer competitive audit

---
*Feature research for: anonymous-device favorites & recents backend, dash-tracker v0.3*
*Researched: 2026-08-31*
