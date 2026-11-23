import type { APIRoute } from 'astro';
import { ewelinkRegion } from '@/lib/ewelink-oauth';
import { connectEwelink, safeStateEquals } from '@/server/ewelink';

const back = (result: string) =>
    new Response(null, { status: 303, headers: {
        Location: `/panel/ewelink?${result}`,
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
    } });

export const GET: APIRoute = async ({ locals, cookies, url }) => {
    const cookie = cookies.get('jym_ewelink_oauth')?.value;
    cookies.delete('jym_ewelink_oauth', { path: '/auth/ewelink/callback' });
    if (!locals.user || locals.profile?.role !== 'owner') return back('error=session');
    const [expectedState, userId] = cookie?.split(':') ?? [];
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    const region = ewelinkRegion(url.searchParams.get('region'));
    if (!expectedState || !state || !safeStateEquals(expectedState, state) || userId !== locals.user.id ||
        !region || !code || code.length > 512) {
        return back('error=authorization');
    }
    try {
        await connectEwelink(code, region);
        return back('ok=connected');
    } catch (error) {
        // Jamás registrar código, tokens ni respuesta cruda de OAuth.
        console.error('[ewelink.oauth]', error instanceof Error ? error.name : 'error');
        return back('error=exchange');
    }
};
