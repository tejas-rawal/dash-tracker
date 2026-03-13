import { describe, expect, it } from 'vitest';
import { NotFoundError } from './index';

describe('NotFoundError', () => {
    it('is an instance of Error', () => {
        // Arrange & Act
        const error = new NotFoundError('something not found');

        // Assert
        expect(error).toBeInstanceOf(Error);
    });

    it('is an instance of NotFoundError', () => {
        // Arrange & Act
        const error = new NotFoundError('something not found');

        // Assert
        expect(error).toBeInstanceOf(NotFoundError);
    });

    it('sets the message to the provided string', () => {
        // Arrange
        const message = 'Route not found: 1A';

        // Act
        const error = new NotFoundError(message);

        // Assert
        expect(error.message).toBe(message);
    });

    it('sets the name property to "NotFoundError"', () => {
        // Arrange & Act
        const error = new NotFoundError('test');

        // Assert
        expect(error.name).toBe('NotFoundError');
    });
});
