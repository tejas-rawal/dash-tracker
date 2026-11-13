---
phase: 18-server-toolchain-cors
verified: 2026-11-12T19:30:00Z
status: human_needed
score: 12/13 must-haves verified
covered_files: [".claude/CLAUDE.md",".git-blame-ignore-revs",".github/workflows/ci.yml",".node-version",".planning/phases/18-server-toolchain-cors/18-01-PLAN.md",".planning/phases/18-server-toolchain-cors/18-01-SUMMARY.md",".planning/phases/18-server-toolchain-cors/18-02-PLAN.md",".planning/phases/18-server-toolchain-cors/18-02-SUMMARY.md",".planning/phases/18-server-toolchain-cors/18-03-PLAN.md",".planning/phases/18-server-toolchain-cors/18-03-SUMMARY.md",".planning/phases/18-server-toolchain-cors/18-04-PLAN.md",".planning/phases/18-server-toolchain-cors/18-04-SUMMARY.md",".planning/phases/18-server-toolchain-cors/18-05-PLAN.md",".planning/phases/18-server-toolchain-cors/18-05-SUMMARY.md",".planning/phases/18-server-toolchain-cors/18-06-PLAN.md",".planning/phases/18-server-toolchain-cors/18-06-SUMMARY.md","AGENTS.md","README.md","apps/server/.env.example","apps/server/package.json","apps/server/src/api/controllers/PredictionStreamController.test.ts","apps/server/src/api/controllers/PredictionStreamController.ts","apps/server/src/api/middleware/cors.test.ts","apps/server/src/api/middleware/cors.ts","apps/server/src/api/middleware/streamConcurrencyCap.test.ts","apps/server/src/api/middleware/upstreamRateLimit.test.ts","apps/server/src/api/models/BusRoute.test.ts","apps/server/src/api/models/BusRoute.ts","apps/server/src/api/repositories/BusDataRepository.test.ts","apps/server/src/api/repositories/BusDataRepository.ts","apps/server/src/api/routes/alertHygiene.test.ts","apps/server/src/api/routes/cors.test.ts","apps/server/src/api/routes/corsStream.test.ts","apps/server/src/api/routes/dataBootRetry.test.ts","apps/server/src/api/routes/dataReload.test.ts","apps/server/src/api/routes/dataReloadStream.test.ts","apps/server/src/api/routes/healthRoutes.test.ts","apps/server/src/api/routes/predictionRoutes.test.ts","apps/server/src/api/routes/rateLimit.test.ts","apps/server/src/api/routes/routeColors.test.ts","apps/server/src/api/routes/streamCap.test.ts","apps/server/src/api/routes/trustProxy.test.ts","apps/server/src/api/routes/upstreamTimeout.test.ts","apps/server/src/api/services/HealthService.test.ts","apps/server/src/api/services/StopService.test.ts","apps/server/src/app.ts","apps/server/src/config/environment.test.ts","apps/server/src/config/environment.ts","apps/server/src/config/index.ts","apps/server/src/createApp.ts","apps/server/src/test/app.ts","apps/server/src/test/setup.ts","apps/server/src/test/streamClient.ts","apps/server/tsconfig.json","biome.json","bun.lock","package.json"]
covered_digest: "v3:sha256:8560c52c20492b5825c48540786209667c684558270c5303d7667d4374a7e1bb"
behavior_unverified: 1
overrides_applied: 0
deferred:
  - truth: "TOOL-09 (mobile half): the app workspace uses TypeScript 6 with its own explicit `types` list"
    addressed_in: "Phase 19"
    evidence: "Phase 19 success criterion 5: 'The app's TypeScript 6 tsconfig has its own explicit `types` list, so the server's `@types` packages don't leak into it.' apps/mobile does not exist yet (ls apps -> server only)."
behavior_unverified_items:
  - truth: "dev-server runs under tsx watch and restarts on a file change; the server shuts down cleanly on SIGINT/SIGTERM under tsx (ROADMAP SC2; 18-02 truths 3-4)"
    test: "From the repo root run `bun run dev:server`, request /api/v1/health/live, `touch apps/server/src/app.ts`, wait for the restart log, request health/live again, then Ctrl-C. Repeat with `cd apps/server && bun run start-server` and SIGINT, and with `bun run dev-server` plus SIGTERM to the bun pid alone."
    expected: "A second 'Server is running on port' after the touch; each stop logs 'Server is gracefully shutting down', leaves no tsx/node process in the group, and frees the port."
    why_human: "Restart and signal forwarding are runtime behaviour of tsx plus app.ts shutdown; no automated test exercises them, and the verifier does not start long-running servers. Only SUMMARY narration (18-02) attests the earlier runs."
human_verification:
  - test: "Run the dev-server restart and signal checks listed in behavior_unverified_items (root dev:server + touch + Ctrl-C; start-server + SIGINT; dev-server + SIGTERM to bun)."
    expected: "Restart after the touch; graceful shutdown log; no leftover process; port free."
    why_human: "Runtime process-group behaviour under tsx watch; no test covers it."
  - test: "Harvested from 18-02-PLAN <human-check>: in a fresh Superset workspace from this branch, let Setup run, start the Run command (`cd apps/server && exec bun run dev-server`), request http://localhost:3000/api/v1/health/live, then dispose the terminal from Superset."
    expected: "Setup's `bun install --frozen-lockfile` succeeds on Node 24.22.2; health/live answers 200; after dispose `pgrep -fl 'tsx watch src/app.ts'` lists nothing from that workspace and port 3000 is free."
    why_human: "Plan marks this human-check. The executor ran it through the Superset CLI (18-02-SUMMARY), so the user must accept that CLI evidence or repeat the dispose from the desktop UI."
  - test: "Push the branch and watch the first GitHub Actions run of the updated .github/workflows/ci.yml."
    expected: "All 4 jobs pass: setup-node@v7 reads .node-version (the v7 tag exists upstream, v7.1.0), the verify step prints matching Node v24.22.2 / Bun 1.3.14 / 'Found 0 untrusted dependencies with scripts' with a clean git status after a fresh frozen install on ubuntu-latest, and the Build job's boot smoke gets 200 from /health/live and exit 0 on SIGTERM."
    why_human: "The workflow has never run. The clean-install-from-scratch half of SC1 (native better-sqlite3 build on a fresh Linux runner) and the boot smoke are only provable by that run; the verifier checked the YAML and the current local install."
---

# Phase 18: Server Toolchain & CORS Verification Report

**Phase Goal:** The server runs on the current toolchain (Node 24 LTS, tsx, TypeScript 6, Biome 2.5) with no change in behavior. Browser code on an allowed origin can read every API response, including the error and retry signals the app needs.
**Verified:** 2026-11-12T19:30:00Z
**Status:** human_needed
**Re-verification:** No (initial verification)

## Goal Achievement

### Observable Truths

These are the roadmap success criteria (the contract), split into checkable truths, with the plan must-haves merged in.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `.node-version` pins a Node 24 LTS release and every CI job sets up Node from it before `bun install` (SC1, TOOL-06) | ✓ VERIFIED | `.node-version` = `24.22.2`. `ci.yml`: all 4 jobs (build, lint, style, test) run `actions/setup-node@v7` with `node-version-file: .node-version` before `bun install --frozen-lockfile`. Each verify step compares `node --version` with `v$(cat .node-version)`. `gh api` confirms the upstream `v7` tag exists (latest v7.1.0). `node --version` = v24.22.2 at the root and in apps/server. |
| 2 | better-sqlite3 builds and loads on Node 24; it is in `trustedDependencies`; `bun pm untrusted` is empty (SC1, TOOL-07) | ✓ VERIFIED | Root `trustedDependencies: ["better-sqlite3","esbuild"]`. Both have install scripts (better-sqlite3 `install`, esbuild `postinstall`). `bun pm untrusted` prints "Found 0 untrusted dependencies with scripts." `new Database(':memory:')` returns `{x:1}` on `process.versions.modules` 137. A clean reinstall was not re-run here; see Human Verification item 3. |
| 3 | The full server suite, coverage and build pass on Node 24 (SC1) | ✓ VERIFIED | One `bun run test:coverage` run: 57 files, 922/922 tests, no type errors, exit 0. All files 98.66 / 96.85 / 98.45 / 98.66 (all ≥ 80). `bun run build` and `bun run typecheck` both exit 0. |
| 4 | `dev-server` is `tsx watch`, `start-server` is `tsx`, and ts-node and nodemon are removed (SC2, TOOL-08) | ✓ VERIFIED | `apps/server/package.json` scripts: `tsx src/app.ts` and `tsx watch src/app.ts`. Neither package is in package.json or node_modules. tsx is 4.23.15. Root `dev:server` and `.superset/config.json` still call `dev-server`. All `@types/*` packages are in devDependencies. |
| 5 | dev-server restarts on a file change, and the server stops cleanly on signals under tsx (SC2) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Present and wired: tsx watch is the script and app.ts has SIGINT/SIGTERM handlers. No test exercises the restart or the process-group cleanup. The only evidence is 18-02-SUMMARY narration. See Human Verification. |
| 6 | `build` emits CommonJS to `dist/` from TypeScript 6, with a tsconfig that extends `@tsconfig/node24` and lists `types` explicitly (SC2, TOOL-09 server half) | ✓ VERIFIED | `tsc --version` = 6.0.3. `tsc --showConfig` gives module commonjs, moduleResolution bundler, target es2024, types ["node"], strict true. The typecheck config shows the same values plus noEmit. `dist/app.js` starts with `"use strict"`, uses `require`, has 0 top-level `import` lines and contains 0 test files. `tsc --listFilesOnly` pulls in 0 `@types/supertest|superagent|chai` files. |
| 7 | The ES2020 → es2024 emit switch (define semantics for class fields) changes no behavior (18-02 backstop truth) | ✓ VERIFIED | Explicit evidence, not presence alone: (a) vite's esbuild 0.19.12 emits define semantics (`x;`) under the unrecognized `es2024` target exactly as it does for `es2022`, so the 922 tests run with the same class-field semantics as tsc's dist output; (b) the built `dist/createApp.js`, `dist/config/environment.js` and the controllers ran in-process under Node 24.22.2 and gave correct responses (spot-checks below); (c) typecheck is clean, with no TS2729. |
| 8 | `bun run lint` runs Biome 2.5 with no warnings beyond the known set; the migrate and reformat commits are separate; the reformat is in `.git-blame-ignore-revs`; `lint:fix` uses a non-deprecated flag (SC3, TOOL-10) | ✓ VERIFIED | `biome --version` = 2.5.15. Lint exits 0. JSON reporter: 36 warnings (30 useFilenamingConvention, 1 useNamingConvention, 2 useThrowOnlyError, 3 suppressions/unused), 0 errors, 0 infos. Migrate commit `597be9a` touches only biome.json, bun.lock and package.json. Reformat `86e09f1` is its direct child. Running `biome check --write .` on an archive of `597be9a` reproduces `86e09f1` byte for byte (`diff -r` is empty). `.git-blame-ignore-revs` holds the full SHA, and `git blame --ignore-revs-file` attributes 0 lines to it. `lint:fix` = `biome check --write --unsafe .`. |
| 9 | With `CORS_ALLOWED_ORIGINS=http://localhost:8081`, browser code on that origin can read the 200, both 429s, the 503, the 404 and the SSE stream, and can read `Retry-After` (SC4, CORS-02, CORS-03) | ✓ VERIFIED | `cors.ts` uses an exact-origin callback with `exposedHeaders: Retry-After, RateLimit, RateLimit-Policy`. It is mounted in `createApp()` right after trust proxy and before json and the routers. Tests: `routes/cors.test.ts` (200, 503, 404, bucket 429 at the 60/61 boundary) and `routes/corsStream.test.ts` (SSE 200 with frames, stream-cap 429 with Retry-After: 5). All pass in the suite run. Dist spot-check: the 503 and 404 from the allowed origin carry ACAO `http://localhost:8081`, the expose list and `Vary: Origin`. |
| 10 | The preflight never spends a rate-limit token (SC4, CORS-02) | ✓ VERIFIED | `cors.test.ts`: ratelimit remaining goes 59 → preflight 204 (no RateLimit header) → 58, and the allowed preflight to `/favorites` answers 204 before `requireDeviceId`. Dist spot-check: the preflight answers 204 with `Access-Control-Allow-Headers: X-Device-Id`. |
| 11 | With the variable unset, no browser origin can read responses; `*`, a path, a trailing slash or a malformed origin stops startup (SC4, CORS-01) | ✓ VERIFIED | The Zod schema defaults to `""`, splits, trims and filters, so `' , ,'` gives `allowedOrigins: []` (run against dist). `isExactOrigin` requires http(s) and `url.origin === entry`. Dist run: `*`, `http://localhost:8081/`, `.../path`, `notaurl` and `http://localhost:8081,*` each throw and name `CORS_ALLOWED_ORIGINS.<i>: entry '<x>'`. `.env.example` lists `http://localhost:8081`. Unit test: an empty list allows no origin. |
| 12 | Requests without an `Origin` header behave exactly as before (SC5, CORS-04) | ✓ VERIFIED | `cors` resolves `false`, which calls `next()` without touching `res` (confirmed in `node_modules/cors/lib/index.js`). Every route test now runs through `createApp()` with CORS mounted, and outside the reformat commit the pre-existing test files only gained lines (no assertion removed). `cors.test.ts` covers no-Origin and disallowed requests: no `access-control-*` headers, the same status and body, OPTIONS `/predictions` → 200 `GET,HEAD`, OPTIONS `/favorites` → 400. |
| 13 | Route responses carry DASH's `color`/`textColor` when the live payload has them (SC5, CORS-05) | ✓ VERIFIED | Captured live payload (`18-dash-routes-payload.txt`): all 12 routes carry 6-hex `color`/`textColor`, so CORS-05 applies. `BusRoute` has optional `color`/`textColor`. `createRoute` passes `parseHexColor(...)`, which never throws. `routeColors.test.ts` runs a fake DASH server through the real load and checks `/routes/all` and `/routes/36B` (values unchanged, no `#`). Repository tests drop each malformed variant per field, the load still resolves and the route count is unchanged. `BusRoute.test.ts` checks that JSON omits the fields when they are unset, including in the `{...route, alerts}` copy. |

**Score:** 12/13 truths verified (1 present, behavior-unverified)

### Prohibitions

| Prohibition | Tier | Disposition | Evidence |
|-------------|------|-------------|----------|
| An empty or unset `CORS_ALLOWED_ORIGINS` never means every origin: no ACAO `*`, no echo of an unlisted origin, no `Access-Control-Allow-Credentials` (18-04, 18-06) | test | Enforced | `cors.test.ts` `afterEach` asserts ACAO ≠ `*` and no credentials header on every response the file receives. `middleware/cors.test.ts` checks the empty list, an exact byte-for-byte echo, `null`, case and trailing-slash variants. All pass. |
| Install supply-chain gates are not weakened: no `minimumReleaseAgeExcludes`, no regenerated `bun.lock`, no unreported trust entry, every install `--frozen-lockfile` (18-01..04) | test | Enforced in CI config; CI not yet run | No `minimumReleaseAgeExcludes` anywhere. `bun.lock` keeps `configVersion: 0` (a regenerated lockfile would get 1). Both trust entries have lifecycle scripts. CI and `.superset/config.json` installs are `--frozen-lockfile`. The CI verify step fails on any untrusted package or a dirty tree. The first live enforcement is the first CI run (Human item 3). |
| Route colors are never invented or altered: no default, no computed contrast, no `#` (18-05) | test | Enforced | `parseHexColor` returns the input or `undefined`. Repository tests cover `#006899` → dropped and uppercase kept as sent. |

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | TOOL-09 mobile half: a TypeScript 6 app tsconfig with its own explicit `types` list | Phase 19 | Phase 19 SC5: "The app's TypeScript 6 tsconfig has its own explicit `types` list, so the server's `@types` packages don't leak into it." `apps/` holds only `server`. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.node-version` | Node 24 LTS pin | ✓ VERIFIED | `24.22.2` |
| `package.json` | trustedDependencies, Biome 2.5.15, `lint:fix --write --unsafe` | ✓ VERIFIED | All present |
| `.github/workflows/ci.yml` | setup-node from `.node-version` in 4 jobs, pin and trust checks, dist boot smoke | ✓ VERIFIED (not yet run) | All present |
| `apps/server/package.json` | tsx scripts, TS 6.0.3, @types in devDependencies, cors 2.8.6 | ✓ VERIFIED | |
| `apps/server/tsconfig.json` | extends `@tsconfig/node24`, commonjs/bundler, `types: ["node"]` | ✓ VERIFIED | |
| `biome.json` | Biome 2 config naming the 1.9.4 style rules | ✓ VERIFIED | 36-warning parity |
| `.git-blame-ignore-revs` | Reformat SHA | ✓ VERIFIED | `86e09f13…ae167` |
| `apps/server/src/createApp.ts` | Shared app wiring | ✓ VERIFIED | Used by `app.ts` and `test/app.ts` |
| `apps/server/src/api/middleware/cors.ts` | `createCorsMiddleware` | ✓ VERIFIED | Wired in createApp |
| `apps/server/src/config/environment.ts` | Zod `CORS_ALLOWED_ORIGINS` → `environment.cors.allowedOrigins` | ✓ VERIFIED | |
| `apps/server/src/api/models/BusRoute.ts` / `BusDataRepository.ts` | color/textColor | ✓ VERIFIED | |
| `routes/cors.test.ts`, `routes/corsStream.test.ts`, `middleware/cors.test.ts`, `routes/routeColors.test.ts`, `test/streamClient.ts` | Test matrix | ✓ VERIFIED | gsd `verify.artifacts`: all plans pass (3/3, 2/2, 3/3, 3/3, 3/3, 4/4) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| ci.yml | .node-version | `node-version-file` + verify step | ✓ WIRED | tool 3/3 for 18-01 |
| package.json | bun.lock | trustedDependencies | ✓ WIRED | |
| ci.yml | apps/server/dist/app.js | boot smoke | ✓ WIRED | |
| root `dev:server` | apps/server `dev-server` | `bun run --filter @dash-tracker/server dev-server` | ✓ WIRED | manual (the tool could not parse the annotated `from`) |
| tsconfig.json / tsconfig.typecheck.json | @tsconfig/node24 / tsconfig.json | extends | ✓ WIRED | |
| .git-blame-ignore-revs | reformat commit | full SHA | ✓ WIRED | manual (the tool's `^…$` pattern is not multiline) |
| package.json lint scripts | biome.json | `biome check` | ✓ WIRED | manual |
| createApp.ts | cors.ts | `createCorsMiddleware(environment.cors.allowedOrigins)` | ✓ WIRED | |
| app.ts, test/app.ts | createApp.ts | `createApp()` | ✓ WIRED | |
| BusDataRepository.createRoute | BusRoute | `color: parseHexColor(...)`, `textColor: parseHexColor(...)` (lines 227-228) | ✓ WIRED | manual |
| BusRouteService.attachAlerts | route responses | `{ ...route, alerts }` (line 23) | ✓ WIRED | manual |
| cors.test.ts | createApp | `import app from "../../test/app"` | ✓ WIRED | |
| corsStream.test.ts | streamClient.ts | `openStream({ port, path, origin })` | ✓ WIRED | manual (shorthand `origin`, not `origin:`) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| Route responses | `color`/`textColor` | DASH `/info/{agency}/routes?verbose=true` → `load()` → `parseHexColor` → `BusRoute` → `res.json` | Yes (live payload captured; end-to-end test through a fake DASH HTTP server) | ✓ FLOWING |
| CORS allowlist | `allowedOrigins` | `process.env.CORS_ALLOWED_ORIGINS` → Zod → `environment.cors` → `createCorsMiddleware` | Yes (dist run) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Node and native module on Node 24 | `node -e "new (require('better-sqlite3'))(':memory:')…"` | `{x:1}`, ABI 137 | ✓ PASS |
| Trust list | `bun pm untrusted` | "Found 0 untrusted dependencies with scripts." | ✓ PASS |
| Suite and coverage (single run) | `bun run test:coverage` | 922/922; 98.66/96.85/98.45/98.66 | ✓ PASS |
| Typecheck / build / lint | `bun run typecheck`, `build`, `lint` | exit 0 / exit 0 / exit 0 with 36 warnings | ✓ PASS |
| Reformat reproducibility | `biome check --write` on `git archive 597be9a`, then `diff -r` against `86e09f1` | identical | ✓ PASS |
| CORS on built dist | in-process `createApp().listen(0)` + fetch | 503/404 allowed → ACAO, expose list, `Vary: Origin`, Retry-After 5 on the 503; no-Origin 503 and evil-origin 200 → no CORS headers; preflight → 204 with `X-Device-Id` | ✓ PASS |
| Startup validation on dist | `require('./dist/config/environment')` with bad values | `*`, trailing slash, path, `notaurl`, mixed `…,*` all throw and name the entry; `' , ,'` → `[]` | ✓ PASS |
| dev-server restart / signals | needs long-running servers | not run | ? SKIP → human |

### Probe Execution

Step 7c: SKIPPED. No `scripts/*/tests/probe-*.sh` exists, and no plan declares a probe.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TOOL-06 | 18-01 | Node 24 LTS pin; every CI job sets up Node before install | ✓ SATISFIED | Truth 1 |
| TOOL-07 | 18-01 | better-sqlite3 loads on Node 24; explicit trustedDependencies; untrusted empty | ✓ SATISFIED | Truth 2 (fresh-runner clean install pending first CI run) |
| TOOL-08 | 18-02 | tsx / tsx watch; ts-node and nodemon removed | ✓ SATISFIED (restart behaviour → human) | Truths 4, 5 |
| TOOL-09 | 18-02 | TS 6 in both workspaces; node24 base; CommonJS; explicit types | ✓ SATISFIED for the server; mobile half deferred to Phase 19 | Truths 6, 7; Deferred 1. REQUIREMENTS.md marks TOOL-09 Complete, but only its server half is delivered here. |
| TOOL-10 | 18-03 | Biome 2.5 sole tool; separate migrate/reformat commits; ignore-revs; non-deprecated lint:fix | ✓ SATISFIED | Truth 8 |
| CORS-01 | 18-04, 18-06 | Zod-validated exact-origin list, empty default, bad values crash, `.env.example` lists 8081 | ✓ SATISFIED | Truth 11 |
| CORS-02 | 18-04, 18-06 | CORS on 200, both 429s, 503, 404, SSE; preflight spends no token | ✓ SATISFIED | Truths 9, 10 |
| CORS-03 | 18-04, 18-06 | Retry-After exposed | ✓ SATISFIED | Truth 9 |
| CORS-04 | 18-04, 18-06 | No-Origin requests unchanged | ✓ SATISFIED | Truth 12 |
| CORS-05 | 18-05 | color/textColor passthrough (conditional) | ✓ SATISFIED (applies: the live payload carries them) | Truth 13 |

All 10 phase requirement IDs appear in plan frontmatter. No requirement mapped to Phase 18 is orphaned.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (41 changed files) | — | TBD/FIXME/XXX | none found | Debt-marker gate clean |
| `apps/server/src/api/middleware/cors.ts` | 19-25 | WR-01 (review, open): `Vary: Origin` is sent only to allowed origins; tests lock the omission in | ⚠️ Warning | A shared or browser cache could replay a no-Origin variant to the web app. The impact is limited here: there is no `Cache-Control`/`Last-Modified`, so caching is revalidation-bound, and every allowed fetch carries Origin. It does not break the goal today, but it is a spec deviation the tests enforce. |
| `apps/server/src/config/environment.test.ts` | 157, 168, 178 | WR-02 (review, open): `toThrow("*")` always matches the message template | ⚠️ Warning | The assertion that the offending entry is named is vacuous for the `*` rows. Behaviour is correct (dist run shows `CORS_ALLOWED_ORIGINS.1: entry '*'`), but the test would not catch a regression. |
| test output (vite 5.1.6 / esbuild 0.19.12) | — | `Unrecognized target environment "es2024"`, printed 118 times per run | ℹ️ Info | Cosmetic: esbuild still emits define semantics (verified), so tests match dist. It appeared with 18-02's es2024 target, but 18-02-SUMMARY does not record it (18-04-SUMMARY says it does). |
| `.planning/phases/18-server-toolchain-cors/.tdd/18-04-red-junit.xml`, `18-04-red.json` | — | Unredacted machine hostname, committed in `91b982f` | ℹ️ Info | Privacy hygiene; pending user decision (`deferred-items.md`). History keeps the value unless it is rewritten. |
| `apps/server/package.json` | 46 | IN-04: `@tsconfig/strictest` unused (no tsconfig extends it) | ℹ️ Info | Obsolete dependency |
| `apps/server/.env.example` | 9 | IN-03: the copied example enables a localhost origin | ℹ️ Info | Safe-default concern |
| `apps/server/src/api/middleware/cors.ts` | — | IN-02: default methods include PUT/PATCH; no `maxAge` | ℹ️ Info | Extra preflight round trips |
| `apps/server/package.json`, `ci.yml` | — | IN-05 (no `start` script for dist; tsx does not type-check), IN-06 (verify block copied into 4 jobs), IN-01 (tsconfig comment rationale) | ℹ️ Info | Maintainability |

### Human Verification Required

### 1. dev-server restart and signal cleanup under tsx

**Test:** From the repo root run `bun run dev:server`, request `/api/v1/health/live`, `touch apps/server/src/app.ts`, then Ctrl-C. Repeat with `start-server` + SIGINT to its group and `dev-server` + SIGTERM to the bun pid alone.
**Expected:** The server restarts after the touch. Each stop logs "Server is gracefully shutting down", leaves no tsx/node process behind and frees the port.
**Why human:** This is runtime process-group behaviour, and no automated test covers it. Only 18-02-SUMMARY narration attests the earlier runs.

### 2. Superset terminal dispose (harvested 18-02 `<human-check>`)

**Test:** Fresh Superset workspace from this branch → Setup → Run `cd apps/server && exec bun run dev-server` → GET `/api/v1/health/live` → dispose the terminal from Superset.
**Expected:** The frozen install succeeds on Node 24.22.2. health/live answers 200. After the dispose no `tsx watch src/app.ts` process remains and port 3000 is free.
**Why human:** The executor ran this through the Superset CLI, not the UI. Accept that evidence or repeat it from the desktop app.

### 3. First CI run of the updated workflow

**Test:** Push the branch and watch GitHub Actions.
**Expected:** All 4 jobs pass. The verify step shows v24.22.2, Bun 1.3.14, 0 untrusted packages and a clean tree after a fresh frozen install. The Build job's boot smoke gets 200 and exits 0 on SIGTERM.
**Why human:** The workflow has never run. A fresh-runner native build of better-sqlite3 and the dist boot smoke can only be proven there.

### Gaps Summary

No blocking gaps. Every roadmap success criterion has code-level evidence that I checked myself: tests, built-artifact runs and git-history reproduction. SUMMARY claims were not taken as evidence. The toolchain is Node 24.22.2, tsx 4.23.15, TypeScript 6.0.3 and Biome 2.5.15. The suite (922 tests), coverage, typecheck and build pass, and lint stays at the 36-warning baseline. CORS lets the allowed origin read the 200, both 429s, the 503, the 404 and the SSE stream, with Retry-After exposed. Requests without an Origin are untouched.

The phase sits at `human_needed` for three reasons. The dev-server restart and signal behaviour under tsx has no automated proof. The planner deferred the Superset dispose check to a human. The new CI workflow has not run yet. The two open review warnings (WR-01 `Vary: Origin`, WR-02 vacuous assertion) do not block the goal, but they should be triaged before shipping. The fix for WR-01 would also change the test expectations that currently enforce the omission.

---

_Verified: 2026-11-12T19:30:00Z_
_Verifier: Claude (gsd-verifier)_
