import type { APIRoute } from 'astro';
import { z } from 'zod';
import { json } from '@/lib/http';
import { dateStringSchema } from '@/lib/validation';
import { scheduleFlocculationFollowUp } from '@/server/visits';
import { VisitWorkError } from '@/server/visit-work';

export const POST: APIRoute = async ({ params, request, locals }) => {
    if (!locals.user) return json({ error: 'No autorizado' }, 401);
    const id = z.uuid().safeParse(params.id);
    if (!id.success) return json({ error: 'Visita inválida' }, 400);
    let input: unknown;
    try {
        input = await request.json();
    } catch {
        return json({ error: 'Datos inválidos' }, 400);
    }
    const date = dateStringSchema.safeParse((input as { date?: unknown } | null)?.date);
    if (!date.success) return json({ error: 'Fecha inválida' }, 400);
    try {
        const visit = await scheduleFlocculationFollowUp(id.data, date.data);
        return json({ ok: true, visit: { id: visit.id, scheduledFor: visit.scheduledFor } });
    } catch (error) {
        if (error instanceof VisitWorkError) return json({ error: error.message }, error.status);
        console.error('[visits.follow-up]', error);
        return json({ error: 'No se pudo programar el seguimiento' }, 500);
    }
};
