---
quick_id: 260915-fc8
status: complete
---

# Summary: Confirm predictions endpoint uses Swiftly real-time API; add vehicle positions endpoint

- **Task 1 (verification-only, no code change):** Confirmed `PredictionService.buildDashApiUrl`
  already builds `` `/real-time/${agency}/predictions?...` `` against `DASH_API_BASE_URL=https://api.goswift.ly`
  (`.env.example`) via the shared `axios` instance (`src/server/config/axios.ts`) — the predictions
  endpoint already calls Swiftly's real-time predictions API correctly. Fixed-string grep confirms
  the literal `real-time/${agency}/predictions` substring exists in `PredictionService.ts` and
  `https://api.goswift.ly` appears once in `.env.example` (note: `grep -c` with the plan's literal
  `$`/`{`/`}` pattern returns 0 under BSD grep due to BRE interval-expression handling; `grep -cF`
  confirms the match).
- **Task 2:** Added `src/server/api/models/Vehicle.ts` (`DashVehicle`/`DashVehiclesApiResponse` vs.
  `VehiclePosition`/`VehiclePositionsResponse`/`VehicleOptions`, mirroring the `Prediction.ts`
  DASH-shaped/service-response split) and `src/server/api/services/VehicleService.ts`
  (`createVehicleService()` — no repository dependency, unlike `PredictionService`) with
  `getVehiclePositions(options?)` fetching `` `/real-time/${agency}/vehicles` `` (optionally
  `?route=`) and throwing `UpstreamApiError` on `success: false`. Added
  `VehicleService.test.ts` (8 tests: URL building with/without `route`, mapping, empty results,
  `generatedAt` timestamp, `UpstreamApiError`, rejected axios call).
- **Task 3:** Added `src/server/api/controllers/VehicleController.ts` (mirrors
  `PredictionController`'s `resolveErrorStatus`/`resolveErrorBody` mapping —
  `UpstreamApiError`→502, default→500) and `src/server/api/routes/vehicleRoutes.ts`, wired
  `GET /api/v1/vehicles` into `src/server/api/routes/index.ts` (replacing the placeholder
  comment lines). Added `VehicleController.test.ts` (6 tests: query handling, 200/502/500
  responses).
- All 393 repo tests pass (`bun run test`), including the 14 new tests. `bun run lint` reports
  1 pre-existing error and pre-existing warnings across files this task did not touch
  (`BusRouteController.test.ts`, `FavoritesRecentsRepository.test.ts`, `StopDiscovery.ts`,
  `axios.ts`, etc.) — out of scope per deviation-rule scope boundary. The two new files this task
  added (`Vehicle.ts`, `VehicleService.test.ts`) trip the same pre-existing
  `lint/style/useFilenamingConvention` warning every other PascalCase-named model/service file in
  the repo already trips (e.g. `StopDiscovery.ts`) — consistent with the codebase's existing
  naming convention, not a new issue.
- `bun install` (run to make `vitest`/`biome` available, since `node_modules` was absent at task
  start) migrated the repo's lockfile from `package-lock.json` to a new `bun.lockb` and
  reformatted `package.json`'s indentation/added `trustedDependencies`. The `package.json`
  reformat was unrelated to this task's scope and was reverted (`git checkout -- package.json`);
  the generated `bun.lockb` was left untracked/uncommitted.

## Endpoints

- `GET /api/v1/vehicles` — new, returns live Swiftly vehicle-position data, optionally filtered
  by `?route=`.
- `GET /api/v1/predictions` — unchanged, confirmed already correct.

## Self-Check: PASSED

All created files and both task commits (`4a5c1f5`, `04a2b66`) verified present.
