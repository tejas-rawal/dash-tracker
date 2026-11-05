# Architecture Research

**Domain:** Bun-workspaces monorepo (Express API + Expo app for iOS, Android and web), v0.7 Frontend Foundation
**Researched:** 2026-10-20
**Confidence:** MEDIUM-HIGH. Repo facts are HIGH: read from the tree, plus Bun 1.3.14 behavior tested locally in the scratchpad. Expo, Bun, Biome and CORS facts are MEDIUM: from official docs fetched this session, cross-checked where possible. The SSE-on-native transport is MEDIUM-LOW and needs a spike.

Scope: only what v0.7 adds or changes. The server's internal layering (routes → controllers → services → repositories → models, factory DI) stays as it is and is documented in `.planning/codebase/ARCHITECTURE.md`.

---

## Standard Architecture

### System Overview

```
┌──────────────────────────── repo root (Bun workspaces) ────────────────────────────┐
│ package.json (workspaces: apps/*, packageManager bun@1.3.14, fan-out scripts)       │
│ bunfig.toml (linker = "hoisted")  biome.json (one config, overrides for mobile)     │
│ .node-version (24)  bun.lock  .github/workflows/ci.yml  .superset/config.json       │
├──────────────────────────────────────────┬──────────────────────────────────────────┤
│ apps/server  (@dash-tracker/server)      │ apps/mobile  (@dash-tracker/mobile)      │
│                                          │                                          │
│  createApp()                             │  src/app/  (expo-router screens)         │
│   trust proxy → cors → json → /api/v1    │   _layout ─ index (routes)               │
│        │                                 │            └ routes/[shortName] (stops)  │
│   router ─ per-handler rate limiter      │            └ stops/[stopId] (arrivals)   │
│        │   + stream cap (unchanged)      │        │                                 │
│   controllers → services → repositories  │  src/hooks/  useLivePredictions (REST    │
│        │                                 │        │      + SSE + focus/AppState)    │
│   DASH API (axios)   SQLite (DB_PATH)    │  src/api/   config · client · errors ·   │
│                                          │             endpoints · predictionStream │
│  .env, data/ live here (cwd)             │  .env (EXPO_PUBLIC_API_BASE_URL)         │
├──────────────────────────────────────────┴──────────────────────────────────────────┤
│          HTTP: REST JSON + text/event-stream, CORS for Expo web origins only        │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities (new vs. modified)

| Component | Status | Responsibility | Implementation |
|-----------|--------|----------------|----------------|
| Root `package.json` | **NEW** (old file moves to `apps/server`) | Lists the workspaces, pins Bun, holds the fan-out scripts and the root-only dev tool (Biome) | `"workspaces": ["apps/*"]`, `"packageManager": "bun@1.3.14"`, no runtime deps |
| Root `bunfig.toml` | **NEW** | Pins the install linker so it doesn't depend on a lockfile field | `[install] linker = "hoisted"` |
| `apps/server/` | **MOVED** (`git mv`) | The existing API, unchanged in behavior | `src/server/**` → `apps/server/src/**` (one nesting level removed) |
| `apps/server/src/createApp.ts` | **NEW** | Builds the Express app (middleware order) once, for both `app.ts` and the tests | Removes the hand-copied wiring in `src/server/test/app.ts` |
| `apps/server/src/api/middleware/cors.ts` | **NEW** | Lets the allowed browser origins read responses, including the error statuses and the `Retry-After` header | `createCorsMiddleware(origins)` wrapping the `cors` package |
| `apps/server/src/config/environment.ts` | **MODIFIED** | New `CORS_ALLOWED_ORIGINS`, validated by Zod, crashes at startup if invalid | Comma list → `string[]`, each entry must be an exact origin |
| `apps/mobile/` | **NEW** | Expo app (iOS, Android, web) | `create-expo-app` default template for SDK 58, example code stripped |
| `apps/mobile/src/api/*` | **NEW** | Base URL, typed fetch, one error type, endpoint functions, SSE stream | Plain TS modules with no React import, so they're testable in isolation |
| `apps/mobile/src/hooks/useLivePredictions.ts` | **NEW** | REST first paint, then SSE updates; opens and closes the stream on screen focus and AppState | TanStack Query cache, updated by stream frames |
| `biome.json` | **MODIFIED** | One config covers both apps; mobile-specific rule overrides | `vcs.useIgnoreFile`, plus an `overrides` entry for `apps/mobile/**` |
| `.github/workflows/ci.yml` | **MODIFIED** | Lint once; type-check, test and build per workspace | Matrix over `server` and `mobile` |
| `.superset/config.json` | **MODIFIED** | The setup script writes the per-app env files; run starts the server | Paths change to `apps/server` |
| `package-lock.json`, `src/server/.eslintrc`, `src/server/.eslintignore` | **DELETE** | Stale leftovers: an npm lockfile is still tracked, and ESLint configs from the Sails template remain | No compatibility shims kept |

---

## Recommended Project Structure

```
dash-tracker/
├── package.json              # NEW root: workspaces, packageManager, fan-out scripts, devDeps: @biomejs/biome
├── bunfig.toml               # NEW: [install] linker = "hoisted"
├── bun.lock                  # regenerated by the move (stays configVersion 0 → hoisted, but pinned anyway)
├── biome.json                # root-only Biome config (no nested configs)
├── .node-version             # 24
├── .gitignore                # existing patterns (.env, data/, coverage, dist) already match at any depth; add .expo/, expo-env.d.ts, web-build/
├── .github/workflows/ci.yml
├── .superset/config.json
├── AGENTS.md, README.md, .claude/CLAUDE.md   # update paths/commands
├── apps/
│   ├── server/
│   │   ├── package.json      # git mv of the old root package.json, renamed @dash-tracker/server
│   │   ├── tsconfig.json     # git mv; extends @tsconfig/node24; explicit "types"
│   │   ├── vitest.config.mts # git mv; setup path src/test/setup.ts
│   │   ├── .env.example      # git mv; + CORS_ALLOWED_ORIGINS
│   │   ├── .env              # local, gitignored (moved by hand)
│   │   ├── data/             # local, gitignored; DB_PATH default resolves here (cwd = apps/server)
│   │   └── src/              # git mv src/server → apps/server/src
│   │       ├── app.ts        # entry: process handlers → SQLite → listen → loops
│   │       ├── createApp.ts  # NEW
│   │       ├── api/ (controllers, middleware/cors.ts NEW, routes, services, repositories, models, errors)
│   │       ├── config/
│   │       └── test/
│   └── mobile/
│       ├── package.json      # @dash-tracker/mobile; main: expo-router/entry
│       ├── app.json          # scheme, web.bundler "metro", plugins: ["expo-router"]
│       ├── tsconfig.json     # extends expo/tsconfig.base; strict; explicit "types"
│       ├── jest.config.js    # preset jest-expo, coverageThreshold 80 (see STACK.md for runner choice)
│       ├── .env.example      # EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
│       ├── .env              # local, gitignored
│       └── src/
│           ├── app/                      # expo-router: files here ARE routes; nothing else lives here
│           │   ├── _layout.tsx           # <Stack/> + QueryClientProvider + focus/online managers
│           │   ├── index.tsx             # route list            GET /routes/all
│           │   ├── routes/[shortName].tsx# stops by direction    GET /routes/:shortName/stops
│           │   └── stops/[stopId].tsx    # live arrivals (?route=) GET /predictions + /predictions/stream
│           ├── api/
│           │   ├── config.ts             # reads process.env.EXPO_PUBLIC_API_BASE_URL once, fails loudly
│           │   ├── client.ts             # getJson<T>(path, query, signal) → T | throws ApiError
│           │   ├── errors.ts             # ApiError { kind, status, retryAfterMs, details }
│           │   ├── endpoints.ts          # getAllRoutes, getRouteStops, getStopPredictions
│           │   ├── predictionStream.ts   # openPredictionStream(...) → { close }
│           │   └── types.ts              # hand-mirrored server response types (no shared package in v0.7)
│           ├── hooks/
│           │   ├── useLivePredictions.ts
│           │   └── useAppActive.ts       # AppState → boolean (RN-web maps it to document visibility)
│           └── components/
│               ├── ErrorState.tsx        # message + action per ApiError.kind
│               └── ArrivalRow.tsx …
└── (no packages/ in v0.7: a shared types package is explicitly deferred in PROJECT.md)
```

### Structure Rationale

- **`apps/server/src/` rather than `apps/server/src/server/`:** `src/` only contains `server/` today, so `git mv src/server apps/server/src` drops a redundant level without touching a single relative import (they're all relative within the tree). `tsconfig.json`'s `rootDir: ./src` / `include: src/**/*` keep working unchanged. Update CLAUDE.md's "rooted at `src/server/`" line. (HIGH, from repo inspection.)
- **Per-app `tsconfig`, no shared `tsconfig.base.json`:** the two apps share almost no compiler settings. The server is Node 24 CommonJS through `@tsconfig/node24`; the app uses bundler resolution and `jsx: react-native` through `expo/tsconfig.base`. A root base file would hold only the strict flags, which is an extra indirection for no real benefit. Repeat the `strict` line in both files instead.
- **One root `biome.json`:** Biome runs once from the root (`biome check .`) across both apps. No fan-out needed, and it keeps today's `lint`/`format` commands.
- **Test runner per app:** each app owns its `test`/`test:coverage` script and config; the root only fans out. Vitest stays for the server. For the app, Expo documents and supports only `jest-expo` + `@testing-library/react-native` (SDK 58 needs Jest 30 and RNTL 14+), and it has no supported Vitest preset (MEDIUM, from Expo's unit-testing docs). STACK.md owns the final runner choice. Architecturally, keep `src/api/` free of React and React Native imports so those modules can be unit-tested without native mocks either way.
- **`src/app/` holds only route files:** expo-router turns every file under `app/` into a route. Hooks, API code and components live beside it in `src/`, never inside.

---

## Monorepo Mechanics

### Root `package.json` and fan-out scripts

```jsonc
{
    "name": "dash-tracker",
    "private": true,
    "packageManager": "bun@1.3.14",
    "workspaces": ["apps/*"],
    "scripts": {
        "lint": "biome check .",
        "lint:fix": "biome check . --write --unsafe",      // also fixes the deprecated --apply-unsafe debt
        "format": "biome check .",
        "format:write": "biome check . --write",
        "typecheck": "bun run --filter './apps/*' typecheck",
        "test": "bun run --filter './apps/*' test",
        "test:coverage": "bun run --filter './apps/*' test:coverage",
        "build": "bun run --filter @dash-tracker/server build",
        "dev:server": "bun run --filter @dash-tracker/server dev",
        "dev:mobile": "bun run --filter @dash-tracker/mobile start"
    },
    "devDependencies": { "@biomejs/biome": "<pinned>" }
}
```

Verified locally with Bun 1.3.14 (HIGH):
- `--filter '*'`, `--filter './apps/*'` and `--workspaces` all run only `apps/a` and `apps/b`. The **root package is not matched**, so a root `test` script that fans out cannot call itself recursively. Prefer the path form `'./apps/*'`: it's explicit about what it selects.
- The script runs with **cwd = the workspace directory**. This is what moves `.env` and `data/` (below).
- `--parallel`/`--sequential` exist from Bun 1.3.9 (official release notes, Feb 2026), so the 1.3.14 pin has them. Don't use `--parallel` for `expo start`: prefixed, non-interactive output loses Expo's QR code and keyboard shortcuts. Keep `dev:server` and `dev:mobile` as separate terminals.

Per-app scripts use conventional names (no compatibility aliases): server `dev`, `start`, `build`, `typecheck` (`tsc --noEmit`), `test`, `test:coverage`; mobile `start` (`expo start`), `web`, `typecheck`, `test`, `test:coverage`, `export:web` (`expo export --platform web`, the CI bundling check).

### Linker: pin `hoisted` explicitly

Facts (Bun docs, MEDIUM; behavior verified locally, HIGH):
- Bun's default linker depends on `bun.lock`'s `configVersion`: `1` + workspaces → **isolated**; `0` → hoisted. A fresh lockfile gets `configVersion: 1`.
- The tracked `bun.lock` is `configVersion: 0`. Tested: adding `workspaces` to a `configVersion: 0` project **keeps it at 0 and hoisted**. Deleting `bun.lock` and reinstalling would **silently switch the monorepo to isolated**.
- Expo supports isolated installs from SDK 54 (Expo monorepo guide, Oct 2026, SDK 58). In practice, Bun isolated + Metro/RN still has community reports of missing symlinks; the common fix is `linker = "hoisted"`.

Decision: commit `bunfig.toml` with `[install] linker = "hoisted"`. That gives:
1. Install behavior that doesn't change when the lockfile is regenerated.
2. The lowest-friction layout for Metro, autolinking and `jest-expo`.
3. One `node_modules/typescript`, so `.vscode/settings.json`'s `js/ts.tsdk.path` keeps working.

Cost: phantom dependencies are possible (the server could import a package only the app declares). This is acceptable with two apps and no shared package. Revisit isolated mode if a `packages/` workspace is ever added.

Metro: no `metro.config.js` is needed. Expo has configured Metro for monorepos automatically since SDK 52, and SDK 55+ enables `autolinkingModuleResolution` for monorepo apps (MEDIUM). Add a metro config only if a concrete problem shows up. Guardrail: `bun pm why react-native` and `bun pm why react` must each show a single version. Duplicate React breaks at runtime, and duplicate RN is unsupported.

**Hoisting side effect on TypeScript (HIGH, standard TS behavior):** with no `compilerOptions.types` set, TypeScript loads every `node_modules/@types/*` it finds in ancestor directories. Hoisted, that means the server's `tsc` sees `@types/jest` from the app, and the app's `tsc` sees `@types/node` from the server (`setTimeout` then returns `NodeJS.Timeout` instead of `number`). Set `types` explicitly in both tsconfigs: server `["node"]`; mobile the Expo or Jest types it needs.

### `.env`, `DB_PATH` and data files after the move

| Item | Before | After | Why |
|------|--------|-------|-----|
| Server `.env` | `./.env` | `apps/server/.env` | `dotenv.config()` reads `process.cwd()/.env`; workspace scripts run with cwd = `apps/server` |
| `.env.example` | root | `apps/server/.env.example` (`git mv`) + new `CORS_ALLOWED_ORIGINS` line | Keeps the file next to its consumer |
| SQLite file | `./data/dash-tracker.sqlite` | `apps/server/data/dash-tracker.sqlite` | `DB_PATH` default is cwd-relative; `mkdirSync(dirname(...))` creates it |
| App `.env` | none | `apps/mobile/.env` + tracked `.env.example` | Expo loads env files from the app project root only |
| `.gitignore` | `.env`, `data/`, `coverage`, `dist` | unchanged for those (unanchored patterns match at any depth); add `.expo/`, `expo-env.d.ts`, `web-build/`, `/ios`, `/android` under `apps/mobile` | No path changes needed |

No code changes and no migration (principle: no backward compatibility). Developers move their local `.env` and `data/` by hand once, and the phase notes say so. A server started from the repo root with plain `ts-node` would look for a root `.env`. Every documented entry point goes through workspace scripts, so that isn't supported.

`.superset/config.json` becomes:
`setup: ["bun install --frozen-lockfile", "[ -f apps/server/.env ] || (cd apps/server && <setup script>)", "[ -f apps/mobile/.env ] || cp apps/mobile/.env.example apps/mobile/.env"]`, `run: ["bun run dev:server"]`. The external setup script writes `$(pwd)/.env`, so running it from `apps/server` puts the file in the right place without editing the script.

### Git history preservation

- Use `git mv` for everything that moves: `src/server` → `apps/server/src`, plus `tsconfig.json`, `vitest.config.mts`, `.env.example`, and the old `package.json` → `apps/server/package.json`. Git tracks renames by content similarity, and an unmodified move is a 100% match, so `git log --follow` and `git blame` (which follows renames by default) keep the history.
- Commit the moves **on their own, with no content edits**, then make the config edits that turn the tree green in the next commit, in the same plan and PR. The intermediate commit doesn't build. That's acceptable inside one plan, because the phase lands green and no one deploys mid-plan. This mirrors the v0.1 decision to land the mass reformat as its own commit.
- `package.json` is moved to `apps/server/package.json` (it is almost entirely server deps) and a **new** root `package.json` is created. Edits to the moved file in the next commit keep it above git's 50% similarity threshold, so its history follows it.
- Delete `package-lock.json` (tracked, stale npm lockfile) and the untracked `bun.lockb` in the toolchain step.

### Biome (root config, overrides for the app)

Keep a single root `biome.json`. Changes:
1. `"vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true }`: Biome then skips `.expo/`, `dist/`, `coverage/` and `node_modules/` in every app via `.gitignore`, and the hand-kept `files.ignore` list shrinks to `.planning` and `.gsd`.
2. One `overrides` entry for `apps/mobile/**`. This is Biome 1.x `include`; Biome 2.x renamed it `includes` and also offers nested `"extends": "//"` configs. STACK.md decides the Biome version. If it's 2.x, `biome migrate` is needed because `style.all` no longer exists. The override needs:
   - `useFilenamingConvention` (enabled today through `style.all`): expo-router names like `_layout.tsx` and `+not-found.tsx` pass (leading underscores and `+` prefixes are allowed), but dynamic segments like `[shortName].tsx` aren't clearly covered (the docs list only catch-alls `[...slug]`). Turn it off for `apps/mobile/src/app/**` if it flags them.
   - `noDefaultExport` is already off globally; expo-router needs default exports for screens.
   - Expect `noImplicitBoolean` (JSX `<X disabled />`) and `noProcessEnv` (if present in the chosen version) to fire. Keep `process.env.EXPO_PUBLIC_API_BASE_URL` in `src/api/config.ts` only, with a `biome-ignore` that gives the reason (Expo inlines it at bundle time).
3. Existing `jsxQuoteStyle: "single"` will reformat the Expo template. Run `format:write` once on the fresh scaffold, in its own commit.

### CI (`.github/workflows/ci.yml`)

```yaml
on: { push: { branches: [main] }, pull_request: {} }   # PR trigger: optional, recommended
jobs:
  lint:            # once, repo-wide (current lint + style jobs run the identical command; merge them)
    steps: [checkout, setup-node (node-version-file: .node-version), setup-bun (bun-version-file: package.json),
            bun install --frozen-lockfile, bun run lint]
  check:
    strategy: { fail-fast: false, matrix: { app: [server, mobile] } }
    steps:
      - checkout / setup-node / setup-bun / bun install --frozen-lockfile
      - bun run --filter @dash-tracker/${{ matrix.app }} typecheck
      - bun run --filter @dash-tracker/${{ matrix.app }} test:coverage
      - if server: bun run --filter @dash-tracker/server build
      - if mobile: bun run --filter @dash-tracker/mobile export:web   # proves Metro resolves the hoisted monorepo
      - codecov: files apps/${{ matrix.app }}/coverage/clover.xml, flags: ${{ matrix.app }}
```

- `oven-sh/setup-bun@v2` reads `packageManager` from `package.json` by default. Passing `bun-version-file: package.json` makes that explicit, so local, lockfile and CI use the same Bun (MEDIUM, from the action's README).
- Add `actions/setup-node` with `.node-version`. Today CI runs `tsc`, `vitest` and `ts-node` on whatever Node the runner image ships. The v0.7 Node 24 pin means nothing in CI without it.
- **Why `expo export --platform web` in CI:** Jest resolves modules with its own resolver, so a green test run doesn't prove Metro can bundle the app from a hoisted monorepo. A web export needs no Xcode or Android SDK and fails on resolution or duplicate-React problems. Native builds stay out of v0.7 (local dev builds only). `npx expo-doctor` is a worthwhile extra check of SDK dependency alignment, but it makes network calls; treat it as optional.
- No path filters per workspace: two small jobs are cheaper than the complexity of filter rules.

---

## Server Integration: CORS

### Placement in the middleware chain

```
app.set("trust proxy", hops)           // unchanged: must come first so req.ip is right for the limiter
app.use(createCorsMiddleware(origins)) // NEW: app-level, before everything that can respond
app.use(express.json())
app.get("/", ...)
app.use("/api/v1", router)             // rate limiter + stream cap stay per-handler inside routers
```

Why app-level and first (HIGH for the CORS semantics; MDN + expressjs/cors README):
- **Error responses must carry `Access-Control-Allow-Origin`.** Without the header, a browser hides a 429 from the limiter, a 503 from `sendErrorResponse` or a 404 from an unmatched route from the app's JavaScript as an opaque network failure, and the app can't tell "rate limited, retry in 5 s" from "server down". Running CORS before the router guarantees every response, including Express's default 404 and errors, gets the headers.
- **Preflight is answered by `cors` and never reaches the limiter.** The limiter is attached with `router.get(...)` only, so an `OPTIONS` request never spends the 60/min bucket or claims a stream slot. In v0.7 the app only makes simple GETs with no custom headers, so it won't trigger a preflight at all. The first preflight comes when favorites (with `X-Device-Id`) reach the app.
- **SSE:** `cors` sets headers with `res.setHeader` before the controller runs. Node merges those with the headers `PredictionStreamController` passes to `res.writeHead(200, {...})`, so the stream response keeps CORS headers. No controller change is needed.
- **CORS is not access control.** The middleware doesn't block requests; the browser decides what JavaScript may read. Disallowed origins and native apps (which send no `Origin`) are still served and still rate-limited. Don't add origin-based rejection logic.

### Configuration

```ts
// environment.ts
CORS_ALLOWED_ORIGINS: z
    .string()
    .default("")
    .transform((raw) => raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0))
    .pipe(z.array(z.string().refine(isExactOrigin, "each CORS_ALLOWED_ORIGINS entry must be an origin like http://localhost:8081"))),
// isExactOrigin(o): URL.canParse(o) && new URL(o).origin === o  → rejects "*", paths, trailing "/", "null"
// exposed as environment.server.corsAllowedOrigins: string[]
```

```ts
// api/middleware/cors.ts
export function createCorsMiddleware(allowedOrigins: string[]): RequestHandler {
    return cors({
        origin: allowedOrigins, // exact-match list; an empty list means no browser origin gets access
        // Not CORS-safelisted, so without this the web app can't read when to retry a 429/503.
        exposedHeaders: ["Retry-After", "RateLimit", "RateLimit-Policy"],
    });
}
```

- Default is empty (no cross-origin browser access). `apps/server/.env.example` sets `CORS_ALLOWED_ORIGINS=http://localhost:8081` (the Expo web dev server's default port). Startup crashes on a malformed entry, in line with the other env vars.
- No `credentials: true`: the API uses no cookies. No wildcard: an exact list keeps the configuration explicit, and `*` would fail validation.
- Tests: unit-test `createCorsMiddleware` and the env parsing. Add route tests that a 429 and a 503 from an allowed origin carry `Access-Control-Allow-Origin` and `Access-Control-Expose-Headers`, and that a request with no `Origin` header still gets 200 with no CORS headers. All of this needs `test/app.ts` to use the real `createApp()`. Today it copies `app.ts`'s middleware by hand, so CORS added only in `app.ts` would be invisible to every route test.

---

## App Architecture

### Patterns to Follow

#### Pattern 1: One config module for the base URL

**What:** `src/api/config.ts` reads `process.env.EXPO_PUBLIC_API_BASE_URL` with literal dot notation (Expo only inlines static dot access; destructuring and bracket access are not inlined, per Expo's env-var docs, MEDIUM). It validates the value with `URL.canParse`, strips any trailing `/`, and throws a clear error at import time if the value is missing.
**When:** Always. Every request URL is built from this one value.
**Values per target (dev):** iOS simulator `http://localhost:3000`; Android emulator `http://10.0.2.2:3000`; physical device `http://<LAN IP>:3000`; web `http://localhost:3000`. These go in the `.env.example` comments. `app.listen(port)` already binds to all interfaces, so LAN devices reach it without server changes. Values are public in the bundle, so never put secrets there (the app needs none).
**Not chosen:** deriving the host from `Constants.expoConfig.hostUri`. It's convenient for phones, but it's a second source of truth and only works in dev.

#### Pattern 2: Typed client with a single error type

```ts
export type ApiErrorKind =
    | "notFound" | "notReady" | "rateLimited" | "upstream" | "badRequest" | "unexpected" | "network";

export class ApiError extends Error {
    constructor(
        readonly kind: ApiErrorKind,
        readonly status: number | undefined,
        readonly retryAfterMs: number | undefined,
        readonly details: string | undefined,
    ) { super(details ?? kind); }
}

// client.ts: fetch → if !res.ok: read Retry-After (seconds) + { error, details } body → ApiError
//            fetch throws (DNS, refused, CORS-blocked on web) → ApiError("network")
```

| Server response | `kind` | UI | Retry |
|-----------------|--------|----|-------|
| 404 `NotFoundError` | `notFound` | "This route/stop no longer exists", back action | Never |
| 503 + `Retry-After: 5` (data not loaded yet) | `notReady` | "Getting bus data ready…" (spinner, not an error look) | Automatic, after `Retry-After` |
| 429 (60/min bucket or 5-stream cap) + `Retry-After` | `rateLimited` | "Too many requests, retrying shortly" | Automatic, after `Retry-After`, never sooner |
| 502 `UpstreamApiError` | `upstream` | "DASH isn't responding"; keep showing the last data with its age | Automatic, backoff with a cap |
| 400 | `badRequest` | Generic error (it's a client bug) | Never |
| 500 / other | `unexpected` | Generic "Something went wrong" + manual retry | Manual |
| fetch threw | `network` | "Can't reach the server" + the base URL in dev builds | Manual + backoff |

The `{ error, details }` body shape is the same for every server error (`sendErrorResponse`, the limiter handler and the stream cap), so one parser covers them all. Show `details` only for `notFound`; for everything else use app-side copy.

#### Pattern 3: TanStack Query for REST state

**What:** Use `@tanstack/react-query` (STACK.md confirms the version) for the three REST reads. Query keys: `["routes"]`, `["routeStops", shortName]`, `["stopPredictions", stopId]`. `retry` and `retryDelay` read `ApiError.kind`/`retryAfterMs` from the table above. In `_layout.tsx`, connect `focusManager` to `AppState` and `onlineManager` to network state, as TanStack's React Native guide shows.
**Why not hand-rolled hooks:** three screens each need loading, error, retry-with-Retry-After, refetch on app focus and a cache kept across back navigation. A small established library replaces all of that (principle: prefer well-maintained libraries that reduce complexity).
**Trade-off:** one dependency. The library is the de facto standard, and the SSE hook writes into the same cache, so there is a single source of truth for arrivals.

#### Pattern 4: The live-arrivals hook (REST first, then SSE)

The SSE stream's first frame is already a full `StopPredictionsResponse` (the controller sends `initialPayload` immediately), and later frames come about every 30 s from the shared per-stop poll. REST and SSE carry the same type, so they share one cache entry:

```
screen focus + app active
   │
   ├─ useQuery(["stopPredictions", stopId], GET /predictions?stop=…)   ← first paint, cached, refetch on focus
   │
   └─ effect: openPredictionStream({ stopId, onPrediction, onFailure })
          onPrediction(payload) → queryClient.setQueryData(["stopPredictions", stopId], payload)
          onFailure(err)        → schedule reconnect per policy below
   cleanup (blur | background | unmount | stopId change) → stream.close() (AbortController.abort)
```

- **Request REST with no `route` filter**, then filter by the `route` search parameter in the view. The stream has no route filter (`PredictionStreamController` reads only `stop`), so an unfiltered REST call returns the same shape and scope as the stream frames. One cache key per stop, and stream frames never overwrite a filtered list with an unfiltered one.
- **Lifecycle:** open inside `useFocusEffect` (with `useCallback`), gated on `useAppActive()`. The cleanup runs on blur, unmount and dependency change (Expo Router focus-handling docs, MEDIUM). On `active` again, invalidate the REST query and reopen the stream. RN-web's `AppState` follows document visibility, so a hidden browser tab also releases its stream, which matters for the 5-streams-per-IP cap.
- **Reconnect policy** (in the hook, not a library, because it must follow the server's status codes):
  - 404 → stop and show `notFound`.
  - 429 or 503 → wait `Retry-After`.
  - 502, network error or a clean stream end → equal-jitter backoff (1 s → 30 s cap), reset after a frame arrives.
  - 400 → stop.
  - The server ends a stream when its stop leaves the dataset; the reconnect then gets 404 and stops cleanly.
- **Watchdog:** if no frame arrives for ~90 s (3 poll intervals), abort and reconnect. Mobile networks can drop a socket silently. During a DASH outage the server sends no frames (errors are transient and not pushed), so the watchdog reconnects slowly with backoff; it doesn't loop fast.
- **While the stream is down,** the REST query keeps the data. Optionally set `refetchInterval: 30_000` only while the stream isn't connected, so arrivals stay fresh. It's cheap, it uses the same cache, and it reuses the existing REST path.
- Show "updated N s ago" from `generatedAt`, which both REST and SSE carry.

#### Pattern 5: SSE transport over fetch, with `eventsource-parser`

**What:** `predictionStream.ts` calls the global `fetch(url, { headers: { Accept: "text/event-stream" }, signal })`, checks `response.ok` (and maps the status through the same `ApiError` function as REST), then reads `response.body.getReader()` through `TextDecoder` into `eventsource-parser`'s `createParser({ onEvent })`, keeping `event === "prediction"` frames and `JSON.parse`-ing `data`.
**Why:**
- In Expo SDK 58, `expo/fetch` *is* the global `fetch` on iOS and Android and supports streaming response bodies; `ReadableStream` and `TextDecoderStream` are globals. On web it's the browser's streaming fetch. One code path covers all three platforms. (MEDIUM, from the Expo SDK docs.)
- An EventSource-style API hides the HTTP status of a failed connect, so it can't tell 404 (stop gone) from 429 (back off `Retry-After`) from 503. Fetch exposes the status and headers before the body is read.
- `react-native-sse` (XHR-based) lists only iOS and Android, and has its own fixed-interval auto-reconnect that would fight the Retry-After policy. The `eventsource` npm package doesn't list React Native as supported.
- Parsing: `eventsource-parser` is small, dependency-free and spec-correct (CRLF, multi-line `data`, comment lines), so we don't hand-write a parser.

**Verify in a spike (LOW until verified):** on an Android emulator and an iOS simulator, check that (a) chunks arrive incrementally rather than buffered until close, and (b) `AbortController.abort()` closes the socket so the server's `res.on("close")` fires and frees the stream-cap slot. The Expo docs fetched here mention neither abort support nor incremental delivery explicitly.

### Data Flow

```
Rider taps route ─▶ index.tsx  useQuery(["routes"]) ─────────▶ GET /api/v1/routes/all          (in-memory, no limiter)
                         │ router.push(`/routes/${shortName}`)
                         ▼
                routes/[shortName].tsx useQuery(["routeStops"]) ▶ GET /api/v1/routes/:shortName/stops  (direction groups)
                         │ router.push({ pathname: `/stops/${stopId}`, params: { route: shortName } })
                         ▼
                stops/[stopId].tsx  useLivePredictions(stopId)
                         ├─ GET /api/v1/predictions?stop=:stopId       (limiter: 1 token)
                         └─ GET /api/v1/predictions/stream?stop=:stopId (limiter: 1 token + 1 of 5 stream slots)
                                 frames every ~30 s ─▶ setQueryData ─▶ view filters by ?route
```

Cost per arrivals visit: 2 of the 60/min tokens plus one stream slot. Under React StrictMode in dev, effects run twice, so expect an extra connect and close on mount. That's harmless, but it counts against the bucket.

### Anti-Patterns

#### Anti-Pattern 1: CORS attached per router or after `express.json()`
**What people do:** add `cors()` only on the routers the app calls, or after other middleware.
**Why it's wrong:** errors raised before or outside that router (unmatched-route 404s, parser errors) carry no CORS headers, and the web app sees opaque network failures for real 404, 429 and 503 statuses.
**Do this instead:** one app-level `cors` right after `trust proxy`, wired once in `createApp()`.

#### Anti-Pattern 2: Forgetting `exposedHeaders`
**What people do:** allow the origin and stop there.
**Why it's wrong:** `Retry-After` isn't a CORS-safelisted response header (the safelist is Cache-Control, Content-Language, Content-Length, Content-Type, Expires, Last-Modified, Pragma). The web build then reads `undefined` and retries on its own guess, works on native and differs only on web.
**Do this instead:** expose `Retry-After` (+ `RateLimit`, `RateLimit-Policy`).

#### Anti-Pattern 3: Relying on the lockfile for the linker choice
**What people do:** leave the linker implicit.
**Why it's wrong:** a regenerated `bun.lock` gets `configVersion: 1` and flips the workspace to isolated installs (tested), changing how Metro and Jest resolve modules without any visible config change.
**Do this instead:** `bunfig.toml` `linker = "hoisted"`.

#### Anti-Pattern 4: Stream opened in a bare `useEffect`
**What people do:** open the stream in a plain `useEffect`.
**Why it's wrong:** a plain effect doesn't run cleanup on blur (Stack screens stay mounted under pushed screens) or when the app goes to the background. Leaked streams hold one of the 5 per-IP slots and keep a DASH poll alive server-side.
**Do this instead:** `useFocusEffect` + `useAppActive`, with abort in the cleanup and one stream per screen.

#### Anti-Pattern 5: A shared types package now
**What people do:** create a `packages/shared` for API types.
**Why it's wrong:** PROJECT.md explicitly defers it. It adds workspace dependency wiring, build order and (with isolated installs) symlink concerns for one consumer.
**Do this instead:** hand-mirror the five response types in `apps/mobile/src/api/types.ts`, with no runtime validation (we own the API). Revisit when there's a second consumer or real drift.

#### Anti-Pattern 6: Keeping `test/app.ts` as a hand-copied app
**What people do:** add CORS to `app.ts` and also to the copy in `test/app.ts`.
**Why it's wrong:** the two drift. CORS added only to `app.ts` is untested.
**Do this instead:** `createApp()` used by both (and the entry keeps only process handlers, SQLite, listen and loops).

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| DASH (goswift.ly) | Unchanged: server-only, via the bounded axios client | The app never calls DASH; the API key stays server-side |
| Expo dev server / Metro | `expo start` in `apps/mobile`; web at `http://localhost:8081` | 8081 must be in `CORS_ALLOWED_ORIGINS` for web |
| Codecov | One upload per matrix leg with `flags: server|mobile` | Paths move to `apps/<app>/coverage/clover.xml` (Jest's default reporters include clover) |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| mobile ↔ server | HTTP JSON + `text/event-stream`, base URL from `EXPO_PUBLIC_API_BASE_URL` | Contract = server's response types, mirrored by hand; error body `{ error, details }` + `Retry-After` |
| `src/api` ↔ hooks/screens | Plain function calls returning typed data or throwing `ApiError` | `src/api` has no React import, so it's testable alone |
| SSE frames ↔ REST cache | `queryClient.setQueryData` on one key per stop | Same `StopPredictionsResponse` type on both paths |
| root ↔ workspaces | `bun run --filter` fan-out; Biome runs once from root | No cross-workspace imports in v0.7 |
| CORS ↔ rate limiter | CORS (app-level) runs before the per-handler limiter and stream cap | Limiter and stream-cap code are untouched |

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Local dev (now) | Simulator, Android emulator and web on one machine **share one client IP**, so they share the 60/min bucket and the 5-stream cap. Opening arrivals on three targets plus a couple of browser tabs can hit 429; the app's Retry-After handling makes that visible but recoverable. |
| Early riders (single process) | Unchanged from v0.6: one shared 30 s DASH poll per subscribed stop, regardless of client count. Closing streams on background/blur is what keeps per-stop polls from outliving riders. |
| Many riders | The first bottleneck stays the DASH quota (UPST-03 caching/coalescing is backlog), not the app. CORS adds nothing per request beyond a header write. |

---

## Suggested Build Order (restructure first)

Phase numbers continue from v0.6's Phase 16. Each phase ends on a fully green product.

1. **Phase 17: Monorepo restructure + toolchain** (no behavior change), as three plans, each green:
   - (a) **Bun pin**: `packageManager` → `bun@1.3.14`; delete `package-lock.json` and stale `bun.lockb`; update the CLAUDE.md install notes (the 1.0.31 vs 1.3.14 split disappears). It must come first, because the root fan-out scripts need modern `--filter`.
   - (b) **Move**: `git mv`-only commit, then a config commit: root `package.json` + `bunfig.toml`, `apps/server` scripts, paths in tsconfig/vitest, `createApp()` extraction (small and behavior-neutral; it unblocks Phase 18's tests), remove ESLint leftovers, Biome `vcs.useIgnoreFile`, CI paths plus a server-only matrix leg, Superset config, docs. Gate: the server's 853 tests, coverage, build, dev server and lint all pass from root and from `apps/server`.
   - (c) **Node 24**: `.node-version`, `@tsconfig/node24`, `@types/node` 24, `setup-node` in CI, and a `better-sqlite3` native rebuild check.
   - Avoids: linker drift, a broken `.env`/`DB_PATH` location, lost history, the CI Node version not matching the pin.
2. **Phase 18: CORS** (server-only, small): env var + Zod validation, `cors` middleware in `createApp()`, `exposedHeaders`, route tests for 429/503 carrying headers, `.env.example`. It comes before the app so Expo web works from its first screen, and it can be verified alone with `curl -H "Origin: …"`.
3. **Phase 19: App foundation + route list**: scaffold `apps/mobile` (SDK 58 default template, stripped), Biome override + format commit, `types` isolation in tsconfig, test runner with an 80% threshold, CI `mobile` leg (`typecheck`, `test:coverage`, `export:web`), `src/api/{config,client,errors,endpoints,types}`, Query provider, route list screen on iOS, Android and web. This is the smallest end-to-end slice: it proves Metro + hoisted workspace + base URL + CORS together.
4. **Phase 20: Stops → arrivals over REST**: `routes/[shortName]` (direction groups) and `stops/[stopId]` with `useQuery` + error states per `ApiError.kind`, plus `refetchInterval` polling. After this phase the full flow works without SSE.
5. **Phase 21: Live arrivals over SSE**: `predictionStream.ts` (fetch + `eventsource-parser`), `useLivePredictions` with focus/AppState lifecycle, reconnect policy, watchdog, and polling only while the stream is down. This is layered on a flow that already works over REST.

Phases 20 and 21 could merge if the planner prefers fewer phases. Keep 21 separate if the transport spike turns up native streaming problems, so the REST flow ships regardless.

**Research flags:**
- Phase 17: standard patterns. Behavior already verified locally (filter semantics, cwd, configVersion). Low risk apart from `better-sqlite3` under Node 24.
- Phase 18: standard; no research.
- Phase 19: **needs phase research**: the SDK 58 template layout, the `jest-expo` (Jest 30) + RNTL 14 setup under a hoisted Bun workspace, which Biome rules fire on Expo code, and the `@types` isolation.
- Phase 21: **needs a spike first**: incremental delivery and abort behavior of `expo/fetch` streaming on Android and iOS against the real `/predictions/stream`.

---

## Sources

- Repo inspection (HIGH): `package.json`, `tsconfig.json`, `vitest.config.mts`, `biome.json`, `.github/workflows/ci.yml`, `.superset/config.json`, `.gitignore`, `bun.lock` (`configVersion: 0`), `src/server/app.ts`, `src/server/test/app.ts`, `config/environment.ts`, `api/routes/*.ts`, `api/middleware/*.ts`, `api/controllers/{errorResponse,PredictionController,PredictionStreamController}.ts`, `api/services/PredictionStreamService.ts` (30 s `setInterval`), `api/repositories/FavoritesRecentsRepository.ts` (cwd-relative `DB_PATH`)
- Local experiments with Bun 1.3.14 in the scratchpad (HIGH): `--filter '*'` / `'./apps/*'` / `--workspaces` exclude the root; scripts run in the workspace dir; a fresh workspace lockfile gets `configVersion: 1`; an existing `configVersion: 0` lockfile stays 0/hoisted after adding workspaces
- [Expo: Work with monorepos](https://docs.expo.dev/guides/monorepos/) (dated 2026-10-16, SDK 58), MEDIUM: Metro auto-configuration since SDK 52, Bun first-class, isolated supported since SDK 54, no duplicate React or RN
- [Bun: Isolated installs](https://bun.com/docs/pm/isolated-installs), MEDIUM: configVersion-dependent default linker, `bunfig.toml` `[install] linker`
- [Bun: --filter](https://bun.com/docs/pm/filter) and [Bun v1.3.9 release notes](https://bun.com/blog/release-notes/bun-v1.3.9), MEDIUM: filter patterns, `--parallel`/`--sequential`
- [Bun v1.3.1 release notes](https://bun.sh/blog/bun-v1.3.1) and [ReScript forum: monorepo with Bun](https://forum.rescript-lang.org/t/rescript-12-monorepo-with-bun/7005), LOW: isolated-linker symlink friction, the `linker = "hoisted"` workaround
- [Expo: Environment variables](https://docs.expo.dev/guides/environment-variables/), MEDIUM: `EXPO_PUBLIC_` inlining, static dot access, project-root env files, SDK 58 file set
- [Expo SDK: expo (expo/fetch)](https://docs.expo.dev/versions/latest/sdk/expo/), MEDIUM: global streaming fetch on native, stream globals
- [Expo Router: focus handling](https://docs.expo.dev/router/reference/focus-handling/) and [TanStack Query: React Native](https://tanstack.com/query/latest/docs/framework/react/react-native), MEDIUM: `useFocusEffect` cleanup semantics, AppState `focusManager`
- [Expo: Unit testing](https://docs.expo.dev/develop/unit-testing/), MEDIUM: jest-expo (Jest 30 from SDK 58), RNTL 14+, no Vitest guidance
- [react-native-sse](https://github.com/binaryminds/react-native-sse) and [EventSource/eventsource](https://github.com/EventSource/eventsource), MEDIUM: platform lists, reconnect behavior
- [MDN: CORS-safelisted response header](https://developer.mozilla.org/en-US/docs/Glossary/CORS-safelisted_response_header) and [expressjs/cors](https://github.com/expressjs/cors), MEDIUM-HIGH: safelist, `exposedHeaders`, app-level preflight handling, does not block requests
- [Biome: big projects / monorepos](https://biomejs.dev/guides/big-projects/) and [useFilenamingConvention](https://biomejs.dev/linter/rules/use-filenaming-convention/), MEDIUM: v2 nested `extends: "//"`, filename exceptions
- [oven-sh/setup-bun](https://github.com/oven-sh/setup-bun), MEDIUM: `packageManager` / `bun-version-file`

---
*Architecture research for: dash-tracker v0.7 Frontend Foundation (Bun-workspaces monorepo + Expo app)*
*Researched: 2026-10-20*
