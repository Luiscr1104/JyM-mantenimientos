import type { APIRoute } from 'astro';
import { z } from 'zod';
import { json } from '@/lib/http';
import { pumpActionSchema } from '@/lib/validation';
import { changePump, VisitWorkError } from '@/server/visit-work';

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
    const action = pumpActionSchema.safeParse(
        typeof input === 'object' && input !== null && 'action' in input ? input.action : null,
    );
    if (!action.success) return json({ error: 'Acción inválida' }, 400);

    try {
        const visit = await changePump(id.data, action.data);
        return json({ ok: true, visit });
    } catch (error) {
        if (error instanceof VisitWorkError) return json({ error: error.message }, error.status);
        console.error('[visits.pump]', error);
        return json({ error: 'No se pudo actualizar el temporizador' }, 500);
    }
};
