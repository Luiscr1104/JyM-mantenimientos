import type { APIRoute } from 'astro';
import { isJsonRequest, json, readJsonOrForm } from '@/lib/http';
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
        const { id, created } = await createVisit(parsed.data);

        return isJsonRequest(request)
            ? json({ ok: true, id, created })
            : new Response(null, {
                status: 303,
                headers: {
                    Location: `/panel/${body.returnTo === 'route' ? 'ruta' : 'agenda'}?date=${parsed.data.scheduledFor}&ok=${created ? 'visit-added' : 'visit-exists'}${body.calendar === 'month' && body.returnTo !== 'route' ? '&calendar=month' : ''}`,
                },
            });
    } catch (error) {
        console.error('[visits.create]', error);
        return json({ error: 'No se pudo programar la visita' }, 500);
    }
};
