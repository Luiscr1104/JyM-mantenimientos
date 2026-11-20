import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { db, offlineVisitSyncs, routePlans, visitEvents, visitProducts, visits } from '@/db';
import { offlineSyncSchema } from '@/lib/offline-visit';
import { getCompletionIssue, normalizeChecklist } from '@/lib/visit-work';
import { VisitWorkError } from './visit-work';

type Input = z.infer<typeof offlineSyncSchema>;

function checkedDate(value: string | null, name: string, now: number): Date | null {
    if (!value) return null;
    const date = new Date(value);
    if (date.getTime() > now + 5 * 60_000 || date.getTime() < now - 30 * 24 * 3600_000) {
        throw new VisitWorkError(`La hora de ${name} parece incorrecta. Revisa el reloj del dispositivo.`, 400);
    }
    return date;
}

export async function syncOfflineVisit(input: Input, actorId: string) {
    const now = Date.now();
    const start = checkedDate(input.startedAt, 'llegada', now);
    const pumpStart = checkedDate(input.pumpStartedAt, 'encendido', now);
    const pumpStop = checkedDate(input.pumpStoppedAt, 'apagado', now);
    const end = checkedDate(input.completedAt, 'salida', now);
    if ((!start && (end || pumpStart || pumpStop)) || (start && end && end < start) ||
        (pumpStart && (!start || pumpStart < start || (end && pumpStart > end))) ||
        (pumpStop && (!pumpStart || pumpStop < pumpStart || (end && pumpStop > end)))) {
        throw new VisitWorkError('Revisa el orden de las horas de llegada, bomba y salida.', 400);
    }
    const checklist = normalizeChecklist(input.work.checklist);
    const issue = getCompletionIssue(checklist, input.work.pendingReason,
        Boolean(pumpStart && !pumpStop), input.work.workTypes);
    if (end && issue) throw new VisitWorkError(issue, 400);

    const result = await db.transaction(async (tx) => {
        const [current] = await tx.select().from(visits)
            .where(eq(visits.id, input.visitId)).for('update');
        if (!current) throw new VisitWorkError('La visita ya no existe.', 404);
        const [previous] = await tx.select().from(offlineVisitSyncs)
            .where(eq(offlineVisitSyncs.id, input.syncId)).limit(1);
        if (previous) {
            if (previous.visitId !== input.visitId || previous.actorId !== actorId) {
                throw new VisitWorkError('Esta sincronización pertenece a otra visita.', 409);
            }
            return { visit: current, alreadySynced: true };
        }
        if (current.updatedAt.toISOString() !== input.expectedUpdatedAt ||
            (current.status !== 'scheduled' && current.status !== 'in_progress')) {
            throw new VisitWorkError('La visita cambió en el servidor. Conservamos la copia local; revísala antes de sincronizar.', 409);
        }
        if (current.status === 'in_progress' && current.startedAt?.getTime() !== start?.getTime()) {
            throw new VisitWorkError('La hora de llegada ya no coincide con el servidor.', 409);
        }
        if (current.pumpStartedAt && current.pumpStartedAt.getTime() !== pumpStart?.getTime()) {
            throw new VisitWorkError('El encendido de la bomba cambió en el servidor.', 409);
        }
        if (current.pumpStoppedAt && current.pumpStoppedAt.getTime() !== pumpStop?.getTime()) {
            throw new VisitWorkError('El apagado de la bomba cambió en el servidor.', 409);
        }
        const existing = await tx.select().from(visitProducts)
            .where(eq(visitProducts.visitId, input.visitId)).orderBy(visitProducts.createdAt, visitProducts.id);
        const serverProducts = existing
            .map(({ product, quantity }) => `${product}:${Number(quantity)}`).sort();
        const initialProducts = input.existingProducts
            .map(({ product, quantity }) => `${product}:${quantity}`).sort();
        if (serverProducts.length !== initialProducts.length ||
            serverProducts.some((product, index) => product !== initialProducts[index])) {
            throw new VisitWorkError('Los productos cambiaron en el servidor. Conservamos la visita local para revisar el conflicto.', 409);
        }
        if (new Set(input.removedProducts).size !== input.removedProducts.length ||
            input.removedProducts.some((index) => index >= existing.length ||
                existing[index].product !== input.existingProducts[index]?.product ||
                Number(existing[index].quantity) !== input.existingProducts[index]?.quantity)) {
            throw new VisitWorkError('Los productos cambiaron. Conservamos la copia local para revisión.', 409);
        }
        if (!start && (input.products.length || current.status !== 'scheduled')) {
            throw new VisitWorkError('Falta la llegada.', 400);
        }
        const [visit] = await tx.update(visits).set({
            status: end ? 'completed' : start ? 'in_progress' : 'scheduled',
            startedAt: start,
            pumpStartedAt: pumpStart,
            pumpStoppedAt: pumpStop,
            workTypes: input.work.workTypes,
            checklist,
            notes: input.work.notes || null,
            pendingReason: input.work.pendingReason || null,
            completedAt: end,
            leftAt: end,
            updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)),
        }).where(eq(visits.id, input.visitId)).returning();
        const events = [
            ...(current.status === 'scheduled'
                && start ? [{ visitId: input.visitId, kind: 'arrival' as const, occurredAt: start, actorId }]
                : []),
            ...(end ? [{ visitId: input.visitId, kind: 'departure' as const, occurredAt: end, actorId }] : []),
        ];
        if (events.length) await tx.insert(visitEvents).values(events);
        for (const index of input.removedProducts) {
            await tx.delete(visitProducts).where(eq(visitProducts.id, existing[index].id));
        }
        if (input.products.length) await tx.insert(visitProducts).values(
            input.products.map(({ product, quantity }) =>
                ({ visitId: input.visitId, product, quantity: String(quantity) })));
        await tx.insert(offlineVisitSyncs).values({ id: input.syncId, visitId: input.visitId, actorId });
        return { visit, alreadySynced: false };
    });
    await db.delete(routePlans).where(eq(routePlans.visitDate, result.visit.scheduledFor));
    return result;
}
