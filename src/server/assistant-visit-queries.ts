import { and, desc, eq, gte, inArray, isNull, lt, lte } from 'drizzle-orm';
import { db, personalReminders, visitProducts, visits, waterFillTasks, type Visit } from '@/db';
import { getToday } from '@/lib/dates';
import { visitMinutes, type ReadAction, type pastVisitSelection } from '@/lib/assistant-visit-read';
import { productInfo } from '@/lib/products';
import { spokenDate, spokenWeek } from '@/lib/voice-assistant';
import { normalizeChecklist, tasksForTypes, EXIT_STEPS } from '@/lib/visit-work';
import { workTypesLabel } from '@/lib/visit-types';
import { listVisitsByDate } from './visits';

type Property = { property: { id: string; alias: string }; client: { name: string } };
type Selection = ReturnType<typeof pastVisitSelection>;
type Product = typeof visitProducts.$inferSelect;
export type ReadResult = { message: string; date?: string };

const status = { scheduled: 'programada', in_progress: 'en curso', completed: 'completada', skipped: 'omitida' };
const brief = (value: string | null, max = 170) => value?.trim()
    ? `${value.trim().slice(0, max)}${value.trim().length > max ? '…' : ''}` : '';
const time = (value: Date) => new Intl.DateTimeFormat('es-CR', {
    timeZone: 'America/Costa_Rica', hour: 'numeric', minute: '2-digit',
}).format(value);
const amount = (value: number) => value.toLocaleString('es-CR', { maximumFractionDigits: 2 });

function productSummary(products: Product[]) {
    const totals = new Map<Product['product'], number>();
    for (const product of products) {
        totals.set(product.product, (totals.get(product.product) ?? 0) + Number(product.quantity));
    }
    return [...totals].map(([key, quantity]) =>
        `${amount(quantity)} ${productInfo(key).unit} de ${productInfo(key).label.toLowerCase()}`).join('; ');
}

async function productsFor(ids: string[]) {
    return ids.length ? db.select().from(visitProducts).where(inArray(visitProducts.visitId, ids)) : [];
}

async function recentVisits(propertyId: string, until: string, count = 2, before?: string) {
    return db.select().from(visits).where(and(eq(visits.propertyId, propertyId),
        lte(visits.scheduledFor, until), before ? lt(visits.scheduledFor, before) : undefined))
        .orderBy(desc(visits.scheduledFor)).limit(count);
}

function checklistSummary(visit: Visit) {
    if (!visit.checklist) return 'No hay pasos guardados.';
    const checklist = normalizeChecklist(visit.checklist);
    const tasks = tasksForTypes(visit.workTypes);
    const done = tasks.filter(({ key }) => checklist[key]).length;
    const exits = EXIT_STEPS.filter(({ key }) => checklist[key]).length;
    return `${done} de ${tasks.length} tareas y ${exits} de 3 controles de salida marcados.`;
}

export async function readTodayBriefing(userId: string): Promise<ReadResult> {
    const today = getToday();
    const [day, reminders, water] = await Promise.all([
        listVisitsByDate(today),
        db.select().from(personalReminders).where(and(eq(personalReminders.userId, userId),
            isNull(personalReminders.completedAt), lte(personalReminders.dueDate, today)))
            .orderBy(personalReminders.dueAt).limit(10),
        db.select({ id: waterFillTasks.id }).from(waterFillTasks)
            .where(isNull(waterFillTasks.closedAt)).limit(20),
    ]);
    const scheduled = day.filter(({ visit }) => visit.status === 'scheduled');
    const ongoing = day.filter(({ visit }) => visit.status === 'in_progress');
    const exit = ongoing.filter(({ visit }) =>
        EXIT_STEPS.some(({ key }) => !normalizeChecklist(visit.checklist)[key]));
    const items = [
        `${scheduled.length} visitas por iniciar${scheduled.length ? `: ${scheduled.slice(0, 3).map(({ property }) => property.alias).join(', ')}${scheduled.length > 3 ? ' y más' : ''}` : ''}`,
        `${ongoing.length} en curso${ongoing.length ? `: ${ongoing.slice(0, 3).map(({ property }) => property.alias).join(', ')}` : ''}`,
        `${exit.length} con controles de salida pendientes de confirmar`,
        `${reminders.length}${reminders.length === 10 ? ' o más' : ''} recordatorios tuyos pendientes${reminders.length ? `: ${reminders.slice(0, 3).map(({ title }) => brief(title, 55)).join(', ')}` : ''}`,
        `${water.length}${water.length === 20 ? ' o más' : ''} llaves de llenado abiertas registradas`,
    ];
    return { message: `Para hoy: ${items.join('; ')}. Los cambios aún sin sincronizar en otros teléfonos podrían faltar.` };
}

export async function readProperty(action: Exclude<ReadAction, 'today_briefing'>,
    row: Property, options: { selection?: Selection; from?: string; to?: string; before?: string } = {}): Promise<ReadResult> {
    const today = getToday();
    const { property, client } = row;
    if (action === 'chlorine_month' || action === 'visit_duration') {
        const from = options.from!, to = options.to!;
        const dates = await db.select().from(visits).where(and(eq(visits.propertyId, property.id),
            gte(visits.scheduledFor, from), lte(visits.scheduledFor, to)));
        const week = action === 'visit_duration' ? spokenWeek(from, to) : undefined;
        if (action === 'visit_duration') {
            const completed = dates.filter(({ status }) => status === 'completed');
            const minutes = completed.map(({ startedAt, leftAt }) => visitMinutes(startedAt, leftAt));
            const valid = minutes.filter((value): value is number => value !== null);
            return { message: `Para ${property.alias}, ${week}: ${valid.length} visitas completadas con horas registradas; ` +
                `${amount(valid.reduce((sum, value) => sum + value, 0))} minutos en total. ` +
                `${completed.length - valid.length} completadas sin duración válida; ${dates.length - completed.length} sin completar. ` +
                'Las visitas aún sin sincronizar no aparecen.' };
        }
        const products = (await productsFor(dates.map(({ id }) => id)))
            .filter(({ product }) => product === 'granulated_chlorine' || product === 'chlorine_tablet');
        const month = new Intl.DateTimeFormat('es-CR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
            .format(new Date(`${from}T12:00:00Z`));
        return { message: products.length
            ? `Para ${property.alias} en ${month}, hasta ${spokenDate(to)}: ${productSummary(products)} ` +
                `en ${new Set(products.map(({ visitId }) => visitId)).size} visitas registradas. Los cambios sin sincronizar podrían faltar.`
            : `No encuentro cloro registrado para ${property.alias} en ${month}, hasta ${spokenDate(to)}. ` +
                'La falta de registro no demuestra que no se haya aplicado; puede faltar sincronización.' };
    }

    if (action === 'visit_summary' && options.selection?.mode === 'ambiguous') {
        return { message: 'No entendí la fecha de esa visita. Di hoy, ayer, la anterior o una fecha completa.' };
    }
    const selection = options.selection;
    const before = options.before ?? (selection?.mode === 'previous' ? today : undefined);
    const date = selection?.mode === 'date' ? selection.date : undefined;
    const latest = date ? await db.select().from(visits)
        .where(and(eq(visits.propertyId, property.id), eq(visits.scheduledFor, date))).limit(1)
        : await recentVisits(property.id, today, action === 'visit_compare' ? 2 : 1, before);
    if (!latest.length) return { message: `No encuentro una visita registrada para ${property.alias}${date ? ` el ${spokenDate(date)}` : ' en ese período'}.` };
    const visit = latest[0];
    const products = await productsFor(latest.map(({ id }) => id));
    if (action === 'visit_compare') {
        const previous = latest[1] ?? (await recentVisits(property.id, today, 1, visit.scheduledFor))[0];
        if (!previous) return { message: `Solo encuentro una visita para ${property.alias}; necesito otra anterior para compararlas.`, date: visit.scheduledFor };
        const previousProducts = latest.find(({ id }) => id === previous.id) ? products.filter(({ visitId }) => visitId === previous.id)
            : await productsFor([previous.id]);
        const nowProducts = products.filter(({ visitId }) => visitId === visit.id);
        return { message: `Entre ${spokenDate(previous.scheduledFor)} y ${spokenDate(visit.scheduledFor)} para ${property.alias}: ` +
            `estado ${status[previous.status]} y luego ${status[visit.status]}; ` +
            `trabajo anterior: ${workTypesLabel(previous.workTypes)}; reciente: ${workTypesLabel(visit.workTypes)}. ` +
            `Productos anteriores: ${productSummary(previousProducts) || 'sin registro'}; recientes: ${productSummary(nowProducts) || 'sin registro'}. ` +
            `Pendientes anteriores: ${brief(previous.pendingReason, 90) || 'sin motivo registrado'}; recientes: ${brief(visit.pendingReason, 90) || 'sin motivo registrado'}. ` +
            'La ausencia de un registro no demuestra que no se hiciera el trabajo.', date: visit.scheduledFor };
    }
    if (action === 'property_pending') {
        const [water] = await db.select({ id: waterFillTasks.id }).from(waterFillTasks)
            .where(and(eq(waterFillTasks.propertyId, property.id), isNull(waterFillTasks.closedAt))).limit(1);
        const checklist = normalizeChecklist(visit.checklist);
        const missing = [...tasksForTypes(visit.workTypes), ...EXIT_STEPS]
            .filter(({ key }) => !checklist[key]).map(({ label }) => label);
        return { message: `Para ${property.alias}, última visita ${spokenDate(visit.scheduledFor)}, ${status[visit.status]}. ` +
            `${visit.pendingReason ? `Motivo pendiente: ${brief(visit.pendingReason)}. ` : ''}` +
            `${missing.length && visit.status === 'in_progress'
                ? `Pasos aún no marcados: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ' y más' : ''}. ` : ''}` +
            `${water ? 'Hay una llave de llenado abierta registrada. ' : ''}` +
            `${visit.notes ? `Observaciones: ${brief(visit.notes)}. ` : ''}` +
            'Si no hay un pendiente registrado, no significa que todo esté verificado.', date: visit.scheduledFor };
    }
    const duration = visitMinutes(visit.startedAt, visit.leftAt ?? visit.completedAt);
    const details = [
        `Visita de ${property.alias}, de ${client.name}, ${spokenDate(visit.scheduledFor)}: ${status[visit.status]}`,
        `tipo de trabajo: ${workTypesLabel(visit.workTypes)}`,
        checklistSummary(visit),
        products.length ? `productos registrados: ${productSummary(products)}` : 'sin productos registrados',
        visit.startedAt ? `llegada registrada a las ${time(visit.startedAt)}` : '',
        visit.leftAt ? `salida a las ${time(visit.leftAt)}` : '',
        duration !== null ? `duración ${duration} minutos` : '',
        visit.pendingReason ? `pendiente: ${brief(visit.pendingReason)}` : '',
        visit.notes ? `observaciones: ${brief(visit.notes)}` : '',
        visit.pumpStartedAt && !visit.pumpStoppedAt ? 'bomba registrada en marcha: verificar físicamente' : '',
    ].filter(Boolean);
    return { message: `${details.join('; ')}. Los registros sin sincronizar en otros teléfonos podrían faltar.`,
        date: visit.scheduledFor };
}
