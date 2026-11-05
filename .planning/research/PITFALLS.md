# Pitfalls Research

**Domain:** Turning a single-package Node/Express/TS API (dash-tracker) into a Bun-workspaces monorepo (`apps/server` + `apps/mobile` Expo app for iOS/Android/web), bumping to Node 24 LTS and a single Bun 1.3.x, adding CORS, and building a routes → stops → live-arrivals app flow over REST + SSE against a rate-limited server (v0.7 Frontend Foundation)
**Researched:** 2026-10-20
**Confidence:** MEDIUM-HIGH overall

The confidence tags below mean the following:

- **[repo] HIGH:** I checked it directly in this worktree: `package.json`, `bun.lock`, `tsconfig.json`, `vitest.config.mts`, `biome.json`, `.gitignore`, `.github/workflows/ci.yml`, `.superset/config.json`, the middleware, the SSE controller/service and `node_modules`.
- **[docs] MEDIUM:** It comes from an official primary source I fetched today: Expo docs and changelog, Bun docs, the `setup-bun` README, the `@expo/package-manager` source, the `react-native-sse` source, the `expressjs/cors` README, or Biome docs. The `classify-confidence` seam rates these webfetch/websearch providers LOW, so I have raised them only when the source is primary. Validate them in the phase spike.
- **[inferred] LOW:** It is reasoned from how the platform works, with no direct source. Treat it as a hypothesis to test.

Phase names used below are **Restructure**, **Toolchain**, **CORS**, **App screens** and **Quality+CI**.

---

## Critical Pitfalls

### Pitfall 1: A Bun lifecycle-script change silently drops better-sqlite3's native build, so the server crashes at boot

**What goes wrong:**
Bun does not run dependency `postinstall`/`install` scripts unless a package is on its trust list. Today `better-sqlite3` builds only because it is on Bun's **built-in default trusted list**. This repo has no `trustedDependencies` field. `node_modules/better-sqlite3/build/Release` contains `obj.target/` and `sqlite3.a`, so it was compiled from source by node-gyp. Bun's docs say: *"Defining `trustedDependencies` in `package.json` **replaces** the default list rather than extending it."* [docs]

The Expo side will tempt someone to add `trustedDependencies`, for example for `@sentry/cli` (Expo's own Bun guide tells you to) or any other app package with a postinstall step. The moment that happens, better-sqlite3 stops building on the next clean install. The server then dies at `FavoritesRecentsRepository.initialize()` with "Could not locate the bindings file", which is fatal by design (D-18).

**Why it happens:**
Developers assume `trustedDependencies` is additive, the way an allowlist usually is. The failure only appears after a clean install, often first in CI or a fresh Superset worktree.

**How to avoid:**
- In the Toolchain phase, add an explicit root `trustedDependencies: ["better-sqlite3"]` now, so the trust is visible and survives later additions. Keep the field in the root `package.json`.
- Add a check, `bun pm untrusted`, that must print nothing to the CI install step or to a smoke script.
- Add a server boot smoke test in CI (`node apps/server/dist/app.js` with test env, then hit `/api/v1/health/live`), or a Vitest test that opens a `:memory:` better-sqlite3 DB. Either one proves the native binary loads under the CI Node version.

**Warning signs:**
`bun install` prints "Blocked N postinstalls"; the `build/Release` folder is missing after a clean install; there is a "bindings file" error at boot.

**Phase to address:** Toolchain (pin the trust list), Quality+CI (boot or native-load check).

---

### Pitfall 2: Native binary built for the wrong Node ABI after the Node 20 → 24 switch

**What goes wrong:**
better-sqlite3 is compiled against one Node ABI: Node 20 is ABI 115 and Node 24 is ABI 137. A developer switches `.node-version` to 24 but keeps the existing `node_modules`. Every test that touches SQLite then fails with `was compiled against a different Node.js version using NODE_MODULE_VERSION 115. This version of Node.js requires NODE_MODULE_VERSION 137`. Bun does not re-run lifecycle scripts for an already-installed package just because the Node version on PATH changed. [repo: binary is source-built; inferred: Bun reinstall behavior]

The CI job has the same problem: `ci.yml` has **no `actions/setup-node`**. Vitest, tsc and the server all run on whatever Node the `ubuntu-latest` image ships, not on `.node-version`. [repo]

**Why it happens:**
"Bun is the package manager" hides the fact that the **runtime is Node**. `bun run` executes `vitest`, `tsc` and `ts-node` through their `#!/usr/bin/env node` shebangs, so whichever Node is on PATH, during install and at runtime, decides the ABI.

**How to avoid:**
- Do the Node bump as its own step after the move, with `rm -rf node_modules apps/*/node_modules && bun install`. Document that in the phase plan and in CLAUDE.md Commands.
- In CI, add `actions/setup-node` with `node-version-file: .node-version` **before** `bun install`, so the native build and the test run use the same Node.
- Keep better-sqlite3 on `^12.x`, which ships Node 24 prebuilds [docs]. Consider 13.x, the first N-API release, whose binaries stop being per-ABI [docs, newreleases.io]. That removes this whole class of failure, but it is a major bump, so evaluate it in Toolchain rather than sneaking it in.

**Warning signs:**
`NODE_MODULE_VERSION` errors; tests pass locally and fail in CI or the reverse; `node -v` in CI logs isn't 24.x.

**Phase to address:** Toolchain.

---

### Pitfall 3: Lockfile and Bun-version drift: three lockfiles, two Bun versions, one of them invisible

**What goes wrong:**
The repo has four drift sources today [repo]:

1. **A tracked `package-lock.json`** sits beside `bun.lock`. It is in `git ls-files`.
2. **A stray `bun.lockb`** exists on disk. It is git-ignored and written by Bun 1.0.31.
3. **`packageManager: "bun@1.0.31"`**, while installs actually need 1.3.14.
4. **CI picks up the 1.0.31 pin.** `oven-sh/setup-bun@v2` with no `bun-version` reads `package.json` `packageManager` first [docs: setup-bun README], so CI runs Bun **1.0.31**, which ignores the text `bun.lock`.

The Superset setup script (`.superset/config.json`) runs a bare `bun install`, which uses whatever Bun is first on PATH and can quietly rewrite the binary lockfile.

**Why it happens:**
Each tool picks its Bun version from a different place: the PATH, the `packageManager` field, or proto. The `.gitignore` pattern `.proto*` also ignores a `.prototools` file [repo: `git check-ignore` confirms], so a proto-based Node or Bun pin would silently never be committed.

**How to avoid:**
- Make the root `packageManager` field (`bun@1.3.x`, exact) the single source of truth. setup-bun follows it automatically.
- Delete `package-lock.json` and `bun.lockb` in the same commit as the pin bump. Remove the now-pointless `bun.lockb` comment from `.gitignore`, but keep `bun.lockb` ignored. Expo's EAS docs say to remove other package managers' lockfiles [docs].
- If proto is kept for local version management, change the `.proto*` ignore to something narrower, or don't rely on `.prototools`.
- Keep `--frozen-lockfile` in CI. Add a CI assertion that `git status --porcelain` is clean after install, to catch a lockfile rewrite.
- Update `.superset/config.json` (`bun install --frozen-lockfile`) and CLAUDE.md, which still documents the 1.0.31/1.3.14 split.

**Warning signs:**
A `bun.lockb` reappears; `bun.lock` diffs show up in unrelated PRs; CI logs show `bun --version` = 1.0.31; `bun install --frozen-lockfile` fails only in CI.

**Phase to address:** Toolchain. Restructure must not regenerate the lockfile; see Pitfall 4.

---

### Pitfall 4: Bun's linker flips from hoisted to isolated mid-milestone, and Metro, jest-expo and better-sqlite3 resolution change under you

**What goes wrong:**
Bun 1.3 picks its default linker from the lockfile's `configVersion`. The current `bun.lock` has `"configVersion": 0`, which means hoisted even in a workspace. A **freshly generated** lockfile gets `configVersion: 1`, which means **isolated** for workspaces [docs: Bun isolated-installs]. So whether the monorepo uses a flat `node_modules` or the `node_modules/.bun/` symlink store depends on whether someone ever ran `rm bun.lock` to "fix" a conflict. Switching linkers reinstalls `node_modules` from scratch [docs].

Under isolated mode, three things change:

- jest-expo needs the Bun-specific `transformIgnorePatterns` that includes `.bun` [docs: Expo unit testing].
- Tools that assume a flat tree can break [docs].
- Only Expo SDK 54+ supports isolated installs [docs: Expo monorepos].

**Why it happens:**
The default is implicit and tied to lockfile history, not to anything in config.

**How to avoid:**
- Set the linker **explicitly** in a root `bunfig.toml` (`[install] linker = "hoisted"` or `"isolated"`) in the Restructure phase, before adding `apps/mobile`.
- Recommendation: use **hoisted** for v0.7. The server has no React, so hoisting cannot create duplicate React copies. jest-expo's default patterns, better-sqlite3's `bindings` lookup and editor TypeScript resolution are all well-trodden in a flat tree. Revisit isolated mode only if phantom-dependency bugs show up.
- Never delete `bun.lock` to resolve a conflict. Resolve it with `bun install` on top of it instead.

**Warning signs:**
A `node_modules/.bun/` directory appears; Jest throws `SyntaxError: Cannot use import statement outside a module` from inside `node_modules`; Metro reports "Unable to resolve module".

**Phase to address:** Restructure.

---

### Pitfall 5: Duplicate React or React Native copies and hand-rolled Metro config in the monorepo

**What goes wrong:**
The app crashes with "Invalid hook call", or with `TurboModuleRegistry.getEnforcing(...)` / native-module "could not be found" errors. Two copies of `react`, `react-native` or an Expo module get bundled, or a native module is autolinked at one version while Metro resolves another. Expo's monorepo guide says: *duplicate React Native versions in a single monorepo are not supported; duplicate React versions cause runtime errors; native modules should never be duplicated* [docs].

The second classic mistake is copying a pre-SDK-52 `metro.config.js` from a blog post, with `watchFolders`, `resolver.nodeModulesPaths`, `extraNodeModules` or `disableHierarchicalLookup`. Since SDK 52, `expo/metro-config` configures monorepos automatically, and the guide says to **remove** those keys and run `npx expo start --clear` once [docs].

**Why it happens:**
There is a lot of outdated monorepo advice online. Developers also install React packages with plain `bun add` rather than `bun expo install`, so versions drift from the SDK's pinned set: React 19.x, `react-dom` for web, and `react-native-web` 0.21 on SDK 57/58 [docs: Expo version table].

**How to avoid:**
- Use `bun expo install <pkg>` for every app dependency so Expo picks SDK-compatible versions. Run `bun expo install --check` in CI.
- Keep `metro.config.js` as the plain `getDefaultConfig(__dirname)` from `expo/metro-config`. Add nothing unless a measured need appears.
- On SDK 55+, autolinking module resolution is on automatically for monorepo apps [docs]. Don't add the SDK 54 experiment flag.
- Check for duplicates with `bun pm why react` and `bun pm why react-native`. Add a root `resolutions` entry only to fix a real duplicate.
- Run `expo-doctor` in CI. Its duplicate-dependency check catches this. It can fail on network errors, so set `EXPO_DOCTOR_WARN_ON_NETWORK_ERRORS=true` in CI [docs-adjacent, MEDIUM].

**Warning signs:**
"Invalid hook call"; a `bun pm why react` tree shows two versions; `expo-doctor` reports "Check that no duplicate dependencies are installed".

**Phase to address:** App screens (scaffold step), with `expo-doctor` and the `install --check` enforced in Quality+CI.

---

### Pitfall 6: SSE client semantics: named events, platform-inverted reconnect behavior, and reconnect storms into the 60/min bucket and 5-stream cap

**What goes wrong:**
React Native has no native `EventSource`. The usual choice, `react-native-sse`, is built on XHR [docs]. Five traps stack up here.

1. **Named events.** The server writes `event: prediction\ndata: …` [repo: `PredictionStreamController.send`]. An `onmessage` / `addEventListener("message")` handler **never fires**. You must use `addEventListener("prediction", …)`, typed as `EventSource<"prediction">`. This applies to both react-native-sse and the browser's native `EventSource`.
2. **react-native-sse ignores status semantics.**
   - On any non-2xx response (429 from the bucket, 429 from the stream cap, 503 not-ready, 404 for an unknown or dropped stop), it dispatches `error` and then **reconnects every `pollingInterval` (default 5000 ms) forever**. It never reads `Retry-After`.
   - On a network failure (status 0) it dispatches `error` and **does not reconnect at all**, so the stream is silently dead.
   - On a server-closed stream (`done`) it reconnects. That covers the server ending a stream because its stop left the dataset: the reconnect then gets 404, and from there it retries every 5 s forever [docs: react-native-sse source].
3. **Browser `EventSource`, on Expo web if used directly, behaves the opposite way.** Per the WHATWG spec, a non-200 or non-`text/event-stream` response **fails the connection permanently**, while a network error auto-reconnects. One hook therefore behaves differently on each platform. [docs/spec, HIGH]
4. **Budget math.** Every reconnect is a new connect, and every connect spends one token from the shared **60/min per-IP bucket** (the bucket sits before the cap). A 5-second retry loop costs 12 requests per minute per stream. Five looping streams, or a few streams plus normal REST traffic, exhaust the bucket. Then REST `/predictions` also gets 429, and the screen goes blank instead of degrading.
5. **The 5-stream cap is shared across everything on one IP.** iOS simulator, Expo web and the Android emulator all reach the dev server as **127.0.0.1**: the emulator goes through 10.0.2.2 or `adb reverse`, and both arrive on host loopback [inferred]. A few leaked streams plus all three platforms open at once easily hit the 6th-stream 429.

**Why it happens:**
SSE libraries are written for "reconnect is always good" and do not model rate-limited servers. The server's v0.6 protections assume clients back off.

**How to avoid:**
- Own the reconnect policy in **one** `usePredictionStream(stopId)` hook. Construct react-native-sse with `pollingInterval: 0`, which disables its auto-reconnect.
- Classify each `error` event by `xhrStatus`:
  - **404:** terminal. Show "stop no longer served" and stop.
  - **429:** back off. Use at least the server's 5 s, plus exponential growth with jitter capped at about 60 s, because the client cannot read `Retry-After` through react-native-sse.
  - **503:** back off at a 5 s or greater floor, then retry.
  - **0 / network:** reconnect with backoff.
  - **`done`:** reconnect once, then treat a 404 as terminal.
- Always fetch REST `/predictions` first and show it. SSE is an *upgrade*. While the stream is down, keep the last REST data with its `generatedAt` age visible, rather than polling REST in a tight loop (that also spends the bucket).
- Use the same client library on web and native. Don't branch to the browser `EventSource` on web, or Pitfall 6.3 applies.
- Unit-test the hook's state machine against a fake EventSource. This is where the 80% coverage should come from (see Pitfall 13).

**Warning signs:**
- Server logs show `Rate limit exceeded for 127.0.0.1` or `Concurrent stream cap reached` during normal dev.
- Arrivals render from REST but never update.
- The Network tab shows `/predictions/stream` requests every 5 s.

**Phase to address:** App screens (stream hook). If live UAT shows dev-loop exhaustion, use a local-only `.env` override; don't change the server limits.

---

### Pitfall 7: Leaking SSE streams on unmount, Fast Refresh, navigation, StrictMode and backgrounding

**What goes wrong:**
Each leaked stream holds one of the IP's 5 slots, plus a server-side subscriber that keeps a DASH poll loop alive. A leak happens whenever a stream is not closed in the effect cleanup, for example in these cases:

- the stop changes;
- the screen is popped;
- Fast Refresh re-runs the effect;
- React StrictMode double-invokes it in dev, on web especially;
- the app goes to the background.

react-native-sse docs say plainly: *"the library does not automatically close the connection when the app goes to sleep"* and *"any set timeout is killed while the app is in sleep mode"* [docs]. Android keeps the socket and drains battery. iOS suspends the app, so the socket dies without a clean `close` the client sees, and the server releases the slot only when TCP notices.

On web there is a second ceiling: browsers allow **6 HTTP/1.1 connections per origin**. A few open streams plus REST calls starve each other, and REST requests hang in "pending" [inferred from browser behavior, well known; MDN notes this limit for SSE].

**Why it happens:**
Stack navigators keep previous screens mounted. Effect cleanup is easy to forget when the stream is created in a callback rather than the effect body.

**How to avoid:**
- Create the EventSource in a `useEffect` keyed on `stopId`, and call `es.removeAllEventListeners(); es.close()` in the cleanup.
- Subscribe to `AppState`. Close on `background`/`inactive`. On `active`, refetch REST and then reopen the stream.
- Use `useFocusEffect` (Expo Router / React Navigation) so only the **focused** arrivals screen holds a stream, not every stop screen on the stack.
- In dev, watch the server for slot release. A test should assert that cleanup closes the stream on unmount and on stopId change.

**Warning signs:**
Open-stream count grows with each navigation; the 6th open triggers a 429; DASH poll logs continue after leaving the screen; web REST calls stay "pending".

**Phase to address:** App screens.

---

### Pitfall 8: CORS wired in the wrong place or too narrowly, so 429/503 answers look like opaque CORS errors and SSE on web fails preflight

**What goes wrong:**
There are five variants.

- **Errors without CORS headers.** CORS is added per-router or after the limiter, so the limiter's 429, the stream cap's 429, `sendErrorResponse`'s 503/502/404 and Express's default 404 go out **without** `Access-Control-Allow-Origin`. The browser shows "CORS error" instead of the status, and the app cannot tell "rate limited" from "server down".
- **Unexposed headers.** `Retry-After`, `RateLimit` and `RateLimit-Policy` are **not CORS-safelisted response headers**, so web JS cannot read them unless they are listed in `Access-Control-Expose-Headers` (`cors({ exposedHeaders })`; by default *"no custom headers are exposed"* [docs: expressjs/cors]).
- **Preflights.** Requests trigger preflight `OPTIONS` in these cases:
  - `X-Device-Id` on `/predictions`, `/favorites` and `/recents`;
  - `Content-Type: application/json` on `POST /favorites`;
  - **react-native-sse on web**, which sets `Cache-Control: no-cache` and `X-Requested-With: XMLHttpRequest` on every connect [repo-verified in react-native-sse source].

  If `allowedHeaders` is set to an explicit short list that omits these, SSE on web fails preflight. The `cors` default reflects `Access-Control-Request-Headers` [docs]. Because the limiter is attached with `router.get`, preflights are not rate-limited, which is good. Without a global `cors()`, though, an `OPTIONS` to `/predictions/stream` gets Express's automatic `Allow` response without CORS headers.
- **Wildcard and credentials.** `origin: "*"` with `credentials: true` is rejected by browsers. Nothing here needs credentials: device ID is a header, not a cookie. Leave `credentials` off.
- **Origin matching.** Origins match exactly: scheme, host and port, no trailing slash. `http://localhost:8081`, `http://127.0.0.1:8081` and `http://192.168.x.y:8081` are three different origins. Native apps send **no Origin**, and that must not be rejected.

**Why it happens:**
CORS gets mistaken for access control. In reality the server still executes the request, and CORS only decides whether browser JS can read the response. Placement gets copied from route-level examples.

**How to avoid:**
- Mount `app.use(cors(options))` in `app.ts` **before** `express.json()` and the `/api/v1` router. Every response then carries CORS headers, including limiter and cap 429s, 503s and unknown-route 404s, and preflight is handled globally.
- Set `exposedHeaders: ["Retry-After", "RateLimit", "RateLimit-Policy"]`. Leave `allowedHeaders` unset (reflect). Leave `credentials` false. Set `maxAge` (e.g. 600) so the browser doesn't preflight every poll or connect.
- Parse a new optional `CORS_ALLOWED_ORIGINS` (comma-separated) in the Zod `environment.ts`:
  - trim each entry;
  - require `http(s)://host[:port]` with no path or trailing slash;
  - reject `*` (an explicit list is the requirement);
  - default to an empty list, which means no CORS headers and is fine for native-only.
- Use an array `origin` so the library emits `Vary: Origin`.
- Add to `.env.example` and the CLAUDE.md env list.
- Tests (supertest): an allowed origin gets ACAO on 200, on the bucket 429, on the cap 429, on the 503 not-ready response and on the SSE 200; a disallowed origin gets no ACAO; there is no `Origin` → request still served; a preflight with `X-Device-Id`, `Cache-Control` and `X-Requested-With` → 204 with matching allow-headers.

**Warning signs:**
The browser console says "No 'Access-Control-Allow-Origin' header" only on errors; `res.headers.get("retry-after")` is null on web but set in curl; SSE works on iOS but not on web.

**Phase to address:** CORS.

---

### Pitfall 9: ts-node dev server breaks or misbehaves on Node 24

**What goes wrong:**
`dev-server` is `nodemon --exec ts-node src/server/app.ts` and `start-server` is `ts-node …` [repo]. ts-node 10.9.2 is the last release (Dec 2023) and is effectively unmaintained.

Node 22.18+ and Node 24 enable **native type stripping by default**. Projects report ts-node regressions that need `NODE_OPTIONS=--no-experimental-strip-types` [docs-adjacent: IgniteUI PR, Node 22.18 release notes]. Separately, Node 22's loader changes broke CJS-export assumptions in some ts-node setups [docs-adjacent: firebase-functions PR].

Native stripping is **not** a drop-in replacement either:

- `src/server/api/models/BusRoute.ts` declares `export enum RouteType` [repo]. Enums aren't erasable syntax, so plain `node app.ts` fails without `--experimental-transform-types`.
- CommonJS `require("./api/repositories")` doesn't resolve `.ts` files without extensions.

**Why it happens:**
"It worked on Node 20" carries over, and the failure may only appear in the dev loop, not in `tsc` builds or Vitest.

**How to avoid:**
- In the Toolchain phase, replace `ts-node` + `nodemon` with **`tsx`**, which is **already a devDependency** (4.19.2) [repo]:
  - `dev-server`: `tsx watch src/server/app.ts`
  - `start-server`: `tsx src/server/app.ts`, or better `node dist/app.js` after `build`
- Remove `ts-node` and `nodemon` from `dependencies`. They, along with `@types/*`, are currently in `dependencies`, not `devDependencies` [repo].
- Verify tsx on Node 24 with a real boot. There are third-party reports of a tsx `__name is not a function` crash on **Node 25** [LOW], and Expo also refuses odd Node majors [docs: SDK 58 beta: "Odd-numbered releases such as 23 and 25 are not supported"]. Pin Node **24**, not "latest".
- Note that `tsx` does not type-check, so `tsc --noEmit` / `vitest --typecheck` stay the type gate.

**Warning signs:**
`ERR_UNKNOWN_FILE_EXTENSION`; `SyntaxError` from enum syntax; the dev server works only with `NODE_OPTIONS` hacks.

**Phase to address:** Toolchain.

---

### Pitfall 10: Losing `git blame` and bisectability on the move

**What goes wrong:**
Git detects renames by content similarity (50% or more by default), per file, per commit. This repo merges milestones as **one squashed commit per PR**, for example `b904b99 Milestone v0.6 … (#16)` [repo]. If the `src/ → apps/server/src/` move lands in the same squashed commit as the Node 24 bump, the tsconfig rewrite, the CORS work and the whole Expo app, two things go wrong:

- heavily edited files (`package.json`, `tsconfig.json`, `vitest.config.mts`, `biome.json`, `ci.yml`, `app.ts`) fall below the similarity threshold and show up as delete+add;
- `git bisect` across the milestone becomes useless.

**Why it happens:**
"It's all one milestone" plus squash-merge.

**How to avoid:**
- Make the Restructure commit a **pure `git mv`** with zero content edits. Then follow it with a separate commit for path fixes in config files. Verify with `git show --stat -M HEAD`: every moved file should show as `rename … (100%)`.
- Land Restructure as **its own PR merged with a merge commit or rebase**, not squashed into the milestone, or ask the user to merge the milestone PR without squash. A squash of a PR containing only the pure move still keeps 100% renames.
- Add a `.git-blame-ignore-revs` file listing any mass-reformat commit, e.g. if Biome reformats the Expo template. GitHub honors it automatically. Locally, run `git config blame.ignoreRevsFile .git-blame-ignore-revs`.
- Keep the Node and Bun bump in a separate commit from the move, so a bisect can tell "path broke" from "runtime broke".

**Warning signs:**
`git log --follow apps/server/src/server/app.ts` stops at the move; GitHub blame shows the move commit on every line.

**Phase to address:** Restructure.

---

### Pitfall 11: Server paths that silently change meaning after the move (`.env`, `DB_PATH`, setup scripts, coverage, Codecov)

**What goes wrong:**
Several things resolve relative to the **current working directory**, not the file:

- `dotenv.config()` loads `.env` from cwd [repo: `environment.ts`].
- `DB_PATH` defaults to the relative `data/dash-tracker.sqlite` [repo].
- `.superset/config.json` runs `bun install`, creates `.env` at the **root**, and runs `bun run dev-server` at the root [repo].

After the move, Bun's `--filter` / workspace scripts run with cwd = `apps/server`. The root `.env` is no longer found, so Zod validation throws at startup: `DASH_API_KEY must not be empty`. Worse, a dev server started from the root with an explicit path finds no `.env`, while one started from `apps/server` creates a **new empty SQLite DB** at `apps/server/data/`. Existing local favorites and recents in `./data/` silently "disappear". No error is raised, because SQLite creates the file.

Other breakage:

- **Coverage output** moves to `apps/server/coverage/`, but CI uploads `./coverage/clover.xml` with `fail_ci_if_error: true` [repo], so CI fails, or with the flag off uploads nothing.
- **Vitest coverage `include` / `exclude`** globs (`src/**/*.ts`, `src/server/app.ts`, `src/server/config/**`) are relative to `test.root`. They keep working only if `vitest.config.mts` moves *with* the code. A root-level Vitest config would match nothing, and **0 files at 80% threshold can pass vacuously**, depending on the version.
- **`@vitest/coverage-v8` is 2.1.5 while `vitest` is 3.2.6** [repo: verified in `node_modules` and `bun.lock`; coverage-v8 2.1.5 peers `vitest: 2.1.5`]. Vitest warns that mixed versions are unsupported [docs-adjacent]. Under an isolated linker it could even resolve a second Vitest. This is an existing latent bug that the move will surface.

**Why it happens:**
The paths look obviously right from the root; the cwd change is invisible.

**How to avoid:**
- Move `.env.example`, `vitest.config.mts`, `tsconfig.json` and `src/server/test/setup.ts` **with** the server into `apps/server/`.
- Update the Superset setup to copy `.env` into `apps/server/.env`, and its run command to `bun run --filter <server> dev-server`.
- Document `data/` moving to `apps/server/data/` in the phase notes, and keep `data/` git-ignored at any depth (it already is).
- Align `@vitest/coverage-v8` to `vitest`'s exact version in the Restructure phase. That is the first time coverage runs from the new path.
- Move the CI upload path to `apps/server/coverage/clover.xml`, and use Codecov `flags` (`server`, `mobile`) so the two workspaces' reports don't overwrite each other. Check in the Codecov UI that files map to `apps/server/src/...`. If they don't, add a `codecov.yml` `fixes` entry.
- Acceptance check: `bun run --filter <server> test:coverage` from the root and from `apps/server` reports **the same file count and the same ~98.8% statements**, and 853 tests.

**Warning signs:**
A test count or coverage % change after a "pure move"; `apps/server/data/` appears; favorites look empty in dev; Codecov shows 0 files or "unusable report".

**Phase to address:** Restructure (paths, config, Superset), Quality+CI (Codecov flags).

---

### Pitfall 12: The app's API base URL doesn't reach the server from devices, or reaches it over a blocked transport

**What goes wrong:**

- **`localhost` resolves differently per client.** It works on the iOS simulator and Expo web. On the **Android emulator** it points at the emulator itself, so use `10.0.2.2` or `adb reverse tcp:3000 tcp:3000`. On a **physical phone** it points at the phone, so use the dev machine's LAN IP.
- **Env-var inlining.** Expo inlines `EXPO_PUBLIC_*` at **bundle time**. Only the literal `process.env.EXPO_PUBLIC_API_URL` dot-access form is inlined. Destructuring (`const { EXPO_PUBLIC_API_URL } = process.env`) or bracket access silently yields `undefined` [docs: Expo env vars]. Changing `.env` needs a Metro restart, sometimes with `--clear`. Env vars are not inlined into code under `node_modules` [docs], so they must be read in app code, not in a shared package.
- **Cleartext HTTP.** Android 9+ blocks cleartext HTTP by default except where the debug manifest allows it. iOS ATS blocks plain HTTP to arbitrary hostnames. `NSAllowsLocalNetworking` covers `.local` and unqualified names [docs-adjacent, OWASP MASTG], and IP-address handling is ambiguous in the sources found. Expo Go and debug dev builds are permissive, so this "works in dev" and fails the first time someone tries a release or preview build against `http://`.
- **Expo Go version.** Store Expo Go only runs the current SDK. The SDK 58 beta notes say Expo Go for SDK 58 was initially CLI-only, with iOS devices needing `eas go` [docs]. An SDK and Expo Go mismatch blocks testing on a real iPhone.

**Why it happens:**
Every simulator and web demo works with `localhost`, so the problem only appears on a real device.

**How to avoid:**
- Use one `config/api.ts` module:
  1. `process.env.EXPO_PUBLIC_API_URL` (dot access) if set;
  2. otherwise, in `__DEV__`, derive the host from `Constants.expoConfig?.hostUri` (the Metro host IP the device already reaches) plus the server port;
  3. otherwise fail loudly at startup.
- Unit-test that module.
- Document the Android emulator option and the physical-device option in the app README.
- Keep v0.7 on HTTP in dev only, which matches scope (no store builds). Record in the deferred backlog that any preview or release build needs HTTPS or an explicit platform exception.
- Note that Express `app.listen(port)` binds all interfaces, so LAN access works [repo + Node default]. The macOS firewall prompt for `node` must be allowed.
- Choose the SDK by checking that the store Expo Go supports it, or plan on a dev client.

**Warning signs:**
"Network request failed" only on Android or on a physical device; a URL showing `undefined/api/v1/...`; works after a cold restart but not after an `.env` edit.

**Phase to address:** App screens (config module). Its tests come under Quality+CI.

---

### Pitfall 13: Forcing Vitest onto React Native, or under-scoping coverage so 80% is either impossible or meaningless

**What goes wrong:**
Teams try to reuse the server's Vitest for the app and spend days fighting untranspiled Flow/ESM in `react-native` and Expo packages. Expo's documented path is Jest with the **`jest-expo`** preset and `@testing-library/react-native` [docs]. On **SDK 58+, jest-expo requires Jest 30**, `react-test-renderer` is deprecated (it does not support React 19+), and Expo Router testing needs RNTL v14+ [docs: Expo unit testing].

Other traps:

- Typing **`bun test`** instead of `bun run test` invokes **Bun's built-in test runner**, not the workspace's Jest or Vitest. It will try to run RN tests in the Bun runtime and fail in confusing ways. [inferred from Bun CLI semantics, HIGH]
- Coverage scope. Including `app/**` screen files, generated files (`expo-env.d.ts`, `.expo/`) or config (`babel.config.js`, `metro.config.js`) under an 80% threshold makes the gate either very hard to meet or padded with shallow snapshot tests. Excluding everything makes it meaningless.
- **Hoisted `@types/jest` leaks into the server's type-check.** TypeScript auto-includes every visible `node_modules/@types/*` when `compilerOptions.types` is unset, and the server tsconfig doesn't set it [repo]. In a hoisted monorepo, Jest's global `describe`/`expect` types become visible to `apps/server`'s `vitest --typecheck` / `tsc`, and you can get redeclaration or wrong-signature errors [inferred, MEDIUM].

**How to avoid:**
- Use `jest-expo` (consider `jest-expo/universal` for iOS+Android+web) plus RNTL for `apps/mobile`, and keep Vitest for `apps/server`. Two runners is the right answer.
- Put the bulk of the app's logic in plain TS modules: the API client, the response mappers, the base-URL resolver and the SSE reconnect state machine. That keeps business logic testable without rendering and makes 80% meaningful.
- Set `collectCoverageFrom` to app source only, excluding `.expo`, `expo-env.d.ts` and config files. Put `coverageThreshold.global` at 80/80/80/80 to match the server.
- Set `"types": ["node"]` (plus Vitest's types if globals are used) explicitly in `apps/server/tsconfig.json`, and `"types": ["jest"]` in `apps/mobile/tsconfig.json`.
- Always use `bun run test` / `bun run --filter … test`. Add a note to CLAUDE.md.

**Warning signs:**
- Days of `transformIgnorePatterns` tweaking in Vitest.
- `Cannot redeclare block-scoped variable 'expect'` in the server.
- Coverage counting `metro.config.js`.
- "bun test" output where Jest output was expected.

**Phase to address:** Quality+CI (runner and threshold); App screens (keeping logic in testable modules).

---

### Pitfall 14: Biome 1.9's `style.all: true` collides with Expo and React Native code, and a Biome 2 upgrade changes semantics

**What goes wrong:**
The root `biome.json` enables **every** style rule (`style.all: true`) [repo], and these rules hit Expo/RN code:

- **`useFilenamingConvention`** accepts `[...slug].tsx`, `_layout.tsx` and `+not-found.tsx` per the docs. It doesn't explicitly document single-segment dynamic routes like `[shortName].tsx`, which this flow needs (`app/routes/[shortName].tsx`). If you set its `match` option, the built-in exceptions stop applying [docs: Biome rule page].
- **`useNamingConvention`** fires on things like `EXPO_PUBLIC_API_URL` reads and on header-name object keys. The server already needs `biome-ignore` comments for headers [repo].
- **`noImplicitBoolean`** flags JSX shorthand props.
- **The Expo template is formatted differently** (double JSX quotes, 2-space indent) from this repo's Biome config (`jsxQuoteStyle: "single"`, 4-space), so the first `biome check` shows hundreds of diffs.

Biome 1.9 also doesn't know about generated Expo dirs. `.expo/`, `ios/`, `android/` (after prebuild), `expo-env.d.ts` and web export output (`dist/` is already ignored) need ignoring. The current `files.ignore` has none of these, and VCS ignore integration isn't enabled [repo].

If the Toolchain phase upgrades to **Biome 2**, these breaking changes apply [docs: Biome v2 upgrade guide]:

- *"The option `all` is removed from the linter"*.
- `files.ignore` becomes `files.includes`, and globs are no longer auto-prefixed with `**/`.
- Style rules stop erroring unless configured. `biome migrate` sets them to error.
- Import sorting moves into an assist action and stops placing bare Node built-ins first.

The upgrade reshapes this exact config.

**How to avoid:**
- Keep one root `biome.json` that covers both workspaces. Add `overrides` for `apps/mobile/**` (and `apps/mobile/app/**` for route files) that relax only the rules that conflict with framework-mandated names. Each override gets a "why" comment, per the project's conventions.
- Add `.expo`, `ios`, `android`, `expo-env.d.ts` and `*.tsbuildinfo` to ignore, or enable `vcs.useIgnoreFile` with git. Add the same entries to `.gitignore`: `apps/mobile/.expo/`, `ios/`, `android/`, `web-build/`, `expo-env.d.ts`.
- Land the first Biome pass over the generated template as **its own formatting-only commit** (the established v0.1 practice) and list it in `.git-blame-ignore-revs`.
- If you move to Biome 2, do it as a separate step: run `biome migrate --write`, then confirm `bun run lint` still reports exactly the 15 known server warnings before adding the app. Fix the deprecated `--apply-unsafe` in `lint:fix` while you're there.
- Recheck `.vscode/settings.json`: `js/ts.tsdk.path: node_modules/typescript/lib` assumes the hoisted root TypeScript, and `importModuleSpecifierEnding: "js"` would make editor auto-imports in `apps/mobile` emit `./Foo.js` specifiers [repo], which Metro may not resolve to `.tsx` [LOW].

**Warning signs:**
Lint errors on every route file; hundreds of format diffs on scaffold; lint passing because `apps/mobile` is accidentally ignored, so check the file count in `biome check` output.

**Phase to address:** App screens (scaffold, overrides, ignores); Toolchain (if upgrading Biome).

---

## Moderate Pitfalls

### Pitfall 15: tsconfig changes from `@tsconfig/node24` silently change module semantics

**What goes wrong:**
The current `tsconfig.json` does **not** extend `@tsconfig/node20` even though it's installed. It hand-sets `target: ES2020, module: CommonJS, moduleResolution: node` [repo]. "Switching to `@tsconfig/node24`" by adding `extends` brings in that base's `module`/`moduleResolution` (`nodenext` family) and a newer `target`/`lib`. Under `nodenext`, the file format is decided by the nearest `package.json` `"type"`. A new `apps/server/package.json` that accidentally sets `"type": "module"` (the default in some scaffolds) flips the whole server to ESM. Relative imports then need `.js` extensions, directory imports (the `./api/repositories` barrels) stop working, and `__dirname` disappears. Explicit settings left in the local file also override the base, so the base may change nothing at all.

**Prevention:**
- Decide explicitly in Toolchain:
  - keep CommonJS and do not set `"type"` in `apps/server/package.json`;
  - `extends: "@tsconfig/node24/tsconfig.json"`;
  - keep `"module": "CommonJS"` or accept `nodenext`-as-CJS deliberately.
- Remove `@tsconfig/node20` and bump `@types/node` to 24.
- Verify with a full `bun run build` and a `node dist/app.js` boot, not only tests.
- Update `rootDir`, `outDir` and `include` only by moving the file with the code. There is no root tsconfig, or only a solution-style root with `"files": []` and `references`.

### Pitfall 16: The root `package.json` keeps server-only fields and scripts

**What goes wrong:**
The root keeps `main`, `exports`, `types` (already wrong: `./dist/index.js` doesn't exist [repo]), `dependencies` and server scripts. The result:

- `bun run test` at the root runs only the server, or nothing;
- CI "lints both workspaces" but Biome actually runs from a root that `files.ignore` partly excludes;
- the root `workspaces` field is missing `private: true` (already present, keep it).

**Prevention:**
- The root keeps only `private`, `workspaces: ["apps/*"]`, `packageManager`, root dev tools (Biome) and orchestration scripts, e.g. `bun run --filter '*' test`, `lint: biome check .`.
- Give each workspace a scoped name (e.g. `@dash-tracker/server`, `@dash-tracker/mobile`) and its own scripts.
- Check that `bun run --filter` exits non-zero when one workspace fails. Test this once deliberately.

### Pitfall 17: CI gets slow, flaky, or only runs after merge

**What goes wrong:**
- `ci.yml` triggers only on `push` to `main` [repo], so "CI lints/type-checks/tests both workspaces" catches nothing before merge.
- Every job does a full `bun install`, which now pulls the whole Expo/RN dependency tree for server-only jobs.
- `timeout-minutes: 5` per job [repo] gets tight with Expo installs plus the better-sqlite3 source build.
- Tempting additions make it slow and flaky: `expo prebuild`, native iOS/Android builds, EAS, or `expo-doctor` without the network-warning flag.

**Prevention:**
- Add a `pull_request` trigger.
- Cache `~/.bun/install/cache` keyed on `bun.lock`.
- Split jobs per workspace: server (build, lint, typecheck, test:coverage, boot smoke) and mobile (typecheck `tsc --noEmit`, jest coverage, `expo install --check`, `expo-doctor`).
- Optionally add `expo export --platform web` as a cheap bundling smoke test that catches Metro resolution errors without native toolchains.
- Run **no native builds in CI** for v0.7, which matches the out-of-scope list.
- Use `actions/setup-node` with `.node-version` in every job (Pitfall 2).

### Pitfall 18: SSE frames silently stop when DASH errors, and clients can't tell a stale stream from a live one

**What goes wrong:**
On a transient DASH error the poll loop sends **nothing** [repo: `PredictionStreamService` stays silent on non-NotFound errors]. There is also no heartbeat comment or `retry:` field. So during an upstream outage the stream stays open but silent, and the app keeps showing the last ETAs as if live.

Some intermediaries and client networking stacks drop idle connections. react-native-sse's `timeout` defaults to 0 (none) [docs]. iOS idle-timeout behavior for long-lived XHR is unverified [LOW].

**Prevention:**
- Client: show "updated N s ago" from `generatedAt` and mark data stale after about 2 poll intervals (more than 60 s) with no frame. A stale stream triggers a REST refresh and a reconnect, subject to Pitfall 6's backoff.
- Server: optionally add a `: keepalive\n\n` comment frame every ~25 s and a `retry: 5000` line on connect. That is a small, contained server change, which react-native-sse honors [docs: `retry:` parsed]. Decide this in the CORS phase or the App screens phase. Don't let it creep in unplanned.
- Never add `compression` middleware in front of `/predictions/stream`. It buffers SSE.

### Pitfall 19: Using `expo/fetch` streaming as a hand-rolled SSE client

**What goes wrong:**
`expo/fetch` supports streaming bodies (`resp.body.getReader()`), and on iOS/Android it replaces global `fetch` [docs]. Hand-parsing SSE over it means re-implementing:

- event-name dispatch;
- multi-line `data:` handling;
- partial-chunk buffering;
- `retry:` handling;
- reconnect.

Historically Android debug network inspection buffered streamed responses until completion. Flipper did, and Expo did before PR #30062, fixed in Expo 51.0.21 / RN 0.74.3 [docs: LaunchDarkly js-core PR #520]. A regression here shows up as "events arrive all at once in dev only".

**Prevention:**
- Use a maintained SSE client (react-native-sse, which is XHR-based and works on web too) behind the single hook from Pitfall 6. The Stack research makes the final library pick.
- Do the first Android SSE verification on a **debug dev build** and confirm frames arrive every ~30 s, not batched. If they're batched, compare with a release build before blaming the server.
- `curl -N` against the server is the ground truth that the server flushes.

### Pitfall 20: Metro watching the whole monorepo, including the server's churn

**What goes wrong:**
With automatic monorepo config, Metro watches the workspace root. Several server paths change constantly:

- `apps/server/data/*.sqlite-wal`, written on every favorites/recents write;
- `apps/server/coverage/`;
- `apps/server/dist/`.

The result is watcher churn, slow startups, or occasional spurious reloads [inferred, LOW].

**Prevention:**
If you observe this, add a `resolver.blockList` for `apps/server/(data|dist|coverage)/` in `metro.config.js`. Don't add it preemptively, per "no speculative config".

---

## Minor Pitfalls

### Pitfall 21: Both platforms hitting `/routes/all` before the first data load

**What goes wrong:**
The server returns 503 + `Retry-After: 5` until the first DASH load [repo]. An app that treats 503 as a fatal error shows a dead screen for the first seconds after a server restart, which is common in dev.

**Prevention:**
The API client maps 503 to a "server warming up" state and retries after `Retry-After`. On web that header requires the CORS expose from Pitfall 8. Otherwise use a fixed 5 s.

### Pitfall 22: The app sends `X-Device-Id` on every request and triggers preflights on web

**What goes wrong:**
Favorites and recents are out of scope for v0.7, but sending the header everywhere "for later" adds a preflight to every web request. It also logs recents from the app before any recents UI exists.

**Prevention:**
Don't send `X-Device-Id` in v0.7 unless a requirement needs it. Then preflight affects only SSE on web, from react-native-sse's headers.

### Pitfall 23: Odd-numbered or too-new Node

**What goes wrong:**
Expo refuses odd Node majors, and the SDK 58 minimums are 22.13+ / 24.3+ / 26+ [docs]. `.node-version` set to `24` without a minor can resolve to an older 24.x on some version managers.

**Prevention:**
Pin `.node-version` to a specific current 24.x LTS patch, and use the same file for `setup-node`.

### Pitfall 24: XHR-based SSE on web accumulates `responseText`

**What goes wrong:**
An XHR-backed stream keeps the whole response in `responseText` for the connection's lifetime [inferred]. At one ~1-2 KB frame every 30 s this is negligible, but a tab left open for days grows.

**Prevention:**
None needed for v0.7. Closing streams on unfocus and background (Pitfall 7) bounds it anyway.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Leave `ts-node` + `nodemon` and add `NODE_OPTIONS=--no-experimental-strip-types` | Dev server keeps working on Node 24 today | Depends on an unmaintained tool plus a flag that Node may remove; it is a stopgap the engineering principles forbid | Never; switch to the already-installed `tsx` |
| One squashed milestone commit containing the move | Simpler PR flow | Blame and bisect broken for the whole server history | Never for the move commit itself |
| `cors({ origin: "*" })` | Expo web works instantly | Any site can read API responses from a rider's browser; still no credentials, but it contradicts the "configured origins" requirement | Never; use the env-driven list |
| Keep `@vitest/coverage-v8` 2.1.5 with Vitest 3.2.6 | No change needed now | Unsupported mix; can break coverage after the move or a linker change | Never; align during Restructure |
| Let react-native-sse auto-reconnect at 5 s | Zero code | Reconnect storms into the 60/min bucket; endless 404 retries for removed stops; dead streams on network loss | Never against this server |
| Hard-code `http://192.168.x.y:3000` in app code | Works on your phone today | Breaks for every other device, network and CI | Only in a local, git-ignored `.env` |
| Snapshot-test screens to hit 80% | Fast coverage | Brittle tests that assert nothing about behavior | Only for one or two smoke renders; real coverage comes from the logic modules |
| Hoisted linker without an explicit `bunfig.toml` setting | No config | Layout flips if `bun.lock` is ever regenerated | Never; make it explicit |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| SSE `event: prediction` | Listening on `onmessage` / `"message"` | `es.addEventListener("prediction", …)` with `EventSource<"prediction">` typing |
| react-native-sse and server 429/503/404 | Relying on built-in 5 s auto-reconnect | `pollingInterval: 0`; own the backoff; 404 is terminal; reconnect on status 0 yourself |
| express-rate-limit and CORS | CORS mounted on routers or after the limiter | Global `app.use(cors())` first, so 429s carry ACAO; `exposedHeaders` include `Retry-After` and `RateLimit*` |
| Stream cap (5/IP) in dev | Running web, iOS sim and Android emulator together with leaky effects | All of them are 127.0.0.1 to the server; close on unfocus and background; count open streams in UAT |
| `cors` `allowedHeaders` | An explicit short list | Leave unset (reflect), or include `X-Device-Id`, `Content-Type`, `Cache-Control`, `X-Requested-With` |
| Expo env vars | Destructuring `process.env` | Literal `process.env.EXPO_PUBLIC_API_URL`; restart Metro after edits |
| Android emulator | `http://localhost:3000` | `10.0.2.2:3000` or `adb reverse tcp:3000 tcp:3000` |
| Bun `trustedDependencies` | Adding one entry for an Expo package | It replaces the default list; always include `better-sqlite3` |
| `setup-bun` in CI | Assuming it installs "latest" | It reads `packageManager` first; keep that field exact |
| Codecov | Same upload path and no flags after the move | `apps/server/coverage/…` plus `flags: server`; separate `mobile` upload |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Reconnect loop at 5 s per stream | 429s on REST too; blank arrivals | Backoff with jitter, ≥5 s floor, cap ~60 s | 5 looping streams = 60/min, the whole bucket for one IP |
| Streams on stacked (unfocused) screens | 6th stream → 429; extra DASH polls | `useFocusEffect` with one stream per focused screen | After ~5 stop screens on the stack |
| Browser HTTP/1.1 6-connection limit (web) | REST calls stuck "pending" | One stream at a time on web; close on navigation | 6 concurrent connections to the API origin |
| CI full install per job | Jobs near the 5-minute timeout | Bun cache; per-workspace jobs | As soon as the Expo deps land |
| Metro watching server output dirs | Slow `expo start`, reload churn | `blockList` only if observed | Busy favorites writes or coverage runs during app dev |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Treating CORS as access control | False sense that disallowed origins can't hit the API; the server still runs the request and spends the DASH budget | CORS only governs browser reads; rate limiting remains the protection |
| `origin: true` (reflect any) or `"*"` | Any web page can read responses in a user's browser | Explicit Zod-validated allowlist; empty by default |
| Shipping `DASH_API_KEY` or other secrets as `EXPO_PUBLIC_*` | Inlined into the JS bundle for anyone to read | The app only ever talks to dash-tracker; never put DASH credentials in the app |
| Logging the full request URL in new CORS or app-facing logs | Leaks rider coordinates (`/predictions/nearby` query) | Keep the v0.6 rule: log `baseUrl + path` only |
| Enabling `NSAllowsArbitraryLoads` / global cleartext to "fix" dev networking | Carries into a later release build; App Review flags | Dev-only exceptions; HTTPS for any non-dev build (deferred) |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Blank arrivals screen until SSE connects | Feels broken on slow networks | REST first, then SSE as an upgrade |
| Silent stale data when DASH or the stream is down | Rider trusts a bus that isn't coming | Show "updated N s ago" from `generatedAt`; mark stale after more than 60 s |
| 503 warm-up shown as an error | Looks like an outage after every deploy | "Loading live data…" state with automatic retry |
| 404 on the stream (stop removed) retried forever | Spinner that never resolves | Terminal "this stop is no longer served" message |
| Route list without grouping or sort | Hard to find a route | Use the server's order and `shortName` display; `/routes/:shortName/stops` is already grouped by direction |

## "Looks Done But Isn't" Checklist

- [ ] **Restructure:** `git show --stat -M` shows 100% renames for every moved file; test count is still 853 and statement coverage is still ~98.8%, from both the root and `apps/server`.
- [ ] **Restructure:** the Superset setup and run work in a fresh worktree; `.env` and `data/` live under `apps/server`.
- [ ] **Toolchain:** `bun --version` in CI equals the `packageManager` pin; `node -v` in CI is 24.x; no `package-lock.json` or `bun.lockb` in the tree.
- [ ] **Toolchain:** a clean `rm -rf node_modules && bun install` followed by a server boot works; `bun pm untrusted` prints nothing.
- [ ] **Toolchain:** `bun run dev-server` (via tsx) restarts on change under Node 24; ts-node and nodemon are gone.
- [ ] **CORS:** ACAO is present on the bucket 429, the stream-cap 429, the 503 not-ready response, the SSE 200 and unknown-route 404s; `Retry-After` is readable from web JS.
- [ ] **CORS:** a request with no `Origin` header (native, curl) still works; a disallowed origin gets no ACAO.
- [ ] **App screens:** arrivals update on iOS, Android **debug dev build** and web, with frames every ~30 s and not batched.
- [ ] **App screens:** leaving the arrivals screen, backgrounding, and Fast Refresh each release the server stream slot.
- [ ] **App screens:** with the server stopped mid-stream, the app backs off and recovers, and the 60/min bucket is never exhausted.
- [ ] **App screens:** works on a physical phone over the LAN, not just simulators.
- [ ] **Quality+CI:** CI runs on `pull_request`; the mobile coverage threshold counts app source only; `expo-doctor` and `expo install --check` pass; Biome actually lints `apps/mobile` (non-zero file count).

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Move squashed with edits (blame lost) | MEDIUM (after merge to main it's permanent) | Before merge: split into a pure `git mv` commit plus a fixups commit. After: document `git log --follow -M30%` / `git blame -C -C` |
| Linker flipped to isolated | LOW | Set `linker` in `bunfig.toml`; `bun install` (Bun reinstalls `node_modules`); re-run app and server tests |
| better-sqlite3 not built (trust list) | LOW | Add `better-sqlite3` to `trustedDependencies`; `rm -rf node_modules && bun install` |
| ABI mismatch after the Node bump | LOW | Clean reinstall under Node 24; add `setup-node` to CI |
| Duplicate React or RN | MEDIUM | `bun pm why react`; `bun expo install --fix`; root `resolutions` if still needed; `expo start --clear` |
| Reconnect storm hitting limits | LOW | Ship the backoff hook; the server limits self-heal per window |
| Favorites "lost" after the move (new DB path) | LOW | Move `./data/dash-tracker.sqlite*` to `apps/server/data/` or set `DB_PATH` |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 4. Linker flip (configVersion) | Restructure | `bunfig.toml` has an explicit `linker`; no `node_modules/.bun` when hoisted |
| 10. Lost blame and bisect | Restructure | `git show --stat -M` shows 100% renames; the move lands as its own PR or commit |
| 11. cwd-relative `.env`/`DB_PATH`, coverage paths, Vitest version skew | Restructure | Same 853 tests and coverage from root and from `apps/server`; the Superset worktree boots |
| 16. Root `package.json` leftovers | Restructure | Root has only workspace fields and orchestration scripts; `--filter` failure propagates |
| 1. `trustedDependencies` replaces the default list | Toolchain | `bun pm untrusted` is empty; the boot smoke test passes after a clean install |
| 2. Native ABI and CI Node version | Toolchain | `setup-node` from `.node-version`; SQLite tests pass on CI Node 24 |
| 3. Lockfile and Bun-version drift | Toolchain | Exact `packageManager`; one lockfile; tree clean after `--frozen-lockfile` |
| 9. ts-node on Node 24 | Toolchain | `tsx watch` dev loop works; ts-node and nodemon removed |
| 15. `@tsconfig/node24` semantics | Toolchain | `bun run build` plus a `node dist/app.js` boot; no `"type": "module"` |
| 23. Node pin precision | Toolchain | `.node-version` is a full 24.x.y |
| 14. Biome 2 migration (if chosen) | Toolchain | Same 15 known warnings before the app lands |
| 8. CORS placement, exposed headers, preflight | CORS | supertest matrix: ACAO on 200/429/429/503/SSE/404; preflight with SSE headers |
| 18. Silent stream / heartbeat decision | CORS or App screens (decide explicitly) | Either a keepalive test or a documented client staleness rule |
| 5. Duplicate React, Metro config | App screens | Plain `getDefaultConfig`; `bun pm why react` shows one version; `expo-doctor` clean |
| 6. SSE semantics and reconnect storms | App screens | Hook unit tests for 404/429/503/0/done; UAT with the server killed mid-stream |
| 7. Stream leaks | App screens | Unmount, focus and AppState tests; server open-stream count returns to 0 |
| 12. Base URL, emulator, ATS, Expo Go | App screens | Config module tests; UAT on a physical device |
| 14. Biome overrides and ignores for Expo | App screens (scaffold) | `biome check` file count includes `apps/mobile`; no route-file errors |
| 19. `expo/fetch` hand-rolled SSE; Android debug buffering | App screens | Frames arrive every ~30 s on an Android debug build |
| 13. Test runner and coverage scope; `@types` leakage | Quality+CI | jest-expo at 80% over app source; explicit `types` in both tsconfigs |
| 17. CI triggers, time, scope | Quality+CI | PR-triggered, per-workspace jobs within timeouts; no native builds |

## Sources

- Expo, "Work with monorepos": SDK 52 auto Metro config, remove `watchFolders`/`nodeModulesPaths`, isolated installs from SDK 54, autolinking resolution auto in SDK 55, no duplicate React/RN/native modules. https://docs.expo.dev/guides/monorepos/ [docs]
- Expo, "Using Bun": `trustedDependencies`, delete other lockfiles, Node still required. https://docs.expo.dev/guides/using-bun/ [docs]
- Expo, "Unit testing": jest-expo, Bun `transformIgnorePatterns` with `.bun`, Jest 30 on SDK 58, `react-test-renderer` deprecated, RNTL v14 for Router. https://docs.expo.dev/develop/unit-testing/ [docs]
- Expo, "Environment variables": dot-access inlining only, not inlined in `node_modules`. https://docs.expo.dev/guides/environment-variables/ [docs]
- Expo SDK version table (SDK 56–58: RN 0.85–0.88, React 19.2–19.3, Node minimums). https://docs.expo.dev/versions/latest/ [docs]
- Expo SDK 58 beta changelog: Node 22.13+/24.3+/26+, odd majors unsupported, Expo Go availability. https://expo.dev/changelog/sdk-58-beta [docs]
- `@expo/package-manager` lockfile resolution order (bun → … → npm → pnpm, from workspace root). https://github.com/expo/expo/blob/main/packages/%40expo/package-manager/src/utils/nodeManagers.ts [docs]
- Bun, "Isolated installs": `configVersion` → default linker table, `bunfig.toml` `linker`. https://bun.com/docs/pm/isolated-installs [docs]
- Bun, "Lifecycle scripts": `trustedDependencies` replaces the default list. https://bun.com/docs/pm/lifecycle [docs]
- Bun default trusted dependencies list (includes `better-sqlite3`). https://github.com/oven-sh/bun/blob/main/src/install/default-trusted-dependencies.txt [docs]
- `oven-sh/setup-bun` README: version from `package.json` `packageManager`, then `engines.bun`, else latest. https://github.com/oven-sh/setup-bun [docs]
- `react-native-sse` README and `src/EventSource.js`: XHR-based, `pollingInterval` 5000 default, non-2xx → error plus reconnect, status 0 → no reconnect, `retry:` honored, default `Cache-Control`/`X-Requested-With` headers, no background auto-close. https://github.com/binaryminds/react-native-sse [docs]
- `expressjs/cors` README: `exposedHeaders` default none, `allowedHeaders` reflects, `app.use(cors())` handles preflight. https://github.com/expressjs/cors [docs]
- Biome `useFilenamingConvention` rule docs. https://biomejs.dev/linter/rules/use-filenaming-convention/ [docs]
- Biome v2 upgrade guide: `all` removed, `includes`, style severity, import organizer. https://biomejs.dev/guides/upgrade-to-biome-v2 [docs]
- LaunchDarkly js-core PR #520: Flipper and Expo network inspection buffering streamed responses on Android; fixed by expo/expo#30062 (Expo 51.0.21). https://github.com/launchdarkly/js-core/pull/520 [docs-adjacent]
- better-sqlite3 13.0.0 release (first N-API build); 12.x adds Node 24 prebuilds. https://newreleases.io/project/npm/better-sqlite3/release/13.0.0 [MEDIUM]
- Node 22.18 type stripping on by default; ts-node regression workaround. https://nodejs.org/blog/release/v22.18.0 , https://github.com/IgniteUI/igniteui-angular/pull/16147 [docs-adjacent]
- Vitest mixed-version warning for `@vitest/*` packages. https://github.com/vitest-dev/vitest/issues/7417 [docs-adjacent]
- OWASP MASTG iOS network communication (ATS, `NSAllowsLocalNetworking`). https://mas.owasp.org/MASTG/iOS/0x06g-Testing-Network-Communication [MEDIUM]
- This repository: `package.json`, `bun.lock` (`configVersion: 0`), `tsconfig.json`, `vitest.config.mts`, `biome.json`, `.gitignore`, `.github/workflows/ci.yml`, `.superset/config.json`, `src/server/config/environment.ts`, `src/server/app.ts`, `src/server/api/middleware/{upstreamRateLimit,streamConcurrencyCap}.ts`, `src/server/api/routes/predictionRoutes.ts`, `src/server/api/controllers/PredictionStreamController.ts`, `src/server/api/services/PredictionStreamService.ts`, `node_modules/{vitest,@vitest/coverage-v8,better-sqlite3,ts-node}/package.json` [repo, HIGH]

---
*Pitfalls research for: Bun-workspaces monorepo + Node 24 + CORS + Expo routes→stops→arrivals app over REST/SSE (dash-tracker v0.7)*
*Researched: 2026-10-20*
