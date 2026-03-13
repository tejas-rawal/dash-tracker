import { describe, expect, it } from 'vitest';
import { BusStop } from './BusStop';
import { RouteDirection } from './RouteDirection';

const makeStop = (id: string) =>
    new BusStop({ id, name: `Stop ${id}`, code: Number(id), lat: 38.8, lon: -77.1 });

describe('RouteDirection', () => {
    describe('constructor', () => {
        it('assigns all properties from the data argument', () => {
            // Arrange
            const stops = [makeStop('1'), makeStop('2')];
            const data = { id: 'dir-1', title: 'Northbound', stops, headSigns: ['Downtown'] };

            // Act
            const direction = new RouteDirection(data);

            // Assert
            expect(direction.id).toBe('dir-1');
            expect(direction.title).toBe('Northbound');
            expect(direction.stops).toEqual(stops);
            expect(direction.headSigns).toEqual(['Downtown']);
        });
    });

    describe('getFirstStop', () => {
        it('returns the first stop in the stops array', () => {
            // Arrange
            const stops = [makeStop('1'), makeStop('2'), makeStop('3')];
            const direction = new RouteDirection({ id: 'd1', title: 'NB', stops, headSigns: [] });

            // Act
            const first = direction.getFirstStop();

            // Assert
            expect(first).toBe(stops[0]);
        });

        it('returns undefined when the stops array is empty', () => {
            // Arrange
            const direction = new RouteDirection({ id: 'd1', title: 'NB', stops: [], headSigns: [] });

            // Act
            const first = direction.getFirstStop();

            // Assert
            expect(first).toBeUndefined();
        });
    });

    describe('getLastStop', () => {
        it('returns the last stop in the stops array', () => {
            // Arrange
            const stops = [makeStop('1'), makeStop('2'), makeStop('3')];
            const direction = new RouteDirection({ id: 'd1', title: 'NB', stops, headSigns: [] });

            // Act
            const last = direction.getLastStop();

            // Assert
            expect(last).toBe(stops[2]);
        });

        it('returns undefined when the stops array is empty', () => {
            // Arrange
            const direction = new RouteDirection({ id: 'd1', title: 'NB', stops: [], headSigns: [] });

            // Act
            const last = direction.getLastStop();

            // Assert
            expect(last).toBeUndefined();
        });
    });

    describe('getNumberOfStops', () => {
        it('returns the count of stops in the direction', () => {
            // Arrange
            const stops = [makeStop('1'), makeStop('2'), makeStop('3')];
            const direction = new RouteDirection({ id: 'd1', title: 'NB', stops, headSigns: [] });

            // Act
            const count = direction.getNumberOfStops();

            // Assert
            expect(count).toBe(3);
        });

        it('returns zero when there are no stops', () => {
            // Arrange
            const direction = new RouteDirection({ id: 'd1', title: 'NB', stops: [], headSigns: [] });

            // Act
            const count = direction.getNumberOfStops();

            // Assert
            expect(count).toBe(0);
        });
    });
});
