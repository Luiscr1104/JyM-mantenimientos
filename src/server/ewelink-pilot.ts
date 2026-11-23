import { eq } from 'drizzle-orm';
import { db, settings } from '@/db';
import { readEwelinkDeviceStatus } from '@/server/ewelink';

// Un único equipo piloto. No hay controles ni endpoints de escritura al dispositivo.
const PILOT_KEY = 'ewelink_pilot_device';

interface PilotMapping {
    propertyId: string;
    deviceId: string;
    name: string;
    model: string;
    uiid: number;
}

export async function getEwelinkPilotForProperty(propertyId: string): Promise<PilotMapping | null> {
    const [row] = await db.select({ value: settings.value }).from(settings)
        .where(eq(settings.key, PILOT_KEY)).limit(1);
    if (!row?.value) return null;
    try {
        const mapping = JSON.parse(row.value) as PilotMapping;
        if (mapping.propertyId !== propertyId ||
            typeof mapping.deviceId !== 'string' || !mapping.deviceId ||
            typeof mapping.name !== 'string' || typeof mapping.model !== 'string' ||
            !Number.isInteger(mapping.uiid)) return null;
        return mapping;
    } catch {
        return null;
    }
}

export async function readEwelinkPilotForProperty(propertyId: string) {
    const mapping = await getEwelinkPilotForProperty(propertyId);
    if (!mapping) return null;
    const telemetry = await readEwelinkDeviceStatus(mapping.deviceId);
    return { mapping, telemetry, readAt: new Date() };
}
