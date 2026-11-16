import { asc, count, desc, eq } from 'drizzle-orm';
import { clients, db, properties, routePlans, visits } from '@/db';
import { nullIfEmpty, type PropertyInput } from '@/lib/validation';

export async function listPropertiesByClient(clientId: string) {
    return db
        .select()
        .from(properties)
        .where(eq(properties.clientId, clientId))
        .orderBy(desc(properties.createdAt));
}

export async function listPropertiesWithClient() {
    return db
        .select({ property: properties, client: clients })
        .from(properties)
        .innerJoin(clients, eq(properties.clientId, clients.id))
        .orderBy(asc(clients.name), asc(properties.alias));
}

export async function getProperty(id: string) {
    const [row] = await db.select().from(properties).where(eq(properties.id, id)).limit(1);
    return row ?? null;
}

export async function getPropertyWithClient(id: string) {
    const [row] = await db
        .select({ property: properties, client: clients })
        .from(properties)
        .innerJoin(clients, eq(properties.clientId, clients.id))
        .where(eq(properties.id, id))
        .limit(1);

    return row ?? null;
}

export async function createProperty(input: PropertyInput) {
    const [row] = await db
        .insert(properties)
        .values({
            clientId: input.clientId,
            alias: input.alias,
            address: input.address,
            lat: input.lat ?? null,
            lng: input.lng ?? null,
            gateCode: nullIfEmpty(input.gateCode),
            accessNotes: nullIfEmpty(input.accessNotes),
            poolType: nullIfEmpty(input.poolType),
            volumeM3: input.volumeM3 ?? null,
            pumpNotes: nullIfEmpty(input.pumpNotes),
            filterType: nullIfEmpty(input.filterType),
            sanitation: nullIfEmpty(input.sanitation),
        })
        .returning();

    return row;
}

export async function updateProperty(id: string, input: PropertyInput) {
    const current = await getProperty(id);
    const [row] = await db
        .update(properties)
        .set({
            alias: input.alias,
            address: input.address,
            lat: input.lat ?? null,
            lng: input.lng ?? null,
            gateCode: nullIfEmpty(input.gateCode),
            accessNotes: nullIfEmpty(input.accessNotes),
            poolType: nullIfEmpty(input.poolType),
            volumeM3: input.volumeM3 ?? null,
            pumpNotes: nullIfEmpty(input.pumpNotes),
            filterType: nullIfEmpty(input.filterType),
            sanitation: nullIfEmpty(input.sanitation),
            updatedAt: new Date(),
        })
        .where(eq(properties.id, id))
        .returning();

    if (row && current && (current.lat !== row.lat || current.lng !== row.lng)) {
        const dates = await db.selectDistinct({ date: visits.scheduledFor })
            .from(visits).where(eq(visits.propertyId, id));
        for (const { date } of dates) {
            await db.delete(routePlans).where(eq(routePlans.visitDate, date));
        }
    }
    return row ?? null;
}

export async function countProperties() {
    const [row] = await db.select({ value: count() }).from(properties);
    return Number(row?.value ?? 0);
}
