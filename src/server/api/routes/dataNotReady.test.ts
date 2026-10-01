import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../../test/app";

// Nothing in this file ever loads route/stop data. vitest isolates modules per test file, so the
// BusDataRepository singleton every route module captured at import stays in its pre-load state for the
// whole file.

const NOT_READY_BODY = { error: "Service Unavailable", details: "Route and stop data is still loading" };

const NOT_READY_ROWS: { label: string; path: string }[] = [
    { label: "GET /api/v1/predictions/stream", path: "/api/v1/predictions/stream?stop=stop-1" },
    { label: "GET /api/v1/vehicles with a route filter", path: "/api/v1/vehicles?route=1A" },
    { label: "GET /api/v1/routes/all", path: "/api/v1/routes/all" },
    { label: "GET /api/v1/routes/:shortName", path: "/api/v1/routes/1A" },
    { label: "GET /api/v1/routes/:shortName/stops", path: "/api/v1/routes/1A/stops" },
    { label: "GET /api/v1/stops/nearby", path: "/api/v1/stops/nearby?lat=38.8&lng=-77.1" },
    { label: "GET /api/v1/predictions", path: "/api/v1/predictions?stop=stop-1" },
];

describe("route/stop-dependent endpoints before the first successful load", () => {
    // Rows go in as [label, path] tuples so the "%s" title prints the label unquoted ($label would quote it).
    it.each(NOT_READY_ROWS.map(({ label, path }) => [label, path]))(
        "%s answers 503 with Retry-After before the first route/stop load",
        async (_label, path) => {
            // Arrange
            const client = request(app);

            // Act
            const response = await client.get(path);

            // Assert
            expect(response.status).toBe(503);
            expect(response.headers["retry-after"]).toBe("5");
            expect(response.headers["content-type"]).toMatch(/application\/json/);
            expect(response.body).toEqual(NOT_READY_BODY);
        },
    );

    it("POST /api/v1/favorites answers 503 with Retry-After before the first route/stop load", async () => {
        // Arrange
        // resolveEntity reads the route/stop repository before any SQLite write, so this runs without an open database.
        const client = request(app);

        // Act
        const response = await client
            .post("/api/v1/favorites")
            .set("X-Device-Id", "device-a")
            .send({ entityType: "route", entityId: "route-1" });

        // Assert
        expect(response.status).toBe(503);
        expect(response.headers["retry-after"]).toBe("5");
        expect(response.body).toEqual(NOT_READY_BODY);
    });
});
