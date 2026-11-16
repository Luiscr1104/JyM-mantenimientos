import type { APIRoute } from 'astro';
import { z } from 'zod';
import { isJsonRequest, json, readJsonOrForm } from '@/lib/http';
import { firstError, propertyInputSchema } from '@/lib/validation';
import { updateProperty } from '@/server/properties';

const idSchema = z.string().uuid();

const handler: APIRoute = async ({ params, request, locals, redirect }) => {
    if (!locals.user) return json({ error: 'No autorizado' }, 401);

    const id = idSchema.safeParse(params.id);
    if (!id.success) return json({ error: 'Propiedad inválida' }, 400);

    const body = await readJsonOrForm(request);
    const parsed = propertyInputSchema.safeParse(body);
    if (!parsed.success) {
        return json({ error: firstError(parsed.error) }, 400);
    }

    try {
        const property = await updateProperty(id.data, parsed.data);
        if (!property) return json({ error: 'Propiedad no encontrada' }, 404);

        return isJsonRequest(request)
            ? json({ ok: true, id: property.id })
            : redirect(`/panel/propiedades/${property.id}`, 303);
    } catch (error) {
        console.error('[properties.update]', error);
        return json({ error: 'No se pudo guardar la propiedad' }, 500);
    }
};

export const PUT = handler;
export const PATCH = handler;
