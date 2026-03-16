import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../errors';
import { BusRoute, BusStop, RouteType } from '../models';
import { RouteDirection } from '../models/RouteDirection';

vi.mock('../repositories/BusDataRepository', () => {
    const mockInstance = {
        getAllRoutes: vi.fn(),
        getRouteByShortName: vi.fn(),
        getStopById: vi.fn(),
        getAllStops: vi.fn(),
        getRoutesForStop: vi.fn(),
    };
    return {
        BusDataRepository: {
            getInstance: vi.fn(() => mockInstance),
        },
    };
});

import { BusDataRepository } from '../repositories/BusDataRepository';
import {
    getAgencyRoute,
    getAgencyRoutes,
    getAgencyStop,
    getAgencyStops,
    getRoutesForStop,
} from './BusRouteService';

const mockRepo = vi.mocked(BusDataRepository.getInstance(), true);

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

describe('BusRouteService', () => {
    describe('getAgencyRoutes', () => {
        it('returns all routes from the repository', () => {
            // Arrange
            const routes = [makeRoute('1A'), makeRoute('2B')];
            mockRepo.getAllRoutes.mockReturnValue(routes);

            // Act
            const result = getAgencyRoutes();

            // Assert
            expect(result).toEqual(routes);
            expect(mockRepo.getAllRoutes).toHaveBeenCalledOnce();
        });

        it('returns an empty array when the repository has no routes', () => {
            // Arrange
            mockRepo.getAllRoutes.mockReturnValue([]);

            // Act
            const result = getAgencyRoutes();

            // Assert
            expect(result).toEqual([]);
        });
    });

    describe('getAgencyRoute', () => {
        it('returns the route matching the given short name', () => {
            // Arrange
            const route = makeRoute('1A');
            mockRepo.getRouteByShortName.mockReturnValue(route);

            // Act
            const result = getAgencyRoute('1A');

            // Assert
            expect(result).toEqual(route);
            expect(mockRepo.getRouteByShortName).toHaveBeenCalledWith('1A');
        });

        it('throws a NotFoundError when no route matches the short name', () => {
            // Arrange
            mockRepo.getRouteByShortName.mockReturnValue(undefined);

            // Act & Assert
            expect(() => getAgencyRoute('UNKNOWN')).toThrowError(NotFoundError);
        });

        it('includes the short name in the NotFoundError message', () => {
            // Arrange
            mockRepo.getRouteByShortName.mockReturnValue(undefined);

            // Act & Assert
            expect(() => getAgencyRoute('UNKNOWN')).toThrowError('Route not found: UNKNOWN');
        });
    });

    describe('getAgencyStop', () => {
        it('returns the stop matching the given stop id', () => {
            // Arrange
            const stop = makeStop('stop-42');
            mockRepo.getStopById.mockReturnValue(stop);

            // Act
            const result = getAgencyStop('stop-42');

            // Assert
            expect(result).toEqual(stop);
            expect(mockRepo.getStopById).toHaveBeenCalledWith('stop-42');
        });

        it('throws a NotFoundError when no stop matches the given id', () => {
            // Arrange
            mockRepo.getStopById.mockReturnValue(undefined);

            // Act & Assert
            expect(() => getAgencyStop('missing-stop')).toThrowError(NotFoundError);
        });

        it('includes the stop id in the NotFoundError message', () => {
            // Arrange
            mockRepo.getStopById.mockReturnValue(undefined);

            // Act & Assert
            expect(() => getAgencyStop('missing-stop')).toThrowError('Stop not found: missing-stop');
        });
    });

    describe('getAgencyStops', () => {
        it('returns all stops from the repository', () => {
            // Arrange
            const stops = [makeStop('s1'), makeStop('s2')];
            mockRepo.getAllStops.mockReturnValue(stops);

            // Act
            const result = getAgencyStops();

            // Assert
            expect(result).toEqual(stops);
            expect(mockRepo.getAllStops).toHaveBeenCalledOnce();
        });

        it('returns an empty array when the repository has no stops', () => {
            // Arrange
            mockRepo.getAllStops.mockReturnValue([]);

            // Act
            const result = getAgencyStops();

            // Assert
            expect(result).toEqual([]);
        });
    });

    describe('getRoutesForStop', () => {
        it('returns all routes containing the given stop id', () => {
            // Arrange
            const routes = [makeRoute('1A'), makeRoute('2B')];
            mockRepo.getRoutesForStop.mockReturnValue(routes);

            // Act
            const result = getRoutesForStop('stop-1');

            // Assert
            expect(result).toEqual(routes);
            expect(mockRepo.getRoutesForStop).toHaveBeenCalledWith('stop-1');
        });

        it('returns an empty array when no routes contain the given stop', () => {
            // Arrange
            mockRepo.getRoutesForStop.mockReturnValue([]);

            // Act
            const result = getRoutesForStop('orphan-stop');

            // Assert
            expect(result).toEqual([]);
        });
    });
});
