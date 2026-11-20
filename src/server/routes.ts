import { eq } from 'drizzle-orm';
import { db, routePlans, visits, type RoutePlan, type RouteStop } from '@/db';
import type { RouteOrigin } from '@/db/schema';
import { getToday } from '@/lib/dates';
import { optimizeRoute } from '@/lib/google-routes';
import { getSettings } from './settings';
import { listVisitsByDate, type VisitWithProperty } from './visits';

export async function getRoutePlan(date: string): Promise<RoutePlan | null> {
    const [row] = await db
        .select()
        .from(routePlans)
        .where(eq(routePlans.visitDate, date))
        .limit(1);

    return row ?? null;
}

export async function clearRoutePlan(date: string) {
    await db.delete(routePlans).where(eq(routePlans.visitDate, date));
}

export interface OptimizedDay {
    plan: RoutePlan;
    visits: VisitWithProperty[];
}

export type RouteStart =
    | { kind: 'base' }
    | { kind: 'gps'; lat: number; lng: number }
    | { kind: 'property'; visitId: string };

export async function optimizeDayRoute(date: string, start: RouteStart = { kind: 'base' }): Promise<OptimizedDay> {
    const settings = await getSettings();
    const dayRows = await listVisitsByDate(date);
    const rows = dayRows.filter((row) => row.visit.status === 'scheduled');

    if (rows.length === 0) {
        throw new Error('No hay visitas pendientes para este día.');
    }

    let origin: RouteOrigin;
    if (start.kind === 'gps') {
        if (date !== getToday() || !Number.isFinite(start.lat) || !Number.isFinite(start.lng) ||
            Math.abs(start.lat) > 90 || Math.abs(start.lng) > 180) {
            throw new Error('Ubicación actual inválida para este día.');
        }
        origin = { lat: start.lat, lng: start.lng, label: 'Ubicación actual', kind: 'gps' };
    } else if (start.kind === 'property') {
        if (date !== getToday()) throw new Error('Solo se puede partir de una visita actual hoy.');
        const current = dayRows.find((row) => row.visit.id === start.visitId && row.visit.status === 'in_progress');
        if (!current || current.property.lat == null || current.property.lng == null) {
            throw new Error('La visita en curso no tiene ubicación marcada.');
        }
        origin = {
            lat: current.property.lat,
            lng: current.property.lng,
            label: current.property.alias,
            kind: 'property',
        };
    } else {
        if (settings.baseLat == null || settings.baseLng == null) {
            throw new Error('Configura la ubicación base en Ajustes antes de optimizar la ruta.');
        }
        origin = { lat: settings.baseLat, lng: settings.baseLng, label: 'Base', kind: 'base' };
    }

    const routable = rows.filter((row) => row.property.lat != null && row.property.lng != null);

    if (routable.length === 0) {
        throw new Error('Ninguna visita tiene ubicación marcada en el mapa.');
    }

    const result = await optimizeRoute(
        origin,
        routable.map((row) => ({ lat: row.property.lat as number, lng: row.property.lng as number })),
    );

    const ordered = result.order
        .map((index) => routable[index])
        .filter((row): row is VisitWithProperty => Boolean(row));

    const rest = rows.filter((row) => !routable.includes(row));
    const all = [...ordered, ...rest];

    for (let index = 0; index < all.length; index += 1) {
        await db
            .update(visits)
            .set({ orderIndex: index, updatedAt: new Date() })
            .where(eq(visits.id, all[index].visit.id));
    }

    const stops: RouteStop[] = ordered.map((row, index) => ({
        visitId: row.visit.id,
        propertyId: row.property.id,
        order: index,
        lat: row.property.lat as number,
        lng: row.property.lng as number,
    }));

    const [plan] = await db
        .insert(routePlans)
        .values({
            visitDate: date,
            stops,
            origin,
            distanceMeters: result.distanceMeters,
            durationSeconds: result.durationSeconds,
            polyline: result.polyline,
            source: result.source,
            optimizedAt: new Date(),
        })
        .onConflictDoUpdate({
            target: routePlans.visitDate,
            set: {
                stops,
                origin,
                distanceMeters: result.distanceMeters,
                durationSeconds: result.durationSeconds,
                polyline: result.polyline,
                source: result.source,
                optimizedAt: new Date(),
                updatedAt: new Date(),
            },
        })
        .returning();

    return { plan, visits: all };
}
