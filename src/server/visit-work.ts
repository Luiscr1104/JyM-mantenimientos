import { eq } from 'drizzle-orm';
import { db, routePlans, visitEvents, visits } from '@/db';
import { getCompletionIssue, normalizeChecklist } from '@/lib/visit-work';
import type { z } from 'zod';
import type { visitWorkInputSchema } from '@/lib/validation';

export class VisitWorkError extends Error {
    constructor(message: string, public status = 409) {
        super(message);
    }
}

export async function saveVisitWork(id: string, input: z.infer<typeof visitWorkInputSchema>) {
    return db.transaction(async (tx) => {
        const [current] = await tx.select().from(visits).where(eq(visits.id, id)).for('update');
        if (!current) throw new VisitWorkError('Visita no encontrada', 404);
        if (current.status !== 'in_progress') {
            throw new VisitWorkError('Inicia la visita antes de guardar el trabajo.');
        }

        const [row] = await tx.update(visits).set({
            workTypes: input.workTypes,
            checklist: normalizeChecklist(input.checklist),
            notes: input.notes || null,
            pendingReason: input.pendingReason || null,
            updatedAt: new Date(),
        }).where(eq(visits.id, id)).returning();
        return row;
    });
}

export async function changePump(id: string, action: 'start' | 'stop') {
    return db.transaction(async (tx) => {
        const [current] = await tx.select().from(visits).where(eq(visits.id, id)).for('update');
        if (!current) throw new VisitWorkError('Visita no encontrada', 404);
        if (current.status !== 'in_progress') {
            throw new VisitWorkError('Inicia la visita antes de registrar la bomba.');
        }
        if (action === 'start' && current.pumpStartedAt) {
            throw new VisitWorkError('La bomba ya se registró en esta visita.');
        }
        if (action === 'stop' && (!current.pumpStartedAt || current.pumpStoppedAt)) {
            throw new VisitWorkError('No hay un temporizador de bomba en curso.');
        }

        const [row] = await tx.update(visits).set({
            ...(action === 'start' ? { pumpStartedAt: new Date() } : { pumpStoppedAt: new Date() }),
            updatedAt: new Date(),
        }).where(eq(visits.id, id)).returning();
        return row;
    });
}

export async function completeVisit(id: string, actorId?: string) {
    const { row, changed } = await db.transaction(async (tx) => {
        const [current] = await tx.select().from(visits).where(eq(visits.id, id)).for('update');
        if (!current) throw new VisitWorkError('Visita no encontrada', 404);
        if (current.status === 'completed') return { row: current, changed: false };
        if (current.status !== 'in_progress') {
            throw new VisitWorkError('Inicia la visita antes de completarla.');
        }

        const issue = getCompletionIssue(
            normalizeChecklist(current.checklist),
            current.pendingReason,
            Boolean(current.pumpStartedAt && !current.pumpStoppedAt),
            current.workTypes,
        );
        if (issue) throw new VisitWorkError(issue);

        const now = new Date();
        const [completed] = await tx.update(visits).set({
            status: 'completed',
            completedAt: now,
            leftAt: now,
            updatedAt: now,
        }).where(eq(visits.id, id)).returning();
        await tx.insert(visitEvents).values({
            visitId: id,
            kind: 'departure',
            occurredAt: now,
            actorId,
        });
        return { row: completed, changed: true };
    });
    if (changed) {
        await db.delete(routePlans).where(eq(routePlans.visitDate, row.scheduledFor));
    }
    return row;
}
