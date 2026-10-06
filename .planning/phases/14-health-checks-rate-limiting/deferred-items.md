## Deferred Items

- Route test files hand supertest the bare Express app, so each request runs on a throwaway server
  status: open
  **Found during:** 14-02 Task 3
  **What:** `request(app)` starts a new `listen(0)` server for every request. Node 20's `http.globalAgent` keeps sockets alive, so a pooled socket to an earlier server that has since closed can be reused when the OS hands its port to a new server. The request is then answered by a different server. A scratch reproduction crossed apps on 1 of 900 requests. 14-02 fixed this for its own files (`rateLimit.test.ts` and `upstreamRateLimit.test.ts` now serve from one long-lived server closed with `closeAllConnections()`). The pre-existing files still use the pattern: busRoutes, dataBootRetry, dataNotReady, dataReload, dataReloadStream, favoriteRoutes, healthRoutes, predictionRoutes, recentRoutes, stopRoutes and upstreamTimeout `*.test.ts`.
  **Why deferred:** These files predate 14-02 and fall outside its scope. Each one uses a single app, so a crossed request reaches the same app instance and the risk there is low. It matters only where a file builds several apps or keeps per-server state.
