import { describe, expect, it } from 'vitest';
import { BusStop } from './BusStop';

describe('BusStop', () => {
    describe('constructor', () => {
        it('assigns all properties from the data argument', () => {
            // Arrange
            const data = { id: 'stop-1', name: 'Main St', code: 101, lat: 38.8, lon: -77.1 };

            // Act
            const stop = new BusStop(data);

            // Assert
            expect(stop.id).toBe('stop-1');
            expect(stop.name).toBe('Main St');
            expect(stop.code).toBe(101);
            expect(stop.lat).toBe(38.8);
            expect(stop.lon).toBe(-77.1);
        });
    });

    describe('getLocation', () => {
        it('returns an object containing the lat and lon of the stop', () => {
            // Arrange
            const stop = new BusStop({ id: 'stop-1', name: 'Main St', code: 101, lat: 38.8, lon: -77.1 });

            // Act
            const location = stop.getLocation();

            // Assert
            expect(location).toEqual({ lat: 38.8, lon: -77.1 });
        });

        it('returns exact numeric values without rounding', () => {
            // Arrange
            const stop = new BusStop({ id: 'stop-2', name: 'Oak Ave', code: 202, lat: 38.123456789, lon: -77.987654321 });

            // Act
            const location = stop.getLocation();

            // Assert
            expect(location.lat).toBe(38.123456789);
            expect(location.lon).toBe(-77.987654321);
        });
    });
});
