import type { APIRoute } from 'astro';
import { json } from '@/lib/http';
import { deliverDueReminders } from '@/server/push-reminders';

export const GET: APIRoute = async ({ request }) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
        return json({ error: 'No autorizado' }, 401);
    }
    try {
        return json(await deliverDueReminders());
    } catch (error) {
        console.error('[cron.reminders]', error);
        return json({ error: 'No se pudieron enviar los avisos.' }, 500);
    }
};
