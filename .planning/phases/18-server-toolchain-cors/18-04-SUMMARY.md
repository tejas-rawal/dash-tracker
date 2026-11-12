---
phase: 18-server-toolchain-cors
plan: 04
subsystem: api
tags: [cors, express, zod, env, createApp, middleware]

requires:
  - phase: 18-server-toolchain-cors
    provides: "18-01: cors/@types/cors package-legitimacy approval; 18-02: tsx + TypeScript 6; 18-03: Biome 2.5.15 with the 36-warning baseline"
provides:
  - "createApp(): Express in apps/server/src/createApp.ts, shared by app.ts and src/test/app.ts"
  - "createCorsMiddleware(allowedOrigins) in apps/server/src/api/middleware/cors.ts (cors 2.8.6, exact-match origin callback)"
  - "CORS_ALLOWED_ORIGINS: Zod-validated exact-origin list exported as environment.cors.allowedOrigins"
  - "CORS mounted right after trust proxy, before express.json() and every router"
affects: [18-06, frontend, cors, deploy]

actuals:
  tokens: 6425
  tasks: 2
  commits: 4
plan_head_before: 5b0d06ef582ad16bc3c460f3e309095b78a151b0
plan_head_after: bdb7f007f5cdbbb10e6987412d58b999f1bd82ac

tech-stack:
  added: ["cors 2.8.6", "@types/cors 2.8.19 (dev)"]
  patterns:
    - "One createApp() factory for the server and every route test; app.ts keeps only process handlers, SQLite, listen and loops"
    - "cors origin as a callback over a Set, answering false for anything off the list, so non-CORS requests are untouched"
    - "Env list values: split, trim, drop empties, then .pipe(z.array(z.string().refine(...))) with the bad entry in the message"

key-files:
  created:
    - apps/server/src/createApp.ts
    - apps/server/src/api/middleware/cors.ts
  modified:
    - apps/server/src/app.ts
    - apps/server/src/test/app.ts
    - apps/server/src/config/environment.ts
    - apps/server/src/config/environment.test.ts
    - apps/server/src/test/setup.ts
    - apps/server/.env.example
    - apps/server/package.json
    - bun.lock
    - .claude/CLAUDE.md
    - AGENTS.md
    - README.md

key-decisions:
  - "Kept src/test/app.ts as a three-line createApp() default export, so none of the 15 route test files changed"
  - "cors origin is a callback, not the array: the array form adds Vary and Access-Control-Expose-Headers to every response and answers every OPTIONS, which would break CORS-04"
  - "Origin validation is url.origin === entry after new URL() and an http(s) check; the Zod issue path is CORS_ALLOWED_ORIGINS.<index>, so the error names both the variable and the entry"
  - "RED evidence captured with Vitest's JUnit reporter: its TAP reporter emits multi-line actual strings that break the YAML block"

patterns-established:
  - "createApp(): add new app-level middleware here, never in app.ts or src/test/app.ts"
  - "Decision tags in new middleware files: a bare D-xx is a Phase 18 decision, older ones name their phase"

requirements-completed: [CORS-01, CORS-02, CORS-03, CORS-04]

coverage:
  - id: D1
    description: "createApp() extraction shared by app.ts and the tests, landed as a behavior-neutral commit before CORS"
    requirement: CORS-04
    verification:
      - kind: other
        ref: "plan 18-04 Task 1 verify: node wiring check prints 'createApp wiring ok'"
        status: pass
      - kind: integration
        ref: "bun run test at 32ff276: Tests 853 passed (853)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Allowed origin gets Access-Control-Allow-Origin, Vary: Origin and the exposed Retry-After/RateLimit/RateLimit-Policy; no-Origin and disallowed-origin responses carry no Access-Control-* header"
    requirement: CORS-02
    verification:
      - kind: e2e
        ref: "plan 18-04 Task 1 verify: real dist server + curl prints 'cors tracer ok'"
        status: pass
      - kind: integration
        ref: "bun run test after 29d764e: Tests 853 passed (853), no existing test changed"
        status: pass
    human_judgment: false
  - id: D3
    description: "CORS mounted after trust proxy and before express.json() and every router, so an allowed preflight is answered 204 before the rate limiter"
    requirement: CORS-03
    verification:
      - kind: other
        ref: "plan 18-04 Task 1 verify: order check trust proxy < cors < express.json() < /api/v1"
        status: pass
      - kind: e2e
        ref: "curl OPTIONS /api/v1/favorites with allowed Origin and Access-Control-Request-Headers: X-Device-Id -> 204"
        status: pass
    human_judgment: false
  - id: D4
    description: "CORS_ALLOWED_ORIGINS parsing and startup rejection of malformed entries, naming the entry"
    requirement: CORS-01
    verification:
      - kind: unit
        ref: "apps/server/src/config/environment.test.ts#CORS_ALLOWED_ORIGINS (19 tests)"
        status: pass
      - kind: e2e
        ref: "plan 18-04 Task 2 verify: built server prints 'startup rejects bad origins' for *, trailing slash, credentials, uppercase host"
        status: pass
    human_judgment: false
  - id: D5
    description: "CORS_ALLOWED_ORIGINS documented in .env.example, CLAUDE.md, AGENTS.md and README"
    requirement: CORS-01
    verification:
      - kind: other
        ref: "plan 18-04 Task 2 verify: grep chain prints 'docs ok'"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-11-12
status: complete
---

# Phase 18 Plan 04: createApp() and CORS Summary

**One shared `createApp()` with the `cors` 2.8.6 package mounted right after `trust proxy`. It echoes only exact origins from a Zod-validated `CORS_ALLOWED_ORIGINS` and exposes `Retry-After`, `RateLimit` and `RateLimit-Policy`. A malformed entry stops startup and the error names it.**

## Performance

- **Duration:** about 5 min
- **Started:** 2026-11-12T18:42:24Z
- **Completed:** 2026-11-12T18:47:02Z
- **Tasks:** 2
- **Files modified:** 13 (2 created, 11 modified)

## Accomplishments

- `createApp(): Express` in `apps/server/src/createApp.ts` builds the one app wiring: trust proxy, CORS, `express.json()`, `GET /` and `/api/v1`. `app.ts` calls it right after `registerProcessErrorHandlers()`. `src/test/app.ts` is now just `createApp()` plus its default export, so the 15 route test files did not change.
- `createCorsMiddleware(allowedOrigins)` wraps `cors` with an origin callback over a `Set`. It sets no `credentials` and no `allowedHeaders`, so a preflight's `X-Device-Id` is echoed back. It never sends `*` and never echoes an origin that is off the list.
- `CORS_ALLOWED_ORIGINS` is optional, split on commas, trimmed, with empty entries dropped, and defaults to `[]`. Each entry must satisfy `new URL()`, be `http:`/`https:`, and equal `url.origin`. The test setup pins it to `http://localhost:8081`.
- Test count went from 853 to 872 (19 new `CORS_ALLOWED_ORIGINS` tests). Coverage thresholds pass, typecheck is clean, and lint stays at `Found 36 warnings.`

## Task Commits

1. **Task 1, commit A: extract createApp()**: `32ff276` (refactor)
2. **Task 1, commit B: CORS from CORS_ALLOWED_ORIGINS**: `29d764e` (feat)
3. **Task 2 RED: failing CORS_ALLOWED_ORIGINS validation tests**: `8152d15` (test)
4. **Task 2 GREEN: reject malformed origins and document the variable**: `bdb7f00` (feat)

**Plan metadata:** the docs commit that follows this SUMMARY.

## Evidence

### Real-server curl (CORS_ALLOWED_ORIGINS=http://localhost:8081, GET /api/v1/health/live)

Allowed (`Origin: http://localhost:8081`):
```
HTTP/1.1 200 OK
X-Powered-By: Express
Access-Control-Allow-Origin: http://localhost:8081
Vary: Origin
Access-Control-Expose-Headers: Retry-After,RateLimit,RateLimit-Policy
Cache-Control: no-store
Content-Type: application/json; charset=utf-8
```

No Origin:
```
HTTP/1.1 200 OK
X-Powered-By: Express
Cache-Control: no-store
Content-Type: application/json; charset=utf-8
```

Disallowed (`Origin: http://evil.example`):
```
HTTP/1.1 200 OK
X-Powered-By: Express
Cache-Control: no-store
Content-Type: application/json; charset=utf-8
```

Preflight and OPTIONS checks:
- `OPTIONS /api/v1/favorites` with the allowed Origin and `Access-Control-Request-Headers: X-Device-Id` answered `204` with `Access-Control-Allow-Headers: X-Device-Id`, `Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE` and no `Access-Control-Allow-Credentials`.
- Without an Origin, `OPTIONS /api/v1/predictions` still answers `200` with `Allow: GET,HEAD`, and `OPTIONS /api/v1/favorites` still answers `400`, the same as before CORS.

### Rejected startup (`CORS_ALLOWED_ORIGINS='*'`, exit 1)

```
Error: Invalid environment configuration:
  CORS_ALLOWED_ORIGINS.0: entry '*' must be an exact http(s) origin such as http://localhost:8081 (no path, trailing slash, query, credentials or *)
```

### Test count

- After Task 1: `Tests 853 passed (853)`, unchanged.
- After Task 2: `Tests 872 passed (872)` under `bun run test:coverage`. All files: 98.49% statements, 96.53% branches, 98.44% functions. `cors.ts` and `createApp.ts` are in coverage at 80% and 91.66% lines; route tests send no Origin, and plan 18-06 adds the Origin matrix.

## TDD Gate Compliance

- **RED** (`8152d15`): 12 invalid-entry rows were added, and all 12 failed with `promise resolved ... instead of rejecting` (Task 1 accepted any entry). The 7 valid rows passed. The classifier returned `RED_EVIDENCE_OK` (`target_test_failed`) on a JUnit report (37 tests, 12 failed). Semantic assessment: the target ran and failed on the planned rejection assertion, with no load, setup or collection faults. Evidence is in `.planning/phases/18-server-toolchain-cors/.tdd/18-04-red.json` and `18-04-red-junit.xml`.
- **GREEN** (`bdb7f00`): `isExactOrigin` and the Zod pipe made all 37 environment tests pass.
- **REFACTOR**: none needed.

## Files Created/Modified

- `apps/server/src/createApp.ts`: the shared Express app factory.
- `apps/server/src/api/middleware/cors.ts`: `createCorsMiddleware` with an exact-match origin callback and the exposed headers.
- `apps/server/src/app.ts`: now calls `createApp()`; listen, SQLite, loops and shutdown are unchanged.
- `apps/server/src/test/app.ts`: `createApp()` default export.
- `apps/server/src/config/environment.ts`: `CORS_ALLOWED_ORIGINS` schema, `isExactOrigin`, and `environment.cors.allowedOrigins`.
- `apps/server/src/config/environment.test.ts`: the `describe("CORS_ALLOWED_ORIGINS")` block.
- `apps/server/src/test/setup.ts`: pins `CORS_ALLOWED_ORIGINS=http://localhost:8081`.
- `apps/server/.env.example`: commented `CORS_ALLOWED_ORIGINS=http://localhost:8081`.
- `apps/server/package.json`, `bun.lock`: `cors` 2.8.6 and `@types/cors` 2.8.19. `bun pm untrusted` reports 0, and a frozen reinstall leaves the lockfile unchanged.
- `.claude/CLAUDE.md`, `AGENTS.md`, `README.md`: the env var, the createApp/CORS architecture bullet, the test pin and the README local-config sentence.

## Decisions Made

See `key-decisions` in the frontmatter. In short: the test app file stays as a thin `createApp()` export, the cors origin is a callback rather than the array, validation compares each entry to `url.origin`, and RED evidence uses the JUnit reporter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Comment text broke the plan's wiring-order check**
- **Found during:** Task 1, commit B
- **Issue:** The CORS mount comment in `createApp.ts` mentioned `express.json()`. The wiring check uses `indexOf("express.json()")`, so the comment's text sat before the CORS call and failed the order check.
- **Fix:** Reworded the comment to "the JSON body parser".
- **Files modified:** apps/server/src/createApp.ts
- **Verification:** The check prints `createApp wiring ok`.
- **Committed in:** 29d764e

### Verify-command note (no code change)

- Task 2's coverage verify pipes `tail -n 25` into the count parser. The coverage table is longer than 25 lines, so the `Tests N passed` line falls outside the window and the parser exits 1 even though the run passed (exit 0). I confirmed the result from the full output instead: `Tests 872 passed (872)`, thresholds met, exit 0. Plan 18-06, or any later reuse of this command, should parse the full output or grep before tailing.

---

**Total deviations:** 1 auto-fixed (1 bug in my own comment) plus 1 verify-command defect, noted above.
**Impact on plan:** None on behavior. No scope change.

## Issues Encountered

- Vitest's `tap-flat` reporter wrote malformed TAP: a multi-line `actual:` string escaped the YAML block, so the classifier returned `invalid_record`. Following tdd.md, I reran the same target with `--reporter=junit` and got `RED_EVIDENCE_OK`.
- The existing vite `Unrecognized target environment "es2024"` warning appears for every file, including the new ones. It predates this plan (already noted in 18-02/18-05) and is out of scope.

## User Setup Required

None. To let a browser client read the API locally, set `CORS_ALLOWED_ORIGINS` in `apps/server/.env` (`.env.example` shows `http://localhost:8081`).

## Next Phase Readiness

- Plan 18-05 (route colors) does not touch any file from this plan.
- Plan 18-06 can build its D-14 response matrix through `src/test/app.ts`. The allowed test origin is `http://localhost:8081`.

---
*Phase: 18-server-toolchain-cors*
*Completed: 2026-11-12*

## Self-Check: PASSED
