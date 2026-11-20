import { and, eq, isNull, lte, ne } from 'drizzle-orm';
import * as webpush from 'web-push';
import { VAPID_PRIVATE_KEY, VAPID_SUBJECT } from 'astro:env/server';
import { PUBLIC_VAPID_PUBLIC_KEY } from 'astro:env/client';
import { db, profiles, properties, pushSubscriptions, reminderDeliveries, settings, visits, waterFillTasks } from '@/db';

const JOSE_SETTING = 'jose_notification_user_id';
const PUMP_REMINDER_MINUTES = 30;

export async function getNotificationUserId() {
    const [setting] = await db.select({ value: settings.value })
        .from(settings).where(eq(settings.key, JOSE_SETTING)).limit(1);
    return setting?.value ?? null;
}

export async function setNotificationUserId(id: string | null) {
    if (id) {
        const [profile] = await db.select({ id: profiles.id }).from(profiles)
            .where(eq(profiles.id, id)).limit(1);
        if (!profile) throw new Error('Usuario inválido.');
    }
    await db.insert(settings).values({ key: JOSE_SETTING, value: id })
        .onConflictDoUpdate({ target: settings.key, set: { value: id, updatedAt: new Date() } });
    // Una suscripción antigua no debe seguir recibiendo avisos al cambiar la cuenta.
    if (id) await db.delete(pushSubscriptions).where(ne(pushSubscriptions.userId, id));
    else await db.delete(pushSubscriptions);
}

export function pushConfigured() {
    return Boolean(PUBLIC_VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT);
}

async function sendReminder(kind: 'water' | 'pump', targetId: string, dueAt: Date, title: string, body: string, path: string, userId: string) {
    const [claim] = await db.insert(reminderDeliveries).values({ kind, targetId, dueAt })
        .onConflictDoNothing().returning({ id: reminderDeliveries.id });
    if (!claim) return false;
    const devices = await db.select().from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId));
    let sent = 0;
    await Promise.all(devices.map(async (device) => {
        try {
            await webpush.sendNotification({
                endpoint: device.endpoint,
                keys: { auth: device.auth, p256dh: device.p256dh },
            }, JSON.stringify({ title, body, path, tag: `${kind}-${targetId}` }), { TTL: 3600 });
            sent += 1;
        } catch (error) {
            const status = (error as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
                await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, device.id));
            } else {
                console.error('[push-reminder]', kind, targetId, status ?? 'error');
            }
        }
    }));
    if (sent === 0) {
        await db.delete(reminderDeliveries).where(eq(reminderDeliveries.id, claim.id));
    }
    return sent > 0;
}

export async function deliverDueReminders() {
    if (!pushConfigured()) throw new Error('Faltan claves VAPID para los avisos.');
    const userId = await getNotificationUserId();
    if (!userId) return { sent: 0, reason: 'Asigna la cuenta de José en Ajustes.' };
    webpush.setVapidDetails(VAPID_SUBJECT!, PUBLIC_VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);

    const now = new Date();
    const water = await db.select({ task: waterFillTasks, alias: properties.alias })
        .from(waterFillTasks).innerJoin(properties, eq(waterFillTasks.propertyId, properties.id))
        .where(and(isNull(waterFillTasks.closedAt), lte(waterFillTasks.dueAt, now)));
    const pumps = await db.select({ visit: visits, alias: properties.alias })
        .from(visits).innerJoin(properties, eq(visits.propertyId, properties.id))
        .where(and(eq(visits.status, 'in_progress'), isNull(visits.pumpStoppedAt),
            lte(visits.pumpStartedAt, new Date(now.getTime() - PUMP_REMINDER_MINUTES * 60_000))));
    let sent = 0;
    for (const { task, alias } of water) {
        if (await sendReminder('water', task.id, task.dueAt, 'Revisar llave de llenado',
            `${alias}: comprueba físicamente la llave y ciérrala si corresponde.`,
            task.visitId ? `/panel/visitas/${task.visitId}` : `/panel/propiedades/${task.propertyId}`, userId)) sent++;
    }
    for (const { visit, alias } of pumps) {
        if (!visit.pumpStartedAt) continue;
        if (await sendReminder('pump', visit.id,
            new Date(visit.pumpStartedAt.getTime() + PUMP_REMINDER_MINUTES * 60_000),
            'Revisar temporizador de bomba',
            `${alias}: verifica físicamente el estado de la bomba.`,
            `/panel/visitas/${visit.id}`, userId)) sent++;
    }
    return { sent };
}
