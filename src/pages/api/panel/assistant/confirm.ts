import type { APIRoute } from 'astro';
import { z } from 'zod';
import { checkAssistantOrigin } from '@/lib/assistant-request';
import { json } from '@/lib/http';
import { AssistantError, confirmVoiceVisit } from '@/server/voice-assistant';

const input = z.object({ token: z.string().max(1500), confirmation: z.string().trim().min(3).max(80) });

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return json({ error: 'No autorizado' }, 401);
    const denied = checkAssistantOrigin(request);
    if (denied) return denied;
    if (Number(request.headers.get('content-length') ?? 0) > 2_000) {
        return json({ error: 'Confirmación inválida.' }, 413);
    }
    const parsed = input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Confirmación inválida.' }, 400);
    try {
        return json(await confirmVoiceVisit(parsed.data.token, locals.user.id, parsed.data.confirmation));
    } catch (error) {
        if (error instanceof AssistantError) return json({ error: error.message }, error.status);
        console.error('[assistant.confirm]', error);
        return json({ error: 'No se pudo crear la visita.' }, 500);
    }
};
