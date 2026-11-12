---
phase: 18-server-toolchain-cors
reviewed: 2026-11-12T19:10:00Z
depth: standard
files_reviewed: 44
files_reviewed_list:
  - .claude/CLAUDE.md
  - .git-blame-ignore-revs
  - .github/workflows/ci.yml
  - .node-version
  - AGENTS.md
  - README.md
  - apps/server/.env.example
  - apps/server/package.json
  - apps/server/src/api/controllers/PredictionStreamController.test.ts
  - apps/server/src/api/controllers/PredictionStreamController.ts
  - apps/server/src/api/middleware/cors.test.ts
  - apps/server/src/api/middleware/cors.ts
  - apps/server/src/api/middleware/streamConcurrencyCap.test.ts
  - apps/server/src/api/middleware/upstreamRateLimit.test.ts
  - apps/server/src/api/models/BusRoute.test.ts
  - apps/server/src/api/models/BusRoute.ts
  - apps/server/src/api/repositories/BusDataRepository.test.ts
  - apps/server/src/api/repositories/BusDataRepository.ts
  - apps/server/src/api/routes/alertHygiene.test.ts
  - apps/server/src/api/routes/cors.test.ts
  - apps/server/src/api/routes/corsStream.test.ts
  - apps/server/src/api/routes/dataBootRetry.test.ts
  - apps/server/src/api/routes/dataReload.test.ts
  - apps/server/src/api/routes/dataReloadStream.test.ts
  - apps/server/src/api/routes/healthRoutes.test.ts
  - apps/server/src/api/routes/predictionRoutes.test.ts
  - apps/server/src/api/routes/rateLimit.test.ts
  - apps/server/src/api/routes/routeColors.test.ts
  - apps/server/src/api/routes/streamCap.test.ts
  - apps/server/src/api/routes/trustProxy.test.ts
  - apps/server/src/api/routes/upstreamTimeout.test.ts
  - apps/server/src/api/services/HealthService.test.ts
  - apps/server/src/api/services/StopService.test.ts
  - apps/server/src/app.ts
  - apps/server/src/config/environment.test.ts
  - apps/server/src/config/environment.ts
  - apps/server/src/config/index.ts
  - apps/server/src/createApp.ts
  - apps/server/src/test/app.ts
  - apps/server/src/test/setup.ts
  - apps/server/src/test/streamClient.ts
  - apps/server/tsconfig.json
  - biome.json
  - package.json
findings:
  critical: 0
  warning: 2
  info: 6
  total: 8
status: issues_found
---

# Phase 18: Code Review Report

**Reviewed:** 2026-11-12T19:10:00Z
**Depth:** standard
**Files Reviewed:** 44
**Status:** issues_found

## Summary

I reviewed the substantive Phase 18 changes since `e7ebe83`:
- the Node 24 pin and the CI setup-node and boot-smoke steps
- tsx in place of ts-node/nodemon
- TypeScript 6 on `@tsconfig/node24`
- the Biome 2.5.15 migration
- the `createApp()` extraction
- the `cors` middleware and `CORS_ALLOWED_ORIGINS` validation
- the DASH route `color`/`textColor` passthrough

The test files that only changed in the Biome reformat commit `86e09f1` were checked against that diff. They contain only import-order and whitespace changes. `.git-blame-ignore-revs` holds the correct full SHA.

Verification run in the worktree:
- `bun run typecheck`: clean.
- `bun run test`: 57 files, 922 tests pass, no type errors.
- `bun run build`: succeeds.
- `bun run lint`: exits 0 with the 36 warnings that already existed under Biome 1.9.4.
- Boot of `dist/app.js`: a request from the allowed origin got ACAO, `Vary: Origin` and the expose list on the 503. A preflight got 204. SIGTERM shut the server down cleanly.
- `tsc --traceResolution`: `moduleResolution: bundler` with `module: commonjs` resolves with the `require` and `types` conditions, so type resolution matches what Node loads at runtime.

The core logic is sound:
- The `cors` origin callback returning `false` makes the package call `next()` without changing the response. I confirmed this in `node_modules/cors/lib/index.js:219-221`.
- `parseHexColor` cannot reject the atomic load.
- `isExactOrigin` rejects every malformed entry the tests list.

The defects I found are a missing `Vary: Origin` on responses that get no CORS headers (the tests lock this behavior in), one assertion that cannot fail, and some config and dependency hygiene. I found no blockers.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Responses that vary by `Origin` omit `Vary: Origin` unless the origin is allowed, and the tests require the omission

**File:** `apps/server/src/api/middleware/cors.ts:19-25` (locked in by `apps/server/src/api/routes/cors.test.ts:84-87` and `apps/server/src/api/middleware/cors.test.ts:99`)

**Issue:** The same URL now returns different headers depending on the request's `Origin`. An allowed origin gets `Access-Control-Allow-Origin`. Any other origin, or no origin, gets nothing. Only the allowed variant carries `Vary: Origin`, because `cors` adds it only after the origin callback accepts. The other variant has no `Vary` at all.

The Fetch standard (CORS protocol and HTTP caches) asks a server that returns different `Access-Control-Allow-Origin` values for the same resource to send `Vary: Origin` on every variant. The reason is caching. A cache that stores the no-`Origin` response can replay it to the allowed web origin. That response has no ACAO, so the browser blocks it.

These GET responses carry an `ETag` and no `Cache-Control`, so the following can all store them:
- any reverse proxy or CDN placed in front of the API (CLAUDE.md expects one via `TRUST_PROXY_HOPS`)
- the browser's own cache

`expectNoCors` (`routes/cors.test.ts:86`) and `cors.test.ts:99` assert that the header is absent. A future fix would therefore break the suite. The tests encode the bug as required behavior.

CORS-04 ("behave exactly as before") is the stated reason. Adding `Vary: Origin` does not change the status or the body, only one cache-key header.

**Fix:** Always vary on `Origin` before delegating to `cors`. The `vary` helper de-duplicates, so allowed responses still carry a single `Origin`:

```ts
export function createCorsMiddleware(allowedOrigins: readonly string[]): RequestHandler {
    const allowed = new Set(allowedOrigins);
    const corsHandler = cors({ /* unchanged options */ });
    return (req, res, next): void => {
        // Every response from a CORS-aware server varies by Origin, allowed or not (Fetch §3.2.5).
        res.vary("Origin");
        corsHandler(req, res, next);
    };
}
```

Then change `expectNoCors` and `cors.test.ts:99` to expect `vary` to contain `origin`, and keep the assertion that no `access-control-*` header is present.

### WR-02: The test for "fails startup naming the entry" cannot fail for the `*` cases

**File:** `apps/server/src/config/environment.test.ts:157,168,178`

**Issue:** `await expect(loading).rejects.toThrow(entry)` does a substring match. The error message template in `environment.ts:59` always ends with `... credentials or *)`. So for the rows `"a wildcard"` and `"one bad entry among good ones"` (both `entry: "*"`), the assertion passes whatever entry the message names, or even with no entry at all.

The second row is the one meant to prove that the bad entry is named among good ones, and it proves nothing. If the refine reported the wrong element, for example the valid `http://localhost:8081`, the test would still pass.

**Fix:** Assert on the quoted entry as the message renders it:

```ts
await expect(loading).rejects.toThrow(`entry '${entry}'`);
```

Optionally also assert the issue path, `CORS_ALLOWED_ORIGINS.1` for the mixed row.

## Info

### IN-01: The `moduleResolution: "bundler"` comment gives the wrong reason; Node-accurate `nodenext` already emits CommonJS here

**File:** `apps/server/tsconfig.json:4-5`

**Issue:** The comment says node16/nodenext "would force module to match". With `module: nodenext` and no `"type": "module"` in `apps/server/package.json`, tsc already emits CommonJS. That setting models Node's `require` semantics exactly, which is the long-term choice the engineering principles ask for. `bundler` models a bundler, not Node.

I traced resolution: it currently uses the `require` and `types` conditions, so nothing is mis-resolved today. Still, the rationale recorded in the file is incorrect, and the setup overrides the base config's Node-accurate mode without needing to.

**Fix:** Drop both overrides and inherit `module: nodenext` / `moduleResolution: node16`, or set them to `nodenext` explicitly. Then rerun `typecheck` and `build`. If you keep `bundler`, correct the comment.

### IN-02: Preflight advertises methods no route implements and sets no `Access-Control-Max-Age`

**File:** `apps/server/src/api/middleware/cors.ts:14-30`

**Issue:** `methods` is unset, so allowed preflights answer `Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE`. I observed this live. The API has no PUT or PATCH routes.

`maxAge` is also unset, so browsers re-preflight about every 5 seconds (Chromium's default). Every `X-Device-Id` request (favorites, recents, `/predictions` with a device id) then costs two round trips.

**Fix:** `methods: ["GET", "HEAD", "POST", "DELETE"], maxAge: 600`, plus a matching assertion in `routes/cors.test.ts`.

### IN-03: `.env.example` turns on a CORS origin when copied as-is

**File:** `apps/server/.env.example:8-9`

**Issue:** The documented default is "unset or empty means no browser origin can". But the example file sets `CORS_ALLOWED_ORIGINS=http://localhost:8081`, and README and CLAUDE.md both say to start from it. A production `.env` copied from the example therefore allows a localhost dev origin unless someone notices.

**Fix:** Ship the line commented out, `# CORS_ALLOWED_ORIGINS=http://localhost:8081`. It still "lists" the value as CORS-01 requires, and it keeps the safe default.

### IN-04: `@tsconfig/strictest` is an unused devDependency

**File:** `apps/server/package.json:46`

**Issue:** This phase reshuffled devDependencies and swapped `@tsconfig/node20` for `@tsconfig/node24`. `@tsconfig/strictest` stayed, but no tsconfig extends it; `tsconfig.json` extends only `@tsconfig/node24`. CLAUDE.md says to remove obsolete paths.

**Fix:** `bun remove @tsconfig/strictest` in `apps/server`, or extend it deliberately.

### IN-05: No script runs the built server, and `start-server` no longer type-checks

**File:** `apps/server/package.json:29-30`

**Issue:** `tsx` is a devDependency, and unlike ts-node's default it does not type-check. So `start-server` and `dev-server` now run code with type errors silently, and a production-only install cannot run `start-server` at all. The only real start path is `node apps/server/dist/app.js`. It exists only inline in `ci.yml:53` and is not a package script or in the docs.

**Fix:** Add `"start": "node dist/app.js"`, call it from the CI smoke step, and note in CLAUDE.md/AGENTS.md that tsx does not type-check (run `bun run typecheck` for that).

### IN-06: The verification block is copied into four CI jobs

**File:** `.github/workflows/ci.yml:29-45, 96-112, 133-149, 170-186`

**Issue:** The 17-line "Verify Bun and Node pins, trust list and clean install" script, and the checkout, setup-node and setup-bun steps, are pasted into all four jobs. This phase grew the block with the Node pin check. Any future change has to be made four times, and one stale copy would quietly weaken a gate.

**Fix:** Move setup and verification into a local composite action (`.github/actions/setup/action.yml`) and have each job run `uses: ./.github/actions/setup`.

---

_Reviewed: 2026-11-12T19:10:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
