import assert from 'node:assert/strict';
import { test } from 'node:test';
import { visitWorkInputSchema } from '../src/lib/validation';
import {
    EXIT_STEPS,
    TASKS,
    emptyChecklist,
    getCompletionIssue,
    normalizeChecklist,
} from '../src/lib/visit-work';

test('el checklist inicia vacío y normaliza registros antiguos', () => {
    const empty = emptyChecklist();
    assert.equal(Object.keys(empty).length, TASKS.length + EXIT_STEPS.length);
    assert.equal(normalizeChecklist(null).exitAccess, false);
    assert.equal(normalizeChecklist({ inspect: true, unknown: true }).inspect, true);
    assert.equal('unknown' in normalizeChecklist({ unknown: true }), false);
});

test('la salida exige confirmaciones, bomba detenida y motivo de tareas pendientes', () => {
    const checklist = emptyChecklist();
    assert.match(getCompletionIssue(checklist, null, false) ?? '', /tres pasos/);
    for (const { key } of EXIT_STEPS) checklist[key] = true;
    assert.match(getCompletionIssue(checklist, '', false) ?? '', /pendientes/);
    assert.match(getCompletionIssue(checklist, 'Filtro inaccesible', true) ?? '', /bomba/);
    assert.equal(getCompletionIssue(checklist, 'Filtro inaccesible', false), null);
    for (const { key } of TASKS) checklist[key] = true;
    assert.equal(getCompletionIssue(checklist, '', false), null);
});

test('el servidor rechaza checklist incompleto y notas demasiado largas', () => {
    const valid = { checklist: emptyChecklist(), notes: 'Todo bien', pendingReason: '' };
    assert.equal(visitWorkInputSchema.safeParse(valid).success, true);
    assert.equal(visitWorkInputSchema.safeParse({ ...valid, checklist: { inspect: true } }).success, false);
    assert.equal(visitWorkInputSchema.safeParse({ ...valid, notes: 'x'.repeat(2001) }).success, false);
});
