import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Visit, VisitProduct, WaterFillTask } from '../src/db/schema';
import type { VisitWithProperty } from '../src/server/visits';
import { summarizeWeeklyReport, visitMinutes, weekEnd, weekStart } from '../src/lib/weekly-report';

function row(id: string, date: string, status: Visit['status'], extra: Partial<Visit> = {}): VisitWithProperty {
    return {
        visit: {
            id, scheduledFor: date, status, workTypes: ['routine'],
            startedAt: null, leftAt: null, completedAt: null, checklist: null, pendingReason: null,
            ...extra,
        } as Visit,
        client: { id: 'client-a', name: 'Cliente A' } as VisitWithProperty['client'],
        property: { id: `property-${id}`, alias: `Piscina ${id}` } as VisitWithProperty['property'],
    };
}

test('la semana va de lunes a domingo, incluso cruzando de año', () => {
    assert.equal(weekStart('2026-11-22'), '2026-11-16');
    assert.equal(weekStart('2026-11-16'), '2026-11-16');
    assert.equal(weekStart('2027-01-01'), '2026-12-28');
    assert.equal(weekEnd(weekStart('2027-01-01')), '2027-01-03');
});

test('el tiempo se cuenta solo para visitas completadas con llegada y salida válidas', () => {
    const start = new Date('2026-11-16T14:00:00Z');
    const end = new Date('2026-11-16T15:30:00Z');
    assert.equal(visitMinutes(row('a', '2026-11-16', 'completed', { startedAt: start, leftAt: end }).visit), 90);
    assert.equal(visitMinutes(row('a', '2026-11-16', 'in_progress', { startedAt: start, leftAt: end }).visit), null);
    assert.equal(visitMinutes(row('a', '2026-11-16', 'completed', { startedAt: end, leftAt: start }).visit), null);
});

test('el reporte conserva omitidas, vencidas, incidencias y productos por unidad', () => {
    const rows = [
        row('a', '2026-11-16', 'completed', {
            startedAt: new Date('2026-11-16T14:00:00Z'),
            leftAt: new Date('2026-11-16T15:30:00Z'),
            checklist: { inspect: true },
            pendingReason: 'Faltó limpiar la piscina.',
        }),
        row('b', '2026-11-17', 'completed', {
            startedAt: new Date('2026-11-17T14:00:00Z'),
            leftAt: new Date('2026-11-17T14:45:00Z'),
            checklist: { inspect: true, debris: true, clean: true, water: true, filter: true },
        }),
        row('c', '2026-11-18', 'skipped'),
        row('d', '2026-11-19', 'scheduled'),
        row('e', '2026-11-22', 'scheduled'),
    ];
    const products = [
        { visitId: 'a', product: 'granulated_chlorine', quantity: '1.25' },
        { visitId: 'b', product: 'granulated_chlorine', quantity: '2.10' },
        { visitId: 'b', product: 'liquid_flocculant', quantity: '5.00' },
    ] as VisitProduct[];
    const water = [
        { closedAt: null },
        { closedAt: new Date('2026-11-17T18:00:00Z') },
    ] as WaterFillTask[];
    const report = summarizeWeeklyReport(rows, products, water, '2026-11-20');

    assert.deepEqual(report.counts, { total: 5, completed: 2, scheduled: 2, inProgress: 0, skipped: 1, overdue: 1 });
    assert.equal(report.totalMinutes, 135);
    assert.equal(report.timedVisits, 2);
    assert.equal(report.incompleteVisits, 1);
    assert.equal(report.workTypes.get('routine'), 2);
    assert.equal(report.productTotals.get('granulated_chlorine'), 3.35);
    assert.equal(report.productTotals.get('liquid_flocculant'), 5);
    assert.deepEqual(report.water, { total: 2, closed: 1, open: 1 });
    assert.deepEqual(report.clients[0].rows[0].completedTasks, ['Revisar piscina y equipos']);
    assert.equal(report.clients[0].rows[0].incompleteTasks.length, 4);
    assert.equal(report.clients[0].rows[1].incompleteTasks.length, 0);
});
