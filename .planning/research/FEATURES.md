# Feature Research

**Domain:** Transit rider app for one agency (DASH, Alexandria VA): route → stop → live arrivals, Expo app on iOS, Android and web, built on the existing dash-tracker API
**Researched:** 2026-10-20
**Confidence:** MEDIUM overall. The API contract comes from reading `src/server/api` directly (HIGH). UX conventions come from Transit app and OneBusAway docs (MEDIUM). Citymapper and DASH-tracker UI details are thin (LOW). Two upstream-data facts still need a check against the live DASH payload: whether routes carry `color`/`textColor`, and whether predictions carry any realtime-vs-scheduled flag. See Gaps.

---

## What the backend actually gives the app (read from source, HIGH)

These facts limit what the app can show. Several of them differ from what the milestone brief assumes.

| Endpoint | Shape the app receives | Implication for features |
|---|---|---|
| `GET /routes/all` | `RouteWithAlerts[]`: `{ id, shortName, longName, name, type, directions[{ id, title, headSigns, stops[...] }], alerts[] }` | **No `color`/`textColor`.** `BusDataRepository` calls `/info/{agency}/routes?verbose=true`. Swiftly route objects carry `color`/`textColor` (6-hex, no `#`), but `RouteData`/`BusRoute` throw them away. Each route also embeds every direction and stop, so this one list payload is heavy, though fine for DASH's ~15 routes. Order follows DASH, not a sort. |
| `GET /routes/:shortName/stops` | `RouteDirectionStops[]`: `[{ directionId, title, stops: [{ id, name, code, lat, lon, alerts[] }] }]`, stops in sequence order | Directions come pre-grouped, so the app does no grouping. `code` (a number) is the rider-facing stop ID that DASH prints on signs and uses for its web tracker and SMS (text `DASHBUS <id>` to 41411). No limiter; 404 for an unknown route, 503 before the first load. |
| `GET /predictions?stop=<id>[&route][&number]` | `StopPredictionsResponse`: `{ success, generatedAt (ISO), data: { agencyKey, stop: { id, name, code }, routes: [{ routeId, routeShortName, routeName, stopId, stopName, stopCode, destinations: [{ directionId, headsign, predictions: [{ min, sec, time (unix s), tripId, vehicleId }] }] }] } }` | Carries **no realtime/scheduled flag** and **no alerts** (ALRT-09 was deferred). The response includes stop name and code, so the arrivals screen can render with no prior navigation state, which matters for web deep links. Rate-limited at 60/min/IP. |
| `GET /predictions/stream?stop=<id>` | SSE frames `event: prediction` + `data: <StopPredictionsResponse>`. The first frame is sent right away; after that, one frame every 30 s from a shared per-stop poll | **Takes no `route` or `number` parameter.** The stream calls `getPredictionsForStop(stopId)` with no options, so every frame holds every route at the stop, at Swiftly's default count. No `id:`, no `retry:`, no heartbeat. When an upstream poll fails, **no frame is sent**: the stream just goes quiet and the client only sees `generatedAt` stop moving. When a stop drops out of the dataset, the server ends the stream, and a reconnect gets 404. The connect counts against the 60/min bucket, and each IP can hold at most 5 open streams (429 + `Retry-After: 5`). |
| Error body (all) | `{ error, details }`; 503 with `Retry-After: 5`; 429 with `Retry-After` (up to 60 from the bucket, 5 from the stream cap); 502; 404; generic 500 | Clients can read `Retry-After` reliably on native. On Expo web the server must send `Access-Control-Expose-Headers: Retry-After`, or JS cannot read it. That requirement belongs to the v0.7 CORS feature. |

**Rule that follows from these shapes:** the REST initial load and the SSE stream should use the same request, `GET /predictions?stop=<id>` with no `route` and no `number`. The app then does all route filtering and truncation on the client, in one place. If REST asks for `route=30&number=3` and SSE frames carry every route at the default count, the list visibly changes on the first SSE frame (rows appear, the count shifts).

---

## Feature Landscape

Suggested REQ-ID prefixes: `ROUTE-` (route list), `STOP-` (stop list), `ARR-` (arrivals), `LIVE-` (stream lifecycle), `STATE-` (loading/empty/error), `A11Y-`, `CFG-`.

### Table Stakes (Users Expect These)

A rider who opens any transit app expects all of these. If one is missing, the app feels broken or untrustworthy.

#### Route list (`/routes/all`)

| Feature | Why Expected | Complexity | Notes / Dependency |
|---|---|---|---|
| Each row shows a route badge (`shortName`) and the `longName` | Every transit app (Transit, OBA, Google Maps) leads with the short name riders see on the bus. The long name tells similar routes apart. | LOW | `/routes/all`. Fall back to `name` if `longName` is empty: the repository defaults missing names to `""`. |
| Natural sort by short name (`30, 31, … 36A, 36B, 102, 103`) | Plain string sort puts `102` before `30`, which reads as a bug | LOW | `a.shortName.localeCompare(b.shortName, undefined, { numeric: true })`. Sort on the client, because the server returns DASH's order. |
| Badge in the route's color | Riders find their line by color. Transit, Google Maps and DASH's own maps all color-code lines. | LOW (app) + LOW (server) | **Needs a server change:** add `color`/`textColor` to `RouteData` → `BusRoute` → response. Confirm DASH fills them first (apply the Phase 8 lesson: capture the live payload before adding types). Fallback: a single neutral brand badge, which costs nothing and keeps the flow working. Use `textColor` for the label, not a computed contrast. |
| Alert marker on a route row that has active alerts | Transit puts a warning icon next to the line number. The core value says a rider must not trust an ETA for a bus that is detoured. | LOW | `alerts[]` is already embedded. A marker and a count only, not a dedicated alerts UI. The dedicated UI stays out of scope. |
| Tap a row to open that route's stops | It is the whole flow | LOW | Expo Router path such as `/routes/[shortName]`, which also gives web a URL that survives a refresh |

#### Stop list (`/routes/:shortName/stops`)

| Feature | Why Expected | Complexity | Notes / Dependency |
|---|---|---|---|
| Stops grouped by direction, labeled with the direction `title` (e.g. "To King St Metro") | A rider thinks "which way am I going". OBA and Transit both pick the direction first. | LOW | The response is already `[{ directionId, title, stops }]`. Use a segmented control or tabs with one direction showing (best on a phone), or a `SectionList` with header sections. Opinion: **use a direction toggle defaulting to the first direction**, because showing ~40 stops twice makes riders scroll. |
| Stops in route sequence order | Riders scan along the line ("the one after Braddock") | LOW | Already in sequence. Do not re-sort alphabetically. |
| Each row shows the stop name and the stop code ("Stop 1234") | DASH riders know stops by ID: it is printed on signs and used for the DASH tracker and the 41411 SMS service | LOW | `code` is a number. Format it, don't do arithmetic on it. |
| Alert marker on stops with active alerts (closure, relocation) | Transit shows a warning icon for closed or relocated stops | LOW | `stops[].alerts[]` is already embedded |
| A stop served in both directions appears under each | Normal behavior, and the backend lists it per direction | LOW | Key list items by `directionId + stop.id`, not `stop.id` alone, or React warns about duplicate keys |
| Tap a stop to open its arrivals | The whole flow | LOW | Route such as `/routes/[shortName]/stops/[stopId]`. Pass the stop's `alerts` along so the arrivals screen can show them, because the predictions payload does not carry alerts. |

#### Arrivals (`/predictions` → `/predictions/stream`)

| Feature | Why Expected | Complexity | Notes / Dependency |
|---|---|---|---|
| Header with stop name, stop code and the route the rider chose | Confirms the rider is looking at the right stop | LOW | Taken from `data.stop`, so it also works on a web deep link |
| Arrivals for the chosen route, grouped by destination/headsign, next 3 per destination | OBA and Transit show route + headsign + the next few times. Three is the common default. | LOW | Filter `data.routes` by `routeShortName === shortName` on the client and slice to 3. Show a destination header only when there is more than one headsign. |
| Relative time display: `Due` when under 1 min, `N min` up to 59, clock time (`3:45 PM`) at 60 min and above | Riders want "how long". Past an hour, "73 min" is harder to read than a clock time. "Due"/"Now" at the low end is universal (OBA's "5 min, 3 min, NOW"). | LOW | Use the server's `min`/`sec` as of `generatedAt`; under 60 `sec` shows `Due`. Format clock times with the device locale (`Intl.DateTimeFormat`, `hour: 'numeric', minute: '2-digit'`) from `time * 1000`. No per-second recomputation, because the animated countdown is out of scope. |
| "Other routes at this stop" section below the chosen route | The stream already sends every route at the stop. A rider at a shared stop often takes whichever bus comes first. | LOW | Already in the payload at no extra cost. Keep it visually secondary. Could be P2, but it is nearly free and avoids discarding data. |
| Freshness label: "Updated just now / 30 s ago / 2 min ago" | Riders need to know whether the number is live. The server keeps a stream open even when it stops sending frames during an upstream failure, so this label is the **only** signal the rider gets. | LOW | Compute the age from the **client's receive time** of the last payload, not `now - generatedAt`. Device clock skew would make `generatedAt` ages negative or inflated. Re-render on a coarse 10–15 s tick. |
| Stale warning when the last payload is more than ~75 s old (2 missed 30 s polls) | A silent stale ETA is the worst failure in a transit app: the rider misses the bus. | LOW | A banner such as "Live updates paused, times may be out of date" over the dimmed last-known times. Keep the last good data on screen; never blank it. |
| Live/connection indicator ("Live" while the stream is open and fresh, otherwise "Reconnecting…") | Transit's animated "waves" signal real-time data. Our only honest real-time signal is the state of the stream. | LOW | See the realtime-vs-scheduled anti-feature. This indicator describes the stream's health, not each prediction. |
| Empty state: "No upcoming arrivals for Route X at this stop" | A common, legitimate state at night, on weekends, or for a direction with no service | LOW | Tell apart (a) no routes at all and (b) other routes have arrivals but the chosen one does not; in case (b), still show "Other routes". |
| Stream lifecycle: open on screen focus, close on blur/unmount and when the app goes to background or the browser tab is hidden, reopen on return | A stream left open in the background drains battery and data, holds one of the IP's 5 stream slots, and counts against DASH quota. react-native-sse neither closes on background nor reconnects on foreground on its own. | MEDIUM | `useFocusEffect` (Expo Router/React Navigation) + `AppState` (RN web maps it to the Page Visibility API). On resume, reconnect. The first SSE frame refreshes the data immediately, so no extra REST call is needed. |
| Reconnect after a network drop, with backoff and jitter, honoring `Retry-After` | Mobile networks drop constantly (elevator, tunnel, Wi-Fi ↔ cellular) | MEDIUM | Do **not** rely on the library or browser default (~3 s fixed retry, no cap). Each reconnect spends a 60/min token, and a phone switching networks can leave dead sockets on the server that still hold stream-cap slots for a while. Use capped exponential backoff (e.g. 2 s → 30 s), reset after a frame arrives. |
| Pull-to-refresh on all three lists | A standard iOS/Android gesture; riders pull when they doubt an ETA | LOW | On arrivals: refetch REST and restart the stream. On route/stop lists: refetch (the data changes hourly at most, so this is mostly reassurance plus recovery from errors). **RN-web `RefreshControl` has no pull gesture**, so web needs a visible refresh button (also good for accessibility). |

#### Loading, empty and error states (every screen)

| Server status / condition | Expected app behavior | Complexity | Notes |
|---|---|---|---|
| Initial load in flight | Skeleton rows or a spinner, never a blank screen | LOW | |
| **503 + `Retry-After`** (server warming up, before the first DASH load) | Not an error screen. Show "Getting bus data ready…" with a spinner and **retry automatically** after `Retry-After` seconds while the screen is focused. | LOW | Applies to all three endpoints. After N retries (~1 min), add a manual Retry button but keep auto-retrying. |
| **429 + `Retry-After`** (60/min bucket, or the stream cap with `Retry-After: 5`) | "Too many requests, retrying in N s". Auto-retry once the time passes. **Keep showing the last good data** on the arrivals screen. | LOW | Only the live endpoints (`/predictions`, `/stream`) can return 429. A 429 on stream connect often means leaked streams, e.g. from dev hot reload. |
| **502** (DASH upstream failed or timed out) | Arrivals: "DASH live data is temporarily unavailable" + Retry, keeping the last data dimmed with the stale banner. If 502 happens on first load, show the error state with Retry. | LOW | Never surface `details`, which is server text, as the main message. Use fixed app copy. |
| **404** (route or stop no longer exists, including a stream ended because the stop was removed) | "This route/stop is no longer available" + a button back to the route list. **Do not retry.** | LOW | On the stream, a server-ended stream followed by a 404 on reconnect must stop the reconnect loop. |
| 500 / unexpected | Generic "Something went wrong" + Retry | LOW | |
| Network error / no response (offline, or a wrong base URL such as `localhost` from a phone) | "Can't reach the server" + Retry. In dev builds, show the configured API base URL. | LOW | Depends on the configurable API base URL (CFG). This is the most common first-run failure on a device or emulator. |
| SSE error with an unknown status | Recover the status with a REST `GET /predictions?stop=` call and branch on it | MEDIUM | Browser `EventSource` **cannot see the status of a failed connect**: a non-200 or non-`text/event-stream` response fails the connection permanently (readyState CLOSED, no auto-retry). react-native-sse exposes `xhrStatus`. One shared status-branching function serves both transports. |

#### Accessibility basics

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| Spoken labels on rows ("Route 30, Braddock Road Metro to King Street", "Route 30 to King St Metro, 5 minutes, then 18 minutes") | Screen readers read "30", "5 min" and badge glyphs poorly ("min" can be read as "minimum"). Visually impaired riders depend on transit apps more than most users (OBA has a strong AppleVis following). | LOW | `accessibilityLabel` on the row with the parts merged (`accessible` on the row container), so VoiceOver doesn't stop on every fragment. |
| Do not announce every 30 s update | A live region firing every frame makes the screen unusable with a screen reader | LOW | No `accessibilityLiveRegion="polite"` on the whole list. At most, announce the stale/reconnect banner when it first appears. |
| Dynamic Type / font scaling | iOS and Android users with large text expect it to be honored | LOW | No fixed-height rows; test at the largest scale. Badges may wrap or grow. |
| Status never conveyed by color alone | WCAG 1.4.1. Route colors are unreliable for color-blind riders. | LOW | Short name always shown as text. Stale/alert states need an icon and text. |
| Contrast on route badges | Low-contrast badge text fails WCAG AA | LOW | Use DASH's `textColor` when it exists; for the neutral fallback, choose a palette that passes AA. |
| Touch targets ≥ 44 pt / 48 dp; direction sections marked as headers (`accessibilityRole="header"`); Retry/refresh buttons reachable | Platform HIG baseline | LOW | |
| Respect Reduce Motion for any pulsing "Live" dot | Platform setting | LOW | `AccessibilityInfo.isReduceMotionEnabled`, or skip the animation entirely |

### Differentiators (Competitive Advantage)

These are not expected in a first slice, but they match the core value ("accurate, near-real-time arrival predictions for their stop"). Most should come after v0.7.

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| Stop search by stop code ("1234") on the route list | DASH riders already know the code from signs, the DASH tracker and SMS, so typing it skips two screens | LOW–MEDIUM | Needs a stop lookup by code. `BusDataRepository` keys stops by `id`, and no code endpoint exists, so this means a small server endpoint. Strong v0.8 candidate. |
| "Updated" age that ticks per second, and minutes recomputed from `time` between frames | Makes ETAs feel live between 30 s polls | MEDIUM | This is the "animated countdown", which is out of scope. The coarse tick above is enough for v0.7. |
| Delay/early status color (OBA-style green/blue/red) | Tells riders whether the bus is running late | HIGH | Needs schedule adherence (SEED-002). The API has no scheduled time. Do not attempt. |
| Inline alert header text and an expandable description on the arrivals screen | Shows why the bus is late or missing | LOW | Data is already present (stop alerts passed through navigation). Lies at the edge of the out-of-scope "dedicated alerts UI". Recommend only the header text in v0.7, with expand/details later. |
| Vehicle-on-map for the chosen arrival | A strong trust signal (Transit, Citymapper) | HIGH | `/vehicles` exists, but maps are a whole feature area. Later milestone. |
| Favorites/recents shortcuts on the home screen | Opens the app straight on "my stop" | MEDIUM | Backend done (`X-Device-Id`). Explicitly out of scope for v0.7. |
| "Nearby" tab | Covers the most common entry point in Transit and Citymapper | MEDIUM | Backend done (`/predictions/nearby`). Explicitly out of scope for v0.7. |
| Haptic tick or subtle highlight when an ETA changes | Draws attention to a changed estimate | LOW | Polish. Defer. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| **Per-prediction "real-time vs scheduled" icon** | Transit's waves and OBA's `predicted` flag make it look like table stakes | The API provides **no flag**. Swiftly prediction objects carry only `min/sec/time/tripId/vehicleId`, and `predictionMapping` copies exactly those fields. Inferring "realtime" from a non-empty `vehicleId` would be a guess shown as fact. | A stream-level "Live" indicator + freshness age + stale banner. If a live-payload check finds a Swiftly flag (e.g. `scheduleBased`), add it to `predictionMapping` in a later milestone. |
| Sending `route=` and `number=` on the REST initial load | It looks efficient: ask only for what you show | SSE frames ignore both parameters, so the list changes on the first frame, and the app ends up with two code paths for one payload type | One unfiltered request shape for REST and SSE. Filter and slice on the client in one pure function, which is also easy to unit-test. |
| Polling REST every N seconds alongside the stream ("belt and braces") | Fear that SSE is unreliable | Doubles DASH load per rider, burns the 60/min bucket (one screen at 5 s polling uses 12/min), and makes 429s likely on a shared NAT. The server already polls DASH every 30 s for everyone. | SSE only. Use REST only for the first paint, pull-to-refresh, and status recovery after an SSE error. |
| Keeping the stream open in the background "so it's instant on return" | Seems faster | Drains battery and data, holds 1 of 5 per-IP stream slots, and iOS suspends the socket anyway. The first SSE frame on reconnect arrives right away, so returning is instant without it. | Close on background/blur, reopen on active/focus |
| Treating 503 as an error screen | Simple status → error mapping | A cold server start (deploy, restart) would greet every rider with a failure for a few seconds | A "warming up" state with automatic `Retry-After` retries |
| Echoing the server's `details` string as UI copy | Easy to wire up | Server text is developer-facing and can change without notice | App-owned copy per status. Log `details` in dev only. |
| Clearing the arrivals list on error or reconnect | "Don't show stale data" | A rider at the stop loses the last good estimate exactly when they need it | Keep the data, dim it, show the age and a stale banner |
| Showing raw `sec` countdowns ("1,511 s") or minutes past 60 ("93 min") | Precise | Hard to read. Precision to the second is false, since the data is up to 30 s old. | `Due` / `N min` / clock time past 60 min |
| Offline caching of routes and stops | Faster start, works with no signal | Explicitly out of scope; adds cache invalidation and versioning on top of a contract that is still settling | Fetch on every launch. In-memory query cache only (e.g. TanStack Query `staleTime` for the route list). |
| Computing route badge text color from contrast math | Covers missing `textColor` | Speculative code before the live payload is known | Use DASH's `textColor`; neutral palette fallback |
| Building a shared `packages/shared` types package for these screens | DRY across server and app | Explicitly deferred until a second consumer or real drift | App-local response types mirroring the server's, kept to the fields the app reads |

## Feature Dependencies

```
Configurable API base URL (CFG)
    └──required by──> every screen (devices/emulators cannot reach localhost)

Server CORS (+ Access-Control-Expose-Headers: Retry-After)
    └──required by──> Expo web: all fetches, EventSource, and reading Retry-After for 503/429 retry

Route list (ROUTE)  ──GET /routes/all──────────────────────────────┐
    └──navigates to──> Stop list (STOP) ──GET /routes/:shortName/stops
                           └──navigates to (passes stop.alerts)──> Arrivals (ARR)
                                                                     ├──GET /predictions?stop=   (first paint, refresh, status recovery)
                                                                     └──GET /predictions/stream?stop= (live updates)

Shared status handler (STATE: 503/429/502/404/500/network)
    └──required by──> ROUTE, STOP, ARR, and LIVE reconnect logic

Client-side filter/slice of StopPredictionsResponse (pure fn)
    └──required by──> ARR REST rendering AND ARR SSE rendering (one path)

Freshness age (client receive time) ──required by──> stale banner, "Live" indicator

Stream lifecycle (focus/blur + AppState) ──enhances──> reconnect/backoff (LIVE)

Route color badge ──requires──> server: add color/textColor to RouteData → BusRoute → response
                                (verify the live DASH payload first; neutral fallback otherwise)

Per-prediction realtime icon ──conflicts──> current API (no flag); do not build
```

### Dependency Notes

- **Every screen requires the configurable base URL and CORS.** Neither is a screen feature, but nothing works without them. On a physical device, `localhost` fails with a network error, not an HTTP status, so the network-error state must exist from the first screen.
- **The `Retry-After` handling requires the CORS expose header on web.** Browsers hide every response header outside the CORS-safelisted set unless `Access-Control-Expose-Headers` lists it, and `Retry-After` is not on that list. Without it, web cannot honor 503/429 back-off and falls back to a fixed delay. Make this part of the CORS requirement's acceptance criteria.
- **Arrivals needs stop alerts from the previous screen.** Predictions payloads don't embed alerts. On a web deep link straight to the arrivals URL, alerts are missing unless the app also fetches `/routes/:shortName/stops` (cheap, in-memory, not rate-limited). Recommend: on the arrivals screen, reuse the cached stops query when present, otherwise fetch it. This also gives a 404 for a bad `shortName` in the URL.
- **SSE status detection depends on the REST endpoint.** Browser `EventSource` exposes no HTTP status on a failed connect, so the REST call doubles as the status probe. Both endpoints map errors through the same `sendErrorResponse`, so their statuses match.
- **Route color depends on a backend change outside the brief.** It is small, but it touches `RouteData`, `BusRoute`, the `createRoute` mapping, and tests. Decide in requirements: either include it as a server REQ in v0.7, or ship neutral badges and list it under "Add After Validation".

## MVP Definition

### Launch With (v0.7)

- [ ] **ROUTE**: route list with short-name badge and long name, natural sort, alert marker, tap through. Proves the app can reach the API.
- [ ] **STOP**: stops for a route, one direction at a time via a direction toggle (titles from the API), in sequence order, name + stop code, alert marker. Gives the rider a stop to watch.
- [ ] **ARR**: unfiltered REST first paint → SSE updates; one client-side filter function (chosen route first, next 3 per headsign, "Other routes" section); `Due`/`N min`/clock-time formatting; empty state. This is the core value.
- [ ] **ARR freshness**: "Updated X ago" from client receive time, a "Live"/"Reconnecting" indicator, and a stale banner past ~75 s that keeps the last data. The server's stream can go silent, so without these the core value fails.
- [ ] **LIVE**: stream closed on blur/background/hidden tab and reopened on focus/active; capped exponential reconnect with jitter honoring `Retry-After`; no reconnect after 404. Prevents battery drain, stream-cap 429s and reconnect storms.
- [ ] **STATE**: one shared status handler (503 warming up with auto-retry, 429 with countdown retry, 502 with the last data kept, 404 with a way back, 500 generic, network error showing the base URL in dev), used by all three screens and by the stream.
- [ ] **Refresh**: pull-to-refresh on native for all three lists; a visible refresh button on web.
- [ ] **A11Y**: merged row labels, no per-update announcements, font scaling, no color-only status, 44/48 targets, header roles.
- [ ] **CFG / CORS dependencies**: configurable base URL; CORS including `Expose-Headers: Retry-After`.

### Add After Validation (v0.7.x / v0.8)

- [ ] Route color badges. Trigger: live payload confirms DASH fills `color`/`textColor`, then do the small server change. Pull into v0.7 if the check is quick.
- [ ] Stop search by stop code. Trigger: the first real-rider feedback ("I know my stop number"). Needs a server lookup.
- [ ] Inline alert detail (description text) on the arrivals screen. Trigger: the dedicated alerts UI milestone.
- [ ] Favorites/recents shortcuts and the Nearby tab. Backend done; these are the next app milestones per PROJECT.md.

### Future Consideration (v2+)

- [ ] Animated per-second countdown. Out of scope by decision; needs a design for the drift between `time` and the device clock.
- [ ] Offline cache of routes and stops. Out of scope by decision.
- [ ] On-time/late status colors. Needs schedule data (SEED-002).
- [ ] Per-prediction realtime/scheduled indicator. Only if the upstream exposes a flag.
- [ ] Vehicle map.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---|---|---|---|
| Route list (badge, long name, natural sort, tap) | HIGH | LOW | P1 |
| Stop list by direction with stop code | HIGH | LOW | P1 |
| Arrivals REST → SSE with one filter path | HIGH | MEDIUM | P1 |
| `Due` / `N min` / clock-time formatting | HIGH | LOW | P1 |
| Freshness age + stale banner + Live indicator | HIGH | LOW | P1 |
| Stream lifecycle (focus/blur/AppState) | HIGH | MEDIUM | P1 |
| Reconnect backoff honoring `Retry-After`, stop on 404 | HIGH | MEDIUM | P1 |
| Shared status handler (503/429/502/404/500/network) | HIGH | LOW | P1 |
| Empty states | MEDIUM | LOW | P1 |
| Alert markers on route/stop rows | MEDIUM | LOW | P1 |
| "Other routes at this stop" | MEDIUM | LOW | P1 (nearly free) |
| Pull-to-refresh + web refresh button | MEDIUM | LOW | P1 |
| Accessibility basics | HIGH | LOW | P1 |
| Route color badges (needs server change) | MEDIUM | LOW | P2 |
| Inline alert header on arrivals screen | MEDIUM | LOW | P2 |
| Stop search by code (needs server endpoint) | HIGH | MEDIUM | P2 (next milestone) |
| Per-second countdown | LOW | MEDIUM | P3 (out of scope) |
| Realtime/scheduled icon | LOW (no data) | — | Do not build |

## Competitor Feature Analysis

| Feature | Transit app | OneBusAway | DASH's own channels | Our Approach (v0.7) |
|---|---|---|---|---|
| Line identity | Colored line badge + short name | Route short name, colored by status in some deployments | Colored lines on maps; stop-ID-centric tracker | Short-name badge (route color once the server exposes it) + long name |
| Direction | Direction picked per line | Stops listed per direction; arrivals show headsign | — | Direction toggle from API `title`; headsign under arrivals |
| Arrival time | Countdown minutes; more departures on swipe | Minutes until arrival, "NOW" | Minutes by stop ID (web, SMS 41411) | `Due` / `N min`, clock time past 60 min, next 3 |
| Realtime vs scheduled | Animated waves = realtime; greyed = scheduled | `predicted` flag; scheduled fallback | — | Stream-level "Live" + freshness only (no per-prediction flag in the API) |
| Disruptions | Warning icon beside line; detour stops on map | Situation/alert banners | Ride Guide / website notices | Alert marker on route and stop rows |
| Cancelled/skipped | Crossed out, "Skips this stop" | — | — | Not available in the API; not built |

## Sources

- dash-tracker source, read 2026-10-20 (HIGH): `models/BusRoute.ts`, `models/Prediction.ts`, `models/StopDiscovery.ts`, `models/ServiceAlertSummary.ts`, `controllers/errorResponse.ts`, `controllers/PredictionStreamController.ts`, `services/PredictionStreamService.ts` (30 s poll, no stream options), `services/predictionMapping.ts`, `services/StopService.ts`, `repositories/BusDataRepository.ts` (`/info/{agency}/routes?verbose=true`, no color fields), `middleware/upstreamRateLimit.ts`, `middleware/streamConcurrencyCap.ts`
- [Transit: How to track departures on your transit line](https://help.transitapp.com/article/445-how-to-track-departures-on-your-transit-line). Realtime waves, greyed scheduled times, cancelled/skipped, warning icon (MEDIUM)
- [OneBusAway arrivalAndDeparture element](https://developer.onebusaway.org/api/where/elements/arrival-and-departure). `predicted` flag, predicted vs scheduled time semantics (MEDIUM)
- [Tampa OneBusAway coverage](https://www.abcactionnews.com/traffic/traffic-news/track-public-transportation-with-the-help-of-the-onebusaway-tampa-mobile-app). Status color coding in one deployment (LOW)
- [OneBusAway "NOW" countdown anecdote](https://theneedling.com/2023/03/06/onebusaway-finally-adds-never-notification-for-when-your-bus-has-fallen-into-the-void/) (LOW)
- [MIT EFI Swiftly exercise](https://efi.mit.edu/spring23/ex08/swiftly). Swiftly route objects with `color`/`textColor`; prediction fields `time/sec/min/tripId/vehicleId`, no realtime flag (LOW–MEDIUM; matches this repo's `Dash*` types)
- [DASH Ride Guide, Feb 2026](https://www.dashbus.com/wp-content/uploads/Ride-Guide-February-2026.pdf). Riders use dashbus.com/tracker by stop ID, SMS 41411, or Transit/Google/Apple Maps (MEDIUM)
- [DASH Tracker app launch (2020)](https://thezebra.org/2020/06/30/on-july-1-dash-to-introduce-new-bus-tracker-app/) (LOW, maintenance status unknown)
- [react-native-sse docs](https://docsearch.algolia.com/mcp/docs/repo/binaryminds/react-native-sse). No automatic background close or foreground reconnect; AppState-driven `open()`/`close()`; `pollingInterval: 0` disables auto-reconnect (MEDIUM; confirm against the GitHub README during the stack phase)
- WHATWG HTML EventSource processing model: a non-200 or non-`text/event-stream` response fails the connection without reconnecting; Fetch spec CORS-safelisted response headers exclude `Retry-After` (HIGH, from spec knowledge; re-verify in the CORS phase)
- WCAG 2.x 1.4.1 (Use of Color), 1.4.3 (Contrast); Apple HIG / Material 44 pt / 48 dp touch targets (HIGH, standard references)
- [OneBusAway on AppleVis](https://applevis.com/apps/ios/navigation/onebusaway). Screen-reader rider base (LOW)

## Gaps to Verify

1. **Does DASH fill `color`/`textColor` on `/info/alexandria-dash/routes?verbose=true`?** Capture the live payload before adding the fields (the Phase 8 lesson). This decides whether route color is P1 or P2.
2. **Does the DASH prediction payload carry any realtime/scheduled field** that `predictionMapping` currently drops (e.g. `scheduleBased`)? Log one raw response. If one exists, it changes the anti-feature verdict.
3. **Swiftly's default prediction count per destination** on the unfiltered stream. If it is below 3, "next 3" shows fewer; adjust the slice copy.
4. **RN-web `RefreshControl` behavior** in the Expo SDK version chosen. Confirm there is no pull gesture on web before relying on a refresh button.
5. **The SSE client library choice** (react-native-sse vs `expo/fetch` streaming vs browser `EventSource` on web), and whether it exposes HTTP status on connect failure. A stack-phase question that this file's status-recovery design depends on.

---
*Feature research for: DASH transit rider app, v0.7 Frontend Foundation (route → stop → live arrivals)*
*Researched: 2026-10-20*
