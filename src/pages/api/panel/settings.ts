import type { APIRoute } from 'astro';
import { json, readJsonOrForm } from '@/lib/http';
import { firstError, settingsInputSchema } from '@/lib/validation';
import { saveSettings } from '@/server/settings';

const handler: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return json({ error: 'No autorizado' }, 401);

    const body = await readJsonOrForm(request);
    const parsed = settingsInputSchema.safeParse(body);

    if (!parsed.success) {
        return json({ error: firstError(parsed.error) }, 400);
    }

    try {
        const settings = await saveSettings(parsed.data);
        return json({ ok: true, settings });
    } catch (error) {
        console.error('[settings.save]', error);
        return json({ error: 'No se pudieron guardar los ajustes' }, 500);
    }
};

export const POST = handler;
export const PUT = handler;
