import type { APIRoute } from 'astro';
import { isJsonRequest, json, readJsonOrForm, redirectBack } from '@/lib/http';
import { dateStringSchema } from '@/lib/validation';
import { createSuggestedVisits } from '@/server/visits';

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return json({ error: 'No autorizado' }, 401);

    const body = await readJsonOrForm(request);
    const date = dateStringSchema.safeParse(body.date);

    if (!date.success) return json({ error: 'Fecha inválida' }, 400);

    try {
        const created = await createSuggestedVisits(date.data);

        return isJsonRequest(request)
            ? json({ ok: true, created })
            : redirectBack(request, `/panel/agenda?date=${date.data}&ok=suggest`);
    } catch (error) {
        console.error('[visits.suggest]', error);
        return json({ error: 'No se pudieron sugerir visitas' }, 500);
    }
};
