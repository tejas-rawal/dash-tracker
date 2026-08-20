# Testing Patterns

**Analysis Date:** 2026-08-20

## Test Framework

**Runner:**
- Vitest v2.1.5
- Config: `vitest.config.mts`
- Global test functions enabled (no imports needed for `describe`, `it`, `expect`)
- Setup file: `src/server/test/setup.ts`

**Assertion Library:**
- Vitest built-in expect API (based on Jest)

**Run Commands:**
```bash
bun run test              # Run all tests with type checking
bun run test:coverage     # Run tests + generate coverage report
bun test -- <file>        # Run single test file (e.g., bun run test -- src/server/api/models/BusRoute.test.ts)
```

**Vitest Config** (`vitest.config.mts`):
```typescript
export default defineConfig({
    test: {
        globals: true,                    // describe/it/expect available globally
        setupFiles: ['src/server/test/setup.ts'],
        coverage: {
            include: ['src/**/*.ts'],
            exclude: [
                'src/**/*.test.ts',        // Exclude test files
                'src/server/test/**',      // Exclude test utilities
                'src/server/app.ts',       // Exclude entry point
                'src/server/config/**',    // Exclude config
            ],
            thresholds: {
                branches: 80,
                functions: 80,
                lines: 80,
                statements: 80,
            },
        },
    },
});
```

## Test File Organization

**Location:**
- Co-located with source files in same directory
- Exception: setup utilities in `src/server/test/`

**Naming:**
- Source: `BusRoute.ts`
- Test: `BusRoute.test.ts`

**Structure:**
```
src/server/api/
├── models/
│   ├── BusRoute.ts
│   ├── BusRoute.test.ts
│   ├── BusStop.ts
│   ├── BusStop.test.ts
│   └── index.ts
├── services/
│   ├── BusRouteService.ts
│   ├── BusRouteService.test.ts
│   └── index.ts
├── controllers/
│   ├── BusRouteController.ts
│   ├── BusRouteController.test.ts
│   └── index.ts
└── routes/
    ├── busRoutes.ts
    └── busRoutes.test.ts
```

## Test Structure

**Basic Describe Block:**
```typescript
import { describe, expect, it, vi } from 'vitest';

describe('BusRouteService', () => {
    describe('getAgencyRoute', () => {
        it('returns the route matching the given short name', () => {
            // Arrange
            const mockRepo = makeMockRepo();
            const route = makeRoute('1A');
            mockRepo.getRouteByShortName.mockReturnValue(route);
            const { getAgencyRoute } = createBusRouteService(mockRepo as never);

            // Act
            const result = getAgencyRoute('1A');

            // Assert
            expect(result).toEqual(route);
            expect(mockRepo.getRouteByShortName).toHaveBeenCalledWith('1A');
        });
    });
});
```

**Test Organization:**
- **Arrange:** Set up test data, mocks, and dependencies
- **Act:** Call the function/method being tested
- **Assert:** Verify the output and side effects
- Nested `describe()` blocks for related test groups
- Clear test names describing what is being tested

**Setup & Teardown:**
```typescript
beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton instances for test isolation
    // @ts-expect-error accessing private static for test isolation
    BusDataRepository.instance = undefined;
});

afterEach(() => {
    // Clean up after each test
    // @ts-expect-error accessing private static for test isolation
    BusDataRepository.instance = undefined;
});
```

## Mocking

**Framework:** Vitest's `vi` module

**Module-Level Mocking:**
Place at the top of test file before any imports of the mocked module:

```typescript
vi.mock('../../config', () => ({
    axios: { get: vi.fn() },
    environment: {
        dashApi: { agency: 'test-agency', baseUrl: 'https://api.test.example.com', apiKey: 'key' },
        server: { port: 3000 },
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { axios } from '../../config';  // Now this imports the mocked version
```

**Creating Mock Functions:**
```typescript
const mockAxiosGet = vi.mocked(axios.get);
const mockFn = vi.fn();  // Create an empty mock function
```

**Configuring Mock Behavior:**

**Return Value:**
```typescript
mockRepo.getAllRoutes.mockReturnValue([route1, route2]);
```

**Implementation:**
```typescript
mockService.getAgencyRoutes.mockImplementation(() => { 
    throw new Error('DB failure'); 
});
```

**Resolved Value (async):**
```typescript
mockAxiosGet.mockResolvedValue({ data: makeDashApiResponse([...]) });
```

**Rejected Value (async error):**
```typescript
mockAxiosGet.mockRejectedValue(new Error('Network error'));
```

**Verifying Mock Calls:**
```typescript
expect(mockRepo.getRouteByShortName).toHaveBeenCalledWith('1A');
expect(mockRepo.getAllRoutes).toHaveBeenCalledOnce();
expect(mockAxiosGet).toHaveBeenCalledWith(expect.stringContaining('stop=stop-1'));
```

**Clearing Mocks:**
```typescript
vi.clearAllMocks();  // Clear in beforeEach to prevent test bleed
```

**What to Mock:**
- External APIs (axios calls to upstream DASH API)
- Repository/database access
- Logger (winston)
- Service dependencies when testing controllers
- HTTP clients and external services

**What NOT to Mock:**
- Domain objects and models
- Factory functions used to create services
- Business logic methods (unless testing error paths)
- Error classes

## Fixtures and Factories

**Test Data Factories:**
Located at the top of test files, providing sensible defaults with override support:

```typescript
const makeStop = (id = 'stop-1') =>
    new BusStop({ id, name: `Stop ${id}`, code: 101, lat: 38.8, lon: -77.1 });

const makeRoute = (shortName = '1A') =>
    new BusRoute({
        id: 'route-1',
        longName: 'Route 1A Long',
        shortName,
        name: 'Route 1A',
        type: RouteType.Bus,
        directions: [
            new RouteDirection({ id: 'd1', title: 'Northbound', stops: [makeStop()], headSigns: [] }),
        ],
    });

const makeMockRepo = () => ({
    getAllRoutes: vi.fn(),
    getRouteByShortName: vi.fn(),
    getStopById: vi.fn(),
    getAllStops: vi.fn(),
    getRoutesForStop: vi.fn(),
});

const makeMockReq = (params: Record<string, string> = {}) =>
    ({ params } as unknown as Request);

const makeMockRes = () => {
    const res = {
        json: vi.fn(),
        status: vi.fn(),
    } as unknown as Response;
    (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
    return res;
};
```

**Patterns:**
- Factory functions return complete, ready-to-use objects
- Sensible defaults for common test data
- Override support via parameters: `makeRoute('2B')`
- Factories for mocked objects with chained mock behavior

## Coverage

**Requirements:** 80% threshold across branches, functions, lines, and statements

**Target Files:**
- `src/**/*.ts` (all source code)

**Excluded from Coverage:**
- `src/**/*.test.ts` (test files themselves)
- `src/server/test/**` (test setup utilities)
- `src/server/app.ts` (entry point)
- `src/server/config/**` (configuration)

**View Coverage Report:**
```bash
bun run test:coverage
# Generates coverage report in terminal
# Look for summary: "Lines: X% | Functions: X% | Branches: X% | Statements: X%"
```

## Test Types

**Unit Tests:**
- Test individual functions/methods in isolation
- Mock all external dependencies
- Located alongside source files
- Examples: `BusRouteService.test.ts`, `BusRoute.test.ts`
- Test data factories for domain objects
- Mock repositories and services

**Integration Tests:**
- Test multiple layers working together
- Mock only external systems (upstream API)
- Test controllers + services + repositories
- Verify error handling across layers
- Examples: `BusRouteController.test.ts` (mock service, test controller logic)

**Route/HTTP Tests:**
- Test full request → response cycle
- Use Supertest library
- Mock service layer
- Verify HTTP status codes and response bodies
- Located in `src/server/api/routes/*.test.ts`
- Examples: `busRoutes.test.ts`, `predictionRoutes.test.ts`

**E2E Tests:**
- Not currently used in this codebase
- Could be added with Playwright or Cypress in future

## Common Patterns

**Synchronous Test:**
```typescript
it('returns the route matching the given short name', () => {
    // Arrange
    const mockRepo = makeMockRepo();
    const route = makeRoute('1A');
    mockRepo.getRouteByShortName.mockReturnValue(route);
    const { getAgencyRoute } = createBusRouteService(mockRepo as never);

    // Act
    const result = getAgencyRoute('1A');

    // Assert
    expect(result).toEqual(route);
    expect(mockRepo.getRouteByShortName).toHaveBeenCalledWith('1A');
});
```

**Async Test with Promise Resolution:**
```typescript
it('calls the DASH API with the correct stop id', async () => {
    // Arrange
    const mockRepo = makeMockRepo();
    mockRepo.getStopById.mockReturnValue(makeStop('stop-1'));
    mockAxiosGet.mockResolvedValue({ data: makeDashApiResponse([makeDashPredictionData()]) });
    const { getPredictionsForStop } = createPredictionService(mockRepo as never);

    // Act
    await getPredictionsForStop('stop-1');

    // Assert
    expect(mockAxiosGet).toHaveBeenCalledWith(expect.stringContaining('stop=stop-1'));
});
```

**Error Testing (Synchronous):**
```typescript
it('throws a NotFoundError when no route matches the short name', () => {
    // Arrange
    const mockRepo = makeMockRepo();
    mockRepo.getRouteByShortName.mockReturnValue(undefined);
    const { getAgencyRoute } = createBusRouteService(mockRepo as never);

    // Act & Assert
    expect(() => getAgencyRoute('UNKNOWN')).toThrowError(NotFoundError);
});

it('includes the short name in the NotFoundError message', () => {
    // Arrange
    const mockRepo = makeMockRepo();
    mockRepo.getRouteByShortName.mockReturnValue(undefined);
    const { getAgencyRoute } = createBusRouteService(mockRepo as never);

    // Act & Assert
    expect(() => getAgencyRoute('UNKNOWN')).toThrowError('Route not found: UNKNOWN');
});
```

**Error Testing (Async):**
```typescript
it('throws NotFoundError when the stop does not exist in the repository', async () => {
    // Arrange
    const mockRepo = makeMockRepo();
    mockRepo.getStopById.mockReturnValue(undefined);
    const { getPredictionsForStop } = createPredictionService(mockRepo as never);

    // Act & Assert
    await expect(getPredictionsForStop('missing-stop')).rejects.toThrow(NotFoundError);
});
```

**Request/Response Testing (Supertest):**
```typescript
it('responds with 200 and an array of route objects', async () => {
    // Arrange
    const routes = [makeRoute('1A'), makeRoute('2B')];
    getMockService().getAgencyRoutes.mockReturnValue(routes);

    // Act
    const response = await request(app).get('/api/v1/routes/all');

    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toBeInstanceOf(Array);
    expect(response.body).toHaveLength(2);
});

it('responds with route objects that contain the expected properties', async () => {
    // Arrange
    getMockService().getAgencyRoutes.mockReturnValue([makeRoute('1A')]);

    // Act
    const response = await request(app).get('/api/v1/routes/all');

    // Assert
    expect(response.body[0]).toMatchObject({
        id: 'route-1',
        shortName: '1A',
        longName: 'Route 1A Long',
    });
});
```

**Verifying Mock Calls with Matchers:**
```typescript
expect(mockAxiosGet).toHaveBeenCalledWith(expect.stringContaining('stop=stop-1'));
expect(mockAxiosGet).toHaveBeenCalledWith(expect.stringContaining('alexandria-dash'));
expect(result).toBeInstanceOf(Error);
```

## Singleton Isolation in Tests

**Problem:** Singleton instances persist across tests, causing test bleed.

**Solution:** Reset singleton in beforeEach and afterEach:
```typescript
beforeEach(() => {
    // @ts-expect-error accessing private static for test isolation
    BusDataRepository.instance = undefined;
    repo = BusDataRepository.getInstance();
});

afterEach(() => {
    // @ts-expect-error accessing private static for test isolation
    BusDataRepository.instance = undefined;
});
```

**Why @ts-expect-error:** The `instance` property is marked `private static`, so TypeScript would normally forbid access. Using `@ts-expect-error` suppresses the type error during tests while making it clear this is intentional test code.

## Test Environment Setup

**File:** `src/server/test/setup.ts`

Vitest runs this before any tests, setting required environment variables:

```typescript
process.env.DASH_API_BASE_URL = 'https://api.test.example.com';
process.env.DASH_API_AGENCY = 'test-agency';
process.env.DASH_API_KEY = 'test-api-key';
process.env.PORT = '3000';
```

These values ensure tests don't need real API credentials and provide consistent test data.

---

*Testing analysis: 2026-08-20*
