# Technology Stack

**Analysis Date:** 2026-08-20

## Languages

**Primary:**
- TypeScript 5.7.3 - Backend API and server code
- JavaScript (via Node.js) - Runtime execution

**Secondary:**
- None

## Runtime

**Environment:**
- Node.js (version specified via .node-version: 20)

**Package Manager:**
- Bun 1.0.31 - Primary package manager for all installs and script execution
- Lockfile: `bun.lockb` (present, also `package-lock.json` for npm compatibility)

## Frameworks

**Core:**
- Express 4.21.2 - REST API framework for routes, controllers, and middleware

**Validation & Configuration:**
- Zod 3.24.0 - TypeScript-first schema validation for environment variables and data structures

**HTTP Client:**
- Axios 1.7.9 - HTTP client for upstream DASH API calls with custom headers and base URL configuration

**Logging:**
- Winston 3.17.0 - Structured logging to console with configurable levels

**Development Runtime:**
- ts-node 10.9.2 - Executes TypeScript directly without compilation step
- tsx 4.19.2 - Alternative TypeScript executor (dev dependency)

## Key Dependencies

**Critical:**
- @types/express 5.0.0 - TypeScript type definitions for Express.js
- @types/node 20.17.6 - TypeScript type definitions for Node.js APIs
- @types/winston 2.4.4 - TypeScript type definitions for Winston logging

**Infrastructure:**
- dotenv 16.4.7 - Loads environment variables from `.env` file at startup
- nodemon 3.1.9 - Watches TypeScript files and automatically restarts server during development

**Testing:**
- Vitest 2.1.5 - Unit and integration test framework with TypeScript support
- @vitest/coverage-v8 2.1.5 - Code coverage reporting using V8 engine
- supertest 7.2.2 - HTTP assertion library for testing Express routes and controllers
- @types/supertest 7.2.0 - TypeScript type definitions for supertest

## Configuration

**Environment:**
- Variables are validated at startup via Zod schema in `src/server/config/environment.ts`
- Required environment variables:
  - `DASH_API_BASE_URL` - Base URL for DASH transit API (e.g., https://api.goswift.ly)
  - `DASH_API_AGENCY` - Agency identifier for DASH API queries
  - `DASH_API_KEY` - API authentication key sent in Authorization header
  - `PORT` - Server port (defaults to 3000 if not specified)
- Missing or invalid variables crash the application immediately at startup

**Build:**
- TypeScript configuration: `tsconfig.json`
  - Target: ES2020
  - Module: CommonJS
  - Strict mode fully enabled (noImplicitAny, noUnusedLocals, noUnusedParameters, noImplicitReturns, etc.)
  - Source maps: Inline for debugging
  - Output directory: `./dist`
- Biome configuration: `biome.json`
  - Line width: 120 characters
  - Indentation: 4 spaces
  - Default exports allowed (noDefaultExport rule disabled per project conventions)

## Linting & Formatting

**Tool:** Biome 1.9.4 (`@biomejs/biome`) — sole linter and formatter (Prettier removed in v0.1)
- Recommended rules enabled; formatting errors do not block linting
- Suspicious noExplicitAny set to info level

## Test Configuration

**Framework:**
- Vitest 2.1.5
- Configuration: `vitest.config.mts`
- Test files: Co-located with source code using `.test.ts` suffix
- Setup file: `src/server/test/setup.ts` runs before all tests to set required environment variables
- Coverage thresholds enforced: 80% minimum on branches, functions, lines, and statements

**Run Commands:**
```bash
bun run test              # Run all tests with type checking
bun run test:coverage     # Run tests and generate coverage report
bun run test -- [file]    # Run single test file
```

## Platform Requirements

**Development:**
- Node.js 20+ (per `.node-version` file)
- Bun 1.0.31+ (package manager)
- TypeScript compiler (ts-node or tsx for runtime)

**Production:**
- Node.js 20+ (ES2020 compiled output)
- Environment variables configured (DASH_API_BASE_URL, DASH_API_AGENCY, DASH_API_KEY, optional PORT)
- Network access to upstream DASH API

## Build Output

- Compiled JavaScript: `dist/` directory
- Type definitions: `dist/*.d.ts` files
- Main entry: `dist/index.js` (compiled from `src/server/app.ts`)

---

*Stack analysis: 2026-08-20*
