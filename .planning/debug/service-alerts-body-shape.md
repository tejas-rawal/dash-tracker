---
status: resolved
trigger: "G-05-5 UAT gap: after 05-05 added format=json, live boot still logs 'error: Failed to poll service alerts: DASH API returned a malformed service alerts response (body is not an object)' with NO '— string body failed JSON.parse' suffix"
created: 2026-09-03T00:00:00Z
updated: 2026-09-04T00:00:00Z
resolution: "Fixed in 05-06 (commit range for 05-06-SUMMARY.md, completed 2026-09-04). fetchFromDashApi() now accepts a bare top-level array body directly as the entities list; confirmed against a real live-boot capture. See 05-06-SUMMARY.md and ServiceAlertService.ts's 'Confirmed live shape (G-05-5)' comment."
---

## Current Focus

hypothesis: CONFIRMED (see Resolution) — the live gtfs-rt-alerts/v2?format=json response body, once axios's own default JSON.parse succeeds on it, is not a plain non-array object; it is most likely a bare top-level JSON array (or null/primitive), which trips `Array.isArray(body)` / `typeof body !== "object"` at ServiceAlertService.ts:42-43 without ever touching the string/JSON.parse-fallback branch.
test: static source-level trace of axios 1.7.9's real transformResponse/http-adapter pipeline (node_modules/axios/lib/defaults/index.js, lib/adapters/http.js) vs. ServiceAlertService.ts's own redundant string-parse guard, to derive which body shapes can reach the bare-message throw site via a genuine network round trip.
expecting: derive that the bare (unsuffixed) message is only reachable when axios's OWN internal JSON.parse already succeeded to a non-object value — ruling out "format=json isn't reaching the request" (which would produce protobuf-binary-as-string, which essentially never parses as valid JSON, and would instead reliably produce the SUFFIXED error via the app's own redundant re-parse).
next_action: none — goal is find_root_cause_only; hand off to /gsd-plan-phase --gaps for a targeted gap-closure plan (see Resolution.fix for suggested direction).

## Symptoms

expected: |
  Boot the real server (`bun run dev-server` or `bun run start-server`) against the live DASH/Swiftly API.
  No "Failed to poll service alerts: ..." error should be logged (startup itself is unaffected either way —
  the poll runs fire-and-forget via ServiceAlertPollService.pollAlerts()).
actual: |
  error: Failed to poll service alerts: DASH API returned a malformed service alerts response (body is not an object)
errors: |
  Bare MALFORMED_BODY_MESSAGE constant, NO "— string body failed JSON.parse" suffix. Two distinct throw
  sites exist in ServiceAlertService.ts's fetchFromDashApi():
    - line 38 (suffixed): hit only when response.data arrived as a string AND the app's own redundant
      JSON.parse(body) call on it throws.
    - line 43 (bare, this incident): hit when, after the string/JSON.parse branch (taken or skipped),
      body is null, typeof body !== "object", or Array.isArray(body).
reproduction: G-05-5 in .planning/phases/05-service-alerts-ingestion/05-UAT.md — Test 1 (blocks Test 2). Live boot only; not reproducible via the existing mocked test suite because every test in ServiceAlertService.test.ts mocks axios.get directly and injects response.data as a hand-picked JS value, bypassing axios's real transformResponse/http-adapter pipeline entirely.
started: Immediately after commit 5b06404 (05-05, "fix(05-05): request format=json from DASH alerts endpoint, drop debug log") — a regression discovered in UAT round 3, same generic error text as G-05-2/G-05-4 but via the OTHER throw site.

## Eliminated

- hypothesis: "format=json query parameter is not actually reaching the outgoing request (dropped/stripped/misencoded by axios or the base URL config)."
  evidence: |
    Read src/server/config/axios.ts — axiosInstance is `axios.create({ baseURL: dashApi.baseUrl })` plus a
    single `Authorization` header assignment. No interceptors, no responseType, no transformResponse
    override anywhere in the codebase (confirmed via `grep -rn "interceptors|responseType|transformResponse"
    src/` — zero hits). buildDashApiUrl() builds the query string via
    `new URLSearchParams({ format: "json" }).toString()` -> "format=json", appended as
    `?${params.toString()}` to a relative path, then passed straight to `axios.get(url)`. Axios's
    `combineURLs(baseURL, url)` (used internally to build the full path) does plain string concatenation
    that does not touch or re-parse the query string, so it cannot be dropped, double-encoded, or
    misparsed by this code path. Even if it somehow WERE dropped and the upstream defaulted back to
    protobuf-binary, the http adapter (lib/adapters/http.js:588-595) always stringifies the raw response
    bytes via `responseData.toString(responseEncoding)` (since `responseType` is never set to
    'arraybuffer' anywhere in this codebase) BEFORE axios's own transformResponse runs — so the
    downstream code would then see a raw binary-as-utf8 string. JSON.parse-ing arbitrary binary garbage
    essentially never succeeds (it would need to accidentally be syntactically valid, fully-consumed JSON
    text), so this path would overwhelmingly reproduce the SUFFIXED failure (via the app's own
    line 34-39 string/JSON.parse fallback), not the bare one actually observed.
  timestamp: 2026-09-03T00:00:00Z

- hypothesis: "A stale competing code path (dist/ build, or a second service) is being executed instead of the fixed ServiceAlertService.ts."
  evidence: |
    `bun run start-server` and `bun run dev-server` (package.json scripts) both run `ts-node
    src/server/app.ts` directly — neither goes through `dist/`. `dist/server/api/services/ServiceAlertService.js`
    IS present and stale (dated before the 05-05 fix), but it is dead weight for these two boot commands,
    not a live competing path. `git diff src/server/api/services/ServiceAlertService.ts` shows the working
    tree exactly matches HEAD (commit 5b06404's fix), and there is only one ServiceAlertService in the repo
    (`grep`/`find` confirm a single source file, single consumer chain: ServiceAlertPollService ->
    ServiceAlertService -> ServiceAlertRepository, no duplicate service class).
  timestamp: 2026-09-03T00:00:00Z

- hypothesis: "The response is a JSON-encoded string served under a non-application/json Content-Type, so it still fails ServiceAlertService's own redundant JSON.parse guard (line 34-39) the same way G-05-4 did."
  evidence: |
    Ruled out by the error text itself: this path, if hit, ALWAYS throws the SUFFIXED
    "— string body failed JSON.parse" message (line 38), because the guard's own catch block appends
    that literal suffix unconditionally on any parse failure. The user's reported error has no suffix,
    so this throw site (line 38) was not reached at all for this incident — the bare line 43 message can
    only be reached with `typeof body !== "string"` at the time of the check (or a string that DID
    successfully re-parse into something non-object, which is a much narrower sub-case handled below).
  timestamp: 2026-09-03T00:00:00Z

## Evidence

- timestamp: 2026-09-03T00:00:00Z
  checked: node_modules/axios/lib/defaults/index.js (defaults.transformResponse), node_modules/axios/lib/adapters/http.js (lines ~545-600), axios@1.7.9 (package.json-confirmed version)
  found: |
    The Node http adapter ALWAYS converts the raw response body to a string via
    `responseData.toString(responseEncoding)` unless `config.responseType === 'arraybuffer'` (never set
    anywhere in this codebase, confirmed by grep). Then `defaults.transformResponse` unconditionally
    ATTEMPTS `JSON.parse(data)` on any string response whenever `forcedJSONParsing` is true (the default,
    from transitional.js) AND `!this.responseType` (true here, since responseType is never configured) —
    i.e. axios itself tries to JSON.parse EVERY string response body regardless of Content-Type, before
    ServiceAlertService ever sees it. If that parse throws, `strictJSONParsing` evaluates to
    `!silentJSONParsing && JSONRequested` = `!true && false` = false (since `JSONRequested` requires
    `this.responseType === 'json'`, which is never explicitly set here), so axios silently swallows the
    parse failure and returns the ORIGINAL raw string unchanged — it does not throw.
  implication: |
    By the time `fetchFromDashApi()` reads `response.data`, one of exactly two things is true:
    (a) axios's own JSON.parse FAILED, and `response.data` is still the original raw string — in which
        case ServiceAlertService's own redundant JSON.parse(body) (line 34-39) will independently attempt
        to parse that SAME string and will independently FAIL for the same reason, deterministically
        producing the SUFFIXED error every time this path is taken; or
    (b) axios's own JSON.parse SUCCEEDED, and `response.data` is already whatever JS value that produced
        — an object, array, string, number, boolean, or null. Only in this branch can the code reach the
        BARE line-43 throw without a suffix: if the parsed value is `null`, a non-object primitive, or an
        array, `typeof body === "string"` is false (skipping the app's own re-parse branch entirely, since
        `body` is no longer a string at that point) and the object/null/array guard at line 42 fires
        directly with no suffix.
    Conclusion: the observed bare error is only reachable through path (b) — meaning the live upstream
    DID return syntactically valid JSON text (format=json's encoding fix from 05-05 IS working), but that
    JSON's TOP-LEVEL VALUE is not a plain, non-array, non-null object.

- timestamp: 2026-09-03T00:00:00Z
  checked: .planning/debug/service-alerts-malformed-body.md (G-05-2 debug session) and 05-UAT.md's G-05-2 `live_response_example` block (lines 68-83)
  found: |
    The "confirmed" live response shape backing the current `DashAlertsApiResponse { entities?:
    DashAlertEntity[] }` model has hallmark signs of a Stoplight/OpenAPI-generated documentation EXAMPLE,
    not a genuine packet-captured live response: every string field is the literal placeholder value
    `"string"`, every numeric field is literal `0`, and enum-typed fields (`cause`, `effect`) show a single
    representative enum value (`"UNKNOWN_CAUSE"`, `"NO_SERVICE"`) — the exact rendering pattern Stoplight
    produces from an OpenAPI schema's `type`/`enum` definitions when no custom example is supplied. It is
    also internally inconsistent with the actual GTFS-RT TranslatedString shape the code implements:
    the example shows `"header_text": [{"translation": [...]}]` (an ARRAY of TranslatedString objects),
    but `ServiceAlert.ts`'s `DashAlert.header_text` is typed as a single `DashAlertTranslatedString`
    object (not an array), and `mapToServiceAlert()` reads `alert.header_text?.translation?.[0]?.text`
    accordingly — a mismatch that was apparently never hit because no live entity payload has successfully
    round-tripped through this code yet (every prior gap failed before or at the mapping stage, per the
    05-05-SUMMARY.md human-check status).
  implication: |
    The `entities`-keyed object envelope this code assumes was never actually confirmed against a true
    live response — it was inferred from what looks like API documentation boilerplate. There is no
    verified ground truth for what `gtfs-rt-alerts/v2?format=json` actually returns at the top level.
    Given Evidence entry 1's derivation that the live body IS syntactically valid JSON but NOT a plain
    object, the most parsimonious and API-design-consistent explanation is that Swiftly's `format=json`
    convenience encoding returns the alert list directly as a top-level JSON ARRAY (a common "give me the
    list, not an envelope" REST convention for this kind of query-flag), rather than wrapping it in a
    `{header, entities}` (or the GTFS-RT-canonical `{header, entity}`) object — though a literal `null`
    body (e.g. "currently no alerts" encoded as JSON null rather than an empty array) is a secondary
    candidate consistent with the same evidence and cannot be fully ruled out without a live capture.

- timestamp: 2026-09-03T00:00:00Z
  checked: src/server/api/services/ServiceAlertService.test.ts (all 19 test cases) vs. what they actually exercise
  found: |
    Every test in this file mocks `../../config`'s `axios.get` directly (`vi.mock("../../config", ...)`)
    and supplies `response.data` as a hand-picked literal JS value (e.g. `{ data: "[]" }`,
    `{ data: null }`, `{ data: makeDashAlertsApiResponse([...]) }`). None of them exercise axios's REAL
    `transformResponse`/http-adapter pipeline verified in Evidence entry 1 — they test ServiceAlertService's
    own guard logic in isolation, which is correct and valuable, but they provide zero coverage of what
    `response.data` actually looks like after a genuine network round trip against the real DASH/Swiftly
    API. The 05-05 plan's "format=json" test only asserts the OUTGOING request URL contains the query
    string — it does not and cannot assert anything about the shape of a real incoming response.
  implication: |
    This explains why 05-05 shipped with full test coverage and zero regressions yet still failed live
    boot: the fix (requesting format=json) was correct and IS taking effect (per Evidence entry 1's
    ruling-out of the "format=json isn't reaching the request" theory), but no test — automated or human —
    in this project has ever verified the actual JSON shape returned by the live endpoint. The human-check
    in 05-05-PLAN.md/05-05-SUMMARY.md that would have caught this (D5, "Live-boot re-verification") was
    marked `human_judgment: true` with empty `verification: []` — i.e. explicitly deferred to a live check
    that then surfaced this gap (G-05-5), which is exactly the mechanism working as intended, just one
    round later than hoped.

## Resolution

root_cause: |
  format=json (05-05's fix) IS correctly reaching the live gtfs-rt-alerts/v2 request and IS producing a
  syntactically valid JSON response body — this is proven by the absence of the "— string body failed
  JSON.parse" suffix, which is only omittable when axios's own internal, unconditional JSON.parse
  (node_modules/axios/lib/defaults/index.js's transformResponse, confirmed applies regardless of
  Content-Type since this codebase never sets `responseType`) already SUCCEEDED before
  ServiceAlertService.fetchFromDashApi() ever inspects `response.data`. The actual defect is a TOP-LEVEL
  SHAPE MISMATCH: `fetchFromDashApi()`'s guard (ServiceAlertService.ts:42-43) rejects any parsed JSON
  value that is `null`, a non-object primitive, or an array — and the real live response's parsed
  top-level value is one of those (an array is the most likely candidate, given a "return the alert list
  directly" API convention and no envelope/header wrapper), not the `{header, entities: [...] }`-shaped
  object the code (and its `DashAlertsApiResponse` model) assumes. That assumed shape traces back to
  G-05-2's "confirmed" `live_response_example`, which itself bears strong hallmarks of being an
  auto-generated OpenAPI/Stoplight documentation example (generic "string"/0 placeholder values, and an
  internally-inconsistent `header_text`-as-array shape that contradicts this same code's own
  `DashAlertTranslatedString` type) rather than a genuine captured live payload — so the object-envelope
  assumption underlying the current 05-0x fixes was never actually verified against reality, and this is
  the first UAT round where a request that successfully reaches the live API with the correct encoding
  (format=json) has exposed that the assumption was wrong.
fix: |
  NOT APPLIED (goal: find_root_cause_only). Suggested direction for the gap-closure plan:
  1. Obtain one real, raw capture of `gtfs-rt-alerts/v2?format=json`'s response body (e.g. a temporary
     diagnostic log of `typeof response.data` plus a truncated `JSON.stringify(response.data)` in
     fetchFromDashApi() before the guard, run once against the live API, then removed) to confirm the
     EXACT top-level shape (array vs. null vs. other) rather than continuing to guess.
  2. Make `fetchFromDashApi()`/`fetchAlerts()` handle whatever that confirmed shape actually is —
     most plausibly treating a top-level array as the entities list directly (no `entities` key/envelope),
     while still rejecting genuinely invalid bodies (null, non-array primitives) with the existing
     UpstreamApiError guards.
  3. Re-examine the `header_text`/`description_text` shape assumption (single `DashAlertTranslatedString`
     object vs. array of them) against the same live capture once entities are reachable, since G-05-2's
     unreliable example also disagrees with the code on this nested shape and it has never been exercised
     by a real payload.
  4. Add a genuine live-shape regression fixture (captured from evidence above, not hand-authored) to
     ServiceAlertService.test.ts once the real shape is confirmed, since none of the 19 existing tests
     exercise axios's real transformResponse pipeline.
verification: ""
files_changed: []
