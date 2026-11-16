import type { APIRoute } from 'astro';
import { isJsonRequest, json, readJsonOrForm, redirectBack } from '@/lib/http';
import { firstError, visitInputSchema } from '@/lib/validation';
import { createVisit } from '@/server/visits';

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return json({ error: 'No autorizado' }, 401);

    const body = await readJsonOrForm(request);
    const parsed = visitInputSchema.safeParse(body);

    if (!parsed.success) {
        return json({ error: firstError(parsed.error) }, 400);
    }

    try {
        const id = await createVisit(parsed.data);

        return isJsonRequest(request)
            ? json({ ok: true, id })
            : redirectBack(request, `/panel/agenda?date=${parsed.data.scheduledFor}`);
    } catch (error) {
        console.error('[visits.create]', error);
        return json({ error: 'No se pudo programar la visita' }, 500);
    }
};
