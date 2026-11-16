import type { APIRoute } from 'astro';
import { z } from 'zod';
import { json, readJsonOrForm } from '@/lib/http';
import { leadStatusSchema } from '@/lib/validation';
import { updateLeadStatus } from '@/server/leads';

const idSchema = z.string().uuid();

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
    if (!locals.user) return json({ error: 'No autorizado' }, 401);

    const id = idSchema.safeParse(params.id);
    if (!id.success) return json({ error: 'Lead inválido' }, 400);

    const body = await readJsonOrForm(request);
    const status = leadStatusSchema.safeParse(body.status);
    if (!status.success) return json({ error: 'Estado inválido' }, 400);

    await updateLeadStatus(id.data, status.data);
    return redirect('/panel/leads', 303);
};
