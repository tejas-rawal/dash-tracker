# Phase 18: Server Toolchain & CORS - Context

**Gathered:** 2026-11-10
**Status:** Ready for planning
**Mode:** `--auto` (yolo chain after Phase 17 verification). Every decision below is the recommended option, chosen without asking. Each one is logged in `18-DISCUSSION-LOG.md`.

<domain>
## Phase Boundary

`apps/server` moves to the current toolchain (Node 24 LTS, `tsx`, TypeScript 6, Biome 2.5) with **no change in behavior**. Then browser code on an allowed origin can read every API response, including `Retry-After`. Requests without an `Origin` behave exactly as before. Route responses gain DASH's `color`/`textColor` (CORS-05 applies, see D-15).

Requirements: TOOL-06, TOOL-07, TOOL-08, TOOL-09, TOOL-10, CORS-01, CORS-02, CORS-03, CORS-04, CORS-05. Success criteria 1–5 in `.planning/ROADMAP.md` § Phase 18 are the acceptance bar.

Out of this phase: any `apps/mobile` code (Phase 19+). The mobile half of TOOL-09 is checked by Phase 19 success criterion 5. No new endpoints, and no behavior change for existing clients.

</domain>

<decisions>
## Implementation Decisions

### Order of work and commits
- **D-01:** Toolchain plans run first and CORS plans last, so the CORS code is written on TypeScript 6 and in Biome 2 style (ROADMAP note). The order inside the toolchain: Node 24 pin plus CI `setup-node` and `trustedDependencies` → `tsx` replaces ts-node/nodemon → TypeScript 6 plus `@tsconfig/node24` → Biome 2.5. Each step is its own commit, or several, and the full suite, typecheck, lint and build stay green after every commit, so a bisect can tell which bump broke something.
- **D-02:** Phase 18 ships as its own PR, merged with a merge commit like Phase 17. The `.git-blame-ignore-revs` entry has to point at a reformat commit SHA that survives on `main`, and a squash merge would rewrite it. — **Reversibility:** one-way — after a squash merge, the SHA listed in `.git-blame-ignore-revs` no longer exists on `main`, so blame stops skipping the reformat.

### Node 24 and native module (TOOL-06, TOOL-07)
- **D-03:** `.node-version` pins the newest Node 24 LTS patch (full `24.x.y`) that is at least 7 days old, which keeps the release-age policy. Research names the exact version. Every CI job runs `actions/setup-node` with `node-version-file: .node-version` **before** `bun install`, alongside the existing Bun pin check.
- **D-04:** The root `package.json` declares `trustedDependencies: ["better-sqlite3"]`, and also lists any package whose blocked postinstall `bun pm untrusted` reports today (`@biomejs/biome` is listed now). The bar is `bun pm untrusted` printing nothing after a clean install. A declared list *replaces* Bun's default list, so the plan checks that esbuild (pulled in by tsx) and Biome still work.
- **D-05:** After the Node bump: delete `node_modules` and run a frozen reinstall. better-sqlite3 must build for the Node 24 ABI and load (`new Database(':memory:')`). Add a boot smoke step to CI that starts the server and gets 200 from `/api/v1/health/live`, so a native-module ABI break fails CI rather than production.

### tsx replaces ts-node and nodemon (TOOL-08)
- **D-06:** `dev-server` becomes `tsx watch src/app.ts`, and `start-server` becomes `tsx src/app.ts`. Script names stay the same (Phase 17 D-13), so the root `dev:server` and `.superset/config.json` (`cd apps/server && exec bun run dev-server`) keep working unchanged. Remove `nodemon` and `ts-node`, bump `tsx` to the research-pinned version, and move every `@types/*` from `dependencies` to `devDependencies` (Phase 17 D-11 left them there).
- **D-07:** Check signal handling again under tsx. SIGTERM and SIGINT to the dev and start processes must still run `app.ts`'s graceful shutdown and leave no orphan process and a free port. Repeat the Phase 17 UAT 1 and UAT 2 checks: a root `dev:server` Ctrl-C, and a Superset terminal dispose. The SIGHUP gap from the Phase 17 UAT hand run (`bun run` wrapper) is noted but not required (STATE.md concern).

### TypeScript 6 (TOOL-09, server half)
- **D-08:** `apps/server/tsconfig.json` extends `@tsconfig/node24` (which replaces `@tsconfig/node20`). It stays CommonJS with no `"type": "module"`. If the base sets a Node16/NodeNext module, override `module` and `moduleResolution` so `build` still emits CommonJS to `dist/`. It sets an explicit `"types": ["node"]`, and `rootDir: "./src"` stays. `tsconfig.typecheck.json` adds `"vitest/globals"` only if the tests use globals; they import from `vitest` today, so `["node"]` is likely enough.
- **D-09:** Keep the current strictness flags (`strict`, `noUnusedLocals`, `noImplicitReturns` and the rest). Fix any new TS 6 errors in their own commit before the base switch, or fold them into it, but never loosen a flag to get green. `@types/node` moves to the 24.x line.

### Biome 2.5 (TOOL-10)
- **D-10:** Commit 1: bump to Biome 2.5.x (research names the version) plus `biome migrate --write`, config only. Commit 2: `biome check --write .` reformat only, with no hand edits. Commit 3: add commit 2's SHA to a new root `.git-blame-ignore-revs`. `lint:fix` becomes `biome check --write --unsafe`. — **Reversibility:** costly — redoing the reformat after more code lands means a second large diff and a second blame-ignore entry.
- **D-11:** "No warnings beyond the known server set" means the warning count from Biome 1.9.4 on the current tree, recorded before the bump, is the baseline. New Biome 2 rules that fire are either fixed in a separate, behavior-neutral commit or turned off in `biome.json` with a one-line reason. Never use blanket `nursery`/`all` changes. `noDefaultExport` stays off.

### createApp() and CORS mount (CORS-02, CORS-04)
- **D-12:** Extract `createApp()` into `apps/server/src/createApp.ts`. It does the wiring both `app.ts` and `src/test/app.ts` duplicate today: `trust proxy`, CORS, `express.json()`, `GET /` and `/api/v1` routes. `app.ts` calls it and keeps the process handlers, the SQLite open, listen and the background loops. `src/test/app.ts` becomes `createApp()` (Phase 17 D-06 deferred this here). The extraction is a behavior-neutral commit that lands before the CORS commit.
- **D-13:** Use the established `cors` package (research: 2.8.6, exact version) with `@types/cors`, not hand-rolled headers. It is mounted app-level in `createApp()` right after `trust proxy` and before every router, so it runs before the per-route `upstreamRateLimiter` and `streamConcurrencyCap`. Preflight `OPTIONS` is answered by `cors` and never reaches the limiter or cap (no token spent). Options: `origin` is the exact allowlist, `exposedHeaders: ["Retry-After"]` (plus `RateLimit`/`RateLimit-Policy` only if the limiter emits them today), no `credentials`, and `allowedHeaders` is left to reflect (`X-Device-Id` must preflight cleanly). A request with no `Origin` gets no CORS headers and is otherwise untouched (CORS-04).
- **D-14:** CORS headers must also reach responses written outside the normal flow. That covers the SSE `res.writeHead(200, …)` (which merges headers `cors` already set), the stream-cap 429, the shared-bucket 429, the 503 with `Retry-After: 5`, and the Express 404. A supertest matrix in the route tests, through `createApp()`, proves ACAO plus `Access-Control-Expose-Headers: Retry-After` on each of them, and their absence for a disallowed origin and for a no-Origin request.

### CORS_ALLOWED_ORIGINS (CORS-01)
- **D-15:** Zod-validated in `environment.ts`, in the existing schema style. It's an optional comma-separated string; entries are trimmed and empty entries dropped. The default is an empty list, meaning no browser origin can read responses. Each entry must parse with `new URL()`, use `http:` or `https:`, and equal its own `URL.origin`, which rejects paths, trailing slashes, queries, credentials and `*`. Any bad entry fails startup with the existing "invalid environment" message listing the offending value. `.env.example` lists `CORS_ALLOWED_ORIGINS=http://localhost:8081`, and CLAUDE.md, AGENTS.md and README list the variable. `src/test/setup.ts` pins it, empty or a known test origin, so a local `.env` can't leak into tests (the Phase 17 `TRUST_PROXY_HOPS` lesson).

### Route colors (CORS-05) — applies
- **D-16:** The live payload, captured 2026-11-10 in `18-dash-routes-payload.txt`, carries `color` and `textColor` on all 12 routes. They are 6-digit lowercase hex with no `#` (for example `006899`/`ffffff`). CORS-05 is **in scope**. Carry them through `RouteData` → `BusRoute` → every route response (`/routes/all`, `/routes/:shortName`, and route objects embedded elsewhere) as `color` and `textColor`, in the exact form DASH sends: no `#` added and no computed contrast. The app uses DASH's `textColor` (research conflict 5).
- **D-17:** Colors are optional display data. A missing or malformed color (anything not 6 hex digits) omits that field on that route. It **never** fails or rejects the atomic `load()` (Phase 13 WR-02: coerce, don't reject; Phase 15: one bad field must not freeze updates). Tests use the `makeRoute` factories.

### Claude's Discretion
- Exact versions for Node 24.x.y, tsx, TypeScript 6.0.x, `@tsconfig/node24`, Biome 2.5.x and `cors`/`@types/cors`. Research picks them, and each must clear the 7-day release-age gate.
- Whether the CI boot smoke step is its own job or a step in the `test` job.
- The file name and location of the CORS options builder (for example `api/middleware/cors.ts`), following the existing middleware layout.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and acceptance
- `.planning/ROADMAP.md` § Phase 18 — goal, success criteria 1–5, notes (createApp, payload capture, light research)
- `.planning/REQUIREMENTS.md` — TOOL-06…TOOL-10, CORS-01…CORS-05
- `.planning/phases/18-server-toolchain-cors/18-dash-routes-payload.txt` — CORS-05 evidence (live payload, 2026-11-10)

### Research (v0.7)
- `.planning/research/SUMMARY.md` — pinned versions (Node 24, tsx, TS 6.0.3, Biome 2.5, cors 2.8.6), pitfalls 2 (trustedDependencies replaces the default list) and 4 (CORS misplacement), conflicts 5 (route colors) and 6 (optional origins)
- `.planning/research/STACK.md`, `.planning/research/PITFALLS.md`, `.planning/research/ARCHITECTURE.md` — the details behind the summary

### Prior phase decisions
- `.planning/phases/17-monorepo-restructure/17-CONTEXT.md` — D-06 (createApp deferred here), D-11 (`@types`/nodemon/ts-node placement), D-13 (script names), D-05 (`lint:fix` flag left for TOOL-10)
- `.planning/phases/17-monorepo-restructure/17-UAT.md` — signal and Superset checks to repeat under tsx (UAT 1, UAT 2), and the SIGHUP note
- `.planning/phases/17-monorepo-restructure/17-SECURITY.md` — supply-chain mitigations that must not be weakened (frozen installs, release-age, no `pull_request_target`)

### Project rules
- `.claude/CLAUDE.md` — architecture, conventions, env vars list, rate-limit and stream-cap behavior
- `bunfig.toml`, `.github/workflows/ci.yml`, `.superset/config.json`, `biome.json`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/server/src/config/environment.ts`: the Zod schema and the "invalid environment" crash path. `CORS_ALLOWED_ORIGINS` slots in next to `TRUST_PROXY_HOPS`.
- `apps/server/src/test/setup.ts`: pins env for tests (already pins `TRUST_PROXY_HOPS=0`).
- Test factories (`makeRoute`, `makeStop`) for the color tests. `supertest` and the shared-server pattern in `rateLimit.test.ts`/`healthRoutes.test.ts` for the CORS matrix.
- `tsx` 4.19.2 is already a devDependency (it was used for Phase 13 smokes), so this is a bump, not an addition.

### Established Patterns
- Per-route middleware: `upstreamRateLimiter` and `streamConcurrencyCap` are attached in `routes/predictionRoutes.ts`/`vehicleRoutes.ts`. App-level CORS ahead of the routers therefore runs first and answers preflight before any limiter.
- `sendErrorResponse` (`controllers/errorResponse.ts`) sets `Retry-After` on 503. The limiter and cap set it on 429.
- `BusDataRepository.load()` validates the whole payload and swaps it atomically. The route fields are parsed from `/info/{agency}/routes?verbose=true` (line ~134).

### Integration Points
- `apps/server/src/app.ts` lines 12–27 and `apps/server/src/test/app.ts` hold the duplicated wiring that `createApp()` replaces.
- `apps/server/src/api/controllers/PredictionStreamController.ts:73`: `res.writeHead(200, …)` for SSE.
- `apps/server/package.json` scripts and deps, `apps/server/tsconfig.json` (`@tsconfig/node20`, explicit compiler options), root `biome.json` (1.9 schema, `style.all`), `.node-version` (`20`).

</code_context>

<specifics>
## Specific Ideas

- Test origin: `http://localhost:8081` (Expo web dev server), the same value as `.env.example`.
- Route colors stay exactly as DASH sends them (`"006899"`, not `"#006899"`). Note for Phase 19: a few pairs have low contrast (for example `eda0d3`/`ffffff` on 36B), and research says to use DASH's `textColor` anyway.

</specifics>

<deferred>
## Deferred Ideas

- `streamConcurrencyCap.test.ts` occasional hang under coverage load (Phase 17 `deferred-items.md`; fix lives in `src/test/streamClient.ts`). It's not a Phase 18 requirement, so it stays a quick-task candidate. Planner: fold it in only if the toolchain bump makes it fail more often.
- `healthRoutes.test.ts` test-order dependence — backlog 999.1.
- SIGHUP survival through the `bun run` wrapper (Phase 17 UAT 2 note). Superset's own dispose is clean, so this is not required here.

</deferred>

---

*Phase: 18-server-toolchain-cors*
*Context gathered: 2026-11-10*
