import { GOOGLE_MAPS_API_KEY } from 'astro:env/server';
import { haversineMeters, type LatLng } from './geo';

export interface RouteOptimization {
    order: number[];
    distanceMeters: number | null;
    durationSeconds: number | null;
    polyline: string | null;
    source: 'google' | 'fallback';
}

const ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const MAX_WAYPOINTS = 25;
const ROAD_FACTOR = 1.35;
const AVERAGE_SPEED_KMH = 35;

export function isGoogleRoutesEnabled(): boolean {
    // El modo estimado es el predeterminado: no genera consumo de Google.
    return process.env.GOOGLE_ROUTES_ENABLED === 'true' && Boolean(GOOGLE_MAPS_API_KEY);
}

interface GoogleRoute {
    distanceMeters?: number;
    duration?: string;
    polyline?: { encodedPolyline?: string };
    optimizedIntermediateWaypointIndex?: number[];
}

function googleLatLng(point: LatLng) {
    return { location: { latLng: { latitude: point.lat, longitude: point.lng } } };
}

async function callGoogle(base: LatLng, stops: LatLng[]): Promise<RouteOptimization> {
    const response = await fetch(ENDPOINT, {
        method: 'POST',
        signal: AbortSignal.timeout(8_000),
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY ?? '',
            'X-Goog-FieldMask':
                'routes.distanceMeters,routes.duration,routes.optimizedIntermediateWaypointIndex,routes.polyline.encodedPolyline',
        },
        body: JSON.stringify({
            origin: googleLatLng(base),
            destination: googleLatLng(base),
            intermediates: stops.map(googleLatLng),
            travelMode: 'DRIVE',
            routingPreference: 'TRAFFIC_UNAWARE',
            optimizeWaypointOrder: true,
            polylineQuality: 'OVERVIEW',
        }),
    });

    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Google Routes respondió ${response.status}: ${detail.slice(0, 300)}`);
    }

    const data = (await response.json()) as { routes?: GoogleRoute[] };
    const route = data.routes?.[0];

    if (!route) throw new Error('Google Routes no devolvió ninguna ruta.');

    const identity = stops.map((_, index) => index);
    const optimized = route.optimizedIntermediateWaypointIndex ?? [];

    const order =
        optimized.length === stops.length &&
        optimized.every((index) => Number.isInteger(index) && index >= 0 && index < stops.length)
            ? optimized
            : identity;

    const duration = route.duration ? Number(String(route.duration).replace('s', '')) : null;

    return {
        order,
        distanceMeters: route.distanceMeters ?? null,
        durationSeconds: Number.isFinite(duration) ? duration : null,
        polyline: route.polyline?.encodedPolyline ?? null,
        source: 'google',
    };
}

function fallback(base: LatLng, stops: LatLng[]): RouteOptimization {
    const pending = stops.map((_, index) => index);
    const order: number[] = [];
    let current = base;
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

    // Vuelta a la base.
    totalMeters += haversineMeters(current, base);

    const roadMeters = Math.round(totalMeters * ROAD_FACTOR);
    const durationSeconds = Math.round((roadMeters / 1000 / AVERAGE_SPEED_KMH) * 3600);

    return {
        order,
        distanceMeters: roadMeters,
        durationSeconds,
        polyline: null,
        source: 'fallback',
    };
}

export async function optimizeRoute(base: LatLng, stops: LatLng[]): Promise<RouteOptimization> {
    if (stops.length === 0) {
        return { order: [], distanceMeters: 0, durationSeconds: 0, polyline: null, source: 'fallback' };
    }

    if (isGoogleRoutesEnabled() && stops.length <= MAX_WAYPOINTS) {
        try {
            return await callGoogle(base, stops);
        } catch (error) {
            console.error('[google-routes] Falló la optimización, uso línea recta:', error);
        }
    }

    return fallback(base, stops);
}
