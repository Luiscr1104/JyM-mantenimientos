import { eq } from 'drizzle-orm';
import { db, routePlans, visits, type RoutePlan, type RouteStop } from '@/db';
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

export async function optimizeDayRoute(date: string): Promise<OptimizedDay> {
    const settings = await getSettings();

    if (settings.baseLat == null || settings.baseLng == null) {
        throw new Error('Configura la ubicación base en Ajustes antes de optimizar la ruta.');
    }

    const rows = (await listVisitsByDate(date))
        .filter((row) => row.visit.status === 'scheduled' || row.visit.status === 'in_progress');

    if (rows.length === 0) {
        throw new Error('No hay visitas pendientes para este día.');
    }

    const routable = rows.filter((row) => row.property.lat != null && row.property.lng != null);

    if (routable.length === 0) {
        throw new Error('Ninguna visita tiene ubicación marcada en el mapa.');
    }

    const result = await optimizeRoute(
        { lat: settings.baseLat, lng: settings.baseLng },
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
