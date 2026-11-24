import type { APIRoute } from 'astro';
import { checkAssistantOrigin } from '@/lib/assistant-request';
import { json } from '@/lib/http';
import { AssistantError, transcribeAudio } from '@/server/voice-assistant';

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user) return json({ error: 'No autorizado' }, 401);
    const denied = checkAssistantOrigin(request);
    if (denied) return denied;
    if (!request.headers.get('content-type')?.startsWith('multipart/form-data') ||
        Number(request.headers.get('content-length') ?? 0) > 2_100_000) {
        return json({ error: 'Envía una grabación de hasta 2 MB.' }, 413);
    }
    try {
        const form = await request.formData();
        const file = form.get('audio');
        if (!(file instanceof File)) return json({ error: 'Falta la grabación.' }, 400);
        return json({ text: await transcribeAudio(file) });
    } catch (error) {
        if (error instanceof AssistantError) return json({ error: error.message }, error.status);
        console.error('[assistant.transcribe]', error);
        return json({ error: 'No se pudo transcribir la grabación.' }, 500);
    }
};
