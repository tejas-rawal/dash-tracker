export interface GeoPoint {
    lat: number;
    lon: number;
}

const EARTH_RADIUS_MILES = 3958.8;

function toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
}

/**
 * Computes the great-circle distance between two lat/lon points using the
 * haversine formula, returned in miles and rounded to 2 decimal places.
 * @param a First point.
 * @param b Second point.
 * @returns Distance in miles, rounded to 2 decimal places.
 */
export function haversineDistanceMiles(a: GeoPoint, b: GeoPoint): number {
    const deltaLat = toRadians(b.lat - a.lat);
    const deltaLon = toRadians(b.lon - a.lon);
    const lat1 = toRadians(a.lat);
    const lat2 = toRadians(b.lat);

    const haversine = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
    const centralAngle = 2 * Math.asin(Math.sqrt(haversine));
    const distance = EARTH_RADIUS_MILES * centralAngle;

    return Math.round(distance * 100) / 100;
}
