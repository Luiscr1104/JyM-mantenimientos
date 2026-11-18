import assert from 'node:assert/strict';
import { test } from 'node:test';
import { propertyDeletionIssue, type PropertyDeletionFacts } from '../src/lib/property-deletion';

const scheduled = {
    status: 'scheduled' as const,
    startedAt: null, completedAt: null, pumpStartedAt: null, pumpStoppedAt: null,
    checklist: null, notes: null, pendingReason: null,
};
const empty: PropertyDeletionFacts = {
    visits: [], hasProducts: false, hasWaterTask: false, hasOpenWaterTask: false,
};

test('se puede borrar solo la propiedad sin actividad real', () => {
    assert.equal(propertyDeletionIssue(empty), null);
    assert.equal(propertyDeletionIssue({ ...empty, visits: [scheduled] }), null);
});

test('se bloquea si hay una llave abierta o historial de llenado cerrado', () => {
    assert.match(propertyDeletionIssue({ ...empty, hasWaterTask: true, hasOpenWaterTask: true }) ?? '', /llave pendiente/);
    assert.match(propertyDeletionIssue({ ...empty, hasWaterTask: true }) ?? '', /historial/);
});

test('se bloquea si una visita tuvo trabajo, notas o productos', () => {
    assert.match(propertyDeletionIssue({ ...empty, hasProducts: true }) ?? '', /historial/);
    assert.match(propertyDeletionIssue({ ...empty, visits: [{ ...scheduled, status: 'completed' }] }) ?? '', /historial/);
    assert.match(propertyDeletionIssue({ ...empty, visits: [{ ...scheduled, status: 'skipped' }] }) ?? '', /historial/);
    assert.match(propertyDeletionIssue({ ...empty, visits: [{ ...scheduled, notes: 'Se revisó la bomba' }] }) ?? '', /historial/);
    assert.match(propertyDeletionIssue({ ...empty, visits: [{ ...scheduled, pumpStartedAt: new Date() }] }) ?? '', /historial/);
});
