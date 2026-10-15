---
status: complete
phase: 12-bounded-upstream-calls-error-safety-nets
source: [12-01-SUMMARY.md, 12-02-SUMMARY.md, 12-03-SUMMARY.md, 12-04-SUMMARY.md]
started: 2026-09-29T19:45:25Z
updated: 2026-09-30T16:21:18Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Stop any running dev server. Start the server from scratch with `bun run dev-server`. It boots without errors, logs the route/stop load, and `curl localhost:${PORT:-3000}/api/v1/routes/all` returns live route data.
result: pass

### 2. Shutdown with an open SSE stream (review WR-05)
expected: With the server running, open a prediction stream in another terminal (`curl -N "localhost:${PORT:-3000}/api/v1/predictions/stream?stop=<a real stop id>"`) and leave it connected. Send SIGTERM to the server (Ctrl+C or `kill <pid>`). The server logs "Server is gracefully shutting down" and exits within about 10 seconds; the curl stream is closed instead of hanging forever.
result: pass

### 3. Failed shutdown exits with code 1 (review WR-03)
expected: If closing the favorites/recents repository fails during shutdown, the server logs "Shutdown failed: ..." and exits with code 1 instead of hanging. (Hard to trigger by hand; skip if you have no easy way to make the close fail.)
result: pass

### 4. A blackholed DASH makes GET /api/v1/vehicles return 502 { error: 'Bad Gateway', details: 'DASH API request timed out after 200ms' } in 150-2000 ms, with no API key in the body or any log call
expected: A blackholed DASH makes GET /api/v1/vehicles return 502 { error: 'Bad Gateway', details: 'DASH API request timed out after 200ms' } in 150-2000 ms, with no API key in the body or any log call
result: pass
source: automated
coverage_id: 12-01-D1

### 5. Every DASH call has its own hard total deadline: a slow trickle is cut off, and consecutive calls, including one after a timed-out call, never inherit an expired deadline
expected: Every DASH call has its own hard total deadline: a slow trickle is cut off, and consecutive calls, including one after a timed-out call, never inherit an expired deadline
result: pass
source: automated
coverage_id: 12-01-D2

### 6. Refused connections and non-2xx responses map to 'DASH API request failed: ...'. The wrapped error has no config/request/response/cause and leaks no key, path or rider coordinates. The key still reaches DASH.
expected: Refused connections and non-2xx responses map to 'DASH API request failed: ...'. The wrapped error has no config/request/response/cause and leaks no key, path or rider coordinates. The key still reaches DASH.
result: pass
source: automated
coverage_id: 12-01-D3

### 7. DASH_API_TIMEOUT_MS is Zod-validated: unset gives 10000, '2500' gives 2500, and abc/0/-1/1.5/empty each fail startup with 'Invalid environment configuration ... DASH_API_TIMEOUT_MS'
expected: DASH_API_TIMEOUT_MS is Zod-validated: unset gives 10000, '2500' gives 2500, and abc/0/-1/1.5/empty each fail startup with 'Invalid environment configuration ... DASH_API_TIMEOUT_MS'
result: pass
source: automated
coverage_id: 12-01-D4

### 8. A blackholed DASH makes GET /api/v1/predictions/nearby return 502 { error: 'Bad Gateway', details: 'DASH API request timed out after 200ms' } with no API key or rider coordinates (38.8048 / -77.0469) in the body or any log call
expected: A blackholed DASH makes GET /api/v1/predictions/nearby return 502 { error: 'Bad Gateway', details: 'DASH API request timed out after 200ms' } with no API key or rider coordinates (38.8048 / -77.0469) in the body or any log call
result: pass
source: automated
coverage_id: 12-02-D1

### 9. Transport errors are wrapped exactly once: NearbyPredictionService propagates the shared client's rejection as the same error object, and the nearby network-level route test gets the client's own message back as the 502 details
expected: Transport errors are wrapped exactly once: NearbyPredictionService propagates the shared client's rejection as the same error object, and the nearby network-level route test gets the client's own message back as the 502 details
result: pass
source: automated
coverage_id: 12-02-D2

### 10. Nearby's content-level UpstreamApiErrors (success: false and malformed bodies) are unchanged and still map to 502
expected: Nearby's content-level UpstreamApiErrors (success: false and malformed bodies) are unchanged and still map to 502
result: pass
source: automated
coverage_id: 12-02-D3

### 11. A blackholed DASH makes GET /api/v1/predictions?stop=stop-1 return 502 with the exact timeout details in 150-2000 ms, with no API key in the body or logs
expected: A blackholed DASH makes GET /api/v1/predictions?stop=stop-1 return 502 with the exact timeout details in 150-2000 ms, with no API key in the body or logs
result: pass
source: automated
coverage_id: 12-02-D4

### 12. /predictions, /predictions/nearby and /vehicles issued in parallel against a blackholed DASH each return 502 with the timeout details, and the batch finishes in under 2000 ms
expected: /predictions, /predictions/nearby and /vehicles issued in parallel against a blackholed DASH each return 502 with the timeout details, and the batch finishes in under 2000 ms
result: pass
source: automated
coverage_id: 12-02-D5

### 13. The startup route/stop load and the 5-minute service-alert poll go through the same bounded client: each fails at the deadline with a logged timeout error instead of hanging, and neither logs the key
expected: The startup route/stop load and the 5-minute service-alert poll go through the same bounded client: each fails at the deadline with a logged timeout error instead of hanging, and neither logs the key
result: pass
source: automated
coverage_id: 12-02-D6

### 14. An error on an established SSE response is logged at warn with the stop id and message, and runs unsubscribe + res.end exactly once
expected: An error on an established SSE response is logged at warn with the stop id and message, and runs unsubscribe + res.end exactly once
result: pass
source: automated
coverage_id: 12-03-D1

### 15. Cleanup is idempotent across event order (error then close, close then error)
expected: Cleanup is idempotent across event order (error then close, close then error)
result: pass
source: automated
coverage_id: 12-03-D2

### 16. An error that arrives while subscribe is pending unsubscribes once the subscription resolves and writes no SSE headers or frames
expected: An error that arrives while subscribe is pending unsubscribes once the subscription resolves and writes no SSE headers or frames
result: pass
source: automated
coverage_id: 12-03-D3

### 17. With the real PredictionStreamService, an errored subscriber is dropped while its neighbour on the same stop keeps receiving ticks, and the per-stop poll stops once the last subscriber leaves (SC4)
expected: With the real PredictionStreamService, an errored subscriber is dropped while its neighbour on the same stop keeps receiving ticks, and the per-stop poll stops once the last subscriber leaves (SC4)
result: pass
source: automated
coverage_id: 12-03-D4

### 18. Existing SSE behaviour is preserved (400, 404/502 without SSE headers, headers plus initial frame, close cleanup, real-socket route stream)
expected: Existing SSE behaviour is preserved (400, 404/502 without SSE headers, headers plus initial frame, close cleanup, real-socket route stream)
result: pass
source: automated
coverage_id: 12-03-D5

### 19. An unhandled promise rejection is logged through Winston and the process keeps running
expected: An unhandled promise rejection is logged through Winston and the process keeps running
result: pass
source: automated
coverage_id: 12-04-D1

### 20. An uncaught exception is logged through Winston before the process exits with code 1
expected: An uncaught exception is logged through Winston before the process exits with code 1
result: pass
source: automated
coverage_id: 12-04-D2

### 21. Logged reasons are the stack/message or String(reason) only, as one string; a secret on the reason object never reaches the log
expected: Logged reasons are the stack/message or String(reason) only, as one string; a secret on the reason object never reaches the log
result: pass
source: automated
coverage_id: 12-04-D3

### 22. registerProcessErrorHandlers is re-exported from the config barrel and called in app.ts before the alert poll and repository init
expected: registerProcessErrorHandlers is re-exported from the config barrel and called in app.ts before the alert poll and repository init
result: pass
source: automated
coverage_id: 12-04-D4

## Notes

- Automated entries 4-22 come from the SUMMARY `coverage:` blocks. After the code-review fixes, the full suite was re-run on 2026-09-29: 561/561 passing, no type errors. Three cited test names were renamed by the fixes (12-03 D2 and 12-04 D2); their renamed equivalents exist and pass.
- The SUMMARY files predate commit-claim recording (`commits:` absent), so the commit-claim check was not possible; reported as a warning, not a mismatch.
- verify:pre api-coverage gate: passed (COVERAGE.md declares no external API integration, overriding 2 detected signals).
- UI checkpoints: 0 auto-verified, 0 queued for manual review (backend-only phase, no browser MCP).

## Summary

total: 22
passed: 22
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
