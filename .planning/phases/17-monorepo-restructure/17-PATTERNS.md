# Phase 17: Monorepo Restructure - Pattern Map

**Mapped:** 2026-10-22
**Files analyzed:** 17
**Analogs found:** 16 / 17 (`bunfig.toml` has no analog)

Phase 17 changes no code under `src/` (D-06). Every "analog" is the pre-move version of the same file, or a sibling config. Copy its content and change only the paths.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/server/src/**` (git mv of `src/server/**`) | source tree | n/a | itself (100% rename) | exact |
| `apps/server/package.json` (git mv of `package.json`) | config | n/a | `package.json` | exact |
| `package.json` (new root) | config | fan-out | `package.json` (scripts/metadata) | role-match |
| `apps/server/tsconfig.json` (git mv) | config | n/a | `tsconfig.json` | exact, no edits needed |
| `apps/server/vitest.config.mts` (git mv) | config / test | n/a | `vitest.config.mts` | exact, path edits |
| `apps/server/.env.example` (git mv) | config | file-I/O (dotenv) | `.env.example` | exact |
| `bunfig.toml` (new root) | config | n/a | none | no analog |
| `bun.lock` (regenerated) | lockfile | n/a | `bun.lock` | exact (no drift, D-10) |
| `.github/workflows/ci.yml` | CI config | n/a | itself | exact |
| `.superset/config.json` | dev-env config | n/a | itself | exact |
| `biome.json` | config | n/a | itself | probably no change |
| `.gitignore` | config | n/a | itself | verify only |
| `apps/server/src/test/setup.ts` | test setup | env | itself | exact (pin TRUST_PROXY_HOPS) |
| `apps/server/src/.eslintrc`, `.eslintignore` | config | n/a | n/a | delete in later commit (D-08) |
| `apps/server/README.md` (stub, 9 lines) | doc | n/a | `README.md` (206 lines) | delete or rewrite |
| `.claude/CLAUDE.md`, `AGENTS.md`, `README.md` | doc | n/a | themselves | exact, path edits |
| `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md` | doc | n/a | themselves | reword MONO-01 / SC3 (D-04) |

## Pattern Assignments

### `apps/server/package.json` (git mv of root `package.json`)

**Analog:** current `/package.json`. Scripts as they are today:
```json
"packageManager": "bun@1.0.31",
"private": true,
"scripts": {
    "lint": "biome check .",
    "lint:fix": "biome check . --apply-unsafe",
    "build": "rm -rf dist && tsc",
    "format": "biome check .",
    "format:write": "biome check . --write",
    "test": "vitest --run --typecheck",
    "test:coverage": "vitest --run --typecheck --coverage",
    "start-server": "ts-node src/server/app.ts",
    "dev-server": "nodemon --exec ts-node src/server/app.ts"
},
```
Edits in the config commit:
- `name` → `@dash-tracker/server`. Drop `packageManager` (root only). Drop `lint`, `lint:fix`, `format`, `format:write` (D-04/D-05: root only).
- **cwd-relative breakage:** `start-server` / `dev-server` → `ts-node src/app.ts` / `nodemon --exec ts-node src/app.ts`.
- Add `"typecheck": "tsc --noEmit"`. Note that `tsconfig.json` excludes `src/**/*.test.ts`, so tests are type-checked only by vitest `--typecheck`, which is acceptable per Claude's Discretion.
- D-09: replace every `^x` with the exact version `bun.lock` resolves. Current caret entries: `@types/better-sqlite3`, `@types/express`, `@types/winston`, `axios`, `better-sqlite3`, `dotenv`, `express`, `nodemon`, `ts-node`, `winston`, `zod`, `@biomejs/biome`, `@types/supertest`, `supertest`, `typescript`.
- TOOL-11: `@vitest/coverage-v8` `2.1.5` → `3.2.6` (matches `vitest: 3.2.6`).
- `@biomejs/biome` is needed by the root `lint`. Either keep it here (hoisted, so `biome` resolves from the root under the hoisted linker) or move it to the root `devDependencies`. Moving it is cleaner, since the root runs it. It must stay at the same resolved version (D-10).
- Keep `@types/*`, `nodemon` and `ts-node` in `dependencies` (D-11).
- `main`/`exports`/`types` `./dist/index.js` are stale (there is no `index.ts`), but leave them: no behavior change.
- better-sqlite3 native build: add `"trustedDependencies": ["better-sqlite3"]` to the **root** package.json (Bun reads it there) if 1.3.14 does not run its install script by default.

### `package.json` (new root)

**Analog:** the metadata block of the current `package.json` (name, author, repository, bugs, license, private). New shape per D-04/D-05/D-12/D-13:
```json
{
    "name": "dash-tracker",
    "private": true,
    "packageManager": "bun@1.3.14",
    "workspaces": ["apps/*"],
    "scripts": {
        "lint": "biome check .",
        "lint:fix": "biome check . --apply-unsafe",
        "format": "biome check .",
        "format:write": "biome check . --write",
        "build": "bun run --filter './apps/*' build",
        "test": "bun run --filter './apps/*' test",
        "test:coverage": "bun run --filter './apps/*' test:coverage",
        "typecheck": "bun run --filter './apps/*' typecheck",
        "dev:server": "bun run --filter @dash-tracker/server dev-server"
    },
    "devDependencies": { "@biomejs/biome": "<exact locked 1.9.x>" }
}
```
`--filter` runs with cwd set to the workspace (ARCHITECTURE.md), which is what makes `.env`, `data/` and `coverage/` resolve under `apps/server/`.

### `apps/server/tsconfig.json`

**Analog:** current `tsconfig.json`. `"rootDir": "./src"`, `"outDir": "./dist"`, `"include": ["src/**/*"]`, `"exclude": ["node_modules", "dist", "coverage", "src/**/*.test.ts"]`. All of these are config-relative, so the file needs no edits after the move. Output becomes `apps/server/dist/app.js` instead of `dist/server/app.js`, which is harmless because nothing references it.

### `apps/server/vitest.config.mts`

**Analog:** current `vitest.config.mts` (whole file, lines 6-22):
```ts
test: {
    root: dirname(fileURLToPath(import.meta.url)),
    globals: true,
    setupFiles: ["src/server/test/setup.ts"],
    coverage: {
        include: ["src/**/*.ts"],
        exclude: ["src/**/*.test.ts", "src/server/test/**", "src/server/app.ts", "src/server/config/**"],
        thresholds: { branches: 80, functions: 80, lines: 80, statements: 80 },
```
**cwd-relative breakage:** `setupFiles` → `src/test/setup.ts`, and the excludes → `src/test/**`, `src/app.ts`, `src/config/**`. If these are not updated, the setup file is not found and every env-dependent test fails. Wrong excludes change the coverage numbers. `root` is config-relative already. Coverage output `coverage/` lands in `apps/server/coverage/`.

### `apps/server/src/test/setup.ts`

**Analog:** itself (5 lines):
```ts
process.env.DASH_API_BASE_URL = "https://api.test.example.com";
process.env.DASH_API_AGENCY = "test-agency";
process.env.DASH_API_KEY = "test-api-key";
process.env.PORT = "3000";
process.env.DASH_API_TIMEOUT_MS = "200";
```
This is the WR-04 fix (Claude's Discretion): add `process.env.TRUST_PROXY_HOPS = "0";` in the same style. `environment.ts` runs `dotenv.config()`, which does not override variables that are already set, so a developer's local `.env` value can no longer leak into `rateLimit.test.ts:274` ("with the default TRUST_PROXY_HOPS=0 ..."). Also check `trustProxy.test.ts` and `streamCap.test.ts`, which reference `TRUST_PROXY_HOPS` too, to confirm they set or stub it themselves. Note: this is a test-helper edit. D-06 ("no code changes to `src/`") is about app code, so confirm in the plan that this is allowed.

### `.github/workflows/ci.yml`

**Analog:** itself. Each of the 4 jobs repeats this step block:
```yaml
steps:
  - name: Checkout Git repository
    uses: actions/checkout@v4
  - name: Setup Bun
    uses: oven-sh/setup-bun@v2
  - name: Install dependencies with Bun
    run: bun install --frozen-lockfile
```
Edits (D-07):
- `on:` add `pull_request:` next to `push: branches: [main]`.
- Setup Bun: add `with: bun-version-file: package.json` in all 4 jobs.
- After install, add in all 4 jobs: `- name: Verify clean tree` / `run: git diff --exit-code && test -z "$(git status --porcelain)"`.
- Codecov step: `files: ./coverage/clover.xml` → `files: ./apps/server/coverage/clover.xml` (**cwd-relative breakage**).
- `run: bun run build|lint|format|test:coverage` stay unchanged, because the root scripts fan out.

### `.superset/config.json`

**Analog:** itself:
```json
{
    "setup": ["bun install", "[ -f .env ] || /Users/trawal/.superset/dash-tracker-setup.sh"],
    "run": ["bun run dev-server"]
}
```
**cwd-relative breakage:** the external script writes `$(pwd)/.env`. New shape:
```json
{
    "setup": ["bun install --frozen-lockfile", "cd apps/server && { [ -f .env ] || /Users/trawal/.superset/dash-tracker-setup.sh; }"],
    "run": ["bun run dev:server"]
}
```

### `bunfig.toml` (new, no analog)

Use STACK.md. At minimum: `[install]` `exact = true` (D-09), and `linker = "hoisted"` (PITFALLS: 1.3 defaults workspaces to the isolated linker; pinning hoisted keeps resolution and `biome`/`tsc` bins the same as today). Use 4-space/TOML style per `.editorconfig`.

### `biome.json`

**Analog:** itself. `"files": { "ignore": ["node_modules", "dist", "coverage", ".planning", ".gsd"] }`. Biome 1.9 ignore entries are unanchored globs, so they still match `apps/server/dist`, `apps/server/coverage` and nested `node_modules`. Verify with `bun run lint` from the root. `$schema: ./node_modules/@biomejs/biome/...` needs biome hoisted to the root `node_modules`.

### `.gitignore`

**Analog:** itself. The relevant patterns `coverage`, `node_modules/`, `.env`, `dist`, `data/` and `bun.lockb` are all unanchored, so they match under `apps/server/`. Verify only: `git check-ignore apps/server/.env apps/server/data/x apps/server/coverage apps/server/dist`. No edit expected.

### `.claude/CLAUDE.md`, `AGENTS.md`, `README.md` (D-14)

**Analog:** themselves. Lines to rewrite (same in both CLAUDE.md and AGENTS.md):
- Install line (CLAUDE.md:13 / AGENTS.md:7): remove the Bun 1.0.31 workaround. `packageManager` is 1.3.14.
- Tech stack line (CLAUDE.md:34 / AGENTS.md:17): same 1.0.31 text.
- Dev server (CLAUDE.md:14 / AGENTS.md:8): `bun run dev:server`, or `bun run dev-server` inside `apps/server`.
- Single test (CLAUDE.md:20): `bun run test -- src/api/models/BusRoute.test.ts` from `apps/server` (vitest filters relative to its root).
- Setup file (CLAUDE.md:25): `apps/server/src/test/setup.ts`.
- "rooted at `src/server/`" (CLAUDE.md:48 / AGENTS.md:28) → `apps/server/src/`.
- Architecture table and bullets (CLAUDE.md:63-75 / AGENTS.md:40-52): every `src/server/...` → `apps/server/src/...`.
- Endpoints bullet (AGENTS.md:51 and the CLAUDE.md equivalent): add stops, favorites/recents, nearby, `/predictions/stream` and `/vehicles`. Build the list from `apps/server/src/api/routes/*.ts`.
- Add a one-time note: move your local `.env` and `data/` into `apps/server/` by hand.
- Grep check: `grep -rn "src/server\|1\.0\.31\|coverage/clover" .claude AGENTS.md README.md .github .superset` should return nothing afterward.

## Shared Patterns

### cwd-relative paths the move breaks (full inventory)
| Path | Where | Resolves against | Fix |
|---|---|---|---|
| `.env` | `apps/server/src/config/environment.ts:5` `dotenv.config()` | process cwd | Workspace scripts run with cwd = `apps/server`. Developer moves `.env` there by hand (doc note). No code change. |
| `data/dash-tracker.sqlite` | `environment.ts` `DB_PATH` default | process cwd | Same as above. Move `data/` by hand. |
| `src/server/app.ts` | `start-server`, `dev-server` scripts | cwd | → `src/app.ts` |
| `src/server/test/setup.ts`, coverage excludes | `vitest.config.mts` | vitest `root` | → `src/test/...` |
| `./coverage/clover.xml` | ci.yml Codecov | repo root | → `./apps/server/coverage/clover.xml` |
| `$(pwd)/.env` | Superset setup script | Superset cwd (repo root) | `cd apps/server` first |
| `bun run dev-server` | Superset `run` | root | → `bun run dev:server` |
| `node_modules/typescript/lib` | `.vscode/settings.json` `js/ts.tsdk.path` | repo root | Still works if TS is hoisted. Verify. |
| `./node_modules/@biomejs/biome/configuration_schema.json` | `biome.json` `$schema` | repo root | Still works if biome is installed at the root |

`tsconfig.json` and `vitest.config.mts` `root` are config-relative and move cleanly. App source has no `__dirname`/`process.cwd()` path logic.

### Rename-commit rule
Commit 1 (after the Bun pin) is `git mv src/server apps/server/src`, plus `git mv package.json tsconfig.json vitest.config.mts .env.example apps/server/`, with **no content edits**. Gate: `git show --stat -M HEAD` shows only `=>` lines at 100%. Create the new root `package.json` in the **next** commit; otherwise git may pair it with the moved one and drop the rename similarity.

### Stale artifacts
`package-lock.json` (tracked, stale) is not mentioned in CONTEXT. Flag it to the planner: deleting it fits the "no backward compat" principle but is outside the locked decisions. Ask before including it.

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `bunfig.toml` | config | The repo has no Bun config yet. Use STACK.md / PITFALLS.md settings. |

## Metadata

**Analog search scope:** repo root configs, `.github/workflows`, `.superset`, `.vscode`, `src/server/config`, `src/server/test`, docs
**Files scanned:** ~20
**Pattern extraction date:** 2026-10-22
