---
phase: 18-server-toolchain-cors
plan: 06
subsystem: api
tags: [cors, sse, rate-limit, supertest, vitest, express]

requires:
  - phase: 18-server-toolchain-cors
    provides: "18-04: createApp() with createCorsMiddleware (exact-match origin callback, exposed Retry-After,RateLimit,RateLimit-Policy) and CORS_ALLOWED_ORIGINS pinned to http://localhost:8081 in src/test/setup.ts"
provides:
  - "connectStream/openStream origin?: string option in apps/server/src/test/streamClient.ts"
  - "corsStream.test.ts: SSE 200 and stream-cap 429 by allowed, disallowed and absent Origin over real sockets"
  - "routes/cors.test.ts: the D-14 matrix through createApp() (200, 503, 404, bucket 429, preflights, null and near-miss origins, parallel, repeat)"
  - "middleware/cors.test.ts: createCorsMiddleware exact match, order and duplicate independence, empty list, uppercase, null"
affects: [19, frontend, cors]

actuals:
  tokens: 6824
  tasks: 2
  commits: 2
plan_head_before: 473e430228ea6de2ddfa5a353731500aebb79149
plan_head_after: 274c7ad8a449f0a44a25c28737d8e73a0db7c546

tech-stack:
  added: []
  patterns:
    - "CORS assertions: corsHeaderNames(response) lists every access-control-* header, so 'none' is one toEqual([]) per row"
    - "A file-wide afterEach checks every recorded response for ACAO never '*' and no Access-Control-Allow-Credentials"
    - "Characterization RED by mutation: when the feature already shipped, mutate it, record the failing run with the JUnit reporter, restore with git checkout"

key-files:
  created:
    - apps/server/src/api/routes/corsStream.test.ts
    - apps/server/src/api/routes/cors.test.ts
    - apps/server/src/api/middleware/cors.test.ts
    - .planning/phases/18-server-toolchain-cors/.tdd/18-06-red.json
    - .planning/phases/18-server-toolchain-cors/.tdd/18-06-red-junit.xml
  modified:
    - apps/server/src/test/streamClient.ts

key-decisions:
  - "No production fix was needed: every D-14 row passed against 18-04's middleware, and Node's writeHead keeps the CORS headers cors set earlier on the SSE 200"
  - "Task 2's RED is shown by mutation, because the feature shipped in 18-04: removing the allowlist check failed 14 of 28 rows (RED_EVIDENCE_OK), and the array origin form failed 17 of 28 including every no-Origin row"
  - "streamClient's options became a named StreamOptions interface shared by connectStream and openStream; the error swallowing (deferred Phase 17 item) is unchanged"

patterns-established:
  - "New CORS-affecting responses get a row in routes/cors.test.ts for allowed, disallowed and absent Origin"

requirements-completed: [CORS-01, CORS-02, CORS-03, CORS-04]

coverage:
  - id: D1
    description: "SSE 200 on /predictions/stream carries ACAO, Vary: Origin and exposed Retry-After for the allowed origin and no Access-Control-* header otherwise, with frames on all three"
    requirement: CORS-02
    verification:
      - kind: integration
        ref: "apps/server/src/api/routes/corsStream.test.ts#streams prediction frames to every client, with CORS headers only for the allowed origin"
        status: pass
    human_judgment: false
  - id: D2
    description: "Stream-cap 429 (6th connect after 5 held) carries ACAO and exposed Retry-After: 5 for the allowed origin, none for disallowed or absent Origin"
    requirement: CORS-03
    verification:
      - kind: integration
        ref: "apps/server/src/api/routes/corsStream.test.ts#answers the stream-cap 429 with readable CORS headers for the allowed origin and none for the others"
        status: pass
    human_judgment: false
  - id: D3
    description: "200, 503 (Retry-After: 5) and Express 404 carry ACAO and exposed Retry-After for the allowed origin; disallowed and absent Origin get no CORS header and identical status and body"
    requirement: CORS-02
    verification:
      - kind: integration
        ref: "apps/server/src/api/routes/cors.test.ts#200, 503 and 404 by origin (D-14) (12 rows)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Bucket boundary: the 60th allowed request passes with ACAO, the 61st is a 429 with ACAO and Retry-After exposed, and disallowed and absent 429s carry no CORS header"
    requirement: CORS-03
    verification:
      - kind: integration
        ref: "apps/server/src/api/routes/cors.test.ts#the 60th request from the allowed origin passes with CORS, and the 61st is a 429 the browser can read"
        status: pass
    human_judgment: false
  - id: D5
    description: "Preflights spend no token (r=59 then r=58 around an OPTIONS); a disallowed preflight equals a no-Origin OPTIONS (200 GET,HEAD); the favorites preflight is 204 before requireDeviceId, which still answers 400 without an Origin"
    requirement: CORS-04
    verification:
      - kind: integration
        ref: "apps/server/src/api/routes/cors.test.ts#preflights (D-13) (3 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Origin precision: null, trailing slash, another port, https and an uppercase host are never allowed; ACAO is never * and credentials are never sent; parallel and repeated requests each get their own, identical result"
    requirement: CORS-02
    verification:
      - kind: integration
        ref: "apps/server/src/api/routes/cors.test.ts#origin precision + concurrency and repeats (7 tests) + file-wide afterEach"
        status: pass
    human_judgment: false
  - id: D7
    description: "createCorsMiddleware: entry order and duplicates do not change which origins are allowed; the empty list allows none; a request with no Origin is untouched"
    requirement: CORS-01
    verification:
      - kind: unit
        ref: "apps/server/src/api/middleware/cors.test.ts#createCorsMiddleware (5 tests)"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-11-12
status: complete
---

# Phase 18 Plan 06: CORS Response Matrix Summary

**28 supertest rows and 2 real-socket stream tests through `createApp()` show that `http://localhost:8081` can read the 200, the 503, the Express 404, both 429s and the SSE stream, each with `Retry-After` exposed. Other clients see exactly the responses they got before CORS, and preflights spend no rate-limit token. No production code changed.**

## Performance

- **Duration:** about 5 min
- **Started:** 2026-11-12T18:53:51Z
- **Completed:** 2026-11-12T18:58:30Z
- **Tasks:** 2
- **Files modified:** 6 (5 created, 1 modified)

## Accomplishments

- `connectStream`/`openStream` take an optional `origin` and send it as the lowercase `origin` header. The swallowed pre-response socket errors are untouched, because that is a deferred Phase 17 item.
- `corsStream.test.ts` (tracer): the SSE 200 and the stream-cap 429 over real sockets for the allowed origin, a disallowed origin and no Origin. All three streams receive frames. Only the allowed one carries `Access-Control-*`.
- `routes/cors.test.ts` covers the rest of D-14 and every edge the probe raised: the 200/503/404 kinds by origin, the bucket boundary (60th and 61st), the token-free preflight, the disallowed preflight equal to a no-Origin OPTIONS, the favorites preflight ahead of `requireDeviceId`, `null` and near-miss origins, the parallel mix, and the repeat-identical expose list with `Retry-After` exactly once. A file-wide `afterEach` checks that no response has ACAO `*` or `Access-Control-Allow-Credentials`, and that no request reached DASH.
- `middleware/cors.test.ts` covers the order/duplicate edge of CORS-01, the empty list, uppercase, `null`, and a no-Origin request with no `Vary`.
- Test count went from 892 to 922. `cors.ts` is now at 100% coverage.

## Task Commits

1. **Task 1: CORS on the SSE stream and the stream-cap 429 (tracer)**: `12a2050` (test)
2. **Task 2: CORS response matrix and createCorsMiddleware unit tests**: `274c7ad` (test)

**Plan metadata:** the docs commit that follows this SUMMARY.

## Evidence

### Captured response headers (allowed origin `http://localhost:8081`)

I captured these with a throwaway test that logged them. It was deleted and never committed.

SSE 200, `GET /api/v1/predictions/stream?stop=stop-1`:
```
x-powered-by: Express
access-control-allow-origin: http://localhost:8081
vary: Origin
access-control-expose-headers: Retry-After,RateLimit,RateLimit-Policy
ratelimit: "60-in-1min"; r=59; t=60
ratelimit-policy: "60-in-1min"; q=60; w=60; pk=:MTJjYTE3YjQ5YWYy:
content-type: text/event-stream
cache-control: no-cache
connection: keep-alive
transfer-encoding: chunked
```

Shared-bucket 429, the 61st `GET /api/v1/predictions?stop=stop-2`:
```
x-powered-by: Express
access-control-allow-origin: http://localhost:8081
vary: Origin
access-control-expose-headers: Retry-After,RateLimit,RateLimit-Policy
ratelimit: "60-in-1min"; r=0; t=60
ratelimit-policy: "60-in-1min"; q=60; w=60; pk=:MTJjYTE3YjQ5YWYy:
retry-after: 60
content-type: application/json; charset=utf-8
content-length: 119
```

### Test count and coverage

- Before: 892 (after 18-05).
- After Task 1: `Tests 894 passed (894)` under `bun run test`.
- After Task 2: `Test Files 57 passed (57)`, `Tests 922 passed (922)` under `bun run test:coverage`, exit 0, thresholds met.

| File | % Stmts | % Branch | % Funcs | % Lines | Uncovered |
|------|---------|----------|---------|---------|-----------|
| All files | 98.66 | 96.85 | 98.45 | 98.66 | |
| `createApp.ts` | 91.66 | 100 | 100 | 91.66 | 21 (`GET /` hello) |
| `cors.ts` | 100 | 100 | 100 | 100 | |

Typecheck and build exit 0, and lint prints `Found 36 warnings.`

### Production fix

None was needed. Every row passed against plan 18-04's middleware, and `PredictionStreamController.ts` is unchanged.

## TDD Gate Compliance

Task 2 is `tdd="true"`, but the behavior it pins down shipped in 18-04, and the plan expected every row to pass on the first run, which it did. A plain run therefore could not produce RED. The task is characterization, so I showed RED by mutation instead:

- **RED (mutation, allowlist check removed):** `createCorsMiddleware` was temporarily changed to echo any defined Origin. 14 of 28 tests failed, which is every row that sends a disallowed, `null` or near-miss origin. The target `200 from /health/live from a disallowed origin carries no CORS header` failed on its `corsHeaderNames(response)` equal-`[]` assertion (received `access-control-allow-origin`, `access-control-expose-headers`). The classifier returned `RED_EVIDENCE_OK` (`target_test_failed`, JUnit, 28 tests, 14 failed). Semantic assessment: the target ran and failed on the planned assertion for the intended reason, with no load, setup, collection or type faults. Evidence is in `.planning/phases/18-server-toolchain-cors/.tdd/18-06-red.json` and `18-06-red-junit.xml`, with the hostname redacted.
- **Second mutation (array `origin` form, the one 18-04 rejected):** 17 of 28 failed, including every no-Origin row. This shows the CORS-04 rows catch a `Vary`/expose leak to clients that send no Origin.
- `cors.ts` was restored with `git checkout -- apps/server/src/api/middleware/cors.ts` after each mutation. `git status` confirmed it was clean.
- **GREEN:** the unmodified 18-04 middleware passes all 28 tests. There is no `feat(18-06)` commit, because no production code was needed. The plan asks for one `test(18-06)` commit per task.
- **REFACTOR:** none.

## Files Created/Modified

- `apps/server/src/test/streamClient.ts`: `StreamOptions` with `origin?: string`, sent as the `origin` header.
- `apps/server/src/api/routes/corsStream.test.ts`: SSE 200 and stream-cap 429 by origin.
- `apps/server/src/api/routes/cors.test.ts`: the createApp() CORS matrix.
- `apps/server/src/api/middleware/cors.test.ts`: `createCorsMiddleware` unit tests.
- `.planning/phases/18-server-toolchain-cors/.tdd/18-06-red.json`, `18-06-red-junit.xml`: mutation RED evidence.
- `.planning/phases/18-server-toolchain-cors/deferred-items.md`: one out-of-scope item (see Issues).

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Biome formatting in cors.test.ts**
- **Found during:** Task 2 verify
- **Issue:** Two lines were over the 120-character width, so `bun run lint` reported 1 format error on top of the 36 warnings.
- **Fix:** I replaced the cross-product row's tuple casts with typed objects (`$label from $originLabel`) and applied `biome format --write`.
- **Files modified:** apps/server/src/api/routes/cors.test.ts
- **Verification:** lint prints `Found 36 warnings.` with 0 errors, and both files pass (28 tests).
- **Committed in:** 274c7ad

### Verify-command note (no code change)

- Task 2's coverage verify pipes `tail -n 25` into the count parser, and the coverage table pushes the `Tests` line out of that window (0 matches in the last 25 lines). The same defect was reported in 18-04. I ran the identical parser over the full output instead: `all 922 tests passed`, exit 0.

### Additions beyond the behavior block (same task, same commit)

- Near-miss origins (trailing slash, another port, https, uppercase host) on the full app, a `null` preflight, and a check that the allowed origin's status and body equal the no-Origin baseline for each kind. These strengthen edge CORS-02/precision and CORS-04 and do not widen scope.

---

**Total deviations:** 1 auto-fixed (formatting), plus 1 verify-command defect noted above.
**Impact on plan:** None on behavior. No scope change.

## Issues Encountered

- The committed 18-04 RED evidence (`.tdd/18-04-red-junit.xml` and the `output` of `18-04-red.json`) contains the machine hostname unredacted. That is outside this plan's scope, so I logged it in `deferred-items.md` and did not change it.
- The known vite `Unrecognized target environment "es2024"` warning still prints for every file. It predates this plan.

## Known Stubs

None.

## User Setup Required

None.

## Next Phase Readiness

- This was the last plan of Phase 18. CORS-01 to CORS-04 now have both the 18-04 implementation and the 18-06 proof.
- A browser client on `http://localhost:8081` (Phase 19) can read every response it depends on, including the retry timing.

---
*Phase: 18-server-toolchain-cors*
*Completed: 2026-11-12*

## Self-Check: PASSED

- FOUND: apps/server/src/api/routes/corsStream.test.ts, apps/server/src/api/routes/cors.test.ts, apps/server/src/api/middleware/cors.test.ts, apps/server/src/test/streamClient.ts (`origin?: string`), .tdd/18-06-red.json, .tdd/18-06-red-junit.xml
- FOUND: 12a2050 and 274c7ad are ancestors of HEAD; `git rev-list --count 473e430..HEAD` = 2
- Line counts: cors.test.ts 344 (min 120), corsStream.test.ts 171 (min 60), middleware/cors.test.ts 101 (min 30)
