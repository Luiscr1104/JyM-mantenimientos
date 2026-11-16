import { and, asc, eq, ne, sql } from 'drizzle-orm';
import {
    clients,
    db,
    properties,
    routePlans,
    servicePlans,
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

    if (existing) return existing.id;

    const orderIndex = input.orderIndex ?? (await nextOrderIndex(input.scheduledFor));

    const [row] = await db
        .insert(visits)
        .values({
            propertyId: input.propertyId,
            scheduledFor: input.scheduledFor,
            orderIndex,
        })
        .onConflictDoNothing({ target: [visits.propertyId, visits.scheduledFor] })
        .returning({ id: visits.id });

    if (row) {
        await invalidateRoute(input.scheduledFor);
        return row.id;
    }
    const [duplicate] = await db
        .select({ id: visits.id })
        .from(visits)
        .where(and(eq(visits.propertyId, input.propertyId), eq(visits.scheduledFor, input.scheduledFor)))
        .limit(1);
    if (!duplicate) throw new Error('No se pudo confirmar la visita.');
    return duplicate.id;
}

export async function deleteVisit(id: string) {
    const row = await db.transaction(async (tx) => {
        const [current] = await tx.select().from(visits).where(eq(visits.id, id)).for('update');
        if (!current) return null;
        if (current.pumpStartedAt && !current.pumpStoppedAt) {
            throw new VisitWorkError('Detén y verifica la bomba antes de eliminar la visita.');
        }
        const [deleted] = await tx.delete(visits).where(eq(visits.id, id)).returning({
            date: visits.scheduledFor,
        });
        return deleted;
    });

    if (row) await invalidateRoute(row.date);
    return Boolean(row);
}

export async function applyVisitAction(id: string, action: VisitAction) {
    if (action === 'delete') {
        await deleteVisit(id);
        return null;
    }
    if (action === 'complete') return completeVisit(id);

    const [current] = await db.select().from(visits).where(eq(visits.id, id)).limit(1);
    if (!current) return null;
    const allowed: Record<Exclude<VisitAction, 'delete' | 'complete'>, Visit['status'][]> = {
        start: ['scheduled'],
        skip: ['scheduled', 'in_progress'],
        reopen: ['completed', 'skipped'],
    };
    if (!allowed[action].includes(current.status)) return current;

    const now = new Date();
    const patch: Partial<typeof visits.$inferInsert> = { updatedAt: now };

    switch (action) {
        case 'start':
            patch.status = 'in_progress';
            patch.startedAt = current.startedAt ?? now;
            break;
        case 'skip':
            if (current.pumpStartedAt && !current.pumpStoppedAt) {
                throw new VisitWorkError('Detén y verifica la bomba antes de omitir la visita.');
            }
            patch.status = 'skipped';
            break;
        case 'reopen':
            patch.status = 'scheduled';
            patch.startedAt = null;
            patch.completedAt = null;
            patch.checklist = normalizeChecklist(current.checklist);
            for (const { key } of EXIT_STEPS) patch.checklist[key] = false;
            break;
    }

    const [row] = await db.update(visits).set(patch)
        .where(and(
            eq(visits.id, id),
            eq(visits.status, current.status),
            action === 'skip'
                ? sql`(${visits.pumpStartedAt} is null or ${visits.pumpStoppedAt} is not null)`
                : undefined,
        )).returning();
    if (row && action !== 'start') await invalidateRoute(current.scheduledFor);

    if (row) return row;
    const [latest] = await db.select().from(visits).where(eq(visits.id, id)).limit(1);
    if (action === 'skip' && latest?.pumpStartedAt && !latest.pumpStoppedAt) {
        throw new VisitWorkError('Detén y verifica la bomba antes de omitir la visita.');
    }
    return latest ?? null;
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
