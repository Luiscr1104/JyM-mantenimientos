import type { APIRoute } from 'astro';
import { z } from 'zod';
import { checkAssistantOrigin } from '@/lib/assistant-request';
import { json } from '@/lib/http';
import { AssistantError, prepareVoiceRequest } from '@/server/voice-assistant';

const input = z.object({
    text: z.string().trim().min(3).max(400),
    contextToken: z.string().max(4_000).optional(),
});

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return json({ error: 'No autorizado' }, 401);
    const denied = checkAssistantOrigin(request);
    if (denied) return denied;
    if (Number(request.headers.get('content-length') ?? 0) > 5_000) {
        return json({ error: 'La frase es demasiado larga.' }, 413);
    }
    const parsed = input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Di una frase breve para el asistente.' }, 400);
    try {
        return json(await prepareVoiceRequest(parsed.data.text, locals.user.id, parsed.data.contextToken));
    } catch (error) {
        if (error instanceof AssistantError) return json({ error: error.message }, error.status);
        console.error('[assistant.interpret]', error);
        return json({ error: 'No se pudo consultar el asistente.' }, 500);
    }
};
