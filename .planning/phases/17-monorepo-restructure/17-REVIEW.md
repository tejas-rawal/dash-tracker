---
phase: 17-monorepo-restructure
reviewed: 2026-10-23T17:38:06Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - .claude/CLAUDE.md
  - .github/workflows/ci.yml
  - .gitignore
  - .superset/config.json
  - AGENTS.md
  - README.md
  - apps/server/package.json
  - apps/server/src/api/middleware/streamConcurrencyCap.test.ts
  - apps/server/src/api/repositories/BusDataRepository.test.ts
  - apps/server/src/api/repositories/FavoritesRecentsRepository.test.ts
  - apps/server/src/api/services/NearbyPredictionService.test.ts
  - apps/server/src/test/setup.ts
  - apps/server/tsconfig.typecheck.json
  - apps/server/vitest.config.mts
  - bunfig.toml
  - package.json
findings:
  critical: 0
  warning: 8
  info: 7
  total: 15
status: issues_found
---

# Phase 17: Code Review Report

**Reviewed:** 2026-10-23T17:38:06Z
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

I reviewed the phase's changes from `8b9f457..HEAD` with rename detection: the workspace root, `apps/server/package.json`, `bunfig.toml`, the CI workflow, the Superset config, the new `tsconfig.typecheck.json`, the four test files with type fixes, the test setup and the docs.

I also ran these checks:
- `bun run test` from the root: 53 files and 853 tests pass, exit 0.
- `bun run typecheck`: exit 0, and 53 of 53 tracked `*.test.ts` files are in the program.
- `bun run lint`: exit 0. The same 36 warnings appear on the base commit, so the phase added none.
- In a scratch workspace, a failing script run through `--filter` returns its exit code, `--` arguments reach the script, and `bun add` run inside a workspace directory follows the root `bunfig.toml` `exact = true`.

I found no blockers. The most important problems:
1. Every root script that fans out through `bun run --filter` hides all but the last 10 lines of output in an interactive terminal. That covers `dev:server`, `test`, `typecheck` and `build`, and the hidden lines include test failures and tsc errors. I confirmed this with Bun 1.3.14.
2. The phase made `typecheck` cover the test files, but CI never runs `typecheck`, so test-file type errors can come back without CI catching them.
3. The newly hardened CI still ignores `.node-version`. It also has no `permissions` block, and its actions are pinned to tags that can move.
4. The new `@dash-tracker/server` package points `main`, `exports` and `types` at `dist/index.*`, which the build never produces.
5. The exact pin kept Express 5 types (`@types/express` 5.0.0) on the Express 4.21.2 runtime.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Root `--filter` scripts hide output in a terminal, including dev-server logs, test failures and tsc errors

**File:** `package.json:11-15`
**Issue:** When stdout is a TTY, `bun run --filter` collapses each package's output to its last 10 lines (`[N lines elided]`), and the final frame stays collapsed after the script exits or fails. I reproduced this with Bun 1.3.14: a filtered script that printed 25 lines and exited 2 left only lines 16 to 25 on screen. The docs make `bun run dev:server` the main way to run the server and `bun run test` / `bun run typecheck` from the root the main way to check work. Run that way:
- the dev server's startup errors, stack traces and request logs scroll out of view;
- a failing Vitest run shows only its summary, not the failed assertion;
- a tsc run with more than 10 lines of errors loses most of them.

CI is not affected because its output is not a TTY.

**Fix:** Turn off elision for the fan-out scripts. Bun 1.3.14 supports the flag, and I confirmed `--elide-lines=0` shows every line:
```json
"build": "bun run --filter './apps/*' --elide-lines=0 build",
"test": "bun run --filter './apps/*' --elide-lines=0 test",
"test:coverage": "bun run --filter './apps/*' --elide-lines=0 test:coverage",
"typecheck": "bun run --filter './apps/*' --elide-lines=0 typecheck",
"dev:server": "bun run --cwd apps/server dev-server"
```
`--cwd` for the single long-running dev server also keeps stdin attached, so nodemon's `rs` restart command still works.

### WR-02: CI never runs `typecheck`, so the new test type-checking is not enforced

**File:** `.github/workflows/ci.yml:34-35` (also `:112-113`)
**Issue:** The phase found that nothing type-checked `*.test.ts`: `tsc` excludes the test files, and `vitest --typecheck` only checks `*.test-d.ts`. It fixed six latent errors and added `tsconfig.typecheck.json` plus a `typecheck` script. CI still runs only `build`, which uses `tsconfig.json` and excludes the tests, along with `lint`, `format` and `test:coverage`. A new type error in a test file passes CI, which brings back the exact gap this phase closed.
**Fix:** Add the step to the `build` job, or give it its own job:
```yaml
      - name: Type-check (source and tests)
        run: bun run typecheck
```

### WR-03: CI does not install the Node version in `.node-version`

**File:** `.github/workflows/ci.yml:19-24` (repeated in each job)
**Issue:**
- **What runs tests:** Vitest, tsc and the native `better-sqlite3` build run under the `node` that `bun run` finds through each bin's `#!/usr/bin/env node` line. In CI, that is whatever Node the `ubuntu-latest` image ships.
- **What the docs promise:** `.node-version` is `20`, and the README and AGENTS.md say "Node from `.node-version`".
- **Why it matters:** The test suite depends on Node-version behavior, for example the Node 20 keep-alive agent comment in `streamConcurrencyCap.test.ts:51-54` and the native module ABI. CI can therefore pass or fail on a different runtime than developers use, and it can shift whenever the runner image changes.

The "hardened CI" change pins Bun but leaves Node unpinned.
**Fix:** Add this before `Setup Bun` in each job:
```yaml
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version-file: .node-version
```

### WR-04: The CI workflow has no `permissions` block, and its actions use tags that can move

**File:** `.github/workflows/ci.yml:1-9, 18, 20, 115`
**Issue:**
- **New exposure:** The phase added a `pull_request` trigger, so the workflow now runs code from PR branches.
- **Token permissions:** With no top-level `permissions:` block, `GITHUB_TOKEN` gets the repository's default scope, which may be read/write. None of the jobs needs write access.
- **Action pins:** `actions/checkout@v4`, `oven-sh/setup-bun@v2` and `codecov/codecov-action@v4` are tags, and a tag can be repointed. `codecov-action` also receives `CODECOV_TOKEN`.

This is inconsistent with the supply-chain rules the phase applies to packages: exact pins plus a 7-day release-age gate.
**Fix:**
```yaml
permissions:
  contents: read
```
Pin each action to a full commit SHA, with the tag in a comment, for example `uses: actions/checkout@<sha> # v4.x.y`.

### WR-05: `@dash-tracker/server` advertises entry points the build never produces

**File:** `apps/server/package.json:12-13, 29`
**Issue:** `main` and `exports` point to `./dist/index.js`, and `types` points to `./dist/index.d.ts`. There is no `src/index.ts`, and `tsc` emits `dist/app.js`, `dist/api/…` and `dist/config/…`. At the old root these fields did nothing. In a workspace package they decide how `@dash-tracker/server` resolves. If a sibling workspace imports it (the roadmap plans `apps/mobile`), resolution fails. Because `exports` is set, deep imports are blocked too. CLAUDE.md says to remove obsolete paths rather than keep them.
**Fix:** Delete `main`, `exports` and `types` from `apps/server/package.json` until the package has a real public entry point. If you add one later, create `src/index.ts` and point `exports` at its built output.

### WR-06: The exact pin locks Express 5 types onto the Express 4 runtime

**File:** `apps/server/package.json:32, 37`
**Issue:** The phase changed `@types/express` from `^5.0.0` to exactly `5.0.0`, which resolves `@types/express-serve-static-core` 5.0.6, while `express` is pinned to 4.21.2. In the v5 types, `RequestHandler` returns `void | Promise<void>`. So async handlers such as `FavoritesController.ts:17` and `PredictionController.ts:24` type-check as if Express awaits them and forwards rejections, but Express 4 ignores the returned promise. Any rejection that escapes a handler's own try/catch becomes an unhandled rejection, not a 500 response. The types also allow other Express-5-only APIs and leave out Express 4 behavior.
**Fix:** Pin types that match the runtime: `"@types/express": "4.17.21"`, added with Bun 1.3.14 behind the release-age gate. Alternatively, upgrade `express` to 5.x on purpose in a separate change.

### WR-07: The Superset setup hardcodes one user's home directory

**File:** `.superset/config.json:4`
**Issue:** `/Users/trawal/.superset/dash-tracker-setup.sh` is an absolute macOS path to one person's home directory, committed to the repo. If `apps/server/.env` is missing, the `||` branch runs it. On any other user, host or Linux workspace, the command exits 127 and the workspace setup fails. The phase rewrote this line for the new layout but kept the non-portable path.
**Fix:** Resolve the path from the environment, and fall back to the template so setup still works:
```json
"[ -f apps/server/.env ] || (cd apps/server && if [ -x \"$HOME/.superset/dash-tracker-setup.sh\" ]; then \"$HOME/.superset/dash-tracker-setup.sh\"; else cp .env.example .env; fi)"
```

### WR-08: A stream-cap test can hang under full-suite load, and CI has no retry

**File:** `apps/server/src/api/middleware/streamConcurrencyCap.test.ts:327-346`
**Issue:** `deferred-items.md` records a hang in "never claims a slot for a connect the shared bucket rejects": 1 of 8 root coverage runs timed out at the 15 s limit. The likely cause is that `connectStream` (`src/test/streamClient.ts:55-57`) swallows request errors, so `connection.opened` never settles when the socket fails before a response. `test:coverage` gates CI, so this is a known intermittent CI failure on every push and PR. Its root cause has a clear, small fix. It was deferred only because of the phase's file-scope rule.
**Fix:** Make `connectStream` reject `opened` when the request errors before a response arrives. Keep ignoring errors that come after a response, which are the expected hang-ups from deliberately destroyed streams:
```ts
let rejectOpened: (error: Error) => void = () => {};
const opened = new Promise<OpenedStream>((resolve, reject) => { resolveOpened = resolve; rejectOpened = reject; });
let responded = false;
// in the response callback: responded = true;
request.on("error", (error) => { if (!responded) rejectOpened(error); });
```
Schedule this fix rather than leaving it open.

## Info

### IN-01: Unused dev dependencies were re-pinned instead of removed

**File:** `apps/server/package.json:45-46, 51`
**Issue:** `apps/server/tsconfig.json` extends neither `@tsconfig/node20` nor `@tsconfig/strictest`, and no script or config uses `tsx`; the scripts use `ts-node`. The phase pinned all three exactly, so it kept dead dependencies, against the project's "remove obsolete paths" rule. In the same file, `nodemon`, `ts-node`, `@types/better-sqlite3`, `@types/express` and `@types/winston` sit under `dependencies` instead of `devDependencies`. `@types/winston` is also a deprecated stub, because winston 3 ships its own types.
**Fix:** Remove `@tsconfig/node20`, `@tsconfig/strictest`, `tsx` and `@types/winston`. Move the tooling and `@types/*` entries to `devDependencies`.

### IN-02: The fixture factory's double cast hides drift in the default fixture

**File:** `apps/server/src/api/services/NearbyPredictionService.test.ts:27-53`
**Issue:** `as unknown as DashNearbyPredictionData` fixed the type error by switching off all checking of the object literal. The default fixture can now drift from the DASH type without any error, which is the drift the new `typecheck` was meant to catch. It also labels deliberately malformed fixtures, such as `stopId: 548` or `destinations: null`, as valid `DashNearbyPredictionData`.
**Fix:** Check the defaults and cast only the merged result:
```ts
const defaultNearbyEntry = { /* ... */ } satisfies DashNearbyPredictionData;
const makeDashNearbyPredictionData = (overrides: Record<string, unknown> = {}): DashNearbyPredictionData =>
    ({ ...defaultNearbyEntry, ...overrides }) as unknown as DashNearbyPredictionData;
```

### IN-03: Test setup pins every env var except `DB_PATH`

**File:** `apps/server/src/test/setup.ts:1-6`
**Issue:** The phase pinned `TRUST_PROXY_HOPS` so a developer's `apps/server/.env` cannot leak into tests, because `dotenv.config()` only fills unset variables. `DB_PATH` is the one optional variable left unpinned. No test currently opens the real repository without mocking `../../config`, but a future test that does would read or write the developer's real SQLite file.
**Fix:** Add `process.env.DB_PATH = ":memory:";`, or point it at a temporary path.

### IN-04: CI repeats the same steps four times, and two jobs are identical

**File:** `.github/workflows/ci.yml:16-33, 42-59, 68-85, 94-111`
**Issue:** All four jobs repeat the checkout, setup-bun, install and pin-check block word for word, so a change to the pin check has to be made in four places. The `lint` and `style` jobs both run `biome check .`, because `lint` and `format` are the same script.
**Fix:** Move the setup into a local composite action, for example `.github/actions/setup/action.yml`. Merge `lint` and `style` into one job.

### IN-05: `lint:fix` uses a deprecated Biome flag

**File:** `package.json:8`
**Issue:** `--apply-unsafe` is deprecated in Biome 1.9 and removed in 2.x. The phase rewrote the root `package.json` but kept it.
**Fix:** `"lint:fix": "biome check . --write --unsafe"`.

### IN-06: The README's new monorepo section sits beside a stack description that contradicts it

**File:** `README.md:3-4, 26-32`
**Issue:** The new section says this is an Express API in `apps/server`. The surrounding text says the backend is Firebase (Auth, Firestore, Cloud Functions) and the app is React Native, and the following feature links point to `./01-*.md` files that are not in the repo (`docs/` is git-ignored). Someone landing on the README gets two incompatible descriptions of the stack.
**Fix:** Either mark the old sections as a future product spec, or trim them to match the current Express/SQLite backend.

### IN-07: Build and type-check scope has small gaps

**File:** `apps/server/tsconfig.typecheck.json:6`, `apps/server/vitest.config.mts:5`
**Issue:**
- **Config not type-checked:** `typecheck` inherits `include: ["src/**/*"]`, so it never checks `vitest.config.mts`.
- **Test helpers in `dist/`:** The build `tsconfig.json` excludes only `src/**/*.test.ts`, so the test helpers `src/test/setup.ts`, `src/test/streamClient.ts` and `src/test/app.ts` are compiled into `dist/test/`.
- **Unused suppression:** Biome reports the `biome-ignore lint/style/noDefaultExport` on `vitest.config.mts:5` as `suppressions/unused`, because `noDefaultExport` is `off` in `biome.json`.

**Fix:**
- Add `"src/test/**"` to `tsconfig.json`'s `exclude`. Keep it included in `tsconfig.typecheck.json` by listing that file's own `exclude` explicitly, as it already does.
- Delete the unused `biome-ignore` line.

---

_Reviewed: 2026-10-23T17:38:06Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
