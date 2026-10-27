# Stack Research

**Domain:** Bun-workspaces monorepo (existing Node/Express API + new Expo app for iOS, Android and web) on a Node 24 toolchain
**Researched:** 2026-10-20
**Confidence:** MEDIUM overall. The GSD classify-confidence seam rates every source used here as LOW, because Context7 isn't available in this environment and the sources were fetched with WebFetch/WebSearch. The evidence itself is first-hand: version numbers, publish dates, `engines` and peer ranges were read directly from the npm registry (`npm view`), and Expo's version matrix from the `expo@58.0.16` tarball (`bundledNativeModules.json`) and the `expo-template-default@58.0.25` `package.json`. Treat versions and dates as HIGH-evidence. Treat runtime-behavior claims (for example how SSE behaves over `expo/fetch` on Android) as MEDIUM until a spike confirms them.

> Scope: only what v0.7 adds or changes. Express 4.21.2, Zod, Axios, Winston, better-sqlite3, express-rate-limit, Vitest 3.2.6 and the `tsc` → CommonJS build are already validated and are not re-researched. Where the move touches them, the impact is noted.

---

## Decisions at a Glance (read this first)

| # | Decision | One-line rationale |
|---|----------|--------------------|
| 1 | **Expo SDK 58** (`expo` 58.0.x, RN **0.88.0**, React **19.3.0**). App scaffolding waits until the SDK 58 dependency set clears the 7-day gate, expected around **2026-10-22 to 26**. | The app is greenfield. SDK 58 reworked the Expo Router navigation core, so starting on SDK 57 means writing code against an API that is immediately replaced. `react-native@0.88.0` was published 2026-10-15, so the gate blocks SDK 58 today. The app phases come after the restructure, toolchain and CORS phases, so the gate will have cleared by then. |
| 2 | **Bun workspaces, `linker = "hoisted"`, set explicitly in a root `bunfig.toml`**, together with `exact = true` and `minimumReleaseAge = 604800` | The lockfile is `configVersion: 0`, so it defaults to hoisted today. A regenerated lockfile with workspaces would silently switch to isolated. Hoisted is the layout Expo/Metro autolinking and the server already run on. Putting the release gate and exact pins in `bunfig.toml` enforces them for every `bun add`, including the ones `expo install` runs. |
| 3 | **Pin Bun through `packageManager` only** (`"bun@1.4.3"` recommended; `"bun@1.3.14"` if the 1.3.x wording in the requirement stands) | `oven-sh/setup-bun@v2` already reads `packageManager` by default, so CI needs no input. It is reading the stale `bun@1.0.31` today. 1.3.14 (2026-05-13) is the final 1.3 release and Bun doesn't backport fixes. **The TOOL requirement wording needs a decision** (see Gaps). |
| 4 | **Node 24 LTS** in `.node-version` (`24`), with **`actions/setup-node` added to every CI job** | CI never installs Node today. `bun run test` runs Vitest/tsc under whatever Node the runner ships, not the pinned one. Expo 58 requires `^24.3.0` on the 24 line. Node 24 enters Maintenance LTS **today** (2026-10-20) and is supported until 2028-04-30. Node 26 becomes Active LTS on 2026-10-28 and is a later bump. |
| 5 | **Replace `ts-node` + `nodemon` with `tsx` 4.23.15** (`tsx watch`), and **don't use Node 24 native type stripping** | `src/server/api/models/BusRoute.ts` declares `export enum RouteType`, and enums are not erasable syntax, so plain `node app.ts` fails. Node's CJS loader also won't resolve extensionless `.ts` imports. `tsx` is already a devDependency, handles both, and replaces two tools (ts-node 10.9.2 has had no release since 2023). |
| 6 | **`cors` 2.8.6** (+ `@types/cors` 2.8.19), mounted **before** the rate limiter and the routes, with `exposedHeaders: ["Retry-After"]` | This is the Express team's package, and it got its first release in 7 years in Jan 2026. Without CORS headers, a 429 or 503 shows up in the browser as an opaque network error, and Expo web can't read `Retry-After` unless the header is exposed. |
| 7 | **SSE over the global `fetch` (which *is* `expo/fetch` on iOS/Android) + `eventsource-parser` 4.1.x**, with the app owning the reconnect policy | One code path on all three platforms. `expo/fetch` streams bodies and honors `AbortSignal`. The app needs a policy that honors `Retry-After` on 429/503, stops on 404, and backs off on network drops, and none of the SSE client libraries let you configure one. `react-native-sse` is stale and reconnects blindly (details below). |
| 8 | **`@tanstack/react-query` 5.104.x** for REST, with SSE events written into the same query cache via `setQueryData` | Loading, error, retry, abort and dedupe for three screens would otherwise be hand-written. A single cache key per stop lets the REST initial load and the SSE updates feed one source of truth. It is also the foundation for the planned offline caching. |
| 9 | **`expo-router` 58.0.x** (file-based), with **`web.output: "single"`** set explicitly | Expo's default, with deep links and web URLs for free. SDK 58 changed the router's web default toward `server` output. An SPA has no SSR, so it avoids `window`/stream code running on a server render. |
| 10 | **App tests: `jest-expo` 58 + Jest 30 + `@testing-library/react-native` 14.** The server stays on Vitest. | Vitest can't run React Native's Flow-typed sources and native-module mocks without unmaintained community shims. `jest-expo` is Expo's official preset, and SDK 58 requires Jest 30. Two runners, one per workspace, is the standard outcome here. |
| 11 | **One TypeScript, 6.0.3, in both workspaces** | Expo 58's template pins `typescript ~6.0.3`. The server is on 5.7.3. Adopting `@tsconfig/node24` already forces the tsconfig rewrite (it replaces the `moduleResolution: "node"` option that TS 6 deprecates), so align at the same time instead of carrying two compilers. Not TS 7 (7.0.2): Expo doesn't target it, and TS 7 removes everything TS 6 deprecates. |
| 12 | **Upgrade Biome 1.9.4 → 2.5.15** in the toolchain phase, as its own commit followed by a reformat commit (the v0.1 pattern) | 1.x is unmaintained. 2.x adds first-class monorepo configs (`root: false` / `extends: "//"`). The current `style.all: true` and `files.ignore` options no longer exist in 2.x, so `biome migrate --write` plus review is required. Staying on 1.9.4 works technically but leaves the repo on a dead major line. |

---

## Recommended Stack

### Core Technologies

| Technology | Version (exact pin) | Purpose | Why Recommended |
|------------|---------------------|---------|-----------------|
| Bun | `1.4.3` (or `1.3.14`, see Decision 3) | Package manager, workspaces, script runner (not the server runtime) | One version everywhere through `packageManager`. Already the tool used in practice. Expo detects Bun first (its resolution order is bun, nub, yarn, npm, pnpm, checked at the workspace root). |
| Node.js | `24` line (24.22.0 current; Expo needs ≥ 24.3.0) | Runtime for the server, tsc, Vitest, Jest, Metro and the Expo CLI | LTS until 2028-04-30. better-sqlite3 12.x `engines` explicitly lists `24.x`. Vitest 3.2.x `engines` is `>=22`. |
| Expo SDK | `expo` 58.0.x (latest 58.0.16) | Native and web app runtime, CLI, Metro config | Current SDK (2026-10-15). Monorepo Metro config is automatic (SDK 52+). Monorepo autolinking resolution is automatic (SDK 55+). Isolated installs are supported (SDK 54+). |
| React Native | `0.88.0` (exact, Expo-mandated) | Native UI runtime | Required by SDK 58. The Strict TypeScript API is the default since 0.87, so deep `react-native/Libraries/*` imports are type errors. |
| React / React DOM | `19.3.0` / `19.3.0` (exact; **not** 19.3.1) | UI library; react-dom for web | `bundledNativeModules.json` pins `19.3.0`. React must not be duplicated in an app. Only the mobile workspace has React, so there is no cross-workspace duplication risk. |
| react-native-web | `0.21.4` | Expo web target | Expo-mandated (`~0.21.4`). Published 2026-10-08, so it clears the gate. |
| Expo Router | `expo-router` 58.0.x (latest 58.0.24) | File-based navigation on all three platforms | Standard Expo navigation. Gives web URLs for each screen (`/`, `/routes/[shortName]`, `/stops/[stopId]`). |
| TypeScript | `6.0.3` (both workspaces) | Type checking (server build too) | Matches Expo 58's template. The last JS-based compiler. Server tsconfig changes are listed under Integration Points. |

### Supporting Libraries — `apps/mobile`

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tanstack/react-query` | `5.104.2` (newest that clears the gate on 2026-10-20; re-check at install) | Server state for `/routes/all`, `/routes/:shortName/stops`, `/predictions` | Every REST call. Use `retry` keyed to status: retry 503 after `Retry-After`, never retry 400/404. |
| `eventsource-parser` | `4.1.2` (published 2026-10-12, clears 2026-10-19) | Parses the `text/event-stream` bytes (`event: prediction`) into messages | Inside the one `subscribeToStopPredictions` module. Feed it with `TextDecoder` (`{ stream: true }`). Hermes provides `TextDecoder` in SDK 58. |
| `react-native-screens` | `4.30.0` | Native stack screens (expo-router peer) | Required peer |
| `react-native-safe-area-context` | `5.10.1` | Safe-area insets (expo-router peer) | Required peer. On web in SDK 58, use CSS `env()` instead. |
| `expo-linking`, `expo-constants`, `@expo/metro-runtime`, `@expo/log-box` | 58.0.x patch from `bundledNativeModules.json` | Required expo-router peers | Required. `bunx expo install --check` validates them. |
| `expo-status-bar` | `58.0.3` | Status bar styling | Default template piece. Optional but trivial. |

**Not needed for v0.7's three screens:** `react-native-reanimated`, `react-native-worklets`, `react-native-gesture-handler`, `@expo/ui`, `expo-symbols`, `expo-image`, `expo-font`. In expo-router 58 they are all *optional* peers. The default template pulls them in, so **scaffold from the blank TypeScript template** (or prune the default template), not the default one.

### Supporting Libraries — `apps/server` (changes only)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `cors` | `2.8.6` | CORS headers + preflight for Expo web / browser preview | `app.use(cors({ origin: allowedOrigins, exposedHeaders: ["Retry-After"] }))`, registered before the rate limiter and the routers |
| `@types/cors` | `2.8.19` (dev) | Types | — |
| `tsx` | `4.23.15` (dev; bump from 4.19.2) | `dev` = `tsx watch src/app.ts`. Replaces nodemon + ts-node | Dev server only. Production runs `node dist/app.js`. |
| `@tsconfig/node24` | `24.0.5` (dev) | tsconfig base (`target es2024`, `module nodenext`, `moduleResolution node16`, `types: ["node"]`) | Replaces the unused `@tsconfig/node20` |
| `@types/node` | `24.19.2` (dev) | Node 24 typings | Server only. Never in the mobile workspace, where RN globals differ. |
| `@vitest/coverage-v8` | `3.2.6` (dev) | Coverage provider | **Fixes an existing mismatch:** it is pinned to 2.1.5 against vitest 3.2.6, and its peer is `vitest` with the same version |

### Development Tools

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| `@biomejs/biome` | `2.5.15` (root only) | Lint + format for both workspaces | Root `biome.json` holds the shared settings. Add `apps/mobile/biome.json` with `"extends": "//"` only if the app needs overrides. Keep `noDefaultExport: "off"`, because Expo Router route files *must* default-export. `useFilenamingConvention` already accepts `[shortName].tsx`, `_layout.tsx` and `+not-found.tsx`. **Don't add ESLint / `expo lint`.** |
| `jest` | `30.5.2` | App test runner | SDK 58 requires Jest 30. Always invoke it as `bun run test`. **`bun test` starts Bun's own runner instead.** |
| `jest-expo` | 58.0.x (latest 58.0.11, published 2026-10-15) | Expo preset (native-module mocks, Babel transform) | `"preset": "jest-expo"`, plus the **Bun** `transformIgnorePatterns` from the Expo docs (the one that includes `.bun`) |
| `@react-native/jest-preset` | `0.88.0` | New peer of jest-expo 58 | Bun auto-installs non-optional peers, but pin it explicitly so it is visible |
| `@testing-library/react-native` | `14.1.0` | Component/hook tests (`render`, `renderHook`, `screen`) | v14 is required for Expo Router testing in SDK 58 and uses `test-renderer` (`react-test-renderer` is gone) |
| `@types/jest` | `30.0.0` | Jest globals types | Add `"jest"` to the mobile tsconfig `types` (TS 6 defaults `types` to `[]`) |
| `@types/react` | `19.3.0` | React types | Expo template pins `~19.3.0` |
| GitHub Actions | `actions/checkout@v7`, `actions/setup-node@v7` (`node-version-file: .node-version`), `oven-sh/setup-bun@v2` (no inputs), `codecov/codecov-action@v7` | CI for both workspaces | Current majors (checkout 7.0.1, setup-node 7.1.0, codecov 7.1.1). The current workflow is still on checkout@v4/codecov@v4. |

---

## Installation

Root `bunfig.toml` (new). It makes the project's pinning rule automatic for every add, including the `bun add` calls that `expo install` makes:

```toml
[install]
linker = "hoisted"
exact = true
minimumReleaseAge = 604800 # 7 days, in seconds
```

Root `package.json` (workspace root, no runtime deps):

```jsonc
{
    "private": true,
    "packageManager": "bun@1.4.3",
    "workspaces": ["apps/*"],
    "scripts": {
        "lint": "biome check .",
        "lint:fix": "biome check . --write --unsafe",
        "test": "bun run --filter '*' test",
        "typecheck": "bun run --filter '*' typecheck"
    },
    "devDependencies": { "@biomejs/biome": "2.5.15" }
}
```

```bash
# Server additions (run in apps/server)
bun add cors@2.8.6
bun add -d @types/cors@2.8.19 tsx@4.23.15 @tsconfig/node24@24.0.5 @types/node@24.19.2 \
  @vitest/coverage-v8@3.2.6 typescript@6.0.3
bun remove ts-node nodemon @tsconfig/node20 @tsconfig/strictest   # last two are unused today

# Mobile app (run in apps/mobile, after SDK 58 clears the gate, ~2026-10-22..26)
# Scaffold from the blank TypeScript template so no reanimated/gesture-handler/@expo/ui come along.
bunx create-expo-app@latest apps/mobile --template blank-typescript@sdk-58 --no-install   # tag confirmed: expo-template-blank-typescript@58.0.25 (expo ~58.0.16, RN 0.88.0, React 19.3.0, TS ~6.0.3, no router/reanimated)
bunx expo install expo-router react-native-screens react-native-safe-area-context \
  expo-linking expo-constants expo-status-bar @expo/metro-runtime react-dom react-native-web
bun add @tanstack/react-query@5.104.2 eventsource-parser@4.1.2
bunx expo install jest-expo jest @types/jest @testing-library/react-native -- --dev
bun add -d @react-native/jest-preset@0.88.0 typescript@6.0.3
bunx expo install --check   # Expo's own version-drift check; also run it in CI
```

After every `expo install`, confirm that `package.json` contains exact versions. Expo passes `~` specifiers to `bun add`, and whether `exact = true` rewrites them is unverified (see Gaps). Hand-edit to the exact resolved version if needed, then `bun install` and `bunx expo install --check`.

---

## Integration Points (where new stack meets existing code)

1. **CORS placement and config.** Add `CORS_ALLOWED_ORIGINS` to the Zod env schema as a comma-separated list of origins, validated as URLs. Requiring it vs. defaulting it to `http://localhost:8081` (the Metro/Expo web dev origin) is a requirements call, so ask rather than build a fallback. Mount `cors` in `app.ts` **before** `upstreamRateLimit`/`streamConcurrencyCap` and the routers, so 429/503/404 responses carry `Access-Control-Allow-Origin`. Allowed methods must include `POST`/`DELETE` (favorites). The default `allowedHeaders` reflects the request, which covers `X-Device-Id`. Set `exposedHeaders: ["Retry-After"]`. Preflight `OPTIONS` is answered by `cors` and never reaches the per-handler limiter. Native builds send no `Origin` header, so `cors` does nothing for them.
2. **SSE stream + CORS.** `/predictions/stream` writes headers with `res.writeHead(...)`. `cors` sets its headers through `res.setHeader` earlier in the chain, and Node merges those into `writeHead`, so the stream gets CORS headers with no controller change. Verify this with a supertest assertion.
3. **SSE client contract.** The server emits `event: prediction\ndata: <StopPredictionsResponse JSON>\n\n`, sends the full payload immediately on connect, and sends no `id:`/`retry:` fields or heartbeat comments. The client module must:
   (a) `fetch(url, { headers: { Accept: "text/event-stream" }, signal })` and check `res.ok`. On 429/503, wait `Retry-After` seconds. On 400/404, stop. On a network error or end of stream, back off exponentially.
   (b) Pipe `res.body.getReader()` → `TextDecoder` → `eventsource-parser`, and handle only `event === "prediction"`.
   (c) Write each payload with `queryClient.setQueryData(["predictions", stopId], payload)`.
   (d) Abort on unmount and when `AppState` goes to `background`, then reconnect on `active`.
   `expo/fetch` rejects an aborted request with a `FetchError`, not a DOMException `AbortError`. Check `signal.aborted`, not `error.name`.
4. **Rate-limit interplay.** All dev clients on one machine (web, iOS simulator, Android emulator through `10.0.2.2`) share one client IP, so they share the 60/min bucket and the 5-stream cap. React StrictMode/dev double-mount can open two streams per screen. Abort on effect cleanup.
5. **API base URL.** `EXPO_PUBLIC_API_BASE_URL`, read once in `apps/mobile/src/config.ts` and failing loudly if it is missing (no `localhost` fallback, per project principles). Metro inlines `EXPO_PUBLIC_*` at build time. SDK 58 loads `.env` files by mode (`NODE_ENV` comes from the command). Typical values: web/iOS simulator `http://localhost:3000`, Android emulator `http://10.0.2.2:3000`, physical device `http://<LAN-IP>:3000`.
6. **Server TypeScript move to `@tsconfig/node24` + TS 6.** `extends: "@tsconfig/node24/tsconfig.json"`. Remove `target`/`module`/`moduleResolution` (TS 6 deprecates `moduleResolution: "node"`). Keep `rootDir: "./src"` explicit (the TS 6 default changed), `outDir`, `declaration`, and the strict extras. With no `"type": "module"`, `nodenext` still emits CommonJS, and extensionless relative imports keep working in CJS-format files. The output target moves ES2020 → ES2024, which Node 24 runs natively.
7. **Native module after the Node bump.** `better-sqlite3` 12.11.1 has prebuilds for Node 24. An existing `node_modules` built for Node 20 fails with `NODE_MODULE_VERSION` mismatch, so do a clean `rm -rf node_modules && bun install` after switching Node. Stay on 12.x. 13.x (`engines >=22`) is an unneeded major bump.
8. **CI.** Each job runs `actions/setup-node@v7` (`node-version-file: .node-version`) and then `oven-sh/setup-bun@v2`, followed by `bun install --frozen-lockfile`. The test job runs both workspaces and uploads two coverage files to Codecov with `flags: server` / `flags: mobile` (`apps/server/coverage/clover.xml`, `apps/mobile/coverage/clover.xml`; Jest's default reporters include clover). Add `bunx expo install --check` and `tsc --noEmit` for the app. Delete the tracked `package-lock.json` and the stray `bun.lockb`.
9. **App coverage gate.** In the Jest config, set `coverageThreshold: { global: { branches: 80, functions: 80, lines: 80, statements: 80 } }`, with `collectCoverageFrom` limited to `src/**/*.{ts,tsx}`. Exclude route-file glue only if a decision records it, mirroring how the server excludes `app.ts`/`config/**`.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Expo SDK 58 | Expo SDK 57 (`expo` 57.0.30, RN 0.86, React 19.2.3) | App scaffolding must start before ~2026-10-22 (RN 0.88 is gated), or you need a physical iPhone on store Expo Go before the SDK 58 Expo Go ships ("within a few weeks" of 2026-10-15). Either way you pay the router migration later. |
| `fetch` + `eventsource-parser` | `react-native-sse` 1.2.1 | You only want an EventSource-shaped API and accept its limits: last release 2024-03; XHR-based, so `responseText` grows for the life of the stream; fixed 5 s reconnect that ignores `Retry-After` (it would hammer the shared 429 bucket); **no reconnect after a network error** (status 0); and it adds `X-Requested-With`/`Cache-Control` request headers that force a CORS preflight on web. |
| `fetch` + `eventsource-parser` | `eventsource` 5.1.3 (WHATWG polyfill) with `fetch` option | Web/Node only. It requires `EventTarget`/`Event`/`MessageEvent` globals that React Native/Hermes doesn't guarantee. On web, the browser's native `EventSource` already exists. |
| `fetch` + `eventsource-parser` | `eventsource-client` 1.2.0 | Its reconnect policy is not configurable (an open TODO in its README), its last release was 2025-09, and it pins `eventsource-parser ^3`. |
| TanStack Query | Plain `fetch` + `useEffect` | A single one-shot request. Three screens plus SSE cache merging plus 503 retry is exactly the code TanStack Query replaces. |
| Hoisted linker | Isolated linker (Bun default for *new* workspaces; Expo supports it since SDK 54) | You want phantom-dependency protection more than the least surprise with RN native autolinking and Metro. It is a reasonable later switch once the app works. |
| `tsx watch` | Node 24 `--watch` + `--experimental-transform-types` | Only once the code has no enums and imports carry `.ts` extensions. Even then the flag is experimental. |
| Biome 2.5.15 | Stay on Biome 1.9.4 with path `overrides` for `apps/mobile` | You want zero lint churn this milestone. It works, but 1.x gets no fixes and has no nested-config support. |
| Bun 1.4.3 | Bun 1.3.14 | You keep the requirement's "1.3.x" wording. Nothing in v0.7 needs a 1.4 feature. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `ts-node` / `nodemon` | ts-node 10.9.2 is unmaintained (last release 2023) and type-checks at startup (slow). nodemon exists only to restart it. Both sit in runtime `dependencies` today. | `tsx watch` (dev), `node dist/app.js` (prod) |
| Node native type stripping (`node app.ts`) | `export enum RouteType` is non-erasable, and the CJS loader won't resolve extensionless `.ts` imports | `tsx` |
| Vitest for the Expo app | RN's Flow sources, Haste and native-module mocks have no maintained Vitest preset | `jest-expo` + Jest 30 |
| `react-test-renderer` | Doesn't support React 19+, and is deprecated by Expo's docs | `@testing-library/react-native` 14 |
| `bun test` | Starts Bun's built-in runner, not the workspace `test` script (Vitest/Jest) | `bun run test` |
| ESLint / `eslint-config-expo` / `expo lint` | A second lint tool undoes v0.1. The Expo default template adds a `lint: expo lint` script, so delete it. | Biome |
| MSW in the app tests | Needs RN polyfills, and it is extra machinery for three endpoints | `jest.mock` of the API module, or `global.fetch = jest.fn()` returning `new Response(stream)` |
| Expo Router data loaders / server output | Server-rendering features. v0.7 is a client-only SPA plus native screens. | TanStack Query + `web.output: "single"` |
| `typedRoutes` experiment | Generates `.expo/types` only when the dev server runs, so `tsc --noEmit` in CI breaks unless generation is scripted | Plain `href` strings for three routes |
| `packages/shared` API types | Explicitly out of scope (PROJECT.md) | Local `Api*` types in the app |
| TypeScript 7.0.x | Expo 58 targets ~6.0.3. TS 7 removes all TS 6 deprecations and its programmatic API is still settling. | TypeScript 6.0.3 |
| The `minimumReleaseAgeExcludes` exemption for Expo | It defeats the project's 7-day gate for exactly the fastest-moving packages | Wait for the gate to clear |

## Stack Patterns by Variant

**If scaffolding must start before the SDK 58 set clears the gate (~2026-10-22 to 26):**
- Use SDK 57 (`expo@57.0.30` and its `bundledNativeModules.json`, RN 0.86.3, React 19.2.3, `jest-expo@57.0.6`). Jest 30 is still fine.
- Plan an SDK 58 upgrade (`bunx expo install expo@^58.0.0 --fix` + router migration guide) in a later phase.

**If testing on a physical iPhone before the SDK 58 Expo Go reaches the App Store:**
- Use the iOS simulator (Expo CLI installs the matching Expo Go there), Android Expo Go, or a local development build (`expo-dev-client`, needs Xcode 26.4+).
- Expo Go on iOS requires being logged in to both the Expo CLI and the Expo Go app since SDK 57 (simulators and dev builds exempt), so the developer needs an Expo account.

**If moving to the isolated linker later:**
- Keep the Bun `transformIgnorePatterns` (it already includes `.bun`), and run `bun pm why react-native` to confirm a single copy.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `expo@58.0.x` | Node `^22.13 \|\| ^24.3 \|\| ^26` | From the `engines` field. Odd Node lines are unsupported. |
| `expo@58` | `react-native@0.88.0`, `react@19.3.0`, `react-dom@19.3.0`, `react-native-web@~0.21.4`, `jest-expo@~58.0.11` | From `bundledNativeModules.json`. React is **19.3.0**, not npm-latest 19.3.1. |
| `expo-router@58.0.24` | Required peers: `expo-linking ^58.0.13`, `expo-constants ^58.0.12`, `@expo/metro-runtime ^58.0.14`, `@expo/log-box ^58.0.12`, `react-native-screens ^4.30.0`, `react-native-safe-area-context >=5.4.0` | reanimated, gesture-handler, worklets, `@expo/ui`, symbols, react-native-web and react-dom are *optional* peers. You need the last two for web. |
| `jest-expo@58.0.11` | `jest ^29 \|\| ^30` (docs say SDK 58 requires 30), `@react-native/jest-preset ^0.88.0` | Depends on `test-renderer 1.3.0` |
| `@testing-library/react-native@14.1.0` | `react >=19`, `react-native >=0.78`, `jest >=29`, `test-renderer ^1` | — |
| `@tanstack/react-query@5.104.x` | `react ^18 \|\| ^19` | — |
| `eventsource-parser@4.1.x` | Any runtime with `TextDecoder`. The `/stream` export needs `TransformStream`. | Zero dependencies. `engines` says Node ≥22.12, which only matters for Jest under Node 24 (fine). |
| `better-sqlite3@12.11.1` | Node `20.x \|\| 22.x \|\| … \|\| 24.x \|\| 25.x \|\| 26.x` | Rebuild/reinstall after the Node switch |
| `vitest@3.2.6` | Node `^18 \|\| ^20 \|\| >=22`; `@vitest/coverage-v8` **must equal** `3.2.6` | Vitest 5.0.5 / 4.1.12 exist but are out of scope |
| `tsx@4.23.15` | Node ≥18 | — |
| `@biomejs/biome@2.5.15` | Biome 1.x config is invalid: `style.all`/`nursery.all` and `files.ignore` were removed | Run `bunx biome migrate --write`. Note that `style` rules no longer error by default in 2.x. |
| `typescript@6.0.3` | `@tsconfig/node24@24.0.5` | TS 6: `types` defaults to `[]` (node24 base sets `["node"]`), `rootDir` defaults to the tsconfig directory, and `moduleResolution: node` is deprecated |
| `oven-sh/setup-bun@v2` | Reads `package.json` `packageManager` → `engines.bun` → `latest` | No `bun-version` input needed once `packageManager` is right |

### Release-age gate status on 2026-10-20 (packages published before 2026-10-13 are installable)

| Package | Newest overall | Newest that clears the gate today |
|---------|----------------|-----------------------------------|
| expo | 58.0.16 (10-19) | 57.0.28 (10-12). **No SDK 58 patch clears yet.** |
| react-native | 0.88.0 (10-15) | 0.87.1. **SDK 58 is blocked until about 10-22.** |
| jest-expo | 58.0.11 (10-15) | 57.0.6 |
| @react-native/jest-preset | 0.88.0 (10-15) | 0.87.1 |
| @tanstack/react-query | 5.104.5 (10-19) | 5.104.2 (10-11) |
| eventsource-parser | 4.1.2 (10-12) | 4.1.2 |
| @testing-library/react-native | 14.1.0 (10-08) | 14.1.0 |
| @biomejs/biome | 2.5.15 (09-30) | 2.5.15 |
| cors / @types/cors | 2.8.6 / 2.8.19 | same |
| tsx | 4.23.15 (09-20) | same |
| @tsconfig/node24 / @types/node 24 | 24.0.5 / 24.19.2 (10-09) | same |
| typescript | 7.0.2; 6.0.3 (04-16) | 6.0.3 |
| Bun | 1.4.3 (10-10); 1.3.14 (05-13) | both |

Expo ships patches several times a week, and every `expo@58.0.N` depends on `~58.0.x` siblings published the same week. With Bun's gate applied to transitive deps, pick the **newest `expo` patch whose whole closure is ≥7 days old**. In practice that means running `bun install` and letting resolution fail or succeed, not hand-computing it.

## Sources

- npm registry (`npm view <pkg> version|time|engines|peerDependencies|dist-tags`, queried 2026-10-20) for every version, date, engine and peer range above. Primary source.
- `expo@58.0.16` tarball: `bundledNativeModules.json` and `package.json` `engines`. `expo-template-default@58.0.25` `package.json` (TypeScript ~6.0.3, React 19.3.0, RN 0.88.0). `@expo/package-manager@1.14.2` `nodeManagers.js` (lockfile detection order). Primary source.
- `expo@58` source `src/winter/fetch/fetch.ts` / `fetch.web.ts`: AbortSignal handling (`FetchError`), and web re-exports `globalThis.fetch`.
- https://docs.expo.dev/versions/latest/ for the SDK 58/57/56 compatibility matrix and Node minimums
- https://expo.dev/changelog/sdk-58 for RN 0.88, Node requirements, router rework, Expo Go timing and `NODE_ENV`/.env changes
- https://expo.dev/changelog and https://expo.dev/changelog/expo-go-57-login for release dates and the Expo Go login requirement
- https://docs.expo.dev/guides/monorepos/ for Bun workspaces support, automatic Metro config, isolated installs (SDK 54+) and no duplicate React/RN
- https://docs.expo.dev/develop/unit-testing/ for jest-expo setup, the Bun `transformIgnorePatterns`, "SDK 58 requires Jest 30" and RNTL replacing react-test-renderer
- https://docs.expo.dev/versions/latest/sdk/expo/ for `expo/fetch` as the global fetch on native, streaming, and TextDecoder/streams globals
- https://docs.expo.dev/versions/latest/config/app/ for the `web.output` values (`single` | `static` | `server`)
- https://bun.com/docs/runtime/bunfig and https://bun.com/docs/pm/cli/install for `linker`, `exact`, `minimumReleaseAge` (seconds, transitive), `configVersion` defaults and automatic peer installs
- https://bun.com/docs/pm/filter and https://bun.com/blog/bun-v1.4 for `--filter` and the 1.4 changes
- https://github.com/oven-sh/setup-bun (README + `src/utils.ts`) for the `packageManager` → `engines.bun` → latest resolution
- https://github.com/nodejs/Release `schedule.json` for Node 24 maintenance on 2026-10-20 and Node 26 LTS on 2026-10-28
- https://biomejs.dev/guides/upgrade-to-biome-v2/ and https://biomejs.dev/guides/big-projects/ for Biome 2 breaking changes and nested configs
- https://biomejs.dev/linter/rules/use-filenaming-convention/ for allowed `[param]`, `+`, `_` and dotted names
- unpkg `react-native-sse@1.2.1/src/EventSource.js` for its reconnect, header and buffering behavior (read directly). GitHub `binaryminds/react-native-sse` for last activity (2025-07, no release since 2024-03).
- https://github.com/EventSource/eventsource and unpkg `eventsource-client` README for required globals and the unconfigurable reconnect
- TypeScript 6.0 change coverage (visualstudiomagazine.com 2026-03-23, logrocket migration guide) for `types: []`, `rootDir`, and the `node10` deprecation. MEDIUM (secondary).

---
*Stack research for: v0.7 Frontend Foundation (Bun monorepo + Expo app + Node 24 toolchain)*
*Researched: 2026-10-20*
