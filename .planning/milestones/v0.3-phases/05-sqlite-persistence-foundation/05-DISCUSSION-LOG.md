# Phase 5: SQLite Persistence Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-31
**Phase:** 5-SQLite Persistence Foundation
**Areas discussed:** SQLite driver choice, DB file location & lifecycle config, Schema creation approach, Testing strategy for the concurrency test

---

## SQLite Driver Choice

| Option | Description | Selected |
|--------|-------------|----------|
| better-sqlite3 | Synchronous API, most widely used Node SQLite driver, zero-config native bindings. Blocking calls sidestep most in-process race conditions by construction. | ✓ |
| sqlite3 | Older, callback/Promise-based async driver. Matches async-everywhere style but adds indirection for no real benefit here. | |
| @libsql/client | Async, Turso/libSQL-compatible client. Only worth it with a future hosted-libSQL/Turso migration plan. | |

**User's choice:** better-sqlite3
**Notes:** Recommended option selected without discussion.

---

## DB File Location & Lifecycle Config

### DB Path

| Option | Description | Selected |
|--------|-------------|----------|
| data/dash-tracker.sqlite, env-configurable | New git-ignored data/ dir, default path baked in, overridable via optional DB_PATH env var (Zod schema) — mirrors environment.ts pattern. | ✓ |
| Hardcoded path, no env var | Simplest — one constant, no new env var/schema. Less flexible. | |
| In-memory only (no file) | Not viable — would violate PERSIST-01 persistence requirement. Listed only to rule out. | |

**User's choice:** data/dash-tracker.sqlite, env-configurable

### Connection Lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit initialize()/close(), wired into app.ts | Mirrors BusDataRepository's getInstance()/initialize() lifecycle; gives graceful shutdown a close() hook. | ✓ |
| Eager connection at module import | Simpler, but harder to control test setup/teardown and no clean shutdown hook — cuts against SC #1. | |

**User's choice:** Explicit initialize()/close(), wired into app.ts
**Notes:** Recommended options selected without discussion; no further questions asked for this area.

---

## Schema Creation Approach

### Creation Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Inline CREATE TABLE IF NOT EXISTS at startup | Plain SQL run once during initialize(), no new dependency. | ✓ |
| Migration library (knex/umzug) | Adds a dependency and migration-file convention — overkill for a 2-table schema. | |

**User's choice:** Inline CREATE TABLE IF NOT EXISTS at startup

### Uniqueness Constraint for Bump-to-Top UPSERT

| Option | Description | Selected |
|--------|-------------|----------|
| UNIQUE(device_id, entity_type, entity_id) + ON CONFLICT...DO UPDATE | Standard SQLite UPSERT pattern — a composite UNIQUE constraint backs a single atomic INSERT ... ON CONFLICT DO UPDATE. | ✓ |
| You decide | Leave exact constraint/index naming to implementation. | |

**User's choice:** UNIQUE(device_id, entity_type, entity_id) + ON CONFLICT...DO UPDATE
**Notes:** Recommended options selected without discussion.

---

## Testing Strategy for the Concurrency Test

### Test Database

| Option | Description | Selected |
|--------|-------------|----------|
| Temp file per test suite | :memory: databases don't meaningfully exercise WAL mode/busy_timeout since there's no real file-locking to contend with; a temp file exercises the real on-disk locking path SC #3 needs. | ✓ |
| In-memory (:memory:) for everything | Faster, no filesystem cleanup, but weakens the concurrency test's guarantee. | |

**User's choice:** Temp file per test suite

### Concurrency Test Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Promise.all of many async wrapper calls, assert final row state | Fires N concurrent "bump to top" calls through the repository's public async API; asserts no exception, exactly one row, correct final timestamp. Proves UPSERT correctness for the single-process case that actually applies here. | ✓ |
| worker_threads hitting the same file from separate OS threads | More rigorous true-concurrency test, but heavier infrastructure for a server that will never have multiple OS threads writing to this file. | |

**User's choice:** Promise.all of many async wrapper calls, assert final row state
**Notes:** Recommended options selected without discussion; user confirmed "I'm ready for context" after all 4 areas.

---

## Claude's Discretion

- Exact table/column names, index naming, and the shape of the repository's public method signatures are left to planning/implementation.

## Deferred Ideas

None — discussion stayed fully within Phase 5 scope. `todo.match-phase` returned 0 matches for Phase 5.
