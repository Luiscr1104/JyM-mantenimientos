import { and, asc, eq, ne, sql } from 'drizzle-orm';
import {
    clients,
    db,
    profiles,
    properties,
    routePlans,
    servicePlans,
    visitEvents,
    visits,
    type Client,
    type Property,
    type Visit,
} from '@/db';
import { matchesPreferredDay } from '@/lib/dates';
import type { VisitInput } from '@/lib/validation';
import { EXIT_STEPS, normalizeChecklist } from '@/lib/visit-work';
import { completeVisit, VisitWorkError } from './visit-work';

export interface VisitWithProperty {
    visit: Visit;
    property: Property;
    client: Client;
}

export interface SuggestedVisit {
    propertyId: string;
    alias: string;
    address: string;
    clientName: string;
    visitsPerWeek: number;
}

export type VisitAction = 'start' | 'complete' | 'skip' | 'reopen' | 'delete';

async function invalidateRoute(date: string) {
    await db.delete(routePlans).where(eq(routePlans.visitDate, date));
}

export async function listVisitsByDate(
    date: string,
    options: { includeSkipped?: boolean } = {},
): Promise<VisitWithProperty[]> {
    const filters = [eq(visits.scheduledFor, date)];
    if (!options.includeSkipped) filters.push(ne(visits.status, 'skipped'));

    return db
        .select({ visit: visits, property: properties, client: clients })
        .from(visits)
        .innerJoin(properties, eq(visits.propertyId, properties.id))
        .innerJoin(clients, eq(properties.clientId, clients.id))
        .where(and(...filters))
        .orderBy(asc(visits.orderIndex), asc(visits.createdAt));
}

export async function getVisitWithProperty(id: string): Promise<VisitWithProperty | null> {
    const [row] = await db
        .select({ visit: visits, property: properties, client: clients })
        .from(visits)
        .innerJoin(properties, eq(visits.propertyId, properties.id))
        .innerJoin(clients, eq(properties.clientId, clients.id))
        .where(eq(visits.id, id))
        .limit(1);

    return row ?? null;
}

async function nextOrderIndex(date: string): Promise<number> {
    const [row] = await db
        .select({ value: sql<number | null>`max(${visits.orderIndex})` })
        .from(visits)
        .where(eq(visits.scheduledFor, date));

    return Number(row?.value ?? -1) + 1;
}

export async function createVisit(input: VisitInput) {
    const [existing] = await db
        .select({ id: visits.id })
        .from(visits)
        .where(
            and(
                eq(visits.propertyId, input.propertyId),
                eq(visits.scheduledFor, input.scheduledFor),
            ),
        )
        .limit(1);

    if (existing) return { id: existing.id, created: false };

    const orderIndex = input.orderIndex ?? (await nextOrderIndex(input.scheduledFor));

    const [row] = await db
        .insert(visits)
        .values({
            propertyId: input.propertyId,
            scheduledFor: input.scheduledFor,
            orderIndex,
            workTypes: [input.workType],
        })
        .onConflictDoNothing({ target: [visits.propertyId, visits.scheduledFor] })
        .returning({ id: visits.id });

    if (row) {
        await invalidateRoute(input.scheduledFor);
        return { id: row.id, created: true };
    }
    const [duplicate] = await db
        .select({ id: visits.id })
        .from(visits)
        .where(and(eq(visits.propertyId, input.propertyId), eq(visits.scheduledFor, input.scheduledFor)))
        .limit(1);
    if (!duplicate) throw new Error('No se pudo confirmar la visita.');
    return { id: duplicate.id, created: false };
}

export async function deleteVisit(id: string) {
    const row = await db.transaction(async (tx) => {
        const [current] = await tx.select().from(visits).where(eq(visits.id, id)).for('update');
        if (!current) return null;
        if (current.pumpStartedAt && !current.pumpStoppedAt) {
            throw new VisitWorkError('Detén y verifica la bomba antes de eliminar la visita.');
        }
        const [event] = await tx.select({ id: visitEvents.id }).from(visitEvents)
            .where(eq(visitEvents.visitId, id)).limit(1);
        if (event || current.status !== 'scheduled' || current.startedAt ||
            current.leftAt || current.completedAt || current.checklist ||
            current.pumpStartedAt || current.pumpStoppedAt ||
            current.notes?.trim() || current.pendingReason?.trim()) {
            throw new VisitWorkError('Esta visita tiene historial. Reábrela o consúltala, pero no se puede borrar el registro.');
        }
        const [deleted] = await tx.delete(visits).where(eq(visits.id, id)).returning({
            date: visits.scheduledFor,
        });
        return deleted;
    });

    if (row) await invalidateRoute(row.date);
    return Boolean(row);
}

export async function applyVisitAction(id: string, action: VisitAction, actorId?: string) {
    if (action === 'delete') {
        if (!(await deleteVisit(id))) throw new VisitWorkError('Visita no encontrada', 404);
        return null;
    }
    if (action === 'complete') return completeVisit(id, actorId);

    const { row, changed, date } = await db.transaction(async (tx) => {
        const [current] = await tx.select().from(visits).where(eq(visits.id, id)).for('update');
        if (!current) return { row: null, changed: false, date: null };
        const allowed: Record<Exclude<VisitAction, 'delete' | 'complete'>, Visit['status'][]> = {
            start: ['scheduled'],
            skip: ['scheduled', 'in_progress'],
            reopen: ['completed', 'skipped'],
        };
        if (!allowed[action].includes(current.status)) {
            return { row: current, changed: false, date: current.scheduledFor };
        }
        if (action === 'skip' && current.pumpStartedAt && !current.pumpStoppedAt) {
            throw new VisitWorkError('Detén y verifica la bomba antes de omitir la visita.');
        }
        const now = new Date();
        const patch: Partial<typeof visits.$inferInsert> = { updatedAt: now };
        switch (action) {
            case 'start':
                patch.status = 'in_progress';
                patch.startedAt = current.startedAt ?? now;
                break;
            case 'skip':
                patch.status = 'skipped';
                if (current.startedAt) patch.leftAt = now;
                break;
            case 'reopen':
                patch.status = 'scheduled';
                patch.startedAt = null;
                patch.completedAt = null;
                patch.leftAt = null;
                patch.checklist = normalizeChecklist(current.checklist);
                for (const { key } of EXIT_STEPS) patch.checklist[key] = false;
                break;
        }
        const [updated] = await tx.update(visits).set(patch).where(eq(visits.id, id)).returning();
        await tx.insert(visitEvents).values({
            visitId: id,
            kind: action === 'start' ? 'arrival' : action,
            occurredAt: now,
            actorId,
        });
        return { row: updated, changed: true, date: current.scheduledFor };
    });
    if (changed && action !== 'start' && date) await invalidateRoute(date);
    return row;
}

export async function listVisitEvents(id: string) {
    return db.select({ event: visitEvents, actor: profiles.fullName })
        .from(visitEvents)
        .leftJoin(profiles, eq(visitEvents.actorId, profiles.id))
        .where(eq(visitEvents.visitId, id))
        .orderBy(asc(visitEvents.occurredAt));
}

export async function getVisitFollowUp(id: string) {
    const [row] = await db.select().from(visits)
        .where(eq(visits.followUpForVisitId, id)).limit(1);
    return row ?? null;
}

export async function scheduleFlocculationFollowUp(id: string, date: string) {
    const { visit, created } = await db.transaction(async (tx) => {
        const [source] = await tx.select().from(visits).where(eq(visits.id, id)).for('update');
        if (!source) throw new VisitWorkError('Visita no encontrada', 404);
        if (source.status !== 'completed' || !source.workTypes.includes('flocculation')) {
            throw new VisitWorkError('Completa la floculación antes de programar su seguimiento.');
        }
        if (date <= source.scheduledFor) {
            throw new VisitWorkError('El seguimiento debe ser en un día posterior a la floculación.', 400);
        }
        const [linked] = await tx.select().from(visits).where(eq(visits.followUpForVisitId, id)).limit(1);
        if (linked) return { visit: linked, created: false };

        const [existing] = await tx.select().from(visits)
            .where(and(eq(visits.propertyId, source.propertyId), eq(visits.scheduledFor, date))).limit(1);
        if (existing) {
            if (existing.followUpForVisitId && existing.followUpForVisitId !== id) {
                throw new VisitWorkError('Esa visita ya es seguimiento de otra floculación.');
            }
            const [updated] = await tx.update(visits).set({
                followUpForVisitId: id,
                workTypes: existing.status === 'completed' || existing.workTypes.includes('flocculation_follow_up')
                    ? existing.workTypes
                    : [...existing.workTypes, 'flocculation_follow_up'],
                updatedAt: new Date(),
            }).where(eq(visits.id, existing.id)).returning();
            return { visit: updated, created: false };
        }
        const [newVisit] = await tx.insert(visits).values({
            propertyId: source.propertyId,
            scheduledFor: date,
            orderIndex: Number((await tx.select({
                max: sql<number | null>`max(${visits.orderIndex})`,
            }).from(visits).where(eq(visits.scheduledFor, date)))[0]?.max ?? -1) + 1,
            workTypes: ['flocculation_follow_up'],
            followUpForVisitId: id,
        }).returning();
        return { visit: newVisit, created: true };
    });
    if (created) await invalidateRoute(date);
    return visit;
}

export async function suggestVisits(date: string): Promise<SuggestedVisit[]> {
    const rows = await db
        .select({ plan: servicePlans, property: properties, client: clients })
        .from(servicePlans)
        .innerJoin(properties, eq(servicePlans.propertyId, properties.id))
        .innerJoin(clients, eq(properties.clientId, clients.id))
        .where(and(eq(servicePlans.active, true), eq(clients.status, 'active')));

    const existing = new Set(
        (
            await db
                .select({ propertyId: visits.propertyId })
                .from(visits)
                .where(eq(visits.scheduledFor, date))
        ).map((row) => row.propertyId),
    );

    return rows
        .filter(
            ({ plan, property }) =>
                !existing.has(property.id) &&
                matchesPreferredDay(plan.preferredDays, date, plan.visitsPerWeek),
        )
        .map(({ plan, property, client }) => ({
            propertyId: property.id,
            alias: property.alias,
            address: property.address,
            clientName: client.name,
            visitsPerWeek: plan.visitsPerWeek,
        }));
}

export async function createSuggestedVisits(date: string): Promise<number> {
    const candidates = await suggestVisits(date);
    if (candidates.length === 0) return 0;

    let orderIndex = await nextOrderIndex(date);

    const created = await db
        .insert(visits)
        .values(
            candidates.map((candidate) => ({
                propertyId: candidate.propertyId,
                scheduledFor: date,
                orderIndex: orderIndex++,
            })),
        )
        .onConflictDoNothing({ target: [visits.propertyId, visits.scheduledFor] })
        .returning({ id: visits.id });

    if (created.length > 0) await invalidateRoute(date);
    return created.length;
}
