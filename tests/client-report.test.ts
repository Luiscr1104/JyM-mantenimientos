import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { VisitProduct } from '../src/db/schema';
import { buildClientReport, type ClientDeliveryRow } from '../src/lib/client-report';
import { reportRange, shiftReportDate } from '../src/lib/report-period';

test('períodos semanal y mensual respetan fines de mes, año y años bisiestos', () => {
    assert.deepEqual(reportRange('2026-11-22', 'week'), { start: '2026-11-16', end: '2026-11-22' });
    assert.deepEqual(reportRange('2024-02-20', 'month'), { start: '2024-02-01', end: '2024-02-29' });
    assert.deepEqual(reportRange('2026-02-28', 'month'), { start: '2026-02-01', end: '2026-02-28' });
    assert.equal(shiftReportDate('2026-01-01', 'month', -1), '2025-12-01');
    assert.equal(shiftReportDate('2026-12-01', 'month', 1), '2027-01-01');
    assert.equal(shiftReportDate('2026-11-16', 'week', 1), '2026-11-23');
});

test('reporte entregable solo presenta pasos realizados de visitas completadas del cliente', () => {
    const row = (id: string, status: ClientDeliveryRow['visit']['status'], clientId: string): ClientDeliveryRow => ({
        visit: {
            id, status, scheduledFor: '2026-11-19', workTypes: ['routine'],
            checklist: { inspect: true, debris: false, clean: false },
            notes: 'NUNCA INCLUIR', pendingReason: 'INTERNO',
        } as ClientDeliveryRow['visit'],
        client: { id: clientId },
        property: { alias: `Piscina ${id}`, gateCode: 'SECRETO' } as ClientDeliveryRow['property'],
    });
    const products = [
        { visitId: '1', product: 'granulated_chlorine', quantity: '150' },
        { visitId: '2', product: 'granulated_chlorine', quantity: '200' },
        { visitId: '3', product: 'chlorine_tablet', quantity: '2' },
    ] as VisitProduct[];

    const result = buildClientReport(
        [row('1', 'completed', 'a'), row('2', 'completed', 'b'), row('3', 'scheduled', 'a')],
        products, 'a',
    );
    assert.deepEqual(result, [{
        date: '2026-11-19',
        propertyName: 'Piscina 1',
        tasks: ['Revisar piscina y equipos'],
        products: [{ name: 'Cloro granulado', quantity: 150, unit: 'g' }],
    }]);
    assert.doesNotMatch(JSON.stringify(result), /SECRETO|INTERNO|NUNCA INCLUIR|Piscina 2|Piscina 3/);
});

test('la página de entrega es independiente y la consulta limita cliente, período y estado', () => {
    const page = readFileSync('src/pages/panel/reportes/cliente.astro', 'utf8');
    const server = readFileSync('src/server/reports.ts', 'utf8');
    assert.doesNotMatch(page, /PanelLayout|visit\.notes|pendingReason|gateCode|client\.phone/);
    assert.match(page, /Cache-Control', 'private, no-store'/);
    assert.match(server, /eq\(clients\.id, clientId\), eq\(visits\.status, 'completed'\)/);
    assert.match(server, /gte\(visits\.scheduledFor, start\), lte\(visits\.scheduledFor, end\)/);
});
