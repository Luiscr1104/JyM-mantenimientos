import { eq } from 'drizzle-orm';
import { db, servicePlans } from '@/db';
import type { ServicePlanInput } from '@/lib/validation';

export async function getServicePlan(propertyId: string) {
    const [row] = await db
        .select()
        .from(servicePlans)
        .where(eq(servicePlans.propertyId, propertyId))
        .limit(1);

    return row ?? null;
}

export async function saveServicePlan(propertyId: string, input: ServicePlanInput) {
    const existing = await getServicePlan(propertyId);

    if (existing) {
        const [row] = await db
            .update(servicePlans)
            .set({
                visitsPerWeek: input.visitsPerWeek,
                preferredDays: input.preferredDays.length > 0 ? input.preferredDays : null,
                active: input.active,
                updatedAt: new Date(),
            })
            .where(eq(servicePlans.id, existing.id))
            .returning();

        return row ?? null;
    }

    const [row] = await db
        .insert(servicePlans)
        .values({
            propertyId,
            visitsPerWeek: input.visitsPerWeek,
            preferredDays: input.preferredDays.length > 0 ? input.preferredDays : null,
            active: input.active,
        })
        .returning();

    return row ?? null;
}
