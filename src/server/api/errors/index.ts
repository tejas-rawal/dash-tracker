export class NotFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NotFoundError';
    }
}

export class UpstreamApiError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UpstreamApiError';
    }
}
