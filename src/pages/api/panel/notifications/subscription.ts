import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, pushSubscriptions } from '@/db';
import { json } from '@/lib/http';
import { mayReceiveNotifications } from '@/lib/notification-policy';
import { getNotificationUserId, pushConfigured } from '@/server/push-reminders';

const schema = z.object({
    endpoint: z.url().startsWith('https://').max(2048),
    keys: z.object({ p256dh: z.string().min(16).max(512), auth: z.string().min(8).max(256) }),
});

export const POST: APIRoute = async ({ locals, request }) => {
    if (!locals.user || !locals.profile ||
        !mayReceiveNotifications(locals.user.id, locals.profile.role, await getNotificationUserId())) {
        return json({ error: 'Esta cuenta no está autorizada para recibir avisos.' }, 403);
    }
    if (!pushConfigured()) return json({ error: 'Falta configurar las claves de notificación.' }, 503);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Suscripción inválida.' }, 400);
    const { endpoint, keys } = parsed.data;
    await db.insert(pushSubscriptions).values({ userId: locals.user.id, endpoint, ...keys })
        .onConflictDoUpdate({
            target: pushSubscriptions.endpoint,
            set: { userId: locals.user.id, ...keys },
        });
    return json({ ok: true });
};

export const DELETE: APIRoute = async ({ locals, request }) => {
    if (!locals.user) return json({ error: 'No autorizado' }, 401);
    const endpoint = z.url().safeParse((await request.json().catch(() => null))?.endpoint);
    if (!endpoint.success) return json({ error: 'Suscripción inválida.' }, 400);
    await db.delete(pushSubscriptions).where(and(
        eq(pushSubscriptions.endpoint, endpoint.data), eq(pushSubscriptions.userId, locals.user.id),
    ));
    return json({ ok: true });
};
