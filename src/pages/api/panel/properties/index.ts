import type { APIRoute } from 'astro';
import { isJsonRequest, json, readJsonOrForm } from '@/lib/http';
import { firstError, propertyInputSchema } from '@/lib/validation';
import { createProperty } from '@/server/properties';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
    if (!locals.user) return json({ error: 'No autorizado' }, 401);

    const body = await readJsonOrForm(request);
    const parsed = propertyInputSchema.safeParse(body);

    if (!parsed.success) {
        return json({ error: firstError(parsed.error) }, 400);
    }

    try {
        const property = await createProperty(parsed.data);
        if (!property) return json({ error: 'No se pudo crear la propiedad' }, 500);

        return isJsonRequest(request)
            ? json({ ok: true, id: property.id, clientId: property.clientId })
            : redirect(`/panel/propiedades/${property.id}`, 303);
    } catch (error) {
        console.error('[properties.create]', error);
        return json({ error: 'No se pudo crear la propiedad' }, 500);
    }
};
