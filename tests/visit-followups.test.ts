import assert from 'node:assert/strict';
import { test } from 'node:test';
import { productInfo } from '../src/lib/products';
import { visitProductSchema, waterFillInputSchema } from '../src/lib/validation';
import { formatTime, formatVisitDuration } from '../src/lib/format';

const visitId = '8b23c32b-7708-40c5-b575-54cc5130e184';
const propertyId = 'f5016abe-abd3-4013-87fd-f699764160ff';

test('productos tienen unidades claras y cantidades con hasta dos decimales', () => {
    assert.equal(productInfo('granulated_chlorine').unit, 'g');
    assert.equal(productInfo('chlorine_tablet').unit, 'unidades');
    assert.equal(productInfo('caustic_base').unit, 'g');
    assert.equal(productInfo('liquid_flocculant').unit, 'ml');
    assert.equal(productInfo('granular_flocculant').unit, 'g');
    assert.equal(visitProductSchema.safeParse({ product: 'granulated_chlorine', quantity: 0.29 }).success, true);
    assert.equal(visitProductSchema.safeParse({ product: 'liquid_flocculant', quantity: 150 }).success, true);
    assert.equal(visitProductSchema.safeParse({ product: 'chlorine_tablet', quantity: 0 }).success, false);
    assert.equal(visitProductSchema.safeParse({ product: 'caustic_base', quantity: 0.123 }).success, false);
    assert.equal(visitProductSchema.safeParse({ product: 'otro', quantity: 1 }).success, false);
});

test('horas reales y duración usan la zona horaria de Costa Rica', () => {
    assert.equal(formatTime('2026-11-19T15:00:00.000Z'), '09:00 a. m.');
    assert.equal(formatVisitDuration('2026-11-19T15:00:00Z', '2026-11-19T16:25:00Z'), '1 h 25 min');
    assert.equal(formatVisitDuration(null, '2026-11-19T16:25:00Z'), null);
});

test('recordatorio acepta visita o propiedad y plazo de 1 a 720 minutos', () => {
    assert.equal(waterFillInputSchema.safeParse({ visitId, minutes: 30 }).success, true);
    assert.equal(waterFillInputSchema.safeParse({ propertyId, minutes: 90 }).success, true);
    assert.equal(waterFillInputSchema.safeParse({ visitId, propertyId, minutes: 30 }).success, false);
    assert.equal(waterFillInputSchema.safeParse({ minutes: 30 }).success, false);
    assert.equal(waterFillInputSchema.safeParse({ propertyId, minutes: 0 }).success, false);
    assert.equal(waterFillInputSchema.safeParse({ propertyId, minutes: 721 }).success, false);
});
