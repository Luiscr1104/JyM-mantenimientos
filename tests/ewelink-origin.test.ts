import assert from 'node:assert/strict';
import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { test } from 'node:test';
import { NodeApp } from 'astro/app/node';
import config from '../astro.config.mjs';

// Usar la protección real de la versión instalada de Astro, no una copia.
const { createOriginCheckMiddleware } = await import(
    new URL('./middlewares.js', import.meta.resolve('astro/app')).href
);
const checkOrigin = createOriginCheckMiddleware();
const canonical = 'https://jymmantenimientos.com';

function forwardedRequest(origin: string, forwardedHost = 'jymmantenimientos.com') {
    const incoming = new IncomingMessage(new Socket());
    incoming.method = 'POST';
    incoming.url = '/api/panel/ewelink/connect';
    incoming.headers = {
        host: 'internal.vercel.app',
        'x-forwarded-host': forwardedHost,
        'x-forwarded-proto': 'https',
        'x-forwarded-port': '443',
        origin,
        'content-type': 'application/x-www-form-urlencoded',
    };
    return NodeApp.createRequest(incoming, {
        skipBody: true,
        allowedDomains: config.security!.allowedDomains,
    });
}

async function submit(request: Request) {
    return checkOrigin(
        { request, url: new URL(request.url), isPrerendered: false },
        () => new Response('Formulario autorizado', { status: 200 }),
    );
}

test('el POST de eWeLink conserva el origen público detrás de Vercel', async () => {
    assert.equal(config.security!.checkOrigin, true);
    const request = forwardedRequest(canonical);
    assert.equal(new URL(request.url).origin, canonical);
    assert.equal((await submit(request)).status, 200);
});

test('Astro sigue bloqueando formularios de otro sitio y orígenes ausentes', async () => {
    assert.equal((await submit(forwardedRequest('https://attacker.example'))).status, 403);
    assert.equal((await submit(forwardedRequest('null'))).status, 403);
    const missingOrigin = forwardedRequest(canonical);
    missingOrigin.headers.delete('origin');
    assert.equal((await submit(missingOrigin)).status, 403);
});

test('no se confía en dominios reenviados arbitrarios ni subdominios parecidos', async () => {
    for (const host of ['attacker.example', 'jymmantenimientos.com.attacker.example',
        'evil.jymmantenimientos.com']) {
        const request = forwardedRequest(`https://${host}`, host);
        assert.notEqual(new URL(request.url).hostname, host);
        assert.equal((await submit(request)).status, 403);
    }
});
