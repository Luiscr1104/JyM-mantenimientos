import type { APIRoute } from 'astro';
import { z } from 'zod';
import { isJsonRequest, json, readJsonOrForm } from '@/lib/http';
import { dateStringSchema } from '@/lib/validation';
import { reorderDayRoute } from '@/server/routes';

const inputSchema = z.object({
    date: dateStringSchema,
    visitId: z.uuid(),
    move: z.enum(['down', 'end']),
});

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return json({ error: 'No autorizado' }, 401);

    const parsed = inputSchema.safeParse(await readJsonOrForm(request));
    if (!parsed.success) return json({ error: 'Movimiento inválido' }, 400);

    const { date, visitId, move } = parsed.data;
    try {
        const moved = await reorderDayRoute(date, visitId, move);
        if (!moved) {
            const message = 'La visita ya no se puede mover. Actualiza la ruta e inténtalo otra vez.';
            return isJsonRequest(request)
                ? json({ error: message }, 400)
                : new Response(null, {
                    status: 303,
                    headers: { Location: `/panel/ruta?date=${date}&error=${encodeURIComponent(message)}` },
                });
        }

        return isJsonRequest(request)
            ? json({ ok: true })
            : new Response(null, {
                status: 303,
                headers: { Location: `/panel/ruta?date=${date}&ok=order#visita-${visitId}` },
            });
    } catch (error) {
        console.error('[route.reorder]', error);
        const message = 'No se pudo cambiar el orden de las paradas.';
        return isJsonRequest(request)
            ? json({ error: message }, 500)
            : new Response(null, {
                status: 303,
                headers: { Location: `/panel/ruta?date=${date}&error=${encodeURIComponent(message)}` },
            });
    }
};
