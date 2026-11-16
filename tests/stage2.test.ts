import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, isValidDate, matchesPreferredDay } from '../src/lib/dates';
import { haversineMeters, googleMapsRouteUrl } from '../src/lib/geo';
import { dateStringSchema, servicePlanInputSchema } from '../src/lib/validation';

test('fechas civiles y validación de fechas imposibles', () => {
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(isValidDate('2026-02-30'), false);
    assert.equal(isValidDate('2028-02-29'), true);
    assert.equal(dateStringSchema.safeParse('2026-02-30').success, false);
});

test('la frecuencia respeta los días seleccionados y el cero', () => {
    assert.equal(matchesPreferredDay(['lunes', 'jueves'], '2026-11-16', 2), true);
    assert.equal(matchesPreferredDay(['lunes', 'jueves'], '2026-11-17', 2), false);
    assert.equal(matchesPreferredDay(['lunes'], '2026-11-16', 0), false);
    // Plan anterior con más días de los contratados.
    assert.equal(matchesPreferredDay(['lunes', 'viernes'], '2026-11-20', 1), false);
});

test('no se aceptan frecuencias incompatibles o repetidas', () => {
    const input = { active: true, visitsPerWeek: 1, preferredDays: ['lunes', 'viernes'] };
    assert.equal(servicePlanInputSchema.safeParse(input).success, false);
    assert.equal(servicePlanInputSchema.safeParse({ ...input, preferredDays: ['lunes', 'lunes'] }).success, false);
    assert.equal(servicePlanInputSchema.safeParse({ ...input, visitsPerWeek: 8, preferredDays: [] }).success, false);
    assert.equal(servicePlanInputSchema.safeParse({ ...input, visitsPerWeek: 2 }).success, true);
});

test('la distancia estimada y el enlace completo incluyen la base de regreso', () => {
    const base = { lat: 10.4709, lng: -84.6453 };
    const stop = { lat: 10.5, lng: -84.7 };
    assert.ok(haversineMeters(base, stop) > 0);
    const url = googleMapsRouteUrl(base, [stop]);
    assert.ok(url?.includes('destination=10.4709%2C-84.6453'));
});
