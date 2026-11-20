import type { APIRoute } from 'astro';
import { eq, inArray } from 'drizzle-orm';
import { db, visitProducts } from '@/db';
import { getToday } from '@/lib/dates';
import { json } from '@/lib/http';
import { normalizeChecklist } from '@/lib/visit-work';
import { listVisitsByDate } from '@/server/visits';
import type { OfflineVisit } from '@/lib/offline-visit';

export const GET: APIRoute = async ({ locals }) => {
    if (!locals.user) return json({ error: 'No autorizado' }, 401);
    const rows = (await listVisitsByDate(getToday())).filter(({ visit }) =>
        visit.status === 'scheduled' || visit.status === 'in_progress');
    const ids = rows.map(({ visit }) => visit.id);
    const entries = ids.length
        ? await db.select().from(visitProducts).where(inArray(visitProducts.visitId, ids))
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
        syncId: crypto.randomUUID(),
        pending: false,
    }));
    return json({ userId: locals.user.id, visits });
};
