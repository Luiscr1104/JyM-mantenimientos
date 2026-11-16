import type { APIRoute } from 'astro';
import { isJsonRequest, json, readJsonOrForm } from '@/lib/http';
import { dateStringSchema } from '@/lib/validation';
import { optimizeDayRoute } from '@/server/routes';

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return json({ error: 'No autorizado' }, 401);

    const body = await readJsonOrForm(request);
    const date = dateStringSchema.safeParse(body.date);

    if (!date.success) return json({ error: 'Fecha inválida' }, 400);

    try {
        const result = await optimizeDayRoute(date.data);

        return isJsonRequest(request)
            ? json({
                  ok: true,
                  source: result.plan.source,
                  distanceMeters: result.plan.distanceMeters,
                  durationSeconds: result.plan.durationSeconds,
                  stops: result.plan.stops,
              })
            : new Response(null, {
                  status: 303,
                  headers: { Location: `/panel/ruta?date=${date.data}&ok=route` },
              });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : 'No se pudo optimizar la ruta';

        console.error('[route.optimize]', error);

        return isJsonRequest(request)
            ? json({ error: message }, 400)
            : new Response(null, {
                  status: 303,
                  headers: {
                      Location: `/panel/ruta?date=${date.data}&error=${encodeURIComponent(message)}`,
                  },
              });
    }
};
