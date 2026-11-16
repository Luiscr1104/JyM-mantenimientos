import type { APIRoute } from 'astro';
import { z } from 'zod';
import { isJsonRequest, json, readJsonOrForm } from '@/lib/http';
import { clientInputSchema, firstError } from '@/lib/validation';
import { updateClient } from '@/server/clients';

const idSchema = z.string().uuid();

const handler: APIRoute = async ({ params, request, locals, redirect }) => {
    if (!locals.user) return json({ error: 'No autorizado' }, 401);

    const id = idSchema.safeParse(params.id);
    if (!id.success) return json({ error: 'Cliente inválido' }, 400);

    const body = await readJsonOrForm(request);
    const parsed = clientInputSchema.safeParse(body);
    if (!parsed.success) {
        return json({ error: firstError(parsed.error) }, 400);
    }

    try {
        const client = await updateClient(id.data, parsed.data);
        if (!client) return json({ error: 'Cliente no encontrado' }, 404);

        return isJsonRequest(request)
            ? json({ ok: true, id: client.id })
            : redirect(`/panel/clientes/${client.id}`, 303);
    } catch (error) {
        console.error('[clients.update]', error);
        return json({ error: 'No se pudo guardar el cliente' }, 500);
    }
};

export const PUT = handler;
export const PATCH = handler;
