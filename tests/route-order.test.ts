import assert from 'node:assert/strict';
import { test } from 'node:test';
import { movePendingVisit, orderPendingVisits } from '../src/lib/route-order';

const visits = ['a', 'b', 'c', 'd'].map((id) => ({ visit: { id } }));
const ids = (rows: typeof visits) => rows.map(({ visit }) => visit.id);

test('el plan define el orden inicial y las visitas nuevas se agregan al final', () => {
    const ordered = orderPendingVisits(visits, [
        { visitId: 'c' }, { visitId: 'a' }, { visitId: 'deleted' }, { visitId: 'c' },
    ]);
    assert.deepEqual(ids(ordered), ['c', 'a', 'b', 'd']);
    assert.deepEqual(ids(visits), ['a', 'b', 'c', 'd']);
});

test('bajar una parada solo intercambia su posición con la siguiente', () => {
    const ordered = orderPendingVisits(visits, [{ visitId: 'c' }, { visitId: 'a' }]);
    assert.deepEqual(ids(movePendingVisit(ordered, 'c', 'down')!), ['a', 'c', 'b', 'd']);
    assert.deepEqual(ids(ordered), ['c', 'a', 'b', 'd']);
});

test('una parada se puede enviar al final y seguir reordenando', () => {
    const first = movePendingVisit(visits, 'a', 'end')!;
    assert.deepEqual(ids(first), ['b', 'c', 'd', 'a']);
    assert.deepEqual(ids(movePendingVisit(first, 'b', 'down')!), ['c', 'b', 'd', 'a']);
});

test('no se puede mover una visita inexistente ni la última', () => {
    assert.equal(movePendingVisit(visits, 'missing', 'down'), null);
    assert.equal(movePendingVisit(visits, 'd', 'end'), null);
    assert.deepEqual(ids(visits), ['a', 'b', 'c', 'd']);
});
