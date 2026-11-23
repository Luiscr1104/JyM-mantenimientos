import { randomBytes } from 'node:crypto';
import type { APIRoute } from 'astro';
import { EWELINK_APP_ID, EWELINK_APP_SECRET } from 'astro:env/server';
import { authorizationUrl } from '@/lib/ewelink-oauth';

export const POST: APIRoute = async ({ locals, cookies, request }) => {
    if (locals.profile?.role !== 'owner' || !locals.user) {
        return new Response('No autorizado', { status: 403 });
    }
    if (!EWELINK_APP_ID || !EWELINK_APP_SECRET) {
        return new Response(null, { status: 303, headers: { Location: '/panel/ewelink?error=config' } });
    }
    // Vercel puede entregar request.url con un host interno. Solo el Origin
    // del navegador confirma que la cookie regresará al dominio canónico.
    if (request.headers.get('origin') !== 'https://jymmantenimientos.com') {
        return new Response(null, { status: 303, headers: {
            Location: 'https://jymmantenimientos.com/panel/ewelink?error=domain',
        } });
    }
    const state = randomBytes(32).toString('hex');
    const nonce = randomBytes(6).toString('base64url').slice(0, 8);
    cookies.set('jym_ewelink_oauth', `${state}:${locals.user.id}`, {
        path: '/auth/ewelink/callback', httpOnly: true, secure: true,
        sameSite: 'lax', maxAge: 300,
    });
    return new Response(null, { status: 303, headers: {
        Location: authorizationUrl(EWELINK_APP_ID, EWELINK_APP_SECRET, state, String(Date.now()), nonce),
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
    } });
};
