import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('los mapas Leaflet quedan dentro de una capa inferior al menú móvil', () => {
    const picker = readFileSync('src/components/panel/MapPicker.tsx', 'utf8');
    const route = readFileSync('src/components/panel/RouteMap.tsx', 'utf8');
    const layout = readFileSync('src/layouts/PanelLayout.astro', 'utf8');

    assert.match(picker, /className="relative isolate z-0"/);
    assert.match(route, /className="relative isolate z-0[^"]*"/);
    assert.match(layout, /class="fixed inset-x-0 bottom-0 z-30/);
    assert.match(picker, /<MapContainer/);
    assert.match(route, /<MapContainer/);
});
