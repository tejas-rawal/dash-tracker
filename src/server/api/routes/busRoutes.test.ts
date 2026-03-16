import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../errors';
import { BusRoute, BusStop, RouteType } from '../models';
import { RouteDirection } from '../models/RouteDirection';

vi.mock('../services/BusRouteService', () => ({
    getAgencyRoutes: vi.fn(),
    getAgencyRoute: vi.fn(),
    getAgencyStop: vi.fn(),
    getAgencyStops: vi.fn(),
    getRoutesForStop: vi.fn(),
}));

import { getAgencyRoute, getAgencyRoutes } from '../services/BusRouteService';
import app from '../../test/app';

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

describe('GET /api/v1/routes/all', () => {
    it('responds with 200 and an array of route objects', async () => {
        // Arrange
        const routes = [makeRoute('1A'), makeRoute('2B')];
        vi.mocked(getAgencyRoutes).mockReturnValue(routes);

        // Act
        const response = await request(app).get('/api/v1/routes/all');

        // Assert
        expect(response.status).toBe(200);
        expect(response.body).toBeInstanceOf(Array);
        expect(response.body).toHaveLength(2);
    });

    it('responds with route objects that contain the expected properties', async () => {
        // Arrange
        vi.mocked(getAgencyRoutes).mockReturnValue([makeRoute('1A')]);

        // Act
        const response = await request(app).get('/api/v1/routes/all');

        // Assert
        expect(response.body[0]).toMatchObject({
            id: 'route-1',
            shortName: '1A',
            longName: 'Route 1A Long',
            name: 'Route 1A',
            type: RouteType.Bus,
        });
    });

    it('responds with 200 and an empty array when there are no routes', async () => {
        // Arrange
        vi.mocked(getAgencyRoutes).mockReturnValue([]);

        // Act
        const response = await request(app).get('/api/v1/routes/all');

        // Assert
        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
    });

    it('responds with 500 and an error body when the service throws', async () => {
        // Arrange
        vi.mocked(getAgencyRoutes).mockImplementation(() => { throw new Error('service error'); });

        // Act
        const response = await request(app).get('/api/v1/routes/all');

        // Assert
        expect(response.status).toBe(500);
        expect(response.body).toMatchObject({
            error: 'Request Failed',
            details: 'service error',
        });
    });
});

describe('GET /api/v1/routes/:shortName', () => {
    it('responds with 200 and the matching route object', async () => {
        // Arrange
        const route = makeRoute('1A');
        vi.mocked(getAgencyRoute).mockReturnValue(route);

        // Act
        const response = await request(app).get('/api/v1/routes/1A');

        // Assert
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            id: 'route-1',
            shortName: '1A',
        });
    });

    it('responds with 404 and a Not Found error body when the route does not exist', async () => {
        // Arrange
        vi.mocked(getAgencyRoute).mockImplementation(() => {
            throw new NotFoundError('Route not found: UNKNOWN');
        });

        // Act
        const response = await request(app).get('/api/v1/routes/UNKNOWN');

        // Assert
        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({
            error: 'Not Found',
            details: 'Route not found: UNKNOWN',
        });
    });

    it('responds with 500 and a Request Failed error body when the service throws a generic error', async () => {
        // Arrange
        vi.mocked(getAgencyRoute).mockImplementation(() => { throw new Error('unexpected'); });

        // Act
        const response = await request(app).get('/api/v1/routes/1A');

        // Assert
        expect(response.status).toBe(500);
        expect(response.body).toMatchObject({
            error: 'Request Failed',
            details: 'unexpected',
        });
    });

    it('passes the shortName path parameter to the service', async () => {
        // Arrange
        const route = makeRoute('3C');
        vi.mocked(getAgencyRoute).mockReturnValue(route);

        // Act
        await request(app).get('/api/v1/routes/3C');

        // Assert
        expect(getAgencyRoute).toHaveBeenCalledWith('3C');
    });
});
