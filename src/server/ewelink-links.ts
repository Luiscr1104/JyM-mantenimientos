import { and, desc, eq } from 'drizzle-orm';
import {
    db, ewelinkDeviceEvents, ewelinkPropertyDevices, profiles, properties,
} from '@/db';

export class EwelinkLinkError extends Error {
    constructor(message: string, public status: number) { super(message); }
}

function isUniqueConflict(error: unknown) {
    let current = error;
    for (let depth = 0; depth < 3 && current && typeof current === 'object'; depth++) {
        if ((current as { code?: string }).code === '23505') return true;
        current = (current as { cause?: unknown }).cause;
    }
    return false;
}

export async function listEwelinkPropertyDevices(propertyId: string) {
    return db.select().from(ewelinkPropertyDevices)
        .where(eq(ewelinkPropertyDevices.propertyId, propertyId))
        .orderBy(ewelinkPropertyDevices.createdAt);
}

export async function listAllEwelinkAssignments() {
    return db.select({
        deviceId: ewelinkPropertyDevices.deviceId,
        name: ewelinkPropertyDevices.name,
        propertyId: ewelinkPropertyDevices.propertyId,
        propertyName: properties.alias,
    }).from(ewelinkPropertyDevices)
        .innerJoin(properties, eq(ewelinkPropertyDevices.propertyId, properties.id));
}

export async function getEwelinkPropertyDevice(propertyId: string, linkId: string) {
    const [row] = await db.select().from(ewelinkPropertyDevices)
        .where(and(eq(ewelinkPropertyDevices.propertyId, propertyId),
            eq(ewelinkPropertyDevices.id, linkId))).limit(1);
    return row ?? null;
}

export async function listEwelinkPropertyHistory(propertyId: string) {
    return db.select({
        id: ewelinkDeviceEvents.id,
        name: ewelinkDeviceEvents.name,
        action: ewelinkDeviceEvents.action,
        actor: profiles.fullName,
        createdAt: ewelinkDeviceEvents.createdAt,
    }).from(ewelinkDeviceEvents)
        .leftJoin(profiles, eq(ewelinkDeviceEvents.actorId, profiles.id))
        .where(eq(ewelinkDeviceEvents.propertyId, propertyId))
        .orderBy(desc(ewelinkDeviceEvents.createdAt)).limit(20);
}

export async function linkEwelinkDevice(
    propertyId: string,
    device: { id: string; name: string; model: string | null; uiid: number | null },
    actorId: string,
) {
    if (!device.id || !device.name || device.id.length > 128) {
        throw new EwelinkLinkError('El equipo no es válido.', 400);
    }
    try {
        return await db.transaction(async (tx) => {
            const [property] = await tx.select({ id: properties.id }).from(properties)
                .where(eq(properties.id, propertyId)).limit(1);
            if (!property) throw new EwelinkLinkError('La propiedad no existe.', 404);
            const [linked] = await tx.insert(ewelinkPropertyDevices).values({
                propertyId, deviceId: device.id, name: device.name,
                model: device.model, uiid: device.uiid, linkedBy: actorId,
            }).returning({ id: ewelinkPropertyDevices.id });
            await tx.insert(ewelinkDeviceEvents).values({
                propertyId, deviceId: device.id, name: device.name,
                action: 'linked', actorId,
            });
            return linked;
        });
    } catch (error) {
        if (isUniqueConflict(error)) {
            throw new EwelinkLinkError('Este Sonoff ya está vinculado a una propiedad. Desvincúlalo allí antes de asignarlo de nuevo.', 409);
        }
        throw error;
    }
}

export async function unlinkEwelinkDevice(propertyId: string, linkId: string, actorId: string) {
    return db.transaction(async (tx) => {
        const [removed] = await tx.delete(ewelinkPropertyDevices)
            .where(and(eq(ewelinkPropertyDevices.propertyId, propertyId),
                eq(ewelinkPropertyDevices.id, linkId)))
            .returning({
                deviceId: ewelinkPropertyDevices.deviceId,
                name: ewelinkPropertyDevices.name,
            });
        if (!removed) throw new EwelinkLinkError('Este equipo ya no está vinculado a la propiedad.', 404);
        await tx.insert(ewelinkDeviceEvents).values({
            propertyId, deviceId: removed.deviceId, name: removed.name,
            action: 'unlinked', actorId,
        });
    });
}
