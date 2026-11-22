import type { Client, Property, Visit, VisitProduct } from '@/db/schema';
import { productInfo } from './products';
import { tasksForTypes } from './visit-work';

/** Proyección explícita: nunca incluir notas, accesos ni estados internos en el reporte para entregar. */
export type ClientDeliveryRow = {
    visit: Pick<Visit, 'id' | 'scheduledFor' | 'status' | 'workTypes' | 'checklist'>;
    property: Pick<Property, 'alias'>;
    client: Pick<Client, 'id'>;
};

export function buildClientReport(rows: ClientDeliveryRow[], products: VisitProduct[], clientId: string) {
    const completed = rows.filter(({ visit, client }) =>
        client.id === clientId && visit.status === 'completed');
    const allowedIds = new Set(completed.map(({ visit }) => visit.id));
    const byVisit = new Map<string, Array<{ name: string; quantity: number; unit: string }>>();

    for (const product of products) {
        if (!allowedIds.has(product.visitId)) continue;
        const amount = Number(product.quantity);
        if (!Number.isFinite(amount) || amount <= 0) continue;
        const { label, unit } = productInfo(product.product);
        const previous = byVisit.get(product.visitId) ?? [];
        previous.push({ name: label, quantity: amount, unit });
        byVisit.set(product.visitId, previous);
    }

    return completed.map(({ visit, property }) => ({
        date: visit.scheduledFor,
        propertyName: property.alias,
        tasks: tasksForTypes(visit.workTypes)
            .filter(({ key }) => visit.checklist?.[key] === true)
            .map(({ label }) => label),
        products: byVisit.get(visit.id) ?? [],
    }));
}
