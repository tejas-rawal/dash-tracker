# Requirements: dash-tracker

**Defined:** 2026-10-20
**Milestone:** v0.7 Frontend Foundation
**Core Value:** Riders can always see accurate, near-real-time arrival predictions for their stop.

## v0.7 Requirements

Requirements for this milestone. Each maps to exactly one roadmap phase. Research backing: `.planning/research/SUMMARY.md`. REQ-ID numbering continues from earlier milestones where a prefix was already used (TOOL, STOP, LIVE).

### Monorepo

- [ ] **MONO-01**: The repo root is a Bun workspace containing `apps/server` and `apps/mobile`. Root scripts (`lint`, `test`, `test:coverage`, `build`, `typecheck`) fan out to each workspace.
- [x] **MONO-02**: The backend moves from `src/server/` to `apps/server` as a pure `git mv`, in a commit of its own, so `git log --follow` and blame keep each file's history.
- [x] **MONO-03**: All 853 server tests pass, and coverage stays ≥80% on every metric (currently ~98.8% statements), whether run from the repo root or from `apps/server`. `build`, `start-server` and `dev-server` work from the new location.
- [ ] **MONO-04**: These all resolve under `apps/server`:
  - the server's `.env` / `.env.example`;
  - the SQLite `data/` path;
  - the Vitest config;
  - the Superset setup/run config;
  - CLAUDE.md, AGENTS.md and README paths;
  - Codecov paths.
- [x] **MONO-05**: `bun.lock` is the only lockfile (`package-lock.json` and `bun.lockb` are deleted). A root `bunfig.toml` pins the hoisted linker, exact version specifiers and the 7-day minimum release age.

### Toolchain

- [x] **TOOL-05**: `packageManager` is `bun@1.3.14`, and local installs and every CI job use exactly that Bun version.
- [ ] **TOOL-06**: `.node-version` pins a Node 24 LTS release, and every CI job sets up Node from it before `bun install`.
- [ ] **TOOL-07**: better-sqlite3 builds and loads on Node 24 after a clean install, and is declared explicitly in `trustedDependencies` (`bun pm untrusted` is empty).
- [ ] **TOOL-08**: The server runs under `tsx` (`tsx watch` for the dev server), and `ts-node` and `nodemon` are removed.
- [ ] **TOOL-09**: Both workspaces use TypeScript 6. The server extends `@tsconfig/node24` and still emits CommonJS to `dist/`, and each workspace's tsconfig has an explicit `types` list, so hoisted `@types` packages don't leak between apps.
- [ ] **TOOL-10**: Biome 2.5 is the only lint/format tool. The `biome migrate` commit and the reformat commit are separate, the reformat commit is listed in `.git-blame-ignore-revs`, and `lint:fix` uses a non-deprecated flag.
- [x] **TOOL-11**: `@vitest/coverage-v8` matches the installed vitest version (3.2.6).

### CORS

- [ ] **CORS-01**: An optional `CORS_ALLOWED_ORIGINS` env var: a Zod-validated, comma-separated list of exact origins. It defaults to empty, meaning no browser origin may read responses. `*`, paths, trailing slashes or malformed values crash startup, and `.env.example` lists `http://localhost:8081`.
- [ ] **CORS-02**: A request from an allowed origin gets CORS headers on every response. That includes 200, both 429s (shared bucket and stream cap), 503, 404 and the SSE stream. Preflight requests are answered without spending rate-limit tokens.
- [ ] **CORS-03**: `Retry-After` is exposed to browser code (`Access-Control-Expose-Headers`), so the web app can read retry timing on 429/503.
- [ ] **CORS-04**: Requests without an `Origin` header (native apps, curl) behave exactly as before.
- [ ] **CORS-05**: Conditional on the live DASH routes payload carrying `color`/`textColor`: route responses include them. If the payload doesn't carry them, this requirement is closed as not applicable, with evidence.

### App Foundation

- [ ] **APP-01**: An Expo SDK 58 app in `apps/mobile` (blank TypeScript template plus expo-router) launches and loads data from the local server on the iOS simulator, an Android emulator or device, and Expo web.
- [ ] **APP-02**: The app reads its API base URL from `EXPO_PUBLIC_API_BASE_URL` and fails loudly at startup if it's unset. `apps/mobile/.env.example` documents the per-target values: `localhost`, `10.0.2.2` for the Android emulator, and the LAN IP for a physical device.
- [ ] **APP-03**: One shared status handler maps each server response to a rider-facing state, using copy the app owns (never the server's `details`):
  - 503: a "getting ready" state with automatic retry.
  - 429: a wait that honors `Retry-After` and keeps the current data.
  - 502: keeps the last data.
  - 404: a way back.
  - 500 or network error: a generic error; dev builds also show the base URL.

### Routes

- [ ] **ROUTE-01**: The rider sees every DASH route as a short-name badge with its long name, in natural sort order (e.g. 2 before 10), and can tap one to open its stops.
- [ ] **ROUTE-02**: Routes with active service alerts show an alert marker that doesn't rely on color alone.
- [ ] **ROUTE-03**: The rider can refresh the route list: pull-to-refresh on native, a refresh button on web.

### Stops

- [ ] **STOP-03**: For the chosen route, the rider sees its stops one direction at a time, switched with a toggle labeled by direction title. Stops are in sequence order with stop name and stop code, and the rider can tap one to open its arrivals.
- [ ] **STOP-04**: Stops with active service alerts show an alert marker that doesn't rely on color alone.

### Arrivals

- [ ] **ARR-01**: For the chosen stop, the rider sees upcoming arrivals for the chosen route, grouped by headsign. The data comes from an unfiltered `GET /predictions?stop=` (the same scope as the stream) and is filtered in one pure client function.
- [ ] **ARR-02**: An arrival time shows as `Due` (under 1 min), `N min`, or the clock time when it's more than 60 minutes out.
- [ ] **ARR-03**: The rider sees a clear empty state when the chosen route has no upcoming arrivals at the stop.
- [ ] **ARR-04**: The rider can refresh arrivals manually: pull-to-refresh on native, a refresh button on web.

### Live Updates

- [ ] **LIVE-08**: After the REST load, arrivals update from `GET /predictions/stream?stop=` without any rider action. Stream frames update the same cached data the REST load filled.
- [ ] **LIVE-09**: The arrivals screen shows "Updated X ago", measured from when the app received the data, plus a Live/Reconnecting indicator. After about 75 s without new data, a stale banner appears and the last data stays visible, dimmed.
- [ ] **LIVE-10**: The stream is open only while the arrivals screen is focused and the app is in the foreground. Blur, backgrounding, a hidden web tab or unmount closes it, so the server frees that stream slot.
- [ ] **LIVE-11**: Reconnects use capped, jittered backoff and honor `Retry-After` on 429/503. A 404 stops reconnecting. A watchdog reconnects after about 90 s with no frame. This logic lives in a unit-tested state machine.

### Quality

- [ ] **QUAL-01**: Biome lints and formats `apps/mobile`, with any Expo-specific overrides (such as expo-router file names) documented with their reason.
- [ ] **QUAL-02**: The app's unit tests (jest-expo with React Native Testing Library) enforce ≥80% coverage on branches, functions, lines and statements.
- [ ] **QUAL-03**: CI runs on pull requests and pushes to main. For each workspace it runs lint, type-check and tests with coverage. The mobile job also runs `expo install --check` and `expo export --platform web`.

## Future Requirements

Deferred. Tracked, but not in the v0.7 roadmap.

- **ARR-05**: An "Other routes" section on the arrivals screen for the other routes that serve the stop (the data is already in the unfiltered stream).
- **A11Y-01**: Accessibility pass: merged row labels, font scaling, 44/48pt touch targets, and no live-region spam on stream updates.
- **SRCH-01**: Stop search by stop code (needs a server lookup endpoint).
- **ALRT-14**: Inline alert header text on the stop and arrivals screens.
- **APP-04**: Nearby stops by device location in the app (`/stops/nearby`, `/predictions/nearby`).
- **APP-05**: Favorites and recents in the app (`X-Device-Id`).

## Out of Scope

| Feature | Reason |
|---------|--------|
| Per-arrival realtime vs scheduled icon | The API carries no such flag. Guessing one would mislead riders. |
| REST polling alongside the SSE stream | Spends the shared 60/min bucket. Reconnect, the stale banner and manual refresh cover outages. |
| Keeping streams open in the background | Battery use and the 5-stream-per-IP cap |
| Offline cache / animated countdown | Polish on top of a flow that must work end to end first |
| `packages/shared` API-types package | Deferred until a second consumer or real drift justifies it |
| Server SSE heartbeat / `retry:` field | The client's watchdog covers silent sockets, and the fetch-based client ignores `retry:` |
| Store builds, EAS submit, hosted web | v0.7 targets the simulator/emulator, dev builds, Expo Go and the Expo web dev server |
| Node 26 | Becomes LTS on 2026-10-28, after this milestone was scoped. Node 24 is the target. |
| Bun 1.4 | The 1.3.x line was chosen (1.3.14). Moving to 1.4 later is a one-line pin change. |

## Traceability

Which phases cover which requirements. Filled in by the roadmap.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MONO-01 | Phase 17 | Pending |
| MONO-02 | Phase 17 | Complete |
| MONO-03 | Phase 17 | Complete |
| MONO-04 | Phase 17 | Pending |
| MONO-05 | Phase 17 | Complete |
| TOOL-05 | Phase 17 | Complete |
| TOOL-06 | Phase 18 | Pending |
| TOOL-07 | Phase 18 | Pending |
| TOOL-08 | Phase 18 | Pending |
| TOOL-09 | Phase 18 | Pending |
| TOOL-10 | Phase 18 | Pending |
| TOOL-11 | Phase 17 | Complete |
| CORS-01 | Phase 18 | Pending |
| CORS-02 | Phase 18 | Pending |
| CORS-03 | Phase 18 | Pending |
| CORS-04 | Phase 18 | Pending |
| CORS-05 | Phase 18 | Pending |
| APP-01 | Phase 19 | Pending |
| APP-02 | Phase 19 | Pending |
| APP-03 | Phase 19 | Pending |
| ROUTE-01 | Phase 19 | Pending |
| ROUTE-02 | Phase 19 | Pending |
| ROUTE-03 | Phase 19 | Pending |
| STOP-03 | Phase 20 | Pending |
| STOP-04 | Phase 20 | Pending |
| ARR-01 | Phase 20 | Pending |
| ARR-02 | Phase 20 | Pending |
| ARR-03 | Phase 20 | Pending |
| ARR-04 | Phase 20 | Pending |
| LIVE-08 | Phase 21 | Pending |
| LIVE-09 | Phase 21 | Pending |
| LIVE-10 | Phase 21 | Pending |
| LIVE-11 | Phase 21 | Pending |
| QUAL-01 | Phase 19 | Pending |
| QUAL-02 | Phase 19 | Pending |
| QUAL-03 | Phase 19 | Pending |

**Coverage:**
- v0.7 requirements: 36 total
- Mapped to phases: 36
- Unmapped: 0 ✓

---
*Requirements defined: 2026-10-20*
*Last updated: 2026-10-20 after v0.7 roadmap creation*
