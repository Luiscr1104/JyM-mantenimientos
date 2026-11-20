import type { APIRoute } from 'astro';
import { inArray } from 'drizzle-orm';
import { db, visitProducts } from '@/db';
import { getToday } from '@/lib/dates';
import { z } from 'zod';
import { json } from '@/lib/http';
import { normalizeChecklist } from '@/lib/visit-work';
import { listVisitsByDate } from '@/server/visits';
import type { OfflineVisit } from '@/lib/offline-visit';

export const GET: APIRoute = async ({ locals, url }) => {
    if (!locals.user) return json({ error: 'No autorizado' }, 401);
    const requested = url.searchParams.get('date');
    const date = requested && z.iso.date().safeParse(requested).success ? requested : getToday();
    const rows = (await listVisitsByDate(date)).filter(({ visit }) =>
        visit.status === 'scheduled' || visit.status === 'in_progress');
    const ids = rows.map(({ visit }) => visit.id);
    const entries = ids.length
        ? await db.select().from(visitProducts).where(inArray(visitProducts.visitId, ids))
            .orderBy(visitProducts.createdAt, visitProducts.id)
        : [];
    const visits: OfflineVisit[] = rows.map(({ visit, property }) => ({
        id: visit.id,
        propertyName: property.alias,
        address: property.address,
        gateCode: property.gateCode,
        accessNotes: property.accessNotes,
        pumpNotes: property.pumpNotes,
        date: visit.scheduledFor,
        expectedUpdatedAt: visit.updatedAt.toISOString(),
        status: visit.status as 'scheduled' | 'in_progress',
        startedAt: visit.startedAt?.toISOString() ?? null,
        pumpStartedAt: visit.pumpStartedAt?.toISOString() ?? null,
        pumpStoppedAt: visit.pumpStoppedAt?.toISOString() ?? null,
        completedAt: null,
        work: {
            workTypes: visit.workTypes,
            checklist: normalizeChecklist(visit.checklist),
            notes: visit.notes ?? '',
            pendingReason: visit.pendingReason ?? '',
        },
        products: entries.filter((entry) => entry.visitId === visit.id)
            .map((entry) => ({ product: entry.product, quantity: Number(entry.quantity) })),
        addedProducts: [],
        removedProducts: [],
        syncId: crypto.randomUUID(),
        pending: false,
    }));
    return json({ userId: locals.user.id, visits });
};
