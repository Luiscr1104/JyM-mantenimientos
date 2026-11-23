import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
    authorizationUrl, decryptEwelinkTokens, encryptEwelinkTokens, ewelinkRegion, ewelinkSignature,
    EWELINK_CALLBACK,
} from '../src/lib/ewelink-oauth';
import { safeDevice, safeTelemetry } from '../src/lib/ewelink-device';

test('OAuth eWeLink usa la firma oficial y el callback exacto', () => {
    assert.equal(ewelinkSignature('abc', 'ABC_123'),
        'v1+mfNY2ukxswM8sZOTg99srZsVnUVv9DGXeav1096M=');
    const url = new URL(authorizationUrl('ABC', 'abc', 'random-state', '123', 'Ab12Cd34'));
    assert.equal(url.origin, 'https://c2ccdn.coolkit.cc');
    assert.equal(url.searchParams.get('authorization'), ewelinkSignature('abc', 'ABC_123'));
    assert.equal(url.searchParams.get('redirectUrl'), EWELINK_CALLBACK);
    assert.equal(url.searchParams.get('state'), 'random-state');
    assert.equal(ewelinkRegion('us'), 'us');
    assert.equal(ewelinkRegion('malicious.example'), null);
});

test('los tokens quedan cifrados y autenticados; no se guardan en claro', () => {
    const credentials = { accessToken: 'token-privado', refreshToken: 'renovacion-privada' };
    const encrypted = encryptEwelinkTokens(credentials, 'app-secret');
    assert.doesNotMatch(encrypted, /token-privado|renovacion-privada/);
    assert.deepEqual(decryptEwelinkTokens(encrypted, 'app-secret'), credentials);
    assert.throws(() => decryptEwelinkTokens(encrypted, 'clave-equivocada'));
});

test('el POW Elite expone solo campos eléctricos y canales, nunca claves del equipo', () => {
    const params = {
        switches: [{ outlet: 0, switch: 'on', apikey: 'no-enviar' }],
        power: '800.00', dayKwh: 123, monthKwh: 250,
        getHoursKwh: { large: 'data' }, apikey: 'secreto',
    };
    const safe = safeTelemetry(params);
    assert.deepEqual(safe, {
        power: '800.00', dayKwh: 123, monthKwh: 250,
        getHoursKwh: 'Disponible (estructura no mostrada)', switches: '0: on',
    });
    assert.equal(safeDevice({
        itemType: 1, itemData: { deviceid: 'example', productModel: 'POWR316D',
            extra: { uiid: 190 }, params },
    })?.uiid, 190);
    assert.equal(safeDevice({ itemType: 3, itemData: { deviceid: 'group' } }), null);
});

test('el diagnóstico nunca envía comandos al Sonoff y solo es accesible al dueño', () => {
    const sender = readFileSync('src/server/ewelink.ts', 'utf8');
    assert.match(sender, /'\/v2\/device\/thing\?lang=en&num=30', 'GET'/);
    assert.match(sender, /'GET', `Bearer \$\{token\}`/);
    assert.doesNotMatch(sender, /\/v2\/device\/thing\/status', 'POST'/);
    const page = readFileSync('src/pages/panel/ewelink.astro', 'utf8');
    assert.match(page, /profile\?\.role !== 'owner'/);
    const callback = readFileSync('src/pages/auth/ewelink/callback.ts', 'utf8');
    assert.match(callback, /safeStateEquals/);
});

test('el piloto de Casa Mariposa usa ID persistido y solo lectura bajo demanda', () => {
    const pilot = readFileSync('src/server/ewelink-pilot.ts', 'utf8');
    assert.match(pilot, /mapping\.propertyId !== propertyId/);
    assert.match(pilot, /readEwelinkDeviceStatus\(mapping\.deviceId\)/);
    assert.doesNotMatch(pilot, /fetch\(|POST|switch.*(?:on|off)/i);
    const reading = readFileSync('src/pages/panel/propiedades/[id]/energia.astro', 'utf8');
    assert.match(reading, /profile\?\.role !== 'owner'/);
    assert.match(reading, /private, no-store/);
    assert.match(reading, /readEwelinkPilotForProperty\(data\.property\.id\)/);
    const visit = readFileSync('src/pages/panel/visitas/[id].astro', 'utf8');
    assert.match(visit, /getEwelinkPilotForProperty/);
    assert.doesNotMatch(visit, /readEwelinkDeviceStatus/);
});
