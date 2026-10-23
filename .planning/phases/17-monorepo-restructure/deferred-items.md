# Phase 17 Deferred Items

## Deferred Items

- streamConcurrencyCap.test.ts "never claims a slot for a connect the shared bucket rejects" can hang under full-suite coverage load
  status: open
  **Found during:** plan 17-02 Task 2, coverage gate (root `bun run test:coverage`, run 3 of 8)
  **What:** The test timed out at its existing 15 s limit (`{ timeout: 15_000 }`, set in Phase 16) in 1 of 8 root coverage runs. It passed in the other 7 and in 5 of 5 runs of the file on its own. Its sibling tests finish in 10–100 ms, so this is a hang, not slowness: raising the timeout would not fix it.
  **Likely cause:** `connectStream` in `apps/server/src/test/streamClient.ts` swallows `request.on("error")`. If the socket errors before a response arrives, `opened` never resolves and the test waits until the timeout. The 60 preceding supertest requests share the default keep-alive agent, which is a candidate for the socket error.
  **Why deferred:** It predates the move (the test and helper come from Phase 16). Fixing it means changing `src/test/streamClient.ts`, which is outside 17-02's allowed test-file set (D-06 amendment: test setup plus the 4 type-fixed files only).
  **Suggested fix:** Make `connectStream` reject (or resolve with a failed status) on a request error before the response, so a socket failure fails fast with a real error. Then find out what resets the socket.
