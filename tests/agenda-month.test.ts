import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { addMonths, isValidMonth, monthGrid } from '../src/lib/agenda-calendar';

test('el calendario mensual respeta lunes, fines de mes y años bisiestos', () => {
    assert.equal(isValidMonth('2026-11'), true);
    assert.equal(isValidMonth('2026-13'), false);
    assert.equal(isValidMonth('2026-2'), false);
    assert.equal(isValidMonth('malicioso'), false);
    assert.equal(addMonths('2026-12', 1), '2027-01');
    assert.equal(addMonths('2026-01', -1), '2025-12');
    const november = monthGrid('2026-11');
    assert.equal(november[0], null); // El 1 de noviembre de 2026 es domingo.
    assert.equal(november[6], '2026-11-01');
    assert.equal(november[7], '2026-11-02');
    assert.equal(november.filter(Boolean).length, 30);
    assert.equal(november.length % 7, 0);
    assert.equal(monthGrid('2028-02').filter(Boolean).length, 29);
    assert.equal(monthGrid('2027-02').filter(Boolean).length, 28);
});

test('Agenda resume un mes en una consulta y solo navega a fechas existentes', () => {
    const visits = readFileSync('src/server/visits.ts', 'utf8');
    const agenda = readFileSync('src/pages/panel/agenda.astro', 'utf8');
    const calendar = readFileSync('src/components/panel/MonthCalendar.astro', 'utf8');
    assert.match(visits, /gte\(visits\.scheduledFor, `\$\{month\}-01`\)/);
    assert.match(visits, /lt\(visits\.scheduledFor, `\$\{addMonths\(month, 1\)\}-01`\)/);
    assert.match(visits, /ne\(visits\.status, 'skipped'\)/);
    assert.match(visits, /\.groupBy\(visits\.scheduledFor\)/);
    assert.match(agenda, /<MonthCalendar/);
    assert.match(agenda, /name="scheduledFor" value=\{date\}/);
    assert.match(calendar, /date=\$\{value\}&calendar=month/);
    assert.match(calendar, /#gestionar-visitas/);
    assert.doesNotMatch(calendar, /fetch\(|method="POST"/);
});

test('al agregar visitas desde el calendario se conserva la vista mensual', () => {
    const agenda = readFileSync('src/pages/panel/agenda.astro', 'utf8');
    const action = readFileSync('src/pages/api/panel/visits/index.ts', 'utf8');
    assert.match(agenda, /data-calendar-state/);
    assert.match(agenda, /calendar\.open \? 'month' : ''/);
    assert.match(action, /body\.calendar === 'month'/);
    assert.match(action, /&calendar=month/);
});
