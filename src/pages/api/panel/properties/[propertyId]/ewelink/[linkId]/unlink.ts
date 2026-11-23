import type { APIRoute } from 'astro';
import { z } from 'zod';
import { EwelinkLinkError, unlinkEwelinkDevice } from '@/server/ewelink-links';

export const POST: APIRoute = async ({ locals, request, params }) => {
    if (locals.profile?.role !== 'owner' || !locals.user) {
        return new Response('No autorizado', { status: 403 });
    }
    const propertyId = z.uuid().safeParse(params.propertyId);
    const linkId = z.uuid().safeParse(params.linkId);
    if (!propertyId.success || !linkId.success) {
        return new Response('Equipo o propiedad inválidos', { status: 400 });
    }
    if (request.headers.get('origin') !== (process.env.NODE_ENV === 'production'
        ? 'https://jymmantenimientos.com' : new URL(request.url).origin)) {
        return new Response('Origen no autorizado', { status: 403 });
    }
    const back = (result: string) => new Response(null, { status: 303, headers: {
        Location: `/panel/propiedades/${propertyId.data}/equipos?${result}`,
        'Cache-Control': 'no-store',
    } });
    const form = await request.formData();
    if (form.get('confirmation') !== 'DESVINCULAR') return back('error=confirmation');
    try {
        await unlinkEwelinkDevice(propertyId.data, linkId.data, locals.user.id);
        return back('ok=unlinked');
    } catch (error) {
        if (error instanceof EwelinkLinkError) return back('error=missing');
        console.error('[ewelink.unlink]', error instanceof Error ? error.name : 'error');
        return back('error=service');
    }
};
