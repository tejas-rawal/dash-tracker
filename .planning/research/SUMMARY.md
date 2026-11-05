# Project Research Summary

**Project:** dash-tracker, milestone v0.7 Frontend Foundation
**Domain:** Bun-workspaces monorepo (existing Express API in `apps/server` + new Expo app in `apps/mobile` for iOS, Android and web) on Node 24, with a route → stops → live-arrivals rider flow over REST then SSE
**Researched:** 2026-10-20
**Confidence:** MEDIUM. Repo facts and registry versions are HIGH. Expo/Bun/Biome behavior comes from primary docs (MEDIUM). Native SSE streaming over `expo/fetch` is LOW until a spike confirms it.

## Executive Summary

v0.7 turns a single-package API into a two-workspace monorepo and ships the first rider-facing app. The established way to do this is: Bun workspaces with an **explicitly hoisted** linker, Expo's automatic monorepo Metro config (no hand-written `metro.config.js`), one root Biome config, one test runner per workspace (Vitest for the server, `jest-expo` + Jest 30 + RNTL 14 for the app), and a CI matrix that type-checks, tests and builds each workspace separately. The app is a thin client: a React-free `src/api/` layer (base URL, typed fetch, a single `ApiError`, endpoints, SSE stream), TanStack Query for REST state, and one `useLivePredictions` hook that paints from REST and then writes SSE frames into the same query cache.

The order of work matters more than any single choice. The restructure must be a pure `git mv` with config fixes in a separate commit, so blame and bisect survive the repo's squash-merge habit. The toolchain bump (Bun pin, Node 24, `tsx` replacing ts-node/nodemon, TS 6, Biome 2) comes before any app code. CORS comes before the app so Expo web works from its first screen. Each app slice is layered on a working product: route list, then stops and arrivals over REST, then live SSE. SSE is last because it carries the most risk and the REST flow should ship regardless.

The main risks are operational, not conceptual. (1) Silent install/runtime drift: the linker flipping to isolated if `bun.lock` is regenerated, `trustedDependencies` replacing Bun's default list and dropping better-sqlite3's native build, a Node ABI mismatch after the bump, and CI running a different Node and Bun than the pins. (2) The app fighting the server's v0.6 protections: reconnect storms into the 60/min bucket and leaked streams filling the 5-per-IP cap, with every dev target on one machine sharing one IP. (3) CORS mounted in the wrong place or without `exposedHeaders: ["Retry-After"]`, so 429/503 look like opaque network errors on web. All three have concrete, testable mitigations below.

## Key Findings

### Recommended Stack

Details are in STACK.md. Only the additions and changes are listed here; Express, Zod, Axios, Winston, better-sqlite3, express-rate-limit and Vitest 3.2.6 stay.

**Core technologies:**
- **Bun 1.3.14 via `packageManager` only**: package manager, workspaces, scripts. `setup-bun@v2` reads the field, so CI follows it. Root `bunfig.toml`: `linker = "hoisted"`, `exact = true`, `minimumReleaseAge = 604800`.
- **Node 24 LTS** (`.node-version` pinned to a full 24.x.y; Expo 58 needs ≥24.3), with `actions/setup-node` added to every CI job. CI installs no Node today.
- **Expo SDK 58** (RN 0.88.0, React 19.3.0 exactly, `react-native-web` 0.21.4, `expo-router` 58), scaffolded from the **blank TypeScript** template with `web.output: "single"`.
- **TypeScript 6.0.3 in both workspaces**: matches Expo 58's template. The server moves to `@tsconfig/node24` and stays CommonJS (no `"type": "module"`).
- **`tsx` 4.23.15** replaces `ts-node` + `nodemon`. Node's native type stripping can't handle `export enum RouteType` or extensionless CJS imports.
- **`cors` 2.8.6**, app-level, before the limiter and routers.
- **`@tanstack/react-query` 5.104.x** for REST, plus **`eventsource-parser` 4.1.x over global `fetch`** for SSE.
- **Biome 2.5.15** (from 1.9.4), done with `biome migrate` as its own commit followed by a reformat commit.
- **Fix in passing:** `@vitest/coverage-v8` 2.1.5 → 3.2.6 (it must equal vitest). Delete the tracked `package-lock.json` and the stray `bun.lockb`.

### Expected Features

Details are in FEATURES.md. The backend contract was read from source (HIGH).

**Must have (table stakes):**
- Route list: short-name badge, long name, **natural sort** on the client, alert marker, tap through.
- Stop list: one direction at a time (toggle from API `title`), in sequence order, name + stop **code**, alert marker. Keys are `directionId + stop.id`.
- Arrivals: **one unfiltered request shape** for REST and SSE (`?stop=` only, because the stream ignores `route`/`number`), filtered and sliced in one pure client function: chosen route first, next 3 per headsign, an "Other routes" section. Times show as `Due` / `N min` / clock time past 60 min. Empty states.
- Freshness: "Updated X ago" from **client receive time**, a Live/Reconnecting indicator, and a stale banner past ~75 s that keeps the last data dimmed. The server goes silent (no frames) during DASH failures, so this label is the only signal the rider gets.
- Stream lifecycle: open on focus + app active, close on blur/background/hidden tab. Capped jittered backoff that honors `Retry-After`; 404 is terminal.
- A shared status handler: 503 shows "warming up" with auto-retry; 429 shows a countdown and keeps the data; 502 keeps the data and shows the stale banner; 404 offers a way back; 500 is generic; a network error shows the base URL in dev builds. Use app-owned copy, never `details`.
- Pull-to-refresh on native and a visible refresh button on web. Accessibility basics: merged row labels, no live-region spam, font scaling, status not by color alone, 44/48 targets.
- Prerequisites: a configurable `EXPO_PUBLIC_API_BASE_URL`, and CORS with `Retry-After` exposed.

**Should have (next):**
- Route color badges (needs a server change; see Conflicts).
- Stop search by stop code (needs a server lookup endpoint; strong v0.8 candidate).
- Inline alert header text on the arrivals screen.

**Defer / do not build:**
- Per-prediction realtime/scheduled icon: the API has no flag, so don't guess one.
- REST polling alongside SSE; keeping streams open in the background; offline cache; animated countdown; `packages/shared`; sending `X-Device-Id` in v0.7 (it would add preflights).
- Favorites, Nearby and the vehicle map (later milestones).

### Architecture Approach

Details are in ARCHITECTURE.md. `git mv src/server apps/server/src` removes one nesting level without touching any relative import. Each app has its own tsconfig with **explicit `types`**; otherwise hoisted `@types/jest` and `@types/node` leak across workspaces. There is one root `biome.json` with `vcs.useIgnoreFile` and an override block for `apps/mobile`. Root scripts fan out with `bun run --filter './apps/*'`. Verified on 1.3.14: the root is excluded and cwd is the workspace, so `.env` and `data/` move to `apps/server/`. A new `createApp()` is shared by `app.ts` and the tests, which removes the hand-copied wiring in `test/app.ts` that would otherwise hide CORS from every route test.

**Major components:**
1. **Root workspace**: `package.json` (workspaces, `packageManager`, fan-out scripts, Biome, `trustedDependencies: ["better-sqlite3"]`), `bunfig.toml`, `.node-version`, `ci.yml`, `.superset/config.json`.
2. **`apps/server`**: the existing API with behavior unchanged, plus `createApp()`, `middleware/cors.ts` and Zod-validated `CORS_ALLOWED_ORIGINS`.
3. **`apps/mobile/src/api/`**: `config` (fails loudly), `client`, `errors` (`ApiError.kind`), `endpoints`, `predictionStream` (fetch + `eventsource-parser`, returns `{ close }`) and hand-mirrored `types`. No React imports, so these modules are unit-testable and carry most of the 80% coverage.
4. **`apps/mobile/src/hooks/`**: `useLivePredictions` (REST query + SSE into `setQueryData(["stopPredictions", stopId])`, `useFocusEffect` + `useAppActive`, reconnect policy, ~90 s watchdog) and `useAppActive`.
5. **`apps/mobile/src/app/`**: route files only: `_layout`, `index`, `routes/[shortName]`, `stops/[stopId]?route=`.

### Critical Pitfalls

Details are in PITFALLS.md.

1. **Linker flip and lockfile/Bun drift.** A regenerated `bun.lock` silently switches to the isolated linker. CI currently runs Bun 1.0.31. Three lockfiles exist. Fix: an explicit `bunfig.toml` linker, an exact `packageManager`, a single `bun.lock`, `--frozen-lockfile`, and a "tree clean after install" CI check. Never delete `bun.lock` to resolve a conflict.
2. **The native SQLite build breaks.** `trustedDependencies` *replaces* Bun's default trust list, and the Node 20→24 ABI changes. Fix: declare `trustedDependencies: ["better-sqlite3"]` now, check `bun pm untrusted` is empty, do a clean reinstall after the Node bump, run `setup-node` before `bun install` in CI, and add a boot or native-load smoke test.
3. **Lost history and moved cwd-relative paths.** Fix: a pure-`git mv` commit (verify 100% renames with `git show --stat -M`), then a config commit. Move `.env`, `data/`, `vitest.config.mts` and `.env.example` with the server. Update Codecov paths and flags. Acceptance: 853 tests and ~98.8% coverage from both the root and `apps/server`. Ask that the milestone PR not be squash-merged, or land the restructure as its own PR.
4. **CORS misplacement.** Fix: `app.use(cors(...))` right after `trust proxy`, inside `createApp()`, with `exposedHeaders: ["Retry-After", "RateLimit", "RateLimit-Policy"]`, an exact origin list, no credentials, and `allowedHeaders` left to reflect. Supertest matrix: ACAO present on the 200, the bucket 429, the cap 429, the 503, the SSE 200 and the unknown-route 404; no-Origin requests still served.
5. **SSE reconnect storms and leaks against the 60/min bucket and 5-stream cap.** Fix: own the policy in one hook (404 terminal; 429/503 wait `Retry-After`; network error or stream end → equal-jitter backoff 1 s→30 s, reset on a frame). Abort on blur, background, unmount and stopId change. Unit-test the state machine. UAT with the server killed mid-stream and three dev targets running at once.

Also watch: `bun test` runs Bun's own runner (always use `bun run test`); `EXPO_PUBLIC_*` is inlined only with literal dot access; the Android emulator needs `10.0.2.2`; never copy a pre-SDK-52 `metro.config.js`; check `bun pm why react` shows a single copy.

## Cross-Research Conflicts and Resolutions

| # | Conflict | Positions | Resolution |
|---|----------|-----------|------------|
| 1 | **Biome 1.9.4 vs 2.x** | STACK: upgrade to 2.5.15. ARCHITECTURE: defers to STACK and writes overrides in 1.x syntax. PITFALLS: optional, as a separate step. | **Upgrade to 2.5.15 in the toolchain phase**, before the app lands: `biome migrate --write` commit, then reformat commit, then confirm the same 15 known server warnings. 1.x is a dead line and the project rejects stopgaps. The `apps/mobile` override is then written in 2.x syntax (`includes`). Keep a single root config; only add a nested `extends: "//"` config if overrides grow. |
| 2 | **Bun 1.3.14 vs 1.4.x** | STACK recommends 1.4.3 but accepts 1.3.14. ARCHITECTURE and PITFALLS use 1.3.14, and ARCHITECTURE verified the fan-out behavior locally on it. The user's requirement says 1.3.x. | **Pin `bun@1.3.14`.** It honors the requirement, it is the version already tested locally, it already has `--filter`, `--parallel`, `minimumReleaseAge` and `linker`, and nothing in v0.7 needs 1.4. Note it as a final, unpatched line, with a bump to 1.4 as a later one-line change. Flag for confirmation only if the user prefers 1.4. |
| 3 | **Expo SDK 58 vs 57 under the 7-day gate** | STACK: SDK 58; RN 0.88.0 and every 58.0.x patch are gated until about 2026-10-22 to 26; SDK 57 means an immediate router migration. PITFALLS: choose by Expo Go availability. | **SDK 58.** The app scaffold lands in Phase 20, after restructure, toolchain and CORS, so the gate will have cleared. Install the newest `expo` patch whose whole closure is ≥7 days old (let `bun install` decide). Don't use `minimumReleaseAgeExcludes`. Test on the iOS simulator, Android Expo Go or web until SDK 58 Expo Go reaches the iOS App Store. Fallback, only if Phase 20 starts before the gate clears: wait, don't drop to 57. |
| 4 | **`react-native-sse` vs `fetch` + `eventsource-parser`** | STACK and ARCHITECTURE: fetch + parser. PITFALLS (19): use react-native-sse rather than hand-rolling, but defers to STACK. | **fetch + `eventsource-parser`.** PITFALLS' own findings argue against react-native-sse: no `Retry-After` access, no reconnect after a network error, endless 5 s retries on 404, no release since 2024-03, and `X-Requested-With`/`Cache-Control` headers that force a CORS preflight on web. The "hand-rolling" concern is covered because `eventsource-parser` does the parsing and the reconnect policy has to be custom anyway. One code path on all three platforms, with HTTP status visible before reading the body. **Spike required:** incremental delivery on an Android debug build and the iOS simulator, and `abort()` freeing the server's stream slot. Check `signal.aborted`, not `error.name`. |
| 5 | **Route colors need a server change** | FEATURES: DASH's Swiftly routes carry `color`/`textColor`, but `RouteData`/`BusRoute` drop them; P2. | **Not in the core v0.7 scope; neutral AA-contrast badge by default.** First capture the live `/routes?verbose=true` payload (the Phase 8 lesson). If it is populated, add it as a small optional server requirement (`RouteData` → `BusRoute` → response, plus tests) in the CORS phase, which is already a server phase. Use DASH's `textColor`, not computed contrast. Requirements decision. |
| 6 | **`CORS_ALLOWED_ORIGINS` required vs defaulted** | STACK: ask, don't build a fallback. ARCHITECTURE and PITFALLS: optional, default empty list (no browser access), `.env.example` sets `http://localhost:8081`. | **Recommend optional with an empty default.** An empty list is not a fallback: it means "no browser origin may read responses", which is correct for native-only and server-only deployments. Malformed entries, `*`, paths and trailing slashes crash startup. Making it required would force every non-web deployment to set a meaningless value. Confirm in requirements. |
| 7 | Expo template | STACK: blank TypeScript template. ARCHITECTURE: default template, stripped. | **Blank TypeScript template**, then add expo-router. It avoids reanimated, gesture-handler, `@expo/ui` and the `expo lint`/ESLint script. |
| 8 | API base URL fallback | STACK and ARCHITECTURE: fail loudly if unset. PITFALLS: fall back to `Constants.expoConfig.hostUri` in `__DEV__`. | **Fail loudly, no fallback.** That is the project principle, and it keeps a single source of truth. Document the per-target values (localhost, `10.0.2.2`, LAN IP) in `apps/mobile/.env.example`. |
| 9 | Freshness source and thresholds | FEATURES: client receive time, stale at ~75 s. ARCHITECTURE: `generatedAt`, watchdog at ~90 s. PITFALLS: stale at &gt;60 s. | **Age from client receive time** (immune to clock skew). **Stale banner at 75 s, watchdog reconnect at 90 s.** |
| 10 | REST polling while the stream is down | ARCHITECTURE: optional `refetchInterval: 30s` only while disconnected. FEATURES: anti-feature (polling *alongside* SSE). | **No polling in v0.7.** Reconnect backoff plus the stale banner plus pull-to-refresh are enough, and polling spends the shared bucket. Revisit only if the spike shows long native stream outages. |
| 11 | Server SSE heartbeat / `retry:` | PITFALLS: optional server keepalive; decide explicitly. | **No server change in v0.7.** With fetch + parser the client ignores `retry:`, and the 90 s client watchdog covers silent sockets. Record this as an explicit decision. |

## Implications for Roadmap

Phase numbering continues at 17. Each phase must end green.

### Phase 17: Monorepo restructure
**Rationale:** Everything else depends on the new layout, and the move must be isolated to keep history.
**Delivers:** Plan A pins Bun first (`packageManager: bun@1.3.14`, delete `package-lock.json`/`bun.lockb`, root `bunfig.toml` hoisted/exact/release-age), because root fan-out needs modern `--filter`. Plan B is a pure-`git mv` commit, then a config commit: new root `package.json` (workspaces, fan-out scripts, `trustedDependencies: ["better-sqlite3"]`), `apps/server` package `@dash-tracker/server`, `.env`/`data/`/vitest config moved, `createApp()` extraction, ESLint leftovers deleted, `@vitest/coverage-v8` aligned to 3.2.6, CI and Codecov paths, Superset config, CLAUDE.md/README paths.
**Avoids:** Pitfalls 3, 4, 10, 11 and 16.
**Gate:** 100% renames; 853 tests and ~98.8% coverage from the root and from `apps/server`; a fresh Superset worktree boots.

### Phase 18: Toolchain (Node 24, tsx, TS 6, Biome 2)
**Rationale:** The runtime and tool bumps must land before app code, and in separate commits from the move so a bisect can tell "path broke" from "runtime broke".
**Delivers:** `.node-version` 24.x.y and `setup-node@v7` in every CI job (before `bun install`); clean reinstall plus better-sqlite3 native check and `bun pm untrusted` empty; `tsx watch` dev server and `node dist/app.js` start, with ts-node/nodemon removed (and `@types/*` moved to devDependencies); TS 6.0.3 + `@tsconfig/node24` (CJS, explicit `types: ["node"]`, `rootDir`); Biome 2.5.15 (`migrate` commit, then reformat commit, `.git-blame-ignore-revs`, `lint:fix` flag fixed); CI on `pull_request`, Bun cache, current action majors, boot smoke test.
**Avoids:** Pitfalls 1, 2, 9, 14 (migration), 15, 17 and 23.

### Phase 19: CORS (+ optional route colors)
**Rationale:** Small, server-only and testable with curl. It must exist before Expo web's first screen.
**Delivers:** Zod `CORS_ALLOWED_ORIGINS` (exact origins, empty default), `createCorsMiddleware` in `createApp()` after `trust proxy`, `exposedHeaders`, the supertest matrix, `.env.example` and CLAUDE.md env list. If the live payload confirms it: `color`/`textColor` on routes.
**Avoids:** Pitfall 8.

### Phase 20: App foundation + route list
**Rationale:** The smallest end-to-end slice. It proves Metro + hoisted workspace + base URL + CORS together on iOS, Android and web.
**Delivers:** SDK 58 blank-TS scaffold plus expo-router (`web.output: "single"`); Biome override and format-only commit; tsconfig `types` isolation; `jest-expo` + Jest 30 + RNTL 14 with an 80% threshold over `src/**`; CI mobile leg (`typecheck`, `test:coverage`, `expo install --check`, `expo export --platform web`, Codecov `mobile` flag); `src/api/*` with `ApiError` and the shared status handler; QueryClient provider with focus/online managers; route list screen with natural sort, alert markers, refresh, and the 503/network states.
**Avoids:** Pitfalls 5, 12, 13 and 14 (Expo rules).

### Phase 21: Stops + arrivals over REST
**Rationale:** Completes the full flow with no SSE risk, so the core value ships even if streaming slips.
**Delivers:** `routes/[shortName]` with direction toggle, stop codes and alerts; `stops/[stopId]?route=` with an unfiltered `/predictions?stop=` query, the pure filter/slice function, time formatting, "Other routes", empty states, the full error-state matrix, accessibility labels, and a web deep link that fetches stops for alerts.

### Phase 22: Live arrivals over SSE
**Rationale:** The highest-risk piece, layered on a working REST flow.
**Delivers:** A transport spike first; `predictionStream.ts` (fetch + `eventsource-parser`); `useLivePredictions` with `useFocusEffect` + `useAppActive`, the reconnect policy, the watchdog, freshness/Live/stale UI and state-machine unit tests; UAT across three targets plus a physical device, with the server killed mid-stream and stream slots released after blur, background and Fast Refresh.
**Avoids:** Pitfalls 6, 7, 18 and 19.

### Phase Ordering Rationale

- Layout → runtime → server contract → app: each step depends on the one before it, and every phase ends on a working product (the project's "grow in layers" principle).
- Splitting the restructure (Phase 17) from the toolchain (Phase 18) is the bisect and blame argument from PITFALLS. ARCHITECTURE merged them into one phase of three plans; either works if commits stay separate, but two phases give clearer gates.
- The SDK 58 release-age gate clears naturally because the app starts in Phase 20.
- REST before SSE matches ARCHITECTURE's recommendation to keep these phases separate if the spike finds native problems.

### Research Flags

Needs `/gsd-plan-phase --research-phase`:
- **Phase 20:** the SDK 58 blank template plus router setup, jest-expo/Jest 30/RNTL 14 under hoisted Bun (`transformIgnorePatterns`), which Biome 2 rules fire on Expo code (`[shortName].tsx` naming), and whether `expo install` writes `~` despite `exact = true`.
- **Phase 22:** a spike before planning: `expo/fetch` incremental delivery and abort on an Android debug build and the iOS simulator against the real `/predictions/stream`.
- **Phase 18 (light):** the Biome 2 migration diff on this exact config, and the TS 6 + `@tsconfig/node24` CJS emit check.

Standard patterns (skip research): **Phase 17** (behavior verified locally), **Phase 19** (expressjs/cors is well documented), **Phase 21** (TanStack Query and expo-router basics).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Versions, dates and peers come straight from the npm registry and Expo tarballs. Runtime claims (SSE over `expo/fetch`, `exact` vs `expo install`) are unverified. |
| Features | MEDIUM | The API contract was read from source (HIGH). UX conventions come from Transit/OBA docs. Two DASH payload facts are unverified (color, realtime flag). |
| Architecture | MEDIUM-HIGH | Repo inspection and local Bun 1.3.14 experiments are HIGH. Expo monorepo docs are MEDIUM. The native SSE transport is LOW until the spike. |
| Pitfalls | MEDIUM-HIGH | Many are repo-verified (lockfiles, CI Node, coverage-v8 mismatch, cwd paths). Some are inferred (shared dev IP, Metro watch churn). |

**Overall confidence:** MEDIUM

### Gaps to Address

- **Requirement confirmations:** Bun 1.3.14 vs 1.4; optional `CORS_ALLOWED_ORIGINS`; route colors in or out; Biome 2 upgrade in this milestone. Settle these during requirements.
- **Live DASH payload:** does it carry `color`/`textColor`? Is there a realtime flag such as `scheduleBased`? What is the default prediction count per destination (affects "next 3")? Capture before Phase 19 and Phase 21.
- **SSE spike:** incremental chunks and abort freeing the slot on native. If it fails, Phase 22 replans; the REST flow is unaffected.
- **`exact = true` vs `expo install` `~` specifiers:** hand-pin if needed; check in Phase 20.
- **RN-web `RefreshControl`:** confirm there is no pull gesture on web (a refresh button is planned regardless).
- **Squash-merge policy:** ask the user to merge the restructure without squashing, or land it as its own PR.
- **Expo Go SDK 58 on the iOS App Store:** until it ships, use the simulator, Android or a dev build for UAT.
- **better-sqlite3 13 (N-API):** out of scope; stay on 12.x.

## Sources

### Primary (HIGH confidence)
- Repository inspection: `package.json`, `bun.lock` (`configVersion: 0`), `tsconfig.json`, `vitest.config.mts`, `biome.json`, `ci.yml`, `.superset/config.json`, `app.ts`, `test/app.ts`, `environment.ts`, middleware, `PredictionStreamController`/`Service`, `predictionMapping`, `BusDataRepository`, `node_modules` versions
- Local Bun 1.3.14 experiments: `--filter` excludes the root, cwd is the workspace, `configVersion` linker behavior
- npm registry (`npm view`), the `expo@58.0.16` tarball (`bundledNativeModules.json`, `engines`), `expo-template-blank-typescript@58.0.25`
- WHATWG EventSource and Fetch specs (CORS-safelisted headers); WCAG 1.4.1 and 1.4.3

### Secondary (MEDIUM confidence)
- Expo docs: monorepos, using Bun, unit testing, environment variables, `expo/fetch`, the app config `web.output`, the SDK 58 changelog, focus handling
- Bun docs: isolated installs, lifecycle/`trustedDependencies`, bunfig, filter, 1.3.9/1.4 release notes; the `oven-sh/setup-bun` README
- Biome v2 upgrade guide, big-projects guide, `useFilenamingConvention`; the `expressjs/cors` README; the MDN CORS safelist
- TanStack Query React Native guide; Node release schedule; `react-native-sse` source (read directly)
- Transit and OneBusAway docs; DASH Ride Guide (Feb 2026)

### Tertiary (LOW confidence)
- Isolated-linker symlink friction reports; tsx crashes on Node 25; Android debug buffering of streamed responses (LaunchDarkly PR #520); the MIT EFI Swiftly exercise (route colors, prediction fields); TS 6 migration articles

---
*Research completed: 2026-10-20*
*Ready for roadmap: yes*
