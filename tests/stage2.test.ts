import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, isValidDate, matchesPreferredDay } from '../src/lib/dates';
import { estimateRoute, haversineMeters, googleMapsRouteUrl } from '../src/lib/geo';
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

test('la distancia estimada y el enlace terminan en la última visita', () => {
    const base = { lat: 10.4709, lng: -84.6453 };
    const stop = { lat: 10.5, lng: -84.7 };
    const expected = Math.round(haversineMeters(base, stop) * 1.35);
    assert.equal(estimateRoute(base, [stop]).distanceMeters, expected);
    const url = googleMapsRouteUrl(base, [stop]);
    assert.equal(new URL(url!).searchParams.get('destination'), '10.5,-84.7');
    assert.equal(new URL(url!).searchParams.has('waypoints'), false);
    const second = { lat: 10.52, lng: -84.71 };
    const multi = googleMapsRouteUrl(base, [stop, second])!;
    assert.equal(new URL(multi).searchParams.get('destination'), '10.52,-84.71');
    assert.equal(new URL(multi).searchParams.get('waypoints'), '10.5,-84.7');
    assert.deepEqual(estimateRoute(base, [stop, second]).order, [0, 1]);
    assert.deepEqual(estimateRoute(second, [stop, base]).order, [0, 1]);
    assert.equal(googleMapsRouteUrl(base, Array(11).fill(stop)), null);
});
