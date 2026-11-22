import { and, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import * as webpush from 'web-push';
import { VAPID_PRIVATE_KEY, VAPID_SUBJECT } from 'astro:env/server';
import { PUBLIC_VAPID_PUBLIC_KEY } from 'astro:env/client';
import { mayReceiveNotifications } from '@/lib/notification-policy';
import {
    db, profiles, properties, pushSubscriptions, reminderDeliveries, reminderDeviceDeliveries,
    settings, visits, waterFillTasks,
} from '@/db';

const JOSE_SETTING = 'jose_notification_user_id';
const CRON_HEARTBEAT = 'notification_cron_last_run';
const PUMP_REMINDER_MINUTES = 30;
const RETRY_AFTER_MS = 60_000;
const STALE_CLAIM_MS = 2 * 60_000;

export async function getNotificationUserId() {
    const [setting] = await db.select({ value: settings.value })
        .from(settings).where(eq(settings.key, JOSE_SETTING)).limit(1);
    return setting?.value ?? null;
}

export { mayReceiveNotifications };

export async function getNotificationRecipientIds(): Promise<string[]> {
    const [owners, technicianId] = await Promise.all([
        db.select({ id: profiles.id }).from(profiles).where(eq(profiles.role, 'owner')),
        getNotificationUserId(),
    ]);
    return [...new Set([...owners.map((owner) => owner.id), ...(technicianId ? [technicianId] : [])])];
}

export async function setNotificationUserId(id: string | null) {
    if (id) {
        const [profile] = await db.select({ id: profiles.id, role: profiles.role }).from(profiles)
            .where(eq(profiles.id, id)).limit(1);
        if (!profile || profile.role !== 'tech') throw new Error('Selecciona una cuenta técnica válida.');
    }
    const previous = await getNotificationUserId();
    await db.insert(settings).values({ key: JOSE_SETTING, value: id })
        .onConflictDoUpdate({ target: settings.key, set: { value: id, updatedAt: new Date() } });
    // Revocar únicamente a la cuenta técnica sustituida. Los dueños conservan
    // sus dispositivos y se autorizan por su rol, no por esta selección.
    if (previous && previous !== id) {
        const [oldProfile] = await db.select({ role: profiles.role }).from(profiles)
            .where(eq(profiles.id, previous)).limit(1);
        if (oldProfile?.role === 'tech') {
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, previous));
        }
    }
}

export function pushConfigured() {
    return Boolean(PUBLIC_VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT);
}

export async function getNotificationCronLastRun() {
    const [row] = await db.select({ value: settings.value }).from(settings)
        .where(eq(settings.key, CRON_HEARTBEAT)).limit(1);
    return row?.value ?? null;
}

async function recordCronRun() {
    const now = new Date();
    await db.insert(settings).values({ key: CRON_HEARTBEAT, value: now.toISOString(), updatedAt: now })
        .onConflictDoUpdate({ target: settings.key, set: { value: now.toISOString(), updatedAt: now } });
}

function configurePush() {
    if (!pushConfigured()) throw new Error('Faltan claves VAPID para los avisos.');
    webpush.setVapidDetails(VAPID_SUBJECT!, PUBLIC_VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
}

export async function sendTestNotification(userId: string, endpoint: string): Promise<void> {
    configurePush();
    const [device] = await db.select().from(pushSubscriptions)
        .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint))).limit(1);
    if (!device) throw new Error('Este dispositivo no está registrado. Activa los avisos primero.');
    try {
        await webpush.sendNotification({
            endpoint: device.endpoint, keys: { auth: device.auth, p256dh: device.p256dh },
        }, JSON.stringify({
            title: 'Prueba de avisos JyM',
            body: 'Este dispositivo está listo para recibir recordatorios.',
            path: '/panel/ajustes',
            tag: `push-test-${device.id}`,
        }), { TTL: 300, timeout: 10_000 });
    } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, device.id));
        }
        throw error;
    }
}

type Device = typeof pushSubscriptions.$inferSelect;
type Kind = 'water' | 'pump';

// La combinación evento/dispositivo es única. Otro cron puede reclamar un
// intento fallido o atascado, pero jamás uno ya aceptado por el servicio push.
async function claimDelivery(kind: Kind, targetId: string, dueAt: Date, subscriptionId: string) {
    const claimedAt = new Date();
    const [created] = await db.insert(reminderDeviceDeliveries).values({
        kind, targetId, dueAt, subscriptionId, status: 'sending', claimedAt,
    }).onConflictDoNothing().returning({ id: reminderDeviceDeliveries.id });
    if (created) return created.id;
    const [retry] = await db.update(reminderDeviceDeliveries).set({
        status: 'sending', claimedAt, updatedAt: claimedAt,
        attempts: sql`${reminderDeviceDeliveries.attempts} + 1`,
    }).where(and(
        eq(reminderDeviceDeliveries.kind, kind),
        eq(reminderDeviceDeliveries.targetId, targetId),
        eq(reminderDeviceDeliveries.dueAt, dueAt),
        eq(reminderDeviceDeliveries.subscriptionId, subscriptionId),
        or(
            and(eq(reminderDeviceDeliveries.status, 'retry'),
                lte(reminderDeviceDeliveries.claimedAt, new Date(claimedAt.getTime() - RETRY_AFTER_MS))),
            and(eq(reminderDeviceDeliveries.status, 'sending'),
                lte(reminderDeviceDeliveries.claimedAt, new Date(claimedAt.getTime() - STALE_CLAIM_MS))),
        ),
    )).returning({ id: reminderDeviceDeliveries.id });
    return retry?.id ?? null;
}

async function sendToDevice(
    kind: Kind, targetId: string, dueAt: Date, title: string, body: string, path: string, device: Device,
) {
    const deliveryId = await claimDelivery(kind, targetId, dueAt, device.id);
    if (!deliveryId) return false;
    try {
        await webpush.sendNotification({
            endpoint: device.endpoint, keys: { auth: device.auth, p256dh: device.p256dh },
        }, JSON.stringify({ title, body, path, tag: `${kind}-${targetId}` }),
        { TTL: 3600, timeout: 10_000 });
    } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        const invalid = status === 404 || status === 410;
        await db.update(reminderDeviceDeliveries).set({
            status: invalid ? 'invalid' : 'retry', updatedAt: new Date(),
        }).where(eq(reminderDeviceDeliveries.id, deliveryId));
        if (invalid) {
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, device.id));
        } else {
            console.error('[push-reminder]', kind, targetId, device.id, status ?? 'error');
        }
        return false;
    }
    await db.update(reminderDeviceDeliveries).set({ status: 'accepted', updatedAt: new Date() })
        .where(eq(reminderDeviceDeliveries.id, deliveryId));
    return true;
}

// Los avisos que ya envió la versión anterior no se reenvían al desplegar
// el nuevo registro por dispositivo mientras la llave o la bomba siga abierta.
async function sentByPreviousVersion(kind: Kind, targetId: string, dueAt: Date) {
    const [legacy] = await db.select({ id: reminderDeliveries.id }).from(reminderDeliveries)
        .where(and(eq(reminderDeliveries.kind, kind), eq(reminderDeliveries.targetId, targetId),
            eq(reminderDeliveries.dueAt, dueAt))).limit(1);
    return Boolean(legacy);
}

export async function deliverDueReminders() {
    configurePush();
    const recipientIds = await getNotificationRecipientIds();
    if (!recipientIds.length) {
        await recordCronRun();
        return { sent: 0, reason: 'No hay cuentas autorizadas para recibir avisos.' };
    }
    const devices = await db.select().from(pushSubscriptions)
        .where(inArray(pushSubscriptions.userId, recipientIds));
    if (!devices.length) {
        await recordCronRun();
        return { sent: 0, reason: 'Ningún dispositivo tiene avisos activados.' };
    }

    const now = new Date();
    const water = await db.select({ task: waterFillTasks, alias: properties.alias })
        .from(waterFillTasks).innerJoin(properties, eq(waterFillTasks.propertyId, properties.id))
        .where(and(isNull(waterFillTasks.closedAt), lte(waterFillTasks.dueAt, now)));
    const pumps = await db.select({ visit: visits, alias: properties.alias })
        .from(visits).innerJoin(properties, eq(visits.propertyId, properties.id))
        .where(and(eq(visits.status, 'in_progress'), isNull(visits.pumpStoppedAt),
            lte(visits.pumpStartedAt, new Date(now.getTime() - PUMP_REMINDER_MINUTES * 60_000))));
    const waterJobs = await Promise.all(water.map(async ({ task, alias }) => {
        if (await sentByPreviousVersion('water', task.id, task.dueAt)) return [];
        return devices.map((device) => () =>
            sendToDevice('water', task.id, task.dueAt, 'Revisar llave de llenado',
                `${alias}: comprueba físicamente la llave y ciérrala si corresponde.`,
                task.visitId ? `/panel/visitas/${task.visitId}` : `/panel/propiedades/${task.propertyId}`, device));
    }));
    const pumpJobs = await Promise.all(pumps.map(async ({ visit, alias }) => {
        if (!visit.pumpStartedAt) return [];
        const dueAt = new Date(visit.pumpStartedAt.getTime() + PUMP_REMINDER_MINUTES * 60_000);
        if (await sentByPreviousVersion('pump', visit.id, dueAt)) return [];
        return devices.map((device) => () =>
            sendToDevice('pump', visit.id, dueAt, 'Revisar temporizador de bomba',
                `${alias}: verifica físicamente el estado de la bomba.`,
                `/panel/visitas/${visit.id}`, device));
    }));
    const jobs = [...waterJobs.flat(), ...pumpJobs.flat()];
    let sent = 0;
    // Acotar peticiones push simultáneas para no agotar el proceso del cron.
    for (let i = 0; i < jobs.length; i += 10) {
        const results = await Promise.all(jobs.slice(i, i + 10).map((job) => job()));
        sent += results.filter(Boolean).length;
    }
    await recordCronRun();
    return { sent };
}
