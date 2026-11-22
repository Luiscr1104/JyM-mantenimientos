import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, pushSubscriptions } from '@/db';
import { json } from '@/lib/http';
import { mayReceiveNotifications } from '@/lib/notification-policy';
import { getNotificationCronLastRun, getNotificationUserId, pushConfigured } from '@/server/push-reminders';

export const POST: APIRoute = async ({ locals, request }) => {
    if (!locals.user || !locals.profile ||
        !mayReceiveNotifications(locals.user.id, locals.profile.role, await getNotificationUserId())) {
        return json({ error: 'Esta cuenta no está autorizada para recibir avisos.' }, 403);
    }
    const endpoint = z.url().startsWith('https://').max(2048)
        .safeParse((await request.json().catch(() => null))?.endpoint);
    const devices = await db.select({ endpoint: pushSubscriptions.endpoint })
        .from(pushSubscriptions).where(eq(pushSubscriptions.userId, locals.user.id));
    return json({
        registered: endpoint.success && devices.some((device) => device.endpoint === endpoint.data),
        devices: devices.length,
        configured: pushConfigured(),
        cronLastRun: await getNotificationCronLastRun(),
    });
};
