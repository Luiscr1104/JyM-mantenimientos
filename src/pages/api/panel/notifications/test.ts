import type { APIRoute } from 'astro';
import { and, eq, lte } from 'drizzle-orm';
import { z } from 'zod';
import { db, settings } from '@/db';
import { json } from '@/lib/http';
import { mayReceiveNotifications } from '@/lib/notification-policy';
import { getNotificationUserId, sendTestNotification } from '@/server/push-reminders';

export const POST: APIRoute = async ({ locals, request }) => {
    if (!locals.user || !locals.profile ||
        !mayReceiveNotifications(locals.user.id, locals.profile.role, await getNotificationUserId())) {
        return json({ error: 'Esta cuenta no está autorizada para recibir avisos.' }, 403);
    }
    const endpoint = z.url().startsWith('https://').max(2048)
        .safeParse((await request.json().catch(() => null))?.endpoint);
    if (!endpoint.success) return json({ error: 'Dispositivo inválido.' }, 400);
    // Un intento por cuenta cada minuto; el servicio push confirma aceptación,
    // no la aparición de la notificación en la pantalla.
    const key = `notification_test_${locals.user.id}`;
    const now = new Date();
    const [claim] = await db.insert(settings).values({ key, value: 'test', updatedAt: now })
        .onConflictDoNothing().returning({ key: settings.key });
    if (!claim) {
        const [retry] = await db.update(settings).set({ updatedAt: now })
            .where(and(eq(settings.key, key), lte(settings.updatedAt, new Date(now.getTime() - 60_000))))
            .returning({ key: settings.key });
        if (!retry) return json({ error: 'Espera un minuto antes de repetir la prueba.' }, 429);
    }
    try {
        await sendTestNotification(locals.user.id, endpoint.data);
        return json({ accepted: true });
    } catch (error) {
        console.error('[push.test]', (error as { statusCode?: number }).statusCode ?? 'error');
        return json({ error: 'La prueba no fue aceptada. Comprueba el permiso; si persiste, desactiva y vuelve a activar los avisos.' }, 502);
    }
};
