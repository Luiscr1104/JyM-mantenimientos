import type { Visit, VisitProduct, WaterFillTask } from '@/db/schema';
import type { VisitWithProperty } from '@/server/visits';
import { addDays, weekdayIndex } from './dates';
import { tasksForTypes } from './visit-work';
import type { ProductKey } from './products';

export function weekStart(date: string): string {
    return addDays(date, -((weekdayIndex(date) + 6) % 7));
}

export function weekEnd(start: string): string {
    return addDays(start, 6);
}

export function visitMinutes(visit: Pick<Visit, 'status' | 'startedAt' | 'leftAt' | 'completedAt'>): number | null {
    if (visit.status !== 'completed' || !visit.startedAt) return null;
    const end = visit.leftAt ?? visit.completedAt;
    if (!end) return null;
    const minutes = (end.getTime() - visit.startedAt.getTime()) / 60_000;
    return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
}

export function summarizeWeeklyReport(
    rows: VisitWithProperty[],
    products: VisitProduct[],
    waterTasks: WaterFillTask[],
    today: string,
) {
    const byVisit = new Map<string, VisitProduct[]>();
    const productTotals = new Map<ProductKey, number>();
    for (const product of products) {
        byVisit.set(product.visitId, [...(byVisit.get(product.visitId) ?? []), product]);
        const quantity = Number(product.quantity);
        if (!Number.isFinite(quantity)) continue;
        // Las cantidades tienen hasta dos decimales; sumar centésimas evita errores de coma flotante.
        productTotals.set(product.product, (productTotals.get(product.product) ?? 0) + Math.round(quantity * 100));
    }

    const counts = { total: rows.length, completed: 0, scheduled: 0, inProgress: 0, skipped: 0, overdue: 0 };
    const workTypes = new Map<string, number>();
    const clients = new Map<string, {
        id: string;
        name: string;
        rows: Array<VisitWithProperty & {
            products: VisitProduct[];
            completedTasks: string[];
            incompleteTasks: string[];
            minutes: number | null;
        }>;
        completed: number;
    }>();
    let totalMinutes = 0;
    let timedVisits = 0;
    let incompleteVisits = 0;

    for (const row of rows) {
        const { visit, client } = row;
        if (visit.status === 'completed') counts.completed++;
        if (visit.status === 'scheduled') {
            counts.scheduled++;
            if (visit.scheduledFor < today) counts.overdue++;
        }
        if (visit.status === 'in_progress') counts.inProgress++;
        if (visit.status === 'skipped') counts.skipped++;

        const minutes = visitMinutes(visit);
        if (minutes !== null) {
            totalMinutes += minutes;
            timedVisits++;
        }
        const tasks = visit.status === 'completed' ? tasksForTypes(visit.workTypes) : [];
        const completedTasks = tasks.filter(({ key }) => visit.checklist?.[key] === true).map(({ label }) => label);
        const incompleteTasks = tasks.filter(({ key }) => visit.checklist?.[key] !== true).map(({ label }) => label);
        if (visit.status === 'completed' && (incompleteTasks.length > 0 || visit.pendingReason?.trim())) incompleteVisits++;
        if (visit.status === 'completed') {
            for (const type of visit.workTypes) workTypes.set(type, (workTypes.get(type) ?? 0) + 1);
        }

        const group = clients.get(client.id) ?? { id: client.id, name: client.name, rows: [], completed: 0 };
        group.rows.push({ ...row, products: byVisit.get(visit.id) ?? [], completedTasks, incompleteTasks, minutes });
        if (visit.status === 'completed') group.completed++;
        clients.set(client.id, group);
    }

    return {
        counts,
        totalMinutes,
        timedVisits,
        incompleteVisits,
        workTypes,
        productTotals: new Map([...productTotals].map(([key, cents]) => [key, cents / 100])),
        water: {
            total: waterTasks.length,
            closed: waterTasks.filter((task) => task.closedAt !== null).length,
            open: waterTasks.filter((task) => task.closedAt === null).length,
        },
        clients: [...clients.values()],
    };
}
