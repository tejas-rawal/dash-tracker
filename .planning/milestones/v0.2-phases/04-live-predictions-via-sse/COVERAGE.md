# Phase 4: API Coverage Declaration

No external API integration: this phase adds an SSE streaming access pattern over the existing DASH API integration already covered by `PredictionService` — no new external API/SDK is introduced.

The new `PredictionStreamService` calls into the existing `PredictionService.getPredictionsForStop()` for all upstream DASH API access (per D-05); it introduces a shared per-stop poll loop and subscriber fan-out on top of that existing capability, not a new integration surface. The DASH API's request/response shape, auth headers, and base URL configuration (`src/server/config/axios.ts`, `src/server/config/environment.ts`) are unchanged by this phase.
