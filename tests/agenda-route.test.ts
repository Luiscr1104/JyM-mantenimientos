import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const agenda = readFileSync('src/pages/panel/agenda.astro', 'utf8');
const route = readFileSync('src/pages/panel/ruta.astro', 'utf8');
const create = readFileSync('src/pages/api/panel/visits/index.ts', 'utf8');
const actions = readFileSync('src/pages/api/panel/visits/[id].ts', 'utf8');
const visits = readFileSync('src/server/visits.ts', 'utf8');
const dateNav = readFileSync('src/components/panel/DateNav.astro', 'utf8');

test('Agenda concentra altas y bajas; Ruta enlaza a la misma fecha sin formulario duplicado', () => {
    assert.match(agenda, /action="\/api\/panel\/visits"/);
    assert.match(agenda, /name="scheduledFor" value=\{date\}/);
    assert.match(agenda, /Quitar visita/);
    assert.match(agenda, /id="visitas-del-dia"/);
    assert.match(route, /\/panel\/agenda\?date=\$\{date\}&from=route#gestionar-visitas/);
    assert.doesNotMatch(route, /action="\/api\/panel\/visits"/);
});

test('la visita con historial no puede borrarse aunque se intente enviar el formulario', () => {
    assert.match(agenda, /row\.visit\.status === 'scheduled' && !row\.visit\.checklist/);
    assert.match(visits, /if \(event \|\| current\.status !== 'scheduled'/);
    assert.match(agenda, /Omitir \(conservar registro\)/);
});

test('las acciones conservan el día y regresan a Ruta cuando se llegó desde allí', () => {
    assert.match(agenda, /fromRoute && <input type="hidden" name="returnTo" value="route"/);
    assert.match(create, /body\.returnTo === 'route' \? 'ruta' : 'agenda'/);
    assert.match(actions, /body\.returnTo === 'route' \? 'ruta' : 'agenda'/);
    assert.match(actions, /dateStringSchema\.safeParse\(body\.date\)/);
    assert.match(dateNav, /fromRoute \? '&from=route' : ''/);
});
