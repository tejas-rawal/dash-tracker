import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BusRoute, BusStop, RouteType } from '../models';
import { RouteDirection } from '../models/RouteDirection';

vi.mock('../../config', () => ({
    axios: { get: vi.fn() },
    environment: {
        dashApi: { agency: 'test-agency', baseUrl: 'https://api.test.example.com', apiKey: 'key' },
        server: { port: 3000 },
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { axios } from '../../config';
import { BusDataRepository } from './BusDataRepository';

const mockAxiosGet = vi.mocked(axios.get);

const makeApiStop = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    name: `Stop ${id}`,
    code: '101',
    lat: '38.8',
    lon: '-77.1',
    ...overrides,
});

const makeApiDirection = (id: string, stops: ReturnType<typeof makeApiStop>[] = []) => ({
    id,
    title: `Direction ${id}`,
    stops,
    headSigns: ['Downtown'],
});

const makeApiRoute = (
    id: string,
    shortName: string,
    directions: ReturnType<typeof makeApiDirection>[] = []
) => ({
    id,
    shortName,
    longName: `Route ${shortName} Long`,
    name: `Route ${shortName}`,
    type: RouteType.Bus,
    directions,
});

const makeApiResponse = (routes: ReturnType<typeof makeApiRoute>[]) => ({
    data: { data: { routes } },
});

describe('BusDataRepository', () => {
    let repo: BusDataRepository;

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset the singleton so each test gets a fresh instance
        // @ts-expect-error accessing private static for test isolation
        BusDataRepository.instance = undefined;
        repo = BusDataRepository.getInstance();
    });

    afterEach(() => {
        // @ts-expect-error accessing private static for test isolation
        BusDataRepository.instance = undefined;
    });

    describe('getInstance', () => {
        it('always returns the same singleton instance', () => {
            // Arrange & Act
            const instance1 = BusDataRepository.getInstance();
            const instance2 = BusDataRepository.getInstance();

            // Assert
            expect(instance1).toBe(instance2);
        });
    });

    describe('initialize', () => {
        it('fetches data from the correct API path on first call', async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute('r1', '1A')]));

            // Act
            await repo.initialize();

            // Assert
            expect(mockAxiosGet).toHaveBeenCalledWith('/info/test-agency/routes?verbose=true');
        });

        it('populates routes after successful initialization', async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute('r1', '1A')]));

            // Act
            await repo.initialize();
            const routes = repo.getAllRoutes();

            // Assert
            expect(routes).toHaveLength(1);
            expect(routes[0]).toBeInstanceOf(BusRoute);
            expect(routes[0].shortName).toBe('1A');
        });

        it('populates stops after successful initialization', async () => {
            // Arrange
            const stop = makeApiStop('s1');
            const direction = makeApiDirection('d1', [stop]);
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute('r1', '1A', [direction])]));

            // Act
            await repo.initialize();
            const stops = repo.getAllStops();

            // Assert
            expect(stops).toHaveLength(1);
            expect(stops[0]).toBeInstanceOf(BusStop);
            expect(stops[0].id).toBe('s1');
        });

        it('does not call the API again when already initialized', async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute('r1', '1A')]));

            // Act
            await repo.initialize();
            await repo.initialize();

            // Assert
            expect(mockAxiosGet).toHaveBeenCalledOnce();
        });

        it('does not call the API a second time when initialization is already in progress', async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute('r1', '1A')]));

            // Act
            await Promise.all([repo.initialize(), repo.initialize()]);

            // Assert
            expect(mockAxiosGet).toHaveBeenCalledOnce();
        });

        it('throws when the API call rejects', async () => {
            // Arrange
            mockAxiosGet.mockRejectedValue(new Error('network error'));

            // Act & Assert
            await expect(repo.initialize()).rejects.toThrow('Failed to initialize bus data');
        });

        it('resets the initialization promise so a retry is possible after failure', async () => {
            // Arrange
            mockAxiosGet.mockRejectedValueOnce(new Error('network error'));
            mockAxiosGet.mockResolvedValueOnce(makeApiResponse([makeApiRoute('r1', '1A')]));

            // Act
            await repo.initialize().catch(() => undefined);
            await repo.initialize();

            // Assert
            expect(mockAxiosGet).toHaveBeenCalledTimes(2);
        });

        it('handles an API response with no routes gracefully', async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue(makeApiResponse([]));

            // Act
            await repo.initialize();
            const routes = repo.getAllRoutes();

            // Assert
            expect(routes).toEqual([]);
        });

        it('handles an API response where routes is null', async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue({ data: { data: { routes: null } } });

            // Act
            await repo.initialize();
            const routes = repo.getAllRoutes();

            // Assert
            expect(routes).toEqual([]);
        });

        it('handles a route without shortName without adding it to the shortName map', async () => {
            // Arrange
            const routeWithoutShortName = { ...makeApiRoute('r1', ''), shortName: undefined } as unknown as ReturnType<typeof makeApiRoute>;
            mockAxiosGet.mockResolvedValue(makeApiResponse([routeWithoutShortName]));

            // Act
            await repo.initialize();

            // Assert
            expect(repo.getRouteByShortName('')).toBeUndefined();
        });

        it('deduplicates stops that appear in multiple directions of a route', async () => {
            // Arrange
            const sharedStop = makeApiStop('shared-stop');
            const dir1 = makeApiDirection('d1', [sharedStop]);
            const dir2 = makeApiDirection('d2', [sharedStop]);
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute('r1', '1A', [dir1, dir2])]));

            // Act
            await repo.initialize();
            const stops = repo.getAllStops();

            // Assert
            expect(stops).toHaveLength(1);
        });

        it('throws when a stop has an invalid numeric code', async () => {
            // Arrange
            const badStop = makeApiStop('s1', { code: 'not-a-number' });
            const direction = makeApiDirection('d1', [badStop]);
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute('r1', '1A', [direction])]));

            // Act & Assert
            await expect(repo.initialize()).rejects.toThrow();
        });

        it('throws when a stop has an invalid latitude', async () => {
            // Arrange
            const badStop = makeApiStop('s1', { lat: 'not-a-number' });
            const direction = makeApiDirection('d1', [badStop]);
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute('r1', '1A', [direction])]));

            // Act & Assert
            await expect(repo.initialize()).rejects.toThrow();
        });

        it('throws when a stop has an invalid longitude', async () => {
            // Arrange
            const badStop = makeApiStop('s1', { lon: 'not-a-number' });
            const direction = makeApiDirection('d1', [badStop]);
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute('r1', '1A', [direction])]));

            // Act & Assert
            await expect(repo.initialize()).rejects.toThrow();
        });

        it('accepts numeric code, lat and lon values without conversion errors', async () => {
            // Arrange
            const numericStop = makeApiStop('s1', { code: 101, lat: 38.8, lon: -77.1 });
            const direction = makeApiDirection('d1', [numericStop]);
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute('r1', '1A', [direction])]));

            // Act
            await repo.initialize();
            const stops = repo.getAllStops();

            // Assert
            expect(stops[0].code).toBe(101);
            expect(stops[0].lat).toBe(38.8);
        });

        it('processes a direction with no stops property without throwing', async () => {
            // Arrange
            const directionWithoutStops = { id: 'd1', title: 'NB', headSigns: [] } as unknown as ReturnType<typeof makeApiDirection>;
            mockAxiosGet.mockResolvedValue(
                makeApiResponse([{ ...makeApiRoute('r1', '1A'), directions: [directionWithoutStops] }])
            );

            // Act
            await repo.initialize();
            const routes = repo.getAllRoutes();

            // Assert
            expect(routes[0].directions[0].stops).toEqual([]);
        });

        it('processes a route with no directions property without throwing', async () => {
            // Arrange
            const routeWithoutDirs = { ...makeApiRoute('r1', '1A'), directions: undefined } as unknown as ReturnType<typeof makeApiRoute>;
            mockAxiosGet.mockResolvedValue(makeApiResponse([routeWithoutDirs]));

            // Act
            await repo.initialize();
            const routes = repo.getAllRoutes();

            // Assert
            expect(routes[0].directions).toEqual([]);
        });
    });

    describe('refreshData', () => {
        it('re-fetches from the API and updates routes', async () => {
            // Arrange
            mockAxiosGet.mockResolvedValueOnce(makeApiResponse([makeApiRoute('r1', '1A')]));
            await repo.initialize();
            mockAxiosGet.mockResolvedValueOnce(makeApiResponse([makeApiRoute('r1', '1A'), makeApiRoute('r2', '2B')]));

            // Act
            await repo.refreshData();
            const routes = repo.getAllRoutes();

            // Assert
            expect(routes).toHaveLength(2);
        });

        it('throws when the refresh API call rejects', async () => {
            // Arrange
            mockAxiosGet.mockResolvedValueOnce(makeApiResponse([makeApiRoute('r1', '1A')]));
            await repo.initialize();
            mockAxiosGet.mockRejectedValueOnce(new Error('refresh failed'));

            // Act & Assert
            await expect(repo.refreshData()).rejects.toThrow('Failed to refresh bus data');
        });
    });

    describe('getAllRoutes', () => {
        it('throws when called before initialization', () => {
            // Arrange & Act & Assert
            expect(() => repo.getAllRoutes()).toThrow('BusDataRepository has not been initialized');
        });
    });

    describe('getRouteById', () => {
        it('returns the route matching the given id', async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute('r1', '1A')]));
            await repo.initialize();

            // Act
            const route = repo.getRouteById('r1');

            // Assert
            expect(route).toBeInstanceOf(BusRoute);
            expect(route?.id).toBe('r1');
        });

        it('returns undefined when no route matches the given id', async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute('r1', '1A')]));
            await repo.initialize();

            // Act
            const route = repo.getRouteById('nonexistent');

            // Assert
            expect(route).toBeUndefined();
        });

        it('throws when called before initialization', () => {
            // Arrange & Act & Assert
            expect(() => repo.getRouteById('r1')).toThrow('BusDataRepository has not been initialized');
        });
    });

    describe('getRouteByShortName', () => {
        it('returns the route matching the given short name', async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute('r1', '1A')]));
            await repo.initialize();

            // Act
            const route = repo.getRouteByShortName('1A');

            // Assert
            expect(route?.shortName).toBe('1A');
        });

        it('returns undefined when no route matches the given short name', async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute('r1', '1A')]));
            await repo.initialize();

            // Act
            const route = repo.getRouteByShortName('UNKNOWN');

            // Assert
            expect(route).toBeUndefined();
        });

        it('throws when called before initialization', () => {
            // Arrange & Act & Assert
            expect(() => repo.getRouteByShortName('1A')).toThrow('BusDataRepository has not been initialized');
        });
    });

    describe('getAllStops', () => {
        it('returns all stops after initialization', async () => {
            // Arrange
            const stop = makeApiStop('s1');
            const direction = makeApiDirection('d1', [stop]);
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute('r1', '1A', [direction])]));
            await repo.initialize();

            // Act
            const stops = repo.getAllStops();

            // Assert
            expect(stops).toHaveLength(1);
            expect(stops[0]).toBeInstanceOf(BusStop);
        });

        it('throws when called before initialization', () => {
            // Arrange & Act & Assert
            expect(() => repo.getAllStops()).toThrow('BusDataRepository has not been initialized');
        });
    });

    describe('getStopById', () => {
        it('returns the stop matching the given id', async () => {
            // Arrange
            const stop = makeApiStop('s1');
            const direction = makeApiDirection('d1', [stop]);
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute('r1', '1A', [direction])]));
            await repo.initialize();

            // Act
            const found = repo.getStopById('s1');

            // Assert
            expect(found).toBeInstanceOf(BusStop);
            expect(found?.id).toBe('s1');
        });

        it('returns undefined when no stop matches the given id', async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute('r1', '1A')]));
            await repo.initialize();

            // Act
            const found = repo.getStopById('unknown-stop');

            // Assert
            expect(found).toBeUndefined();
        });

        it('throws when called before initialization', () => {
            // Arrange & Act & Assert
            expect(() => repo.getStopById('s1')).toThrow('BusDataRepository has not been initialized');
        });
    });

    describe('getRoutesForStop', () => {
        it('returns routes that contain the given stop', async () => {
            // Arrange
            const stop = makeApiStop('s1');
            const direction = makeApiDirection('d1', [stop]);
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute('r1', '1A', [direction])]));
            await repo.initialize();

            // Act
            const routes = repo.getRoutesForStop('s1');

            // Assert
            expect(routes).toHaveLength(1);
            expect(routes[0]).toBeInstanceOf(BusRoute);
        });

        it('returns an empty array when no routes contain the given stop', async () => {
            // Arrange
            mockAxiosGet.mockResolvedValue(makeApiResponse([makeApiRoute('r1', '1A')]));
            await repo.initialize();

            // Act
            const routes = repo.getRoutesForStop('nonexistent-stop');

            // Assert
            expect(routes).toEqual([]);
        });

        it('throws when called before initialization', () => {
            // Arrange & Act & Assert
            expect(() => repo.getRoutesForStop('s1')).toThrow('BusDataRepository has not been initialized');
        });

        it('returns routes from multiple routes that share the given stop', async () => {
            // Arrange
            const sharedStop = makeApiStop('shared');
            const dir1 = makeApiDirection('d1', [sharedStop]);
            const dir2 = makeApiDirection('d2', [sharedStop]);
            mockAxiosGet.mockResolvedValue(makeApiResponse([
                makeApiRoute('r1', '1A', [dir1]),
                makeApiRoute('r2', '2B', [dir2]),
            ]));
            await repo.initialize();

            // Act
            const routes = repo.getRoutesForStop('shared');

            // Assert
            expect(routes).toHaveLength(2);
        });
    });
});
