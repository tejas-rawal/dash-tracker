# Roadmap: dash-tracker

## Milestones

- ✅ **v0.1 Tooling Cleanup** — Phases 1-2 (shipped 2026-08-26)
- ✅ **v0.2 Real-Time Arrival Predictions** — Phases 3-4 (shipped 2026-08-27)
- ✅ **v0.3 Favorited & Recent Routes** — Phases 5-7 (shipped 2026-09-01)
- ✅ **v0.4 Service Alerts** — Phases 8-9 (shipped 2026-09-08)
- ✅ **v0.5 Nearby Stop Predictions** — Phase 11 (shipped 2026-09-24)
- ✅ **v0.6 Solidifying the backend** — Phases 12-16 (shipped 2026-10-15)
- 🚧 **v0.7 Frontend Foundation** — Phases 17-21 (in progress)

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (17.1, 17.2): Urgent insertions between planned phases
- Phase numbering is continuous across milestones (never restarts at 1); v0.7 continues at Phase 17
- v0.3 (phases 5-7) and v0.4 (phases 8-9) were developed independently on separate branches before both landing on `main`; v0.4's phases were renumbered from their original 5-6 to 8-9 when the branches were merged, to keep numbering continuous
- Phase 10 was a standalone post-v0.4 phase (promoted backlog item, not part of a milestone); v0.5 continued at Phase 11

<details>
<summary>✅ v0.1 Tooling Cleanup (Phases 1-2) — SHIPPED 2026-08-26</summary>

- [x] **Phase 1: Consolidate Lint & Format Tooling** (1/1 plans) — completed 2026-08-26
- [x] **Phase 2: Full-Repo Reformat** (1/1 plans) — completed 2026-08-26

</details>

<details>
<summary>✅ v0.2 Real-Time Arrival Predictions (Phases 3-4) — SHIPPED 2026-08-27</summary>

- [x] **Phase 3: Stop Discovery** (2/2 plans) — completed 2026-08-26
- [x] **Phase 4: Live Predictions via SSE** (1/1 plans) — completed 2026-08-27

</details>

<details>
<summary>✅ v0.3 Favorited & Recent Routes (Phases 5-7) — SHIPPED 2026-09-01</summary>

- [x] **Phase 5: SQLite Persistence Foundation** (2/2 plans) — completed 2026-08-31
- [x] **Phase 6: Favorites (Routes & Stops)** (1/1 plans) — completed 2026-08-31
- [x] **Phase 7: Recents (Routes & Stops)** (1/1 plans) — completed 2026-09-01

</details>

<details>
<summary>✅ v0.4 Service Alerts (Phases 8-9) — SHIPPED 2026-09-08</summary>

- [x] **Phase 8: Service Alerts Ingestion** (6/6 plans) — completed 2026-09-04
- [x] **Phase 9: Alerts Surfaced on Routes, Stops & Predictions** (2/2 plans) — completed 2026-09-08

See `.planning/milestones/v0.4-ROADMAP.md` for full phase details.

</details>

**Standalone (post-v0.4):**

- [x] **Phase 10: Solidify vehicle position work** (1/1 plans) — completed 2026-09-22 (details in `.planning/milestones/v0.4-phases/10-solidify-vehicle-position-work/`)

<details>
<summary>✅ v0.5 Nearby Stop Predictions (Phase 11) — SHIPPED 2026-09-24</summary>

- [x] **Phase 11: Nearby Stop Predictions** (3/3 plans) — completed 2026-09-24

See `.planning/milestones/v0.5-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v0.6 Solidifying the backend (Phases 12-16) — SHIPPED 2026-10-15</summary>

- [x] **Phase 12: Bounded Upstream Calls & Error Safety Nets** (4/4 plans) — completed 2026-09-29
- [x] **Phase 13: Resilient Route/Stop Data Lifecycle** (7/7 plans) — completed 2026-10-01
- [x] **Phase 14: Health Checks & Rate Limiting** (3/3 plans) — completed 2026-10-07
- [x] **Phase 15: Alert & Nearby Data Hygiene** (3/3 plans) — completed 2026-10-07
- [x] **Phase 16: Concurrent SSE Stream Cap per IP** (1/1 plans) — completed 2026-10-13

See `.planning/milestones/v0.6-ROADMAP.md` for full phase details.

</details>

### 🚧 v0.7 Frontend Foundation (In Progress)

**Milestone Goal:** The repo becomes a Bun-workspaces monorepo on a current toolchain, and the first Expo app ships: on iOS, Android, and the web, a rider can pick a route, then a stop, and watch that stop's live arrivals.

**Phase shape:** The work runs in order: the repo layout first, then the server runtime and API contract, then the app. Every phase ends on a working product. Research suggested six phases. Under coarse granularity, its separate toolchain and CORS phases are merged into Phase 18 (see that phase's notes), which gives five.

- [ ] **Phase 17: Monorepo Restructure** - The backend moves to `apps/server` with a pure `git mv` inside a Bun 1.3.14 workspace that has one lockfile. The server's tests, coverage, build and dev server stay green from the root and from `apps/server`
- [ ] **Phase 18: Server Toolchain & CORS** - The server runs on Node 24, tsx, TypeScript 6 and Biome 2.5 with no change in behavior. Browser code on an allowed origin can read every API response, including its retry timing
- [ ] **Phase 19: App Foundation & Route List** - The Expo SDK 58 app launches on iOS, Android and web and shows every DASH route from the local server, with error states written for riders. It is linted, unit-tested at ≥80% coverage and checked in CI
- [ ] **Phase 20: Stops & Arrivals over REST** - A rider goes from a route to its stops, one direction at a time, to that stop's upcoming arrivals for the route. This completes the core flow over REST
- [ ] **Phase 21: Live Arrivals over SSE** - Arrivals update over the prediction stream while the screen is in view and show how fresh they are. Reconnects leak no streams and stay within the server's rate limit and stream cap

## Phase Details

### Phase 17: Monorepo Restructure

**Goal**: The repo is a Bun-workspaces monorepo with the backend in `apps/server`, installed by one Bun version from one lockfile. The server behaves exactly as before from its new location, and every moved file keeps its history.
**Depends on**: Nothing in this milestone (builds on the v0.6 server as shipped)
**Requirements**: MONO-01, MONO-02, MONO-03, MONO-04, MONO-05, TOOL-05, TOOL-11
**Success Criteria** (what must be TRUE):

  1. `git log --follow` and `git blame` on any moved server file show its history from before the move. The move commit contains only renames (100% similarity in `git show --stat -M`). Config and path fixes land in later commits.
  2. From the repo root and from `apps/server`, all 853 server tests pass and coverage stays ≥80% on every metric (about 98.8% statements), with `@vitest/coverage-v8` on the same version as vitest (3.2.6). `build`, `start-server` and `dev-server` work from `apps/server`, which now holds `.env`, `.env.example`, `data/` and the Vitest config.
  3. The root `lint`, `test`, `test:coverage`, `build` and `typecheck` scripts fan out to every workspace under `apps/`, and a failure in any workspace fails the root script.
  4. `bun.lock` is the only lockfile, and a root `bunfig.toml` pins the hoisted linker, exact version specifiers and the 7-day minimum release age. `bun install --frozen-lockfile` under Bun 1.3.14 (the `packageManager` pin) leaves the working tree clean, both locally and in every CI job.
  5. A fresh Superset worktree sets up and runs the server from `apps/server`. CLAUDE.md, AGENTS.md, README and the Codecov upload all use the new paths.

**Plans**: 3 plans

Plans:
**Wave 1**
- [ ] 17-01-PLAN.md — Bun 1.3.14 pin, bunfig.toml install gates, single lockfile, CI on the pinned Bun with a clean-tree check, and the legitimacy gate for @vitest/coverage-v8@3.2.6

**Wave 2** *(blocked on Wave 1 completion)*
- [ ] 17-02-PLAN.md — Rename-only move to apps/server, workspace wiring, exact pins and coverage-v8 3.2.6 with no lockfile drift, hermetic tests, and server runtime proofs from root and apps/server

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 17-03-PLAN.md — Superset worktree setup/run from apps/server, CLAUDE.md/AGENTS.md/README on the new layout with the full endpoint list, and the D-04 wording of MONO-01 and criterion 3

**Notes**:
- The Bun pin and single lockfile (TOOL-05, MONO-05) land first: the root fan-out scripts need Bun 1.3's `--filter`.
- **Decided (2026-10-20):** Phase 17 ships as its own PR, merged with a merge commit (not a squash), so the rename-only commit and file history survive on `main`.
- `rateLimit.test.ts` reads `TRUST_PROXY_HOPS` from the local `.env` (Phase 14 WR-04). Confirm it still passes once `.env` moves to `apps/server`.
- These are standard patterns, already verified locally on Bun 1.3.14, so no research phase is needed.

### Phase 18: Server Toolchain & CORS

**Goal**: The server runs on the current toolchain (Node 24 LTS, tsx, TypeScript 6, Biome 2.5) with no change in behavior. Browser code on an allowed origin can read every API response, including the error and retry signals the app needs.
**Depends on**: Phase 17 (the toolchain bump lands on the new layout in commits separate from the move, so a bisect can tell a path break from a runtime break)
**Requirements**: TOOL-06, TOOL-07, TOOL-08, TOOL-09, TOOL-10, CORS-01, CORS-02, CORS-03, CORS-04, CORS-05
**Success Criteria** (what must be TRUE):

  1. After a clean install on the Node 24 LTS release pinned in `.node-version`, which every CI job sets up before `bun install`, better-sqlite3 builds and loads and `bun pm untrusted` is empty. The full server suite, coverage and build pass.
  2. `dev-server` runs under `tsx watch` and restarts on a file change, and the server starts with ts-node and nodemon removed. `build` still emits CommonJS to `dist/` from TypeScript 6, with a tsconfig that extends `@tsconfig/node24` and lists its `types` explicitly.
  3. `bun run lint` runs Biome 2.5 and reports no warnings beyond the known server set. The `biome migrate` commit and the reformat commit are separate, the reformat commit is listed in `.git-blame-ignore-revs`, and `lint:fix` uses a non-deprecated flag.
  4. With `CORS_ALLOWED_ORIGINS=http://localhost:8081`, browser code on that origin can read the 200, both 429s (shared bucket and stream cap), the 503, the 404 and the SSE stream, and it can read `Retry-After`. Its preflight never spends a rate-limit token. With the variable unset, no browser origin can read responses. A value containing `*`, a path, a trailing slash or a malformed origin stops the server at startup.
  5. Requests without an `Origin` header (native apps, curl) behave exactly as before. Route responses carry DASH's `color`/`textColor` if the live routes payload has them. If it doesn't, CORS-05 is closed as not applicable, with the captured payload as evidence.

**Plans**: TBD
**Notes**:
- This phase merges the research's separate toolchain and CORS phases (coarse granularity). Both are server-only, both must land before any app code, and each change still gets its own commits.
- The toolchain plans run first, so the CORS code is written on TypeScript 6 and in Biome 2 style.
- Mount CORS where the route tests see it (research recommends a shared `createApp()` used by both `app.ts` and the tests).
- Before deciding CORS-05, capture the live `/routes?verbose=true` payload (the Phase 8 lesson).
- Light research: the Biome 2 migration diff on this exact config, and the CommonJS emit from TypeScript 6 with `@tsconfig/node24`.

### Phase 19: App Foundation & Route List

**Goal**: A rider opens the Expo app on iOS, Android or the web and sees every DASH route, loaded from the local server, with clear states when the server isn't ready or can't be reached. From this first screen on, the app is linted, unit-tested and checked in CI.
**Depends on**: Phase 18 (Expo SDK 58 needs Node ≥24.3, Expo web needs CORS, and the mobile Biome override is written in Biome 2 syntax)
**Requirements**: APP-01, APP-02, APP-03, ROUTE-01, ROUTE-02, ROUTE-03, QUAL-01, QUAL-02, QUAL-03
**Success Criteria** (what must be TRUE):

  1. With the local server running and `EXPO_PUBLIC_API_BASE_URL` set to the value `apps/mobile/.env.example` gives for the target (`localhost`, `10.0.2.2` for the Android emulator, the LAN IP for a physical device), the app launches and shows the route list on the iOS simulator, an Android emulator or device, and Expo web. With the variable unset, the app fails loudly at startup.
  2. The rider sees every route as a short-name badge with its long name, in natural sort order (2 before 10). Routes with active alerts carry a marker that doesn't rely on color alone. The rider can refresh the list (pull-to-refresh on native, a button on web) and tap a route to open that route's screen, which Phase 20 fills with its stops.
  3. Each server failure gets app-owned copy, and the server's `details` text never appears. The cases:
     - 503: a "getting ready" state that retries automatically.
     - 429: a wait that honors `Retry-After` and keeps the current data.
     - 502: the last data stays on screen.
     - 404: a way back.
     - 500 or an unreachable server: a generic error that also shows the base URL in dev builds.
  4. Biome lints and formats `apps/mobile`, and each Expo-specific override states its reason. The app's unit tests (jest-expo with React Native Testing Library) enforce ≥80% coverage on branches, functions, lines and statements.
  5. CI runs on pull requests and on pushes to main. For each workspace it runs lint, type-check and tests with coverage, and the mobile job also runs `expo install --check` and `expo export --platform web`. The root scripts now fan out to `apps/mobile` as well. The app's TypeScript 6 tsconfig has its own explicit `types` list, so the server's `@types` packages don't leak into it.

**Plans**: TBD
**UI hint**: yes
**Notes**:
- Research needed before planning (`/gsd-plan-phase --research-phase`). Open questions:
  - setting up the SDK 58 blank TypeScript template with expo-router;
  - running jest-expo, Jest 30 and RNTL 14 under the hoisted Bun linker (`transformIgnorePatterns`);
  - which Biome 2 rules fire on Expo files (for example `[shortName].tsx`);
  - whether `expo install` writes `~` ranges despite `exact = true`.
- Expo SDK 58 sits behind the 7-day release-age gate until about 2026-10-22 to 26. Install only the newest `expo` patch whose whole dependency closure has cleared the gate. If execution reaches this phase before then, wait. Don't drop to SDK 57, and don't add `minimumReleaseAgeExcludes`.
- Until SDK 58 Expo Go is in the iOS App Store, run UAT on the iOS simulator, on Android, or with a dev build.

### Phase 20: Stops & Arrivals over REST

**Goal**: On iOS, Android and the web, a rider can go from a route to its stops to that stop's upcoming arrivals for the route. The core flow then works end to end over REST, before any streaming is added.
**Depends on**: Phase 19 (app shell, API client, shared status handler and route list)
**Requirements**: STOP-03, STOP-04, ARR-01, ARR-02, ARR-03, ARR-04
**Success Criteria** (what must be TRUE):

  1. A route's screen shows one direction's stops at a time, in sequence order, each with its name and stop code. A toggle labeled by direction title switches direction. Stops with active alerts carry a marker that doesn't rely on color alone, and tapping a stop opens its arrivals.
  2. The arrivals screen shows the chosen route's upcoming arrivals at that stop, grouped by headsign. They come from one unfiltered `GET /predictions?stop=` request (the same scope the stream uses), filtered by a single pure, unit-tested client function.
  3. Each arrival time reads `Due` when under 1 minute away, `N min` up to 60 minutes, and the clock time beyond that.
  4. When the chosen route has no upcoming arrivals at the stop, the rider sees a clear empty state. The rider can refresh arrivals (pull-to-refresh on native, a button on web). On 503, 429, 502, 404, 500 and network errors, both new screens show the shared status states from Phase 19.

**Plans**: TBD
**UI hint**: yes
**Notes**:
- These are standard patterns (TanStack Query, expo-router basics), so no research phase is needed.
- Before planning, capture a live `/predictions?stop=` payload. The default number of predictions per destination shapes each headsign group.

### Phase 21: Live Arrivals over SSE

**Goal**: Arrivals stay current while the rider watches, and the rider can always tell how fresh they are. The app never leaks streams and never floods the server's rate limit or stream cap.
**Depends on**: Phase 20 (stream frames write into the same query cache the REST load fills)
**Requirements**: LIVE-08, LIVE-09, LIVE-10, LIVE-11
**Success Criteria** (what must be TRUE):

  1. After the REST load, the open stop's arrivals update from `GET /predictions/stream?stop=` with no rider action on iOS, Android and the web. Each frame updates the same cached data the REST load filled.
  2. The arrivals screen shows "Updated X ago", measured from when the app received the data, plus a Live or Reconnecting indicator. After about 75 s without new data a stale banner appears, and the last arrivals stay on screen, dimmed.
  3. Leaving the screen, backgrounding the app, hiding the web tab or unmounting closes the stream and frees its slot on the server. With the iOS simulator, an Android target and Expo web all running at once, leaked streams never push the machine to the 5-stream cap.
  4. When the server is killed mid-stream or answers 429, 503 or 404, the app reconnects with capped, jittered backoff, waits out `Retry-After` on 429 and 503, and stops reconnecting on 404. If no frame arrives for about 90 s, a watchdog reconnects. This policy lives in a state machine whose unit tests cover each transition.

**Plans**: TBD
**UI hint**: yes
**Notes**:
- Spike before planning. On an Android debug build and the iOS simulator, against the real `/predictions/stream`, confirm two things: `expo/fetch` delivers chunks as they arrive, and `abort()` frees the server's stream slot. Detect the abort with `signal.aborted`, not `error.name`.
- If the spike fails, replan this phase. The REST flow from Phase 20 ships regardless.
- The transport, per research, is global `fetch` with `eventsource-parser`. v0.7 adds no REST polling alongside the stream and no server heartbeat.

## Progress

**Execution Order:**
Phases execute in numeric order: 17 → 18 → 19 → 20 → 21

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Consolidate Lint & Format Tooling | v0.1 | 1/1 | Complete | 2026-08-26 |
| 2. Full-Repo Reformat | v0.1 | 1/1 | Complete | 2026-08-26 |
| 3. Stop Discovery | v0.2 | 2/2 | Complete | 2026-08-26 |
| 4. Live Predictions via SSE | v0.2 | 1/1 | Complete | 2026-08-27 |
| 5. SQLite Persistence Foundation | v0.3 | 2/2 | Complete | 2026-08-31 |
| 6. Favorites (Routes & Stops) | v0.3 | 1/1 | Complete | 2026-08-31 |
| 7. Recents (Routes & Stops) | v0.3 | 1/1 | Complete | 2026-09-01 |
| 8. Service Alerts Ingestion | v0.4 | 6/6 | Complete | 2026-09-04 |
| 9. Alerts Surfaced on Routes, Stops & Predictions | v0.4 | 2/2 | Complete | 2026-09-08 |
| 10. Solidify vehicle position work | standalone | 1/1 | Complete | 2026-09-22 |
| 11. Nearby Stop Predictions | v0.5 | 3/3 | Complete | 2026-09-24 |
| 12. Bounded Upstream Calls & Error Safety Nets | v0.6 | 4/4 | Complete | 2026-09-29 |
| 13. Resilient Route/Stop Data Lifecycle | v0.6 | 7/7 | Complete | 2026-10-01 |
| 14. Health Checks & Rate Limiting | v0.6 | 3/3 | Complete | 2026-10-07 |
| 15. Alert & Nearby Data Hygiene | v0.6 | 3/3 | Complete | 2026-10-07 |
| 16. Concurrent SSE Stream Cap per IP | v0.6 | 1/1 | Complete | 2026-10-13 |
| 17. Monorepo Restructure | v0.7 | 0/TBD | Not started | - |
| 18. Server Toolchain & CORS | v0.7 | 0/TBD | Not started | - |
| 19. App Foundation & Route List | v0.7 | 0/TBD | Not started | - |
| 20. Stops & Arrivals over REST | v0.7 | 0/TBD | Not started | - |
| 21. Live Arrivals over SSE | v0.7 | 0/TBD | Not started | - |

---

_Full phase details for shipped milestones archived to `.planning/milestones/v0.1-ROADMAP.md` through `.planning/milestones/v0.6-ROADMAP.md`._
