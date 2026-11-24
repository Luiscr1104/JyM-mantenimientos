import { and, asc, eq, exists, inArray, isNull, lt, lte, notExists, or, sql, type SQL } from 'drizzle-orm';
import * as webpush from 'web-push';
import { VAPID_PRIVATE_KEY, VAPID_SUBJECT } from 'astro:env/server';
import { PUBLIC_VAPID_PUBLIC_KEY } from 'astro:env/client';
import { mayReceiveNotifications } from '@/lib/notification-policy';
import {
    canRetryReminder, MAX_REMINDER_ATTEMPTS, REMINDER_RETRY_AFTER_MS, REMINDER_STALE_CLAIM_MS,
} from '@/lib/reminder-retry';
import {
    db, personalReminders, profiles, properties, pushSubscriptions, reminderDeliveries, reminderDeviceDeliveries,
    settings, visits, waterFillTasks,
} from '@/db';

const JOSE_SETTING = 'jose_notification_user_id';
const CRON_HEARTBEAT = 'notification_cron_last_run';
const PUMP_REMINDER_MINUTES = 30;
const MAX_EVENTS_PER_KIND = 10;
const MAX_SENDS_PER_RUN = 10;

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
type Kind = 'water' | 'pump' | 'personal';

// La combinación evento/dispositivo es única. Otro cron puede reclamar un
// intento fallido o atascado, pero jamás uno ya aceptado por el servicio push.
async function claimDelivery(kind: Kind, targetId: string, dueAt: Date, subscriptionId: string) {
    const claimedAt = new Date();
    const [created] = await db.insert(reminderDeviceDeliveries).values({
        kind, targetId, dueAt, subscriptionId, status: 'sending', claimedAt,
    }).onConflictDoNothing().returning({
        id: reminderDeviceDeliveries.id, attempts: reminderDeviceDeliveries.attempts,
    });
    if (created) return created;
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
                lte(reminderDeviceDeliveries.claimedAt, new Date(claimedAt.getTime() - REMINDER_RETRY_AFTER_MS))),
            and(eq(reminderDeviceDeliveries.status, 'sending'),
                lte(reminderDeviceDeliveries.claimedAt, new Date(claimedAt.getTime() - REMINDER_STALE_CLAIM_MS))),
        ),
        lt(reminderDeviceDeliveries.attempts, MAX_REMINDER_ATTEMPTS),
    )).returning({
        id: reminderDeviceDeliveries.id, attempts: reminderDeviceDeliveries.attempts,
    });
    return retry ?? null;
}

async function sendToDevice(
    kind: Kind, targetId: string, dueAt: Date, title: string, body: string, path: string, device: Device,
) {
    const claim = await claimDelivery(kind, targetId, dueAt, device.id);
    if (!claim) return false;
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
        }).where(eq(reminderDeviceDeliveries.id, claim.id));
        if (invalid) {
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, device.id));
        } else {
            console.error('[push-reminder]', kind, targetId, device.id, status ?? 'error');
            if (claim.attempts >= MAX_REMINDER_ATTEMPTS) {
                console.error('[push-reminder] Se agotaron los reintentos:', kind, targetId, device.id);
            }
        }
        return false;
    }
    await db.update(reminderDeviceDeliveries).set({ status: 'accepted', updatedAt: new Date() })
        .where(eq(reminderDeviceDeliveries.id, claim.id));
    return true;
}

// Filtrar en PostgreSQL antes de traer eventos: una llave abierta y ya avisada
// no debe volver a ocupar el cupo de cada ejecución ni generar consultas N+1.
function pendingEvent(kind: Kind, targetId: typeof waterFillTasks.id | typeof visits.id | typeof personalReminders.id,
    dueAt: typeof waterFillTasks.dueAt | typeof personalReminders.dueAt | ReturnType<typeof sql<Date>>,
    recipients: string[] | SQL, now: Date) {
    const delivery = and(
        eq(reminderDeviceDeliveries.kind, kind),
        eq(reminderDeviceDeliveries.targetId, targetId),
        eq(reminderDeviceDeliveries.dueAt, dueAt),
        eq(reminderDeviceDeliveries.subscriptionId, pushSubscriptions.id),
    );
    const retryable = or(
        and(eq(reminderDeviceDeliveries.status, 'retry'),
            lte(reminderDeviceDeliveries.claimedAt, new Date(now.getTime() - REMINDER_RETRY_AFTER_MS))),
        and(eq(reminderDeviceDeliveries.status, 'sending'),
            lte(reminderDeviceDeliveries.claimedAt, new Date(now.getTime() - REMINDER_STALE_CLAIM_MS))),
    );
    return and(
        notExists(db.select({ id: reminderDeliveries.id }).from(reminderDeliveries)
            .where(and(eq(reminderDeliveries.kind, kind), eq(reminderDeliveries.targetId, targetId),
                eq(reminderDeliveries.dueAt, dueAt)))),
        exists(db.select({ id: pushSubscriptions.id }).from(pushSubscriptions)
            .where(and(Array.isArray(recipients)
                ? inArray(pushSubscriptions.userId, recipients) : recipients,
                or(
                    notExists(db.select({ id: reminderDeviceDeliveries.id }).from(reminderDeviceDeliveries)
                        .where(delivery)),
                    exists(db.select({ id: reminderDeviceDeliveries.id }).from(reminderDeviceDeliveries)
                        .where(and(delivery, lt(reminderDeviceDeliveries.attempts, MAX_REMINDER_ATTEMPTS), retryable))),
                )))),
    );
}

export async function deliverDueReminders() {
    configurePush();
    const recipientIds = await getNotificationRecipientIds();
    const devices = await db.select().from(pushSubscriptions);
    if (!devices.length) {
        await recordCronRun();
        return { sent: 0, reason: 'Ningún dispositivo tiene avisos activados.' };
    }
    const sharedDevices = devices.filter((device) => recipientIds.includes(device.userId));

    const now = new Date();
    const pumpDueAt = sql<Date>`${visits.pumpStartedAt} + ${PUMP_REMINDER_MINUTES} * interval '1 minute'`;
    const water = await db.select({ task: waterFillTasks, alias: properties.alias })
        .from(waterFillTasks).innerJoin(properties, eq(waterFillTasks.propertyId, properties.id))
        .where(and(isNull(waterFillTasks.closedAt), lte(waterFillTasks.dueAt, now),
            pendingEvent('water', waterFillTasks.id, waterFillTasks.dueAt, recipientIds, now)))
        .orderBy(asc(waterFillTasks.dueAt)).limit(MAX_EVENTS_PER_KIND);
    const pumps = await db.select({ visit: visits, alias: properties.alias })
        .from(visits).innerJoin(properties, eq(visits.propertyId, properties.id))
        .where(and(eq(visits.status, 'in_progress'), isNull(visits.pumpStoppedAt),
            lte(visits.pumpStartedAt, new Date(now.getTime() - PUMP_REMINDER_MINUTES * 60_000)),
            pendingEvent('pump', visits.id, pumpDueAt, recipientIds, now)))
        .orderBy(asc(visits.pumpStartedAt)).limit(MAX_EVENTS_PER_KIND);
    const personal = await db.select().from(personalReminders)
        .where(and(isNull(personalReminders.completedAt), lte(personalReminders.dueAt, now),
            pendingEvent('personal', personalReminders.id, personalReminders.dueAt,
                eq(pushSubscriptions.userId, personalReminders.userId), now)))
        .orderBy(asc(personalReminders.dueAt)).limit(MAX_EVENTS_PER_KIND);
    const dueIds = [...water.map(({ task }) => task.id), ...pumps.map(({ visit }) => visit.id),
        ...personal.map((reminder) => reminder.id)];
    const attempts = dueIds.length
        ? await db.select().from(reminderDeviceDeliveries)
            .where(and(inArray(reminderDeviceDeliveries.targetId, dueIds),
                inArray(reminderDeviceDeliveries.subscriptionId, devices.map((device) => device.id))))
        : [];
    const byEventDevice = new Map(attempts.map((row) =>
        [`${row.kind}:${row.targetId}:${row.dueAt.getTime()}:${row.subscriptionId}`, row]));
    const eligibleDevices = (kind: Kind, id: string, dueAt: Date, recipients: Device[]) => recipients.filter((device) => {
        const row = byEventDevice.get(`${kind}:${id}:${dueAt.getTime()}:${device.id}`);
        return canRetryReminder(row, now);
    });
    const jobs: Array<{ dueAt: Date; send: () => Promise<boolean> }> = [];
    for (const { task, alias } of water) {
        for (const device of eligibleDevices('water', task.id, task.dueAt, sharedDevices)) jobs.push({
            dueAt: task.dueAt,
            send: () => sendToDevice('water', task.id, task.dueAt, 'Revisar llave de llenado',
                `${alias}: comprueba físicamente la llave y ciérrala si corresponde.`,
                task.visitId ? `/panel/visitas/${task.visitId}` : `/panel/propiedades/${task.propertyId}`, device),
        });
    }
    for (const { visit, alias } of pumps) {
        if (!visit.pumpStartedAt) continue;
        const dueAt = new Date(visit.pumpStartedAt.getTime() + PUMP_REMINDER_MINUTES * 60_000);
        for (const device of eligibleDevices('pump', visit.id, dueAt, sharedDevices)) jobs.push({
            dueAt,
            send: () => sendToDevice('pump', visit.id, dueAt, 'Revisar temporizador de bomba',
                `${alias}: verifica físicamente el estado de la bomba.`,
                `/panel/visitas/${visit.id}`, device),
        });
    }
    for (const reminder of personal) {
        if (!reminder.dueAt) continue;
        for (const device of eligibleDevices('personal', reminder.id, reminder.dueAt,
            devices.filter((item) => item.userId === reminder.userId))) jobs.push({
            dueAt: reminder.dueAt,
            send: () => sendToDevice('personal', reminder.id, reminder.dueAt!,
                'Mi recordatorio', reminder.title, '/panel', device),
        });
    }
    jobs.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
    // Acotar peticiones push simultáneas para no agotar el proceso del cron.
    const results = await Promise.all(jobs.slice(0, MAX_SENDS_PER_RUN).map((job) => job.send()));
    const sent = results.filter(Boolean).length;
    await recordCronRun();
    return { sent };
}
