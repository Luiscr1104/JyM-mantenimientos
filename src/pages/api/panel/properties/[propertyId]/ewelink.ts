import type { APIRoute } from 'astro';
import { z } from 'zod';
import { listEwelinkDevices } from '@/server/ewelink';
import { EwelinkLinkError, linkEwelinkDevice } from '@/server/ewelink-links';

const returnTo = (propertyId: string, result: string) =>
    new Response(null, { status: 303, headers: {
        Location: `/panel/propiedades/${propertyId}/equipos?${result}`,
        'Cache-Control': 'no-store',
    } });

export const POST: APIRoute = async ({ locals, request, params }) => {
    if (locals.profile?.role !== 'owner' || !locals.user) {
        return new Response('No autorizado', { status: 403 });
    }
    const propertyId = z.uuid().safeParse(params.propertyId);
    if (!propertyId.success) return new Response('Propiedad inválida', { status: 400 });
    if (request.headers.get('origin') !== (process.env.NODE_ENV === 'production'
        ? 'https://jymmantenimientos.com' : new URL(request.url).origin)) {
        return new Response('Origen no autorizado', { status: 403 });
    }
    const form = await request.formData();
    const deviceId = form.get('deviceId');
    if (form.get('confirmation') !== 'ASIGNAR' || typeof deviceId !== 'string' ||
        deviceId.length < 1 || deviceId.length > 128) {
        return returnTo(propertyId.data, 'error=confirmation');
    }
    try {
        // No confiar en IDs ni metadatos del formulario: verificar contra la cuenta eWeLink.
        const inventory = await listEwelinkDevices();
        const device = inventory.devices.find((item) => item.id === deviceId);
        if (!device) return returnTo(propertyId.data, 'error=unavailable');
        await linkEwelinkDevice(propertyId.data, device, locals.user.id);
        return returnTo(propertyId.data, 'ok=linked');
    } catch (error) {
        if (error instanceof EwelinkLinkError) {
            return returnTo(propertyId.data, `error=${error.status === 409 ? 'assigned' : 'property'}`);
        }
        console.error('[ewelink.link]', error instanceof Error ? error.name : 'error');
        return returnTo(propertyId.data, 'error=service');
    }
};
