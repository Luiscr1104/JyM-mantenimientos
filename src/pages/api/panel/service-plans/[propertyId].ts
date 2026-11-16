import type { APIRoute } from 'astro';
import { z } from 'zod';
import { isJsonRequest, json, readJsonOrForm } from '@/lib/http';
import { firstError, servicePlanInputSchema } from '@/lib/validation';
import { saveServicePlan } from '@/server/service-plans';

const idSchema = z.string().uuid();

const handler: APIRoute = async ({ params, request, locals, redirect }) => {
    if (!locals.user) return json({ error: 'No autorizado' }, 401);

    const propertyId = idSchema.safeParse(params.propertyId);
    if (!propertyId.success) return json({ error: 'Propiedad inválida' }, 400);

    const body = await readJsonOrForm(request);
    const parsed = servicePlanInputSchema.safeParse(body);

    if (!parsed.success) {
        return json({ error: firstError(parsed.error) }, 400);
    }

    try {
        const plan = await saveServicePlan(propertyId.data, parsed.data);
        if (!plan) return json({ error: 'No se pudo guardar el plan' }, 500);

        return isJsonRequest(request)
            ? json({ ok: true, plan })
            : redirect(`/panel/propiedades/${propertyId.data}/editar?ok=plan`, 303);
    } catch (error) {
        console.error('[service-plans.save]', error);
        return json({ error: 'No se pudo guardar la frecuencia' }, 500);
    }
};

export const PUT = handler;
export const POST = handler;
