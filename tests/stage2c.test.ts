import assert from 'node:assert/strict';
import { test } from 'node:test';
import { visitInputSchema, visitWorkInputSchema } from '../src/lib/validation';
import {
    EXIT_STEPS,
    EXTRA_TASKS,
    TASKS,
    emptyChecklist,
    getCompletionIssue,
    normalizeChecklist,
    tasksForTypes,
} from '../src/lib/visit-work';

test('el checklist inicia vacío y normaliza registros antiguos', () => {
    const empty = emptyChecklist();
    assert.equal(Object.keys(empty).length, TASKS.length + EXTRA_TASKS.length + EXIT_STEPS.length);
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
    const valid = { workTypes: ['routine'], checklist: emptyChecklist(), notes: 'Todo bien', pendingReason: '' };
    assert.equal(visitWorkInputSchema.safeParse(valid).success, true);
    assert.equal(visitWorkInputSchema.safeParse({ ...valid, checklist: { inspect: true } }).success, false);
    assert.equal(visitWorkInputSchema.safeParse({ ...valid, notes: 'x'.repeat(2001) }).success, false);
    assert.equal(visitWorkInputSchema.safeParse({ ...valid, workTypes: [] }).success, false);
    assert.equal(visitWorkInputSchema.safeParse({ ...valid, workTypes: ['routine', 'routine'] }).success, false);
    assert.equal(visitWorkInputSchema.safeParse({ ...valid, workTypes: ['unknown'] }).success, false);
});

test('trabajos especiales no exigen el checklist habitual, pero sí una salida segura', () => {
    const checklist = emptyChecklist();
    assert.equal(tasksForTypes(['flocculation']).length, 2);
    for (const { key } of EXIT_STEPS) checklist[key] = true;
    assert.match(getCompletionIssue(checklist, '', false, ['flocculation']) ?? '', /pendientes/);
    for (const { key } of tasksForTypes(['flocculation'])) checklist[key] = true;
    assert.equal(getCompletionIssue(checklist, '', false, ['flocculation']), null);
    assert.match(getCompletionIssue(checklist, '', true, ['flocculation']) ?? '', /bomba/);
});

test('una visita nueva es habitual por defecto o acepta otro trabajo previsto', () => {
    const input = { propertyId: 'f5016abe-abd3-4013-87fd-f699764160ff', scheduledFor: '2026-11-20' };
    assert.equal(visitInputSchema.parse(input).workType, 'routine');
    assert.equal(visitInputSchema.parse({ ...input, workType: 'flocculation' }).workType, 'flocculation');
    assert.equal(visitInputSchema.safeParse({ ...input, workType: 'flocculation_follow_up' }).success, false);
    assert.equal(visitInputSchema.safeParse({ ...input, workType: 'desconocido' }).success, false);
});
