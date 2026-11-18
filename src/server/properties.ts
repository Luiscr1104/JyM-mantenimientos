import { asc, count, desc, eq } from 'drizzle-orm';
import { clients, db, properties, routePlans, visitProducts, visits, waterFillTasks } from '@/db';
import { nullIfEmpty, type PropertyInput } from '@/lib/validation';
import { propertyDeletionIssue } from '@/lib/property-deletion';

export class PropertyDeletionError extends Error {
    constructor(message: string, public status = 409) {
        super(message);
    }
}

export async function getPropertyDeletionStatus(propertyId: string) {
    const [relatedVisits, product, waterTasks] = await Promise.all([
        db.select().from(visits).where(eq(visits.propertyId, propertyId)),
        db.select({ id: visitProducts.id }).from(visitProducts)
            .innerJoin(visits, eq(visitProducts.visitId, visits.id))
            .where(eq(visits.propertyId, propertyId)).limit(1),
        db.select({ closedAt: waterFillTasks.closedAt }).from(waterFillTasks)
            .where(eq(waterFillTasks.propertyId, propertyId)),
    ]);
    return {
        scheduledVisits: relatedVisits.length,
        issue: propertyDeletionIssue({
            visits: relatedVisits,
            hasProducts: product.length > 0,
            hasWaterTask: waterTasks.length > 0,
            hasOpenWaterTask: waterTasks.some(({ closedAt }) => closedAt === null),
        }),
    };
}

export async function deletePropertySafely(propertyId: string, clientId: string) {
    return db.transaction(async (tx) => {
        const [property] = await tx.select().from(properties)
            .where(eq(properties.id, propertyId)).for('update');
        if (!property || property.clientId !== clientId) {
            throw new PropertyDeletionError('Propiedad no encontrada en este cliente.', 404);
        }

        const relatedVisits = await tx.select().from(visits)
            .where(eq(visits.propertyId, propertyId)).for('update');
        const product = await tx.select({ id: visitProducts.id }).from(visitProducts)
            .innerJoin(visits, eq(visitProducts.visitId, visits.id))
            .where(eq(visits.propertyId, propertyId)).limit(1);
        const waterTasks = await tx.select({ closedAt: waterFillTasks.closedAt }).from(waterFillTasks)
            .where(eq(waterFillTasks.propertyId, propertyId)).for('update');
        const issue = propertyDeletionIssue({
            visits: relatedVisits,
            hasProducts: product.length > 0,
            hasWaterTask: waterTasks.length > 0,
            hasOpenWaterTask: waterTasks.some(({ closedAt }) => closedAt === null),
        });
        if (issue) throw new PropertyDeletionError(issue);

        for (const date of new Set(relatedVisits.map((visit) => visit.scheduledFor))) {
            await tx.delete(routePlans).where(eq(routePlans.visitDate, date));
        }
        await tx.delete(properties).where(eq(properties.id, propertyId));
        return { clientId: property.clientId, removedVisits: relatedVisits.length };
    });
}

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
