# Pitfalls Research

**Domain:** Adding a first SQLite persistence layer + anonymous device-ID scoping to an existing stateless Node/Express/TypeScript API (dash-tracker v0.3 — favorites & recents)
**Researched:** 2026-08-31
**Confidence:** MEDIUM (SQLite/Bun-runtime driver interaction verified via web search MEDIUM confidence; architecture-specific pitfalls derived directly from reading this codebase — BusDataRepository.ts, PredictionController.ts, test/setup.ts, tsconfig.json, package.json, vitest.config.mts — HIGH confidence)

## Critical Pitfalls

### Pitfall 1: Reaching for `bun:sqlite` because "we use Bun" — it will not load

**What goes wrong:**
`bun run dev-server` executes `nodemon --exec ts-node src/server/app.ts`, and `bun run start-server` executes `ts-node src/server/app.ts` directly. Both spawn `ts-node`, which runs on the Node.js engine (ts-node's shebang is `#!/usr/bin/env node`), not the Bun JS engine. Bun here is only the package manager and script runner — it is not executing the server's TypeScript as Bun bytecode. `bun:sqlite` is a Bun-runtime-only native binding; importing it under this execution path throws `Cannot find module 'bun:sqlite'` at startup (or at least once the code path executing `import { Database } from "bun:sqlite"` runs), even though `bun install` happily installs it as a no-op (it's a virtual builtin, not an npm package) and local ad-hoc testing with `bun run src/server/app.ts` (bypassing ts-node) would appear to work.

**Why it happens:**
The name "Bun" plus `bun.lockb`/`packageManager: bun@1.0.31` in `package.json` creates a reasonable but false assumption that the JS engine is Bun everywhere. The project's actual runtime story (Node 20 via ts-node/tsc, Bun as package manager only) is documented in CLAUDE.md's Technology Stack section but easy to miss when scaffolding a new persistence layer.

**How to avoid:**
Use `better-sqlite3` (synchronous API, mirrors this codebase's synchronous, no-Promise-wrapping repository style, works under plain Node 20 via prebuilt native bindings). Do not use `bun:sqlite` or `node:sqlite` (see Pitfall 2 for why `node:sqlite` is also out). Confirm the chosen driver by actually running `bun run dev-server` and `bun run build && bun run start-server` — not just `bun run <file>.ts` directly — since only the former reflects the real deployment path.

**Warning signs:**
`Cannot find module 'bun:sqlite'` or a TypeScript error resolving `bun:sqlite` types; a `db.ts` that works when file is bun-run standalone but crashes under `nodemon --exec ts-node`.

**Phase to address:**
Schema/repository phase (driver selection happens before any schema work) — should be one of the first decisions locked in, ideally validated with a one-line smoke script run through the actual `dev-server`/`start-server` scripts.

---

### Pitfall 2: Choosing `node:sqlite` for a "zero extra dependency" story

**What goes wrong:**
`node:sqlite` looks attractive (built into Node, no native compile step, no `node-gyp`). But it requires Node.js 22.5+ (unflagged since 22.13, stabilized in v26). This project's `@tsconfig/node20` target and CLAUDE.md's stated `Node 20` requirement mean `node:sqlite` is unavailable in the actual runtime — the import fails immediately on the CI/deploy Node version even if a developer's local machine happens to have a newer Node installed via nvm.

**Why it happens:**
Blog posts and docs about "no npm install needed" SQLite in Node don't always surface the minimum version prominently, and a developer's local Node version can silently diverge from the project's pinned/documented version.

**How to avoid:**
Stick with `better-sqlite3` (works on Node 20, mature, widely used, synchronous). If the team later upgrades the Node target past 22.5+, revisit — but that's a separate, deliberate decision, not a byproduct of this milestone.

**Warning signs:**
Works on a contributor's laptop, fails in CI/deploy with an "unsupported experimental module" or resolution error; version skew between local Node and CLAUDE.md's stated Node 20.

**Phase to address:**
Schema/repository phase, same decision point as Pitfall 1.

---

### Pitfall 3: Read-then-write "insert or bump to top" logic races under concurrent requests

**What goes wrong:**
The natural first implementation of "log this route as a recent, bumping it to the top if already present, capped at 5" is: `SELECT` existing row for `(deviceId, routeId)` → branch into `UPDATE ... SET viewedAt = now` or `INSERT`, then a second query to trim anything past the 5th most-recent row. Under concurrent requests from the same device (e.g., the Expo client hitting `/stops/nearby` then several `/predictions` calls in quick succession, or two browser tabs), two requests can both read "not present," both `INSERT`, and produce duplicate rows for the same `(deviceId, routeId)` pair — corrupting the "last 5" semantics (a route could occupy two of the five slots) and breaking any UNIQUE constraint with a raw `INSERT` that wasn't anticipating the race.

**Why it happens:**
better-sqlite3 is synchronous per-call, but Express request handlers are still concurrent at the Node event-loop level (multiple in-flight requests interleave between awaited/microtask boundaries, and recents-logging is a side effect fired from an existing controller flow that itself awaits an upstream DASH API call before or after the log-write). The gap between the `SELECT` and the `INSERT`/`UPDATE` is real even in a single-threaded process because other async work runs in between.

**How to avoid:**
Use a single atomic `INSERT INTO recents (device_id, route_id, viewed_at) VALUES (?, ?, ?) ON CONFLICT(device_id, route_id) DO UPDATE SET viewed_at = excluded.viewed_at` (UPSERT, SQLite 3.24+) instead of SELECT-then-branch. This requires a `UNIQUE(device_id, route_id)` constraint. Do the "trim to last 5" as a second statement in the same `better-sqlite3` transaction (`db.transaction(...)`) using `DELETE FROM recents WHERE device_id = ? AND route_id NOT IN (SELECT route_id FROM recents WHERE device_id = ? ORDER BY viewed_at DESC LIMIT 5)`, so insert+trim happen atomically per request.

**Warning signs:**
Recents list occasionally shows duplicate route IDs, or occasionally has more/fewer than the expected count of distinct routes; flaky test failures under a "fire N concurrent requests" style test.

**Phase to address:**
Schema/repository phase — the upsert-based write path is a repository-layer implementation detail; write a concurrency test (many parallel logRecent calls for the same device+route) as part of that phase's verification, not deferred to a later hardening pass.

---

### Pitfall 4: SQLITE_BUSY errors under concurrent writers with no timeout/WAL configured

**What goes wrong:**
SQLite's default journal mode only allows one writer at a time and blocks readers during writes; with default settings and no `busy_timeout`, a second concurrent write (e.g., two devices favoriting routes simultaneously, or a recents-log write racing a favorites-write) fails immediately with `SQLITE_BUSY: database is locked` instead of waiting — surfacing as an unhandled 500 error under any real concurrent load, including this project's own Vitest suite if tests share a file-backed DB without serialization.

**Why it happens:**
SQLite's out-of-the-box defaults are tuned for single-writer desktop use, not concurrent web-server access; `better-sqlite3`'s `new Database(path)` doesn't enable WAL or set a busy timeout unless told to.

**How to avoid:**
On repository initialization, run `db.pragma("journal_mode = WAL")` and set a busy timeout (`new Database(path, { timeout: 5000 })` or `db.pragma("busy_timeout = 5000")`) once, at startup, alongside the existing repository's `initialize()` pattern. WAL lets readers proceed while one writer is active, and the busy timeout makes a second writer retry instead of failing instantly. Given this app's actual write volume (occasional favorite toggles + recents logs, single Node process, no read replicas), WAL + a few-second busy timeout is sufficient — do not reach for a queueing library or external DB for this scale.

**Warning signs:**
Intermittent 500s under load-testing or rapid manual double-clicking of favorite/unfavorite; `SQLITE_BUSY` in logs; flaky concurrency tests.

**Phase to address:**
Schema/repository phase — WAL + busy_timeout should be set in the same initialization step that opens the DB connection, verified with an integration/concurrency test in that phase, not left as follow-up hardening.

---

### Pitfall 5: Treating `X-Device-Id` as authentication instead of a namespacing key

**What goes wrong:**
Because the PROJECT.md decision explicitly accepts "no auth system," any client can set an arbitrary `X-Device-Id` value and read or write another device's favorites/recents by guessing or reusing an ID. If the implementation additionally trusts the header for anything beyond scoping storage rows (e.g., logs it as an identity, uses it in error messages, or lets an empty/missing header silently fall back to a shared "default" bucket), it compounds the exposure — a missing-header bug could leak all-devices-merged-into-one-bucket data, which is worse than per-device isolation being merely guessable.

**Why it happens:**
"No auth for v1" is a legitimate, already-approved product tradeoff (see PROJECT.md Key Decisions), but it's easy to slide from "acceptable that IDs aren't secret" into an implementation that doesn't even validate the header is present/well-formed, or that treats it as more trustworthy than it is elsewhere in the code (e.g., using it unsanitized in a log line or SQL string).

**How to avoid:**
Treat `X-Device-Id` purely as an opaque partition key, never as an authorization proof: (1) require the header on every favorites/recents endpoint and reject with 400 if missing/empty rather than defaulting to a shared bucket; (2) validate its shape (e.g., non-empty string, reasonable max length — a UUID is the expected client format) to prevent abuse via absurdly long values or injection attempts, even though parameterized queries already prevent SQL injection; (3) do not log the raw device ID at info level routinely (it's a quasi-identifier) — align with the existing Winston convention of "not per-call noise"; (4) document the spoofing tradeoff explicitly (it already is, in PROJECT.md) so it isn't rediscovered as a "vulnerability" later — this is a deliberate, accepted v1 tradeoff, not a mitigation gap, provided the above hygiene is in place.

**Warning signs:**
Endpoints that 200 with empty results instead of 400 when the header is absent; a device ID appearing in structured logs at info level; no length/format validation on the header before it hits a query.

**Phase to address:**
Middleware/controller phase where the device-ID extraction happens (likely a small shared middleware reused by favorites and recents controllers) — validation belongs there, once, not duplicated per-controller.

---

### Pitfall 6: N+1 lookups from `BusDataRepository` when hydrating favorite/recent route IDs into full route details

**What goes wrong:**
The favorites/recents SQLite tables will store `route_id` (or `shortName`) references, not full route payloads (storing denormalized full route JSON would go stale against the in-memory `BusDataRepository`, which itself refreshes independently). The naive service-layer implementation loops over each stored favorite/recent row and calls `BusDataRepository.getRouteById(id)` or `getRouteByShortName(...)` once per row inside an `await`-heavy path, or — worse — re-queries SQLite once per row instead of fetching all rows for a device in a single query.

**Why it happens:**
It's the most obvious way to write "map stored IDs to full route objects," and because `BusDataRepository` lookups are Map-backed O(1) in-memory reads (not real N+1 network calls), the performance cost is easy to dismiss — but the correctness cost (see below) is not.

**How to avoid:**
Fetch all favorite/recent rows for a device with a single SQLite query (`SELECT route_id FROM favorites WHERE device_id = ? ORDER BY favorited_at DESC`), then map each `route_id` through `BusDataRepository.getRouteById()` (in-memory Map lookup, no loop-level query cost regardless). The real risk isn't SQLite N+1 — it's a stored route ID that no longer exists in `BusDataRepository` (route removed/renamed upstream at DASH, or `refreshData()` ran between favoriting and listing). Decide explicitly whether the service silently filters out orphaned IDs from the response or surfaces a partial-result marker — don't let `getRouteById()` returning `undefined` propagate as a thrown error or a `null` entry in the array without a deliberate decision, since `BusDataRepository.assertInitialized()` throws only on an uninitialized repo, not a missing route.

**Warning signs:**
A `.map()` over favorite IDs that doesn't handle `undefined` from `getRouteById`/`getRouteByShortName`; a crash (or a `null` polluting the API response) after a `refreshData()` cycle changes route IDs; favorites/recents service issuing one SQL query per row instead of one query per request.

**Phase to address:**
Service phase (route-ID-to-route-details mapping is business logic, sitting above the repository) — should be covered by a test that favorites/logs a route ID, then simulates that ID being absent from `BusDataRepository` (mock `getRouteById` returning `undefined`) and asserts the service's chosen behavior (filter vs. error).

---

### Pitfall 7: SQLite file path/permissions break in the actual deployment environment

**What goes wrong:**
A relative path like `new Database("./data/app.db")` resolves against `process.cwd()`, which differs between `bun run dev-server` (repo root), `bun run build && bun run start-server`/`node dist/...` (also typically repo root, but not guaranteed for all deploy targets), and containerized or PaaS deployments where the working directory or writable filesystem differs (e.g., ephemeral filesystems that reset on redeploy, or a read-only root with only `/tmp` or a mounted volume writable). If the directory doesn't exist, `better-sqlite3`'s `new Database(path)` throws (it does not create parent directories); if the process lacks write permission to that directory, the same happens.

**Why it happens:**
Locally everything "just works" because the repo root is writable and `cwd` is predictable in dev; the gap only surfaces in CI (which may run from a different directory) or in production deploy environments not yet chosen for this project (PROJECT.md doesn't specify a deploy target yet).

**How to avoid:**
Add a `DATABASE_PATH` (or similar) env var to the existing Zod-validated `environmentSchema` in `src/server/config/environment.ts` (following the exact pattern already used for `DASH_API_BASE_URL` etc.), defaulted sensibly for local dev (e.g., `./data/favorites.db`), and have the repository's `initialize()` step explicitly create the parent directory (`fs.mkdirSync(dirname(path), { recursive: true })`) before opening the DB — don't assume it exists. Fail loudly (crash on startup, consistent with the existing Zod-validated env-var crash-on-missing convention) rather than silently falling back to an in-memory `:memory:` DB if the configured path is unwritable, since that would silently lose persistence.

**Warning signs:**
Works locally, fails in CI/deploy with `SQLITE_CANTOPEN`; favorites/recents mysteriously reset after every deploy (symptom of an in-memory fallback or an ephemeral filesystem that isn't being flagged to the user).

**Phase to address:**
Schema/repository phase — path resolution and directory creation belong in the repository's `initialize()`, mirroring `BusDataRepository`'s `initialize()`/`applyData()` pattern; env var addition belongs in the same phase's config changes.

---

### Pitfall 8: SQLite test state leaking between Vitest files/tests, breaking the existing singleton-reset convention

**What goes wrong:**
This codebase's established pattern (seen in `BusDataRepository.test.ts`) is `BusDataRepository.instance = undefined` in `beforeEach` via `@ts-expect-error` to force a fresh in-memory singleton per test. A new SQLite-backed favorites/recents repository is a *stateful, file-backed* singleton — resetting the JS instance reference alone does not reset the underlying SQLite file/table contents. If tests share one on-disk DB file (or even one shared `:memory:` connection reused across the reset singleton), rows written by one test (or one test file, since Vitest can run files in parallel worker processes) leak into the next, producing order-dependent test failures (a "no cap" favorites test polluted by a leftover row from a "recents capped at 5" test) and, if the same file path is used for both dev and test, dev data corruption or dev DB rows silently used as fixtures.

**Why it happens:**
Copying the existing singleton-reset test pattern verbatim without accounting for the new persistence dimension — the existing repository is pure in-memory Maps with no external state to clean up, so `instance = undefined` was sufficient there; it is not sufficient once a file/connection is involved.

**How to avoid:**
Use a fresh `:memory:` SQLite database per test (or per test file), not a shared file path — `new Database(":memory:")` is fast and gives true isolation with zero cleanup burden. Inject the DB path/instance via the existing factory-DI pattern (`createFavoritesRepository(dbPath)` or `createFavoritesRepository(db)`) rather than hardcoding `getInstance()` internals, so tests can construct an isolated instance directly instead of fighting a singleton. If a singleton is still required for parity with `BusDataRepository`, reset it in `beforeEach`/`afterEach` by closing the previous connection (`db.close()`) and reopening a fresh `:memory:` instance — closing matters because leaving connections open across tests can exhaust file handles or leave WAL files on disk if any test accidentally uses a real path. Add `*.db`, `*.db-wal`, `*.db-shm` to `.gitignore` regardless, in case a test or local run ever points at a real path.

**Warning signs:**
Tests pass individually but fail when run as a full suite (`bun run test`) or fail only in a specific order; leftover `*.db-wal`/`*.db-shm` files appearing in the repo after running tests; a "no cap" favorites test seeing more rows than it inserted.

**Phase to address:**
Schema/repository phase for the DI shape (constructor/factory accepting an injectable DB path or connection); test-writing step of that same phase for the actual `:memory:` isolation pattern — this should be nailed down before any service/controller tests are written on top of it, since they'll copy whatever pattern the repository tests establish.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|--------------------|-----------------|------------------|
| No auth on `X-Device-Id` (spoofable identity) | Ships v1 without an auth system; matches PROJECT.md's explicit decision | Any client can read/write another device's favorites by guessing/reusing an ID; can't later "claim" anonymous data into a real account without a migration story | Acceptable for v1 as already decided — but only if PROJECT.md's rationale ("device ID becomes a natural foreign key if real accounts are added later") is honored, i.e. the schema uses device ID as a plain scoping column, not baked into route/table design in a way that resists adding a `user_id` column later |
| Storing only `route_id` (not denormalized route JSON) in favorites/recents tables | Simpler schema, no staleness between stored snapshot and live route data | Requires a join-by-lookup against `BusDataRepository` on every read, and an explicit decision about orphaned IDs (Pitfall 6) | Always acceptable here — it's the correct choice, not really a shortcut, given `BusDataRepository` is the single source of truth for route shape |
| Single shared `better-sqlite3` connection object reused across the app (no connection pool) | Simplest possible setup; matches SQLite's single-writer nature anyway | None significant at this scale — a pool is actively wrong for SQLite (better-sqlite3 is explicitly synchronous/single-connection by design) | Always acceptable at this project's scale (single Node process, embedded DB) |
| Deferring a migration framework (e.g., raw `CREATE TABLE IF NOT EXISTS` in `initialize()` instead of a migrations library) | Zero new dependency, fast to ship | No versioned schema history; a future column addition requires hand-written `ALTER TABLE` guarded by a manual check, which gets fragile past 2-3 schema changes | Acceptable for v1's two simple tables (favorites, recents); revisit if a third migration is ever needed post-launch |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|------------------|--------------------|
| Recents auto-logging from existing `PredictionController`/`StopController` | Bolting the SQLite write directly into the existing controller (import the new repository/service inline), coupling an unrelated concern into an already-tested controller and breaking the "services throw, controllers translate" layering | Log recents from the *service* layer (`PredictionService`/`StopService`) via an injected recents-logging dependency (factory DI, matching `createX(repository)` convention), so the controller stays untouched and the existing controller test suites (`PredictionController.test.ts`, `StopController.test.ts`) don't need to start mocking a DB dependency they have no business knowing about |
| Recents logging failing should not break the primary request | A recents-log write throwing (e.g., transient `SQLITE_BUSY`) propagates up and turns a successful predictions/stop lookup into a 500 | Fire-and-forget or explicitly try/catch-and-log the recents write so a persistence hiccup never degrades the core value ("riders can always see accurate predictions") — log via the existing Winston logger at `warn`, don't let it reach the controller's error-mapping path |
| `BusDataRepository` singleton lifecycle vs. new favorites/recents repository lifecycle | Assuming the new repository needs the same async `initialize()` gate as `BusDataRepository` (which waits on a network fetch) | SQLite open + `CREATE TABLE IF NOT EXISTS` + WAL/pragma setup is effectively synchronous/fast — still wire it into `app.ts`'s existing "init repository → start Express" sequence for consistency, but it doesn't need the same in-flight-promise dedup complexity `BusDataRepository.initialize()` has (that complexity exists there specifically because concurrent callers could trigger duplicate network fetches — not a concern for a local file open) |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Unbounded favorites list (explicitly "no cap" per requirements) fully hydrated against `BusDataRepository` on every list call | Slightly higher response latency/payload size as a device accumulates many favorites | Acceptable as scoped — no pagination requirement was set, and even hundreds of favorites is trivial for in-memory Map lookups + a small JSON response; don't add speculative pagination now | Would only matter at favorite counts in the thousands per device, far beyond realistic usage for a personal transit app |
| Recents-logging write on the hot path of every prediction/stop request | Adds a synchronous SQLite write (better-sqlite3 is synchronous) to the latency of every prediction lookup, including the 30s-polled SSE stream's initial/fallback path | Keep the write cheap (single UPSERT + trim, both indexed) and don't block the HTTP response on it if it can be deferred safely (see Integration Gotchas row above); do not log recents from inside the SSE poll loop itself (would write on every 30s tick per stop rather than per client action) — log at the point a client actually requests/subscribes, not on each background poll | Would matter if request volume grew large enough for synchronous disk writes to dominate latency — not a concern at this project's current scale, but worth avoiding logging on every SSE poll tick regardless of scale, since that's a correctness issue (recents should reflect what a rider looked at, not server-side polling cadence) |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Trusting `X-Device-Id` for anything beyond storage scoping (see Pitfall 5) | Cross-device data read/write via header spoofing (accepted tradeoff, but must not be compounded) | Validate header presence/shape; never treat it as proof of identity for anything sensitive; document as an accepted v1 limitation |
| String-concatenating `route_id`/`device_id` into SQL instead of parameterized queries | Classic SQL injection, even though device IDs are "just" a scoping key | Use `better-sqlite3`'s prepared statements with `?` placeholders exclusively — never template literals into SQL strings |
| Logging full device IDs at `info` level on every favorite/recent action | Turns Winston logs into a per-device activity trail (privacy-adjacent even for anonymous IDs), and contradicts CLAUDE.md's "not per-call noise" logging convention | Log only aggregate/error-level events (e.g., "recents write failed") without the raw device ID in routine info logs |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|--------------|-------------------|
| Recents silently including a route the rider only glanced at via an unrelated background mechanism (e.g., an SSE poll tick, not an explicit client action) | "Recent routes" list feels wrong/noisy, doesn't reflect what the rider actually looked at | Only log a recent on an explicit client-initiated lookup (REST prediction/stop call, or SSE *subscribe* action), never on the server's internal 30s poll refresh |
| Favoriting the same route twice (double-tap, retry after slow network) silently creating a duplicate favorite or bumping "favorited-at" unexpectedly | Route jumps in the favorites list ordering ("most-recently-favorited-first") from an accidental re-tap, confusing the rider | Make favorite-add idempotent via the same UPSERT pattern as recents (`ON CONFLICT DO NOTHING` for favorites, since favoriting an already-favorited route shouldn't change its position — unlike recents, which should bump) |

## "Looks Done But Isn't" Checklist

- [ ] **Recents auto-logging:** Often implemented only on the REST predictions endpoint — verify it also fires on the SSE subscribe path and on stop-discovery lookups (`GET /:shortName/stops`, `/stops/nearby`), per the "any prediction/stop lookup" requirement.
- [ ] **Favorites ordering:** "Most-recently-favorited-first" often gets implemented as insertion order or `rowid` order — verify it's explicitly `ORDER BY favorited_at DESC` and that re-favoriting an already-favorited route is a no-op for ordering (doesn't silently re-bump).
- [ ] **Concurrent-write safety:** A single-request manual test looks correct; verify with an actual concurrent-requests test (e.g., `Promise.all` of N parallel recents-log calls for the same device+route) that no duplicates or lock errors occur.
- [ ] **Missing/malformed `X-Device-Id`:** Easy to test only the happy path; verify a 400 (or equivalent) response when the header is absent, empty, or absurdly long — not a silent empty-array or shared-bucket fallback.
- [ ] **Orphaned route IDs:** Verify favorites/recents listing doesn't crash or return `null`/`undefined` entries when a stored route ID no longer exists in `BusDataRepository` (e.g., after a `refreshData()` cycle changes upstream route IDs).
- [ ] **Test isolation:** Verify the full suite (`bun run test`, not individual files) passes repeatedly in a row — file-backed or shared-connection SQLite state leaking between tests often only shows up on full-suite or repeated runs, not single-file runs.
- [ ] **DB file location in the actual npm scripts:** Verify `bun run build && bun run start-server` (or however this deploys) actually creates/opens the DB successfully from that entry point's `cwd`, not just `bun run dev-server`.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|-----------------|-------------------|
| Chose `bun:sqlite`/`node:sqlite`, discovered incompatibility late | LOW | Swap the driver import for `better-sqlite3` behind the repository's existing constructor/factory boundary — if DI was done correctly (Pitfall 8's recommendation), only the repository's internals change, not services/controllers/tests |
| Duplicate recent-route rows from a race condition already shipped | MEDIUM | Add the `UNIQUE(device_id, route_id)` constraint via a migration step that first de-dupes existing rows (keep the max `viewed_at` per pair), then backfill the constraint; switch write path to UPSERT |
| DB file path broke in a deploy environment, data reset | MEDIUM | No recovery of lost favorites/recents (ephemeral/anonymous data, low stakes per PROJECT.md's own framing) — fix is purely forward-looking: add the `DATABASE_PATH` env var + directory-creation fix, document the deploy target's required writable/persistent volume |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|--------------------|-----------------|
| `bun:sqlite`/`node:sqlite` incompatibility (Pitfalls 1, 2) | Schema/repository phase | Run `bun run dev-server` and `bun run build && bun run start-server` end-to-end, not just unit tests, before considering the driver decision closed |
| Read-then-write race in recents "bump to top" (Pitfall 3) | Schema/repository phase | Concurrency test: fire N parallel `logRecent(deviceId, routeId)` calls for the same pair, assert exactly one row results |
| `SQLITE_BUSY` under concurrent writers (Pitfall 4) | Schema/repository phase | Concurrency test: fire N parallel writes across *different* device/route pairs simultaneously, assert none throw `SQLITE_BUSY` within the configured timeout |
| Device-ID spoofing hygiene (Pitfall 5) | Middleware/controller phase | Test: missing/empty `X-Device-Id` header returns 400 on every favorites/recents endpoint; header is never present in an info-level log assertion |
| N+1 / orphaned-route handling (Pitfall 6) | Service phase | Test: mock `BusDataRepository.getRouteById` to return `undefined` for a stored favorite ID, assert the service's chosen (documented) behavior, not a crash |
| DB file path/permissions (Pitfall 7) | Schema/repository phase | Config test: `DATABASE_PATH` validated via the same Zod schema pattern as existing env vars; repository `initialize()` creates missing parent directories |
| Test isolation / singleton state leakage (Pitfall 8) | Schema/repository phase (DI shape) + carried into every subsequent test file in this milestone | Run `bun run test` (full suite) repeatedly and in isolation per-file; assert no order-dependent failures |

## Sources

- Direct codebase reading (HIGH confidence): `src/server/api/repositories/BusDataRepository.ts`, `BusDataRepository.test.ts`, `src/server/api/controllers/PredictionController.ts`, `src/server/test/setup.ts`, `vitest.config.mts`, `tsconfig.json`, `package.json`, `.planning/PROJECT.md`
- [SQLite | Bun Docs](https://bun.com/docs/runtime/sqlite) — bun:sqlite is Bun-runtime-specific (MEDIUM confidence, web search)
- [`node:sqlite` not available in Bun? · oven-sh/bun Discussion #27092](https://github.com/oven-sh/bun/discussions/27092) — runtime-specific SQLite module boundaries (MEDIUM confidence)
- [Write-Ahead Logging — SQLite official docs](https://sqlite.org/wal.html) — WAL concurrency semantics (MEDIUM confidence, web search verified against official source)
- [What to do about SQLITE_BUSY errors despite setting a timeout — Bert Hubert](https://berthub.eu/articles/posts/a-brief-post-on-sqlite3-database-locked-despite-timeout/) — busy_timeout / BEGIN IMMEDIATE guidance (MEDIUM confidence)
- [SQLite Upsert — SQLite Tutorial](https://www.sqlitetutorial.net/sqlite-upsert/) — UPSERT syntax and atomicity (MEDIUM confidence)
- [SQLite | Node.js v26 Documentation](https://nodejs.org/api/sqlite.html) and [nodejs/node Issue #57445 — stabilization of node:sqlite](https://github.com/nodejs/node/issues/57445) — node:sqlite version requirements (MEDIUM confidence)

---
*Pitfalls research for: dash-tracker v0.3 — Favorited & Recent Routes (SQLite persistence + anonymous device-ID scoping)*
*Researched: 2026-08-31*
