import { and, asc, eq, gte, inArray, lt, lte } from 'drizzle-orm';
import { clients, db, properties, visitProducts, visits, waterFillTasks } from '@/db';
import { addDays } from '@/lib/dates';

export async function getWeeklyReportData(start: string, end: string) {
    const rows = await db.select({ visit: visits, property: properties, client: clients })
        .from(visits)
        .innerJoin(properties, eq(visits.propertyId, properties.id))
        .innerJoin(clients, eq(properties.clientId, clients.id))
        .where(and(gte(visits.scheduledFor, start), lte(visits.scheduledFor, end)))
        .orderBy(asc(visits.scheduledFor), asc(visits.orderIndex), asc(visits.createdAt));

    const ids = rows.map(({ visit }) => visit.id);
    // Costa Rica permanece en UTC-6; filtrar con medianoche local, no UTC.
    const startAt = new Date(`${start}T06:00:00.000Z`);
    const endAt = new Date(`${addDays(end, 1)}T06:00:00.000Z`);
    const [products, followUps, waterTasks] = await Promise.all([
        ids.length ? db.select().from(visitProducts).where(inArray(visitProducts.visitId, ids)) : Promise.resolve([]),
        ids.length ? db.select().from(visits).where(inArray(visits.followUpForVisitId, ids)) : Promise.resolve([]),
        db.select({ task: waterFillTasks, property: properties, client: clients })
            .from(waterFillTasks)
            .innerJoin(properties, eq(waterFillTasks.propertyId, properties.id))
            .innerJoin(clients, eq(properties.clientId, clients.id))
            .where(and(gte(waterFillTasks.createdAt, startAt), lt(waterFillTasks.createdAt, endAt)))
            .orderBy(asc(waterFillTasks.createdAt)),
    ]);

    return { rows, products, followUps, waterTasks };
}
