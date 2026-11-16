import type { APIRoute } from 'astro';
import { z } from 'zod';
import { json } from '@/lib/http';
import { firstError, visitWorkInputSchema } from '@/lib/validation';
import { saveVisitWork, VisitWorkError } from '@/server/visit-work';

export const PUT: APIRoute = async ({ params, request, locals }) => {
    if (!locals.user) return json({ error: 'No autorizado' }, 401);
    const id = z.uuid().safeParse(params.id);
    if (!id.success) return json({ error: 'Visita inválida' }, 400);

    let input: unknown;
    try {
        input = await request.json();
    } catch {
        return json({ error: 'Datos inválidos' }, 400);
    }
    const parsed = visitWorkInputSchema.safeParse(input);
    if (!parsed.success) return json({ error: firstError(parsed.error) }, 400);

    try {
        const visit = await saveVisitWork(id.data, parsed.data);
        return json({ ok: true, visit });
    } catch (error) {
        if (error instanceof VisitWorkError) return json({ error: error.message }, error.status);
        console.error('[visits.work]', error);
        return json({ error: 'No se pudo guardar el trabajo' }, 500);
    }
};
