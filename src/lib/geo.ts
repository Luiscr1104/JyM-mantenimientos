export interface LatLng {
    lat: number;
    lng: number;
}

const EARTH_RADIUS_METERS = 6_371_000;

export function haversineMeters(a: LatLng, b: LatLng): number {
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const dLat = toRadians(b.lat - a.lat);
    const dLng = toRadians(b.lng - a.lng);

    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;

    return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

/** Orden estimado de paradas sin vuelta al punto de partida. */
export function estimateRoute(origin: LatLng, stops: LatLng[]) {
    const pending = stops.map((_, index) => index);
    const order: number[] = [];
    let current = origin;
    let totalMeters = 0;

    while (pending.length > 0) {
        let best = 0;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (let position = 0; position < pending.length; position += 1) {
            const distance = haversineMeters(current, stops[pending[position]]);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = position;
            }
        }
        const [nextIndex] = pending.splice(best, 1);
        order.push(nextIndex);
        totalMeters += bestDistance;
        current = stops[nextIndex];
    }

    const distanceMeters = Math.round(totalMeters * 1.35);
    return {
        order,
        distanceMeters,
        durationSeconds: Math.round((distanceMeters / 1000 / 35) * 3600),
    };
}

/** Decodifica una polilínea codificada de Google (precisión 5). */
export function decodePolyline(encoded: string): Array<[number, number]> {
    const points: Array<[number, number]> = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
        let shift = 0;
        let result = 0;
        let byte: number;

        do {
            byte = encoded.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);

        lat += result & 1 ? ~(result >> 1) : result >> 1;

        shift = 0;
        result = 0;

        do {
            byte = encoded.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);

        lng += result & 1 ? ~(result >> 1) : result >> 1;

        points.push([lat / 1e5, lng / 1e5]);
    }

    return points;
}

/** Enlace a Google Maps hasta la última visita (máximo 9 paradas intermedias). */
export function googleMapsRouteUrl(origin: LatLng, stops: LatLng[]): string | null {
    if (stops.length === 0 || stops.length > 10) return null;

    const waypoints = stops.slice(0, -1).map((stop) => `${stop.lat},${stop.lng}`).join('|');
    const destination = stops[stops.length - 1];
    const params = new URLSearchParams({
        api: '1',
        origin: `${origin.lat},${origin.lng}`,
        destination: `${destination.lat},${destination.lng}`,
        travelmode: 'driving',
    });
    if (waypoints) params.set('waypoints', waypoints);

    return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function googleMapsStopUrl(stop: LatLng): string {
    return `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}&travelmode=driving`;
}
