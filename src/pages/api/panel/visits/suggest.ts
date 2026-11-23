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

        if (isJsonRequest(request)) return json({ ok: true, created });
        const fallback = `/panel/agenda?date=${date.data}&ok=suggest${body.calendar === 'month' ? '&calendar=month' : ''}`;
        return body.calendar === 'month'
            ? new Response(null, { status: 303, headers: { Location: fallback } })
            : redirectBack(request, fallback);
    } catch (error) {
        console.error('[visits.suggest]', error);
        return json({ error: 'No se pudieron sugerir visitas' }, 500);
    }
};
