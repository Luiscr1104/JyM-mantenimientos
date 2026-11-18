import { and, desc, eq } from 'drizzle-orm';
import { db, properties, visitProducts, visits } from '@/db';
import type { z } from 'zod';
import type { visitProductSchema } from '@/lib/validation';

export class ProductError extends Error {
    constructor(message: string, public status = 409) {
        super(message);
    }
}

export async function listVisitProducts(visitId: string) {
    return db.select().from(visitProducts).where(eq(visitProducts.visitId, visitId))
        .orderBy(desc(visitProducts.createdAt), desc(visitProducts.id));
}

export async function listPropertyProducts(propertyId: string) {
    return db.select({ product: visitProducts, visit: visits }).from(visitProducts)
        .innerJoin(visits, eq(visitProducts.visitId, visits.id))
        .innerJoin(properties, eq(visits.propertyId, properties.id))
        .where(eq(properties.id, propertyId))
        .orderBy(desc(visitProducts.createdAt)).limit(30);
}

export async function addVisitProduct(visitId: string, input: z.infer<typeof visitProductSchema>) {
    return db.transaction(async (tx) => {
        const [visit] = await tx.select().from(visits).where(eq(visits.id, visitId)).for('update');
        if (!visit) throw new ProductError('Visita no encontrada', 404);
        if (visit.status !== 'in_progress' && visit.status !== 'completed') {
            throw new ProductError('Inicia la visita antes de registrar productos.');
        }
        const [row] = await tx.insert(visitProducts).values({
            visitId,
            product: input.product,
            quantity: input.quantity.toFixed(2),
        }).returning();
        return row;
    });
}

export async function removeVisitProduct(visitId: string, productId: string) {
    return db.transaction(async (tx) => {
        const [visit] = await tx.select().from(visits).where(eq(visits.id, visitId)).for('update');
        if (!visit) throw new ProductError('Visita no encontrada', 404);
        if (visit.status !== 'in_progress' && visit.status !== 'completed') {
            throw new ProductError('Inicia la visita antes de corregir productos.');
        }
        const [removed] = await tx.delete(visitProducts).where(
            and(eq(visitProducts.id, productId), eq(visitProducts.visitId, visitId)),
        ).returning({ id: visitProducts.id });
        if (!removed) throw new ProductError('Producto no encontrado en esta visita', 404);
        return removed;
    });
}
