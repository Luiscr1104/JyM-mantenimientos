import type { APIRoute } from 'astro';
import { z } from 'zod';
import { isJsonRequest, json, readJsonOrForm, redirectBack } from '@/lib/http';
import { visitActionSchema, visitStatusSchema } from '@/lib/validation';
import { applyVisitAction, type VisitAction } from '@/server/visits';
import { VisitWorkError } from '@/server/visit-work';

const idSchema = z.string().uuid();

const STATUS_TO_ACTION: Record<string, VisitAction> = {
    scheduled: 'reopen',
    in_progress: 'start',
    completed: 'complete',
    skipped: 'skip',
};

export const POST: APIRoute = async ({ params, request, locals }) => {
    if (!locals.user) return json({ error: 'No autorizado' }, 401);

    const id = idSchema.safeParse(params.id);
    if (!id.success) return json({ error: 'Visita inválida' }, 400);

    const body = await readJsonOrForm(request);
    const action = visitActionSchema.safeParse(body.action);

    if (!action.success) return json({ error: 'Acción inválida' }, 400);

    try {
        const visit = await applyVisitAction(id.data, action.data, locals.user.id);
        if (action.data !== 'delete' && !visit) return json({ error: 'Visita no encontrada' }, 404);

        return isJsonRequest(request)
            ? json({ ok: true, visit })
            : redirectBack(request, '/panel/agenda');
    } catch (error) {
        console.error('[visits.action]', error);
        if (error instanceof VisitWorkError) {
            if (isJsonRequest(request)) return json({ error: error.message }, error.status);
            return new Response(null, {
                status: 303,
                headers: {
                    Location: `/panel/visitas/${id.data}?error=${encodeURIComponent(error.message)}`,
                },
            });
        }
        return json({ error: 'No se pudo actualizar la visita' }, 500);
    }
};

export const PATCH: APIRoute = async ({ params, request, locals }) => {
    if (!locals.user) return json({ error: 'No autorizado' }, 401);

    const id = idSchema.safeParse(params.id);
    if (!id.success) return json({ error: 'Visita inválida' }, 400);

    const body = await readJsonOrForm(request);
    const status = visitStatusSchema.safeParse(body.status);
    if (!status.success) return json({ error: 'Estado inválido' }, 400);

    try {
        const visit = await applyVisitAction(id.data, STATUS_TO_ACTION[status.data], locals.user.id);
        if (!visit) return json({ error: 'Visita no encontrada' }, 404);
        return json({ ok: true, visit });
    } catch (error) {
        console.error('[visits.status]', error);
        return error instanceof VisitWorkError
            ? json({ error: error.message }, error.status)
            : json({ error: 'No se pudo actualizar la visita' }, 500);
    }
};
