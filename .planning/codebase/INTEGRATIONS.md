# External Integrations

**Analysis Date:** 2026-08-20

## APIs & External Services

**Transit Data:**
- DASH API (goswift.ly) - Public transit bus route, stop, and real-time prediction data
  - SDK/Client: Axios 1.7.9 with custom configuration
  - Auth: API key sent via Authorization header
  - Env var: `DASH_API_KEY`
  - Base URL env var: `DASH_API_BASE_URL`
  - Agency filter env var: `DASH_API_AGENCY`

**DASH API Endpoints Used:**
- `GET /routes` - Fetch all bus routes and their directions/stops
- `GET /real-time/{agency}/predictions` - Fetch arrival predictions for a stop
  - Query parameters: `stop` (required), `route` (optional), `number` (optional predictions count)

## Data Storage

**Databases:**
- None - This is a stateless API proxy layer
- All data is fetched from DASH API and held in-memory during application lifecycle
- No persistent database (no PostgreSQL, MongoDB, etc.)

**File Storage:**
- Local filesystem only - TypeScript source and compiled JavaScript in `src/` and `dist/`
- No cloud storage integration (no S3, GCS, etc.)

**Caching:**
- In-memory only
- BusDataRepository singleton holds routes and stops data in Maps after initialization
- Repository refresh can be triggered manually via `refreshData()` method
- Predictions are fetched on-demand from DASH API (not cached)

## Authentication & Identity

**Auth Provider:**
- Custom API key authentication (no third-party auth provider)
  - DASH API authentication via Authorization header with pre-configured API key
  - Configured in `src/server/config/axios.ts`
  - No user authentication or session management in this API layer

**Axios Configuration:**
- Base URL: Configured from `DASH_API_BASE_URL` environment variable
- Authorization header: Pre-set with `DASH_API_KEY` value on all requests to DASH API
- Custom instance: `axiosInstance` exported from `src/server/config/axios.ts`

## Monitoring & Observability

**Error Tracking:**
- None - Application errors are logged but no external error tracking service is configured

**Logs:**
- Winston logger configured to console transport only
- Default log level: info
- Format: simple text format
- Logger instance: `src/server/config/logger.ts`
- Logs used in repository initialization, API requests, and error handling

**Logging Points:**
- Repository data fetch and refresh operations
- DASH API prediction requests
- Application startup and graceful shutdown
- Error messages during initialization or upstream API failures

## CI/CD & Deployment

**Hosting:**
- Not specified in codebase
- Expected to run on any Node.js 20+ host (cloud platform, VPS, container orchestration)

**CI Pipeline:**
- GitHub Actions workflows present (`.github/` directory)
- No specific pipeline configuration visible in explored files

**Environment Configuration:**
- Loaded via dotenv from `.env` file (example template: `.env.example`)
- Validated at application startup using Zod schema
- Application crashes if validation fails

## Environment Configuration

**Required Environment Variables:**

| Variable | Purpose | Example |
|----------|---------|---------|
| `DASH_API_BASE_URL` | Base URL for DASH transit API | `https://api.goswift.ly` |
| `DASH_API_AGENCY` | Agency identifier for API queries | `sf-muni` |
| `DASH_API_KEY` | API authentication token | (API key from DASH provider) |

**Optional Environment Variables:**

| Variable | Purpose | Default |
|----------|---------|---------|
| `PORT` | HTTP server port | `3000` |

**Secrets Location:**
- `.env` file (not committed to git, see `.gitignore`)
- Environment variables injected at deployment time
- Example template: `.env.example` (safe to commit, contains no actual secrets)

## Validation & Error Handling

**Configuration Validation:**
- All environment variables validated at startup via Zod schema in `src/server/config/environment.ts`
- Failed validation causes application to exit with error message
- Type-safe configuration object exported after successful validation

**API Error Handling:**
- Custom error classes: `NotFoundError`, `UpstreamApiError` in `src/server/api/errors/index.ts`
- `NotFoundError` - Thrown when requested stop or route not found in local repository
- `UpstreamApiError` - Thrown when DASH API returns error (e.g., `success: false`)
- Errors propagate from services to controllers for HTTP response handling

## Webhooks & Callbacks

**Incoming:**
- None - This is a request/response API layer only

**Outgoing:**
- None - No callbacks or webhooks triggered by this service

## Data Flow Summary

```
Request to /api/v1/routes or /api/v1/predictions/{stopId}
    ↓
Route → Controller → Service → Repository/DASH API
    ↓
Response with structured transit data
```

**On Application Startup:**
1. Environment variables validated via Zod
2. BusDataRepository singleton initialized
3. Repository fetches routes and stops from DASH API
4. In-memory maps populated
5. Express server begins accepting HTTP requests

**On Prediction Request:**
1. Validate stop exists in repository
2. Build DASH API query with stop ID and optional filters
3. Fetch from DASH API via axios
4. Transform response to standardized format
5. Return to client

---

*Integration audit: 2026-08-20*
