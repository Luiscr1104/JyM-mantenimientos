import type { APIRoute } from 'astro';
import { json, readJsonOrForm } from '@/lib/http';
import { firstError, leadInputSchema } from '@/lib/validation';
import { createLead } from '@/server/leads';

// Rate limit sencillo en memoria. En serverless es por instancia, pero frena
// el spam básico sin añadir infraestructura.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 5;
const hits = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const entry = hits.get(ip);

    if (!entry || entry.resetAt < now) {
        hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
        return false;
    }

    entry.count += 1;
    return entry.count > MAX_REQUESTS;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
    try {
        if (isRateLimited(clientAddress)) {
            return json({ error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' }, 429);
        }

        const body = await readJsonOrForm(request);
        const parsed = leadInputSchema.safeParse(body);

        if (!parsed.success) {
            return json({ error: firstError(parsed.error) }, 400);
        }

        // Honeypot: respondemos como si todo hubiera ido bien.
        if (parsed.data.website) {
            return json({ ok: true });
        }

        await createLead(parsed.data);
        return json({ ok: true });
    } catch (error) {
        console.error('[leads.create]', error);
        return json({ error: 'No se pudo enviar el mensaje. Intenta por WhatsApp.' }, 500);
    }
};
