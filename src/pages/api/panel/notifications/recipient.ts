import type { APIRoute } from 'astro';
import { z } from 'zod';
import { json } from '@/lib/http';
import { setNotificationUserId } from '@/server/push-reminders';

export const POST: APIRoute = async ({ locals, request }) => {
    if (locals.profile?.role !== 'owner') return json({ error: 'No autorizado' }, 403);
    const form = await request.formData();
    const parsed = z.union([z.uuid(), z.literal('')]).safeParse(form.get('userId'));
    if (!parsed.success) return json({ error: 'Usuario inválido' }, 400);
    try {
        await setNotificationUserId(parsed.data || null);
        return new Response(null, { status: 303, headers: { Location: '/panel/ajustes?ok=recipient' } });
    } catch {
        return json({ error: 'No se pudo configurar la cuenta de José.' }, 400);
    }
};
