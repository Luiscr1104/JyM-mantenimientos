import type { APIRoute } from 'astro';
import { z } from 'zod';
import { checkAssistantOrigin } from '@/lib/assistant-request';
import { json } from '@/lib/http';
import { completeMyReminder } from '@/server/personal-reminders';

export const POST: APIRoute = async ({ request, params, locals }) => {
    if (!locals.user) return json({ error: 'No autorizado' }, 401);
    const denied = checkAssistantOrigin(request);
    if (denied) return denied;
    const id = z.uuid().safeParse(params.id);
    if (!id.success) return json({ error: 'Recordatorio inválido' }, 400);
    const completed = await completeMyReminder(locals.user.id, id.data);
    return completed ? new Response(null, { status: 303, headers: { Location: '/panel' } })
        : json({ error: 'Recordatorio no encontrado' }, 404);
};
