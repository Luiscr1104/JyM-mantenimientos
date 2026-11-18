import type { APIRoute } from 'astro';
import { z } from 'zod';
import { json } from '@/lib/http';
import { closeWaterTask } from '@/server/water-fill';
import { VisitWorkError } from '@/server/visit-work';

export const POST: APIRoute = async ({ params, locals }) => {
    if (!locals.profile) return json({ error: 'No autorizado' }, 401);
    const id = z.uuid().safeParse(params.id);
    if (!id.success) return json({ error: 'Tarea inválida' }, 400);
    try {
        const task = await closeWaterTask(id.data, locals.profile.id);
        return json({ ok: true, task });
    } catch (error) {
        if (error instanceof VisitWorkError) return json({ error: error.message }, error.status);
        console.error('[water-fill.close]', error);
        return json({ error: 'No se pudo cerrar la tarea' }, 500);
    }
};
