import type { APIRoute } from 'astro';
import { firstError } from '@/lib/validation';
import { offlineSyncSchema } from '@/lib/offline-visit';
import { json } from '@/lib/http';
import { syncOfflineVisit } from '@/server/offline-visits';
import { VisitWorkError } from '@/server/visit-work';

export const POST: APIRoute = async ({ locals, request }) => {
    if (!locals.user) return json({ error: 'No autorizado' }, 401);
    const parsed = offlineSyncSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: firstError(parsed.error) }, 400);
    try {
        const result = await syncOfflineVisit(parsed.data, locals.user.id);
        return json({ ok: true, alreadySynced: result.alreadySynced });
    } catch (error) {
        if (error instanceof VisitWorkError) return json({ error: error.message }, error.status);
        console.error('[offline.sync]', error);
        return json({ error: 'No se pudo sincronizar la visita.' }, 500);
    }
};
