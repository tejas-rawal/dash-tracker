import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../errors';
import { BusRoute, BusStop, RouteType } from '../models';
import { RouteDirection } from '../models/RouteDirection';
import { createBusRouteController } from './BusRouteController';

const makeStop = () =>
    new BusStop({ id: 'stop-1', name: 'Main St', code: 101, lat: 38.8, lon: -77.1 });

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

const makeMockRes = () => {
    const res = {
        json: vi.fn(),
        status: vi.fn(),
    } as unknown as Response;
    (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
    return res;
};

const makeMockReq = (params: Record<string, string> = {}) =>
    ({ params } as unknown as Request);

const makeMockService = () => ({
    getAgencyRoutes: vi.fn(),
    getAgencyRoute: vi.fn(),
    getAgencyStop: vi.fn(),
    getAgencyStops: vi.fn(),
    getRoutesForStop: vi.fn(),
});

describe('BusRouteController', () => {
    describe('getAllRoutes', () => {
        it('responds with the list of routes returned by the service', () => {
            // Arrange
            const mockService = makeMockService();
            const routes = [makeRoute('1A'), makeRoute('2B')];
            mockService.getAgencyRoutes.mockReturnValue(routes);
            const { getAllRoutes } = createBusRouteController(mockService);
            const req = makeMockReq();
            const res = makeMockRes();

            // Act
            getAllRoutes(req, res, vi.fn());

            // Assert
            expect(res.json).toHaveBeenCalledWith(routes);
        });

        it('responds with an empty array when the service returns no routes', () => {
            // Arrange
            const mockService = makeMockService();
            mockService.getAgencyRoutes.mockReturnValue([]);
            const { getAllRoutes } = createBusRouteController(mockService);
            const req = makeMockReq();
            const res = makeMockRes();

            // Act
            getAllRoutes(req, res, vi.fn());

            // Assert
            expect(res.json).toHaveBeenCalledWith([]);
        });

        it('responds with status 500 when the service throws a generic error', () => {
            // Arrange
            const mockService = makeMockService();
            mockService.getAgencyRoutes.mockImplementation(() => { throw new Error('DB failure'); });
            const { getAllRoutes } = createBusRouteController(mockService);
            const req = makeMockReq();
            const res = makeMockRes();

            // Act
            getAllRoutes(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(500);
        });

        it('responds with a Request Failed error body when the service throws a generic error', () => {
            // Arrange
            const mockService = makeMockService();
            mockService.getAgencyRoutes.mockImplementation(() => { throw new Error('DB failure'); });
            const { getAllRoutes } = createBusRouteController(mockService);
            const req = makeMockReq();
            const res = makeMockRes();

            // Act
            getAllRoutes(req, res, vi.fn());

            // Assert
            expect(res.json).toHaveBeenCalledWith({
                error: 'Request Failed',
                details: 'DB failure',
            });
        });

        it('responds with status 404 when the service throws a NotFoundError', () => {
            // Arrange
            const mockService = makeMockService();
            mockService.getAgencyRoutes.mockImplementation(() => { throw new NotFoundError('not found'); });
            const { getAllRoutes } = createBusRouteController(mockService);
            const req = makeMockReq();
            const res = makeMockRes();

            // Act
            getAllRoutes(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(404);
        });

        it('responds with a Not Found error body when the service throws a NotFoundError', () => {
            // Arrange
            const mockService = makeMockService();
            mockService.getAgencyRoutes.mockImplementation(() => { throw new NotFoundError('not found'); });
            const { getAllRoutes } = createBusRouteController(mockService);
            const req = makeMockReq();
            const res = makeMockRes();

            // Act
            getAllRoutes(req, res, vi.fn());

            // Assert
            expect(res.json).toHaveBeenCalledWith({
                error: 'Not Found',
                details: 'not found',
            });
        });

        it('responds with unknown error details when a non-Error is thrown', () => {
            // Arrange
            const mockService = makeMockService();
            // biome-ignore lint/style/useThrowOnlyError: intentionally testing non-Error throw path
            mockService.getAgencyRoutes.mockImplementation(() => { throw 'string error'; });
            const { getAllRoutes } = createBusRouteController(mockService);
            const req = makeMockReq();
            const res = makeMockRes();

            // Act
            getAllRoutes(req, res, vi.fn());

            // Assert
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ details: 'Unknown error' }),
            );
        });
    });

    describe('getRoute', () => {
        it('responds with the route matching the shortName param', () => {
            // Arrange
            const mockService = makeMockService();
            const route = makeRoute('1A');
            mockService.getAgencyRoute.mockReturnValue(route);
            const { getRoute } = createBusRouteController(mockService);
            const req = makeMockReq({ shortName: '1A' });
            const res = makeMockRes();

            // Act
            getRoute(req, res, vi.fn());

            // Assert
            expect(mockService.getAgencyRoute).toHaveBeenCalledWith('1A');
            expect(res.json).toHaveBeenCalledWith(route);
        });

        it('responds with status 404 when the service throws a NotFoundError', () => {
            // Arrange
            const mockService = makeMockService();
            mockService.getAgencyRoute.mockImplementation(() => { throw new NotFoundError('Route not found: X'); });
            const { getRoute } = createBusRouteController(mockService);
            const req = makeMockReq({ shortName: 'X' });
            const res = makeMockRes();

            // Act
            getRoute(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(404);
        });

        it('responds with a Not Found error body when the service throws a NotFoundError', () => {
            // Arrange
            const mockService = makeMockService();
            mockService.getAgencyRoute.mockImplementation(() => { throw new NotFoundError('Route not found: X'); });
            const { getRoute } = createBusRouteController(mockService);
            const req = makeMockReq({ shortName: 'X' });
            const res = makeMockRes();

            // Act
            getRoute(req, res, vi.fn());

            // Assert
            expect(res.json).toHaveBeenCalledWith({
                error: 'Not Found',
                details: 'Route not found: X',
            });
        });

        it('responds with status 500 when the service throws a generic error', () => {
            // Arrange
            const mockService = makeMockService();
            mockService.getAgencyRoute.mockImplementation(() => { throw new Error('internal'); });
            const { getRoute } = createBusRouteController(mockService);
            const req = makeMockReq({ shortName: '1A' });
            const res = makeMockRes();

            // Act
            getRoute(req, res, vi.fn());

            // Assert
            expect(res.status).toHaveBeenCalledWith(500);
        });

        it('responds with unknown error details when a non-Error is thrown', () => {
            // Arrange
            const mockService = makeMockService();
            // biome-ignore lint/style/useThrowOnlyError: intentionally testing non-Error throw path
            mockService.getAgencyRoute.mockImplementation(() => { throw 42; });
            const { getRoute } = createBusRouteController(mockService);
            const req = makeMockReq({ shortName: '1A' });
            const res = makeMockRes();

            // Act
            getRoute(req, res, vi.fn());

            // Assert
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ details: 'Unknown error' }),
            );
        });
    });
});
