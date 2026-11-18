import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db, profiles, properties, visits, waterFillTasks } from '@/db';
import { VisitWorkError } from './visit-work';
import type { z } from 'zod';
import type { waterFillInputSchema } from '@/lib/validation';

export async function listOpenWaterTasks() {
    return db.select({ task: waterFillTasks, property: properties })
        .from(waterFillTasks)
        .innerJoin(properties, eq(waterFillTasks.propertyId, properties.id))
        .where(isNull(waterFillTasks.closedAt))
        .orderBy(asc(waterFillTasks.dueAt));
}

export async function getOpenWaterTaskForProperty(propertyId: string) {
    const [row] = await db.select().from(waterFillTasks)
        .where(and(eq(waterFillTasks.propertyId, propertyId), isNull(waterFillTasks.closedAt)))
        .limit(1);
    return row ?? null;
}

export async function listWaterTaskHistory(propertyId: string) {
    const tasks = await db.select().from(waterFillTasks)
        .where(eq(waterFillTasks.propertyId, propertyId))
        .orderBy(desc(waterFillTasks.createdAt)).limit(10);
    const ids = [...new Set(tasks.flatMap((task) =>
        [task.openedBy, task.closedBy].filter((id): id is string => id !== null)))];
    const names = ids.length
        ? await db.select({ id: profiles.id, name: profiles.fullName }).from(profiles)
            .where(inArray(profiles.id, ids))
        : [];
    const byId = new Map(names.map(({ id, name }) => [id, name]));
    return tasks.map((task) => ({
        task,
        openedByName: task.openedBy ? byId.get(task.openedBy) ?? 'Usuario' : 'Usuario',
        closedByName: task.closedBy ? byId.get(task.closedBy) ?? 'Usuario' : null,
    }));
}

export async function createWaterTask(input: z.infer<typeof waterFillInputSchema>, userId: string) {
    return db.transaction(async (tx) => {
        let propertyId: string;
        if (input.visitId) {
            const [visit] = await tx.select().from(visits).where(eq(visits.id, input.visitId)).for('update');
            if (!visit) throw new VisitWorkError('Visita no encontrada', 404);
            if (visit.status !== 'in_progress') {
                throw new VisitWorkError('Inicia la visita antes de dejar la llave abierta.');
            }
            propertyId = visit.propertyId;
        } else {
            const [property] = await tx.select({ id: properties.id }).from(properties)
                .where(eq(properties.id, input.propertyId!)).limit(1);
            if (!property) throw new VisitWorkError('Propiedad no encontrada', 404);
            propertyId = property.id;
        }

        const [existing] = await tx.select({ id: waterFillTasks.id }).from(waterFillTasks)
            .where(and(eq(waterFillTasks.propertyId, propertyId), isNull(waterFillTasks.closedAt)))
            .limit(1);
        if (existing) throw new VisitWorkError('Ya hay una llave pendiente de cerrar en esta propiedad.');

        const dueAt = new Date(Date.now() + input.minutes * 60_000);
        const [row] = await tx.insert(waterFillTasks).values({
            propertyId,
            visitId: input.visitId ?? null,
            delayMinutes: input.minutes,
            openedBy: userId,
            dueAt,
        }).returning();
        return row;
    });
}

export async function closeWaterTask(id: string, userId: string) {
    const [row] = await db.update(waterFillTasks)
        .set({ closedAt: new Date(), closedBy: userId })
        .where(and(eq(waterFillTasks.id, id), isNull(waterFillTasks.closedAt)))
        .returning();
    if (!row) throw new VisitWorkError('La tarea ya fue cerrada o no existe.', 409);
    return row;
}
