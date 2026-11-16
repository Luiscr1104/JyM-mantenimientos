import { count, desc, eq } from 'drizzle-orm';
import { db, leads } from '@/db';
import { nullIfEmpty, type LeadInput } from '@/lib/validation';

export type LeadStatus = 'new' | 'contacted' | 'quoted' | 'won' | 'lost';

export async function listLeads(limit = 100, status?: LeadStatus) {
    return db
        .select()
        .from(leads)
        .where(status ? eq(leads.status, status) : undefined)
        .orderBy(desc(leads.createdAt))
        .limit(limit);
}

export async function getRecentLeads(limit = 4) {
    return listLeads(limit);
}

export async function countNewLeads() {
    const [row] = await db.select({ value: count() }).from(leads).where(eq(leads.status, 'new'));
    return Number(row?.value ?? 0);
}

export async function createLead(input: LeadInput) {
    const [row] = await db
        .insert(leads)
        .values({
            name: input.name,
            phone: input.phone,
            email: nullIfEmpty(input.email),
            message: input.message,
            source: 'website',
        })
        .returning();

    return row;
}

export async function updateLeadStatus(id: string, status: LeadStatus) {
    const [row] = await db
        .update(leads)
        .set({ status, updatedAt: new Date() })
        .where(eq(leads.id, id))
        .returning();

    return row ?? null;
}
