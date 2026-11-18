import type { APIRoute } from 'astro';
import { z } from 'zod';
import { json } from '@/lib/http';
import { firstError, visitProductSchema } from '@/lib/validation';
import { addVisitProduct, listVisitProducts, ProductError, removeVisitProduct } from '@/server/visit-products';

export const POST: APIRoute = async ({ params, request, locals }) => {
    if (!locals.user) return json({ error: 'No autorizado' }, 401);
    const id = z.uuid().safeParse(params.id);
    if (!id.success) return json({ error: 'Visita inválida' }, 400);

    let body: unknown;
    try { body = await request.json(); } catch { return json({ error: 'Datos inválidos' }, 400); }
    const data = z.discriminatedUnion('action', [
        visitProductSchema.extend({ action: z.literal('add') }),
        z.object({ action: z.literal('delete'), productId: z.uuid() }),
    ]).safeParse(body);
    if (!data.success) return json({ error: firstError(data.error) }, 400);

    try {
        if (data.data.action === 'add') {
            await addVisitProduct(id.data, data.data);
        } else {
            await removeVisitProduct(id.data, data.data.productId);
        }
        return json({ ok: true, products: await listVisitProducts(id.data) });
    } catch (error) {
        if (error instanceof ProductError) return json({ error: error.message }, error.status);
        console.error('[visit.products]', error);
        return json({ error: 'No se pudo guardar el producto' }, 500);
    }
};
