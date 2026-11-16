import { count, desc, eq, ilike, or } from 'drizzle-orm';
import { clients, db, properties } from '@/db';
import { nullIfEmpty, type ClientInput } from '@/lib/validation';

export async function listClientsWithPropertyCount(search?: string) {
    const term = search?.trim();
    const filter = term
        ? or(
              ilike(clients.name, `%${term}%`),
              ilike(clients.phone, `%${term}%`),
              ilike(clients.email, `%${term}%`),
          )
        : undefined;

    const rows = await db
        .select({
            client: clients,
            propertyCount: count(properties.id),
        })
        .from(clients)
        .leftJoin(properties, eq(properties.clientId, clients.id))
        .where(filter)
        .groupBy(clients.id)
        .orderBy(desc(clients.createdAt));

    return rows.map((row) => ({
        ...row.client,
        propertyCount: Number(row.propertyCount),
    }));
}

export async function getClient(id: string) {
    const [row] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
    return row ?? null;
}

export async function createClient(input: ClientInput) {
    const [row] = await db
        .insert(clients)
        .values({
            name: input.name,
            phone: nullIfEmpty(input.phone),
            email: nullIfEmpty(input.email),
            notes: nullIfEmpty(input.notes),
            status: input.status,
        })
        .returning();

    return row;
}

export async function updateClient(id: string, input: ClientInput) {
    const [row] = await db
        .update(clients)
        .set({
            name: input.name,
            phone: nullIfEmpty(input.phone),
            email: nullIfEmpty(input.email),
            notes: nullIfEmpty(input.notes),
            status: input.status,
            updatedAt: new Date(),
        })
        .where(eq(clients.id, id))
        .returning();

    return row ?? null;
}

export async function countClients(status?: 'active' | 'inactive') {
    const [row] = await db
        .select({ value: count() })
        .from(clients)
        .where(status ? eq(clients.status, status) : undefined);

    return Number(row?.value ?? 0);
}
