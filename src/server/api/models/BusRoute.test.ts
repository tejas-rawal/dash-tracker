import { describe, expect, it } from 'vitest';
import { BusRoute, RouteType } from './BusRoute';
import { BusStop } from './BusStop';
import { RouteDirection } from './RouteDirection';

const makeStop = (id: string) =>
    new BusStop({ id, name: `Stop ${id}`, code: Number(id), lat: 38.8, lon: -77.1 });

const makeDirection = (id: string, stops: BusStop[]) =>
    new RouteDirection({ id, title: `Direction ${id}`, stops, headSigns: [] });

const makeRoute = (overrides: Partial<ConstructorParameters<typeof BusRoute>[0]> = {}) =>
    new BusRoute({
        id: 'route-1',
        longName: 'Route One Long',
        shortName: '1',
        name: 'Route One',
        type: RouteType.Bus,
        directions: [],
        ...overrides,
    });

describe('BusRoute', () => {
    describe('constructor', () => {
        it('assigns all properties from the data argument', () => {
            // Arrange
            const directions = [makeDirection('d1', [makeStop('s1')])];

            // Act
            const route = makeRoute({ directions });

            // Assert
            expect(route.id).toBe('route-1');
            expect(route.longName).toBe('Route One Long');
            expect(route.shortName).toBe('1');
            expect(route.name).toBe('Route One');
            expect(route.type).toBe(RouteType.Bus);
            expect(route.directions).toEqual(directions);
        });
    });

    describe('getAllStops', () => {
        it('returns all unique stops across all directions', () => {
            // Arrange
            const stop1 = makeStop('s1');
            const stop2 = makeStop('s2');
            const stop3 = makeStop('s3');
            const dir1 = makeDirection('d1', [stop1, stop2]);
            const dir2 = makeDirection('d2', [stop2, stop3]);
            const route = makeRoute({ directions: [dir1, dir2] });

            // Act
            const stops = route.getAllStops();

            // Assert
            expect(stops).toHaveLength(3);
            expect(stops.map(s => s.id)).toEqual(['s1', 's2', 's3']);
        });

        it('returns an empty array when the route has no directions', () => {
            // Arrange
            const route = makeRoute({ directions: [] });

            // Act
            const stops = route.getAllStops();

            // Assert
            expect(stops).toEqual([]);
        });

        it('returns an empty array when all directions have no stops', () => {
            // Arrange
            const dir1 = makeDirection('d1', []);
            const dir2 = makeDirection('d2', []);
            const route = makeRoute({ directions: [dir1, dir2] });

            // Act
            const stops = route.getAllStops();

            // Assert
            expect(stops).toEqual([]);
        });

        it('deduplicates stops that appear in multiple directions', () => {
            // Arrange
            const sharedStop = makeStop('shared');
            const dir1 = makeDirection('d1', [sharedStop]);
            const dir2 = makeDirection('d2', [sharedStop]);
            const route = makeRoute({ directions: [dir1, dir2] });

            // Act
            const stops = route.getAllStops();

            // Assert
            expect(stops).toHaveLength(1);
            expect(stops[0].id).toBe('shared');
        });
    });

    describe('getDirectionById', () => {
        it('returns the direction matching the given id', () => {
            // Arrange
            const dir1 = makeDirection('d1', []);
            const dir2 = makeDirection('d2', []);
            const route = makeRoute({ directions: [dir1, dir2] });

            // Act
            const found = route.getDirectionById('d2');

            // Assert
            expect(found).toBe(dir2);
        });

        it('returns undefined when no direction matches the given id', () => {
            // Arrange
            const route = makeRoute({ directions: [makeDirection('d1', [])] });

            // Act
            const found = route.getDirectionById('nonexistent');

            // Assert
            expect(found).toBeUndefined();
        });

        it('returns undefined when the route has no directions', () => {
            // Arrange
            const route = makeRoute({ directions: [] });

            // Act
            const found = route.getDirectionById('d1');

            // Assert
            expect(found).toBeUndefined();
        });
    });

    describe('RouteType enum', () => {
        it('maps Tram to the value "0"', () => {
            expect(RouteType.Tram).toBe('0');
        });

        it('maps Subway to the value "1"', () => {
            expect(RouteType.Subway).toBe('1');
        });

        it('maps Rail to the value "2"', () => {
            expect(RouteType.Rail).toBe('2');
        });

        it('maps Bus to the value "3"', () => {
            expect(RouteType.Bus).toBe('3');
        });
    });
});
