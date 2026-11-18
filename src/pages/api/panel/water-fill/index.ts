import type { APIRoute } from 'astro';
import { json } from '@/lib/http';
import { firstError, waterFillInputSchema } from '@/lib/validation';
import { createWaterTask } from '@/server/water-fill';
import { VisitWorkError } from '@/server/visit-work';

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.profile) return json({ error: 'No autorizado' }, 401);
    let body: unknown;
    try { body = await request.json(); } catch { return json({ error: 'Datos inválidos' }, 400); }
    const input = waterFillInputSchema.safeParse(body);
    if (!input.success) return json({ error: firstError(input.error) }, 400);

    try {
        const task = await createWaterTask(input.data, locals.profile.id);
        return json({ ok: true, task });
    } catch (error) {
        if (error instanceof VisitWorkError) return json({ error: error.message }, error.status);
        if (error instanceof Error && 'code' in error && error.code === '23505') {
            return json({ error: 'Ya hay una llave pendiente de cerrar en esta propiedad.' }, 409);
        }
        console.error('[water-fill.create]', error);
        return json({ error: 'No se pudo registrar la llave abierta' }, 500);
    }
};
