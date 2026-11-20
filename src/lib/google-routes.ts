import { GOOGLE_MAPS_API_KEY } from 'astro:env/server';
import { estimateRoute, type LatLng } from './geo';

export interface RouteOptimization {
    order: number[];
    distanceMeters: number | null;
    durationSeconds: number | null;
    polyline: string | null;
    source: 'google' | 'fallback';
}

const ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const MAX_WAYPOINTS = 25;

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

async function callGoogle(origin: LatLng, stops: LatLng[], suggestedOrder: number[]): Promise<RouteOptimization> {
    // Google optimiza puntos intermedios, pero necesita un destino fijo.
    // Elegimos la última parada con el orden estimado y optimizamos las anteriores.
    const destinationIndex = suggestedOrder[suggestedOrder.length - 1];
    const intermediateIndices = suggestedOrder.slice(0, -1);
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
            origin: googleLatLng(origin),
            destination: googleLatLng(stops[destinationIndex]),
            ...(intermediateIndices.length > 0 && {
                intermediates: intermediateIndices.map((index) => googleLatLng(stops[index])),
            }),
            travelMode: 'DRIVE',
            routingPreference: 'TRAFFIC_UNAWARE',
            optimizeWaypointOrder: intermediateIndices.length > 1,
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

    const identity = intermediateIndices.map((_, index) => index);
    const optimized = route.optimizedIntermediateWaypointIndex ?? [];

    const order =
        optimized.length === identity.length &&
        new Set(optimized).size === identity.length &&
        optimized.every((index) => Number.isInteger(index) && index >= 0 && index < identity.length)
            ? optimized.map((index) => intermediateIndices[index])
            : intermediateIndices;

    const duration = route.duration ? Number(String(route.duration).replace('s', '')) : null;

    return {
        order: [...order, destinationIndex],
        distanceMeters: route.distanceMeters ?? null,
        durationSeconds: Number.isFinite(duration) ? duration : null,
        polyline: route.polyline?.encodedPolyline ?? null,
        source: 'google',
    };
}

export async function optimizeRoute(origin: LatLng, stops: LatLng[]): Promise<RouteOptimization> {
    if (stops.length === 0) {
        return { order: [], distanceMeters: 0, durationSeconds: 0, polyline: null, source: 'fallback' };
    }

    const estimated = estimateRoute(origin, stops);
    if (isGoogleRoutesEnabled() && stops.length <= MAX_WAYPOINTS) {
        try {
            return await callGoogle(origin, stops, estimated.order);
        } catch (error) {
            console.error('[google-routes] Falló la optimización, uso línea recta:', error);
        }
    }

    return { ...estimated, polyline: null, source: 'fallback' };
}
