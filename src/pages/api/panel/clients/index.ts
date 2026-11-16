import type { APIRoute } from 'astro';
import { isJsonRequest, json, readJsonOrForm } from '@/lib/http';
import { clientInputSchema, firstError } from '@/lib/validation';
import { createClient } from '@/server/clients';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
    if (!locals.user) return json({ error: 'No autorizado' }, 401);

    const body = await readJsonOrForm(request);
    const parsed = clientInputSchema.safeParse(body);

    if (!parsed.success) {
        return json({ error: firstError(parsed.error) }, 400);
    }

    try {
        const client = await createClient(parsed.data);
        if (!client) return json({ error: 'No se pudo crear el cliente' }, 500);

        return isJsonRequest(request)
            ? json({ ok: true, id: client.id })
            : redirect(`/panel/clientes/${client.id}`, 303);
    } catch (error) {
        console.error('[clients.create]', error);
        return json({ error: 'No se pudo crear el cliente' }, 500);
    }
};
