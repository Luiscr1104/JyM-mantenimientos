import { json } from './http';

// Solo peticiones del propio panel pueden consumir la cuota de Groq o confirmar escrituras.
export function checkAssistantOrigin(request: Request): Response | null {
    const origin = request.headers.get('origin');
    if (!origin || origin !== new URL(request.url).origin) {
        return json({ error: 'Origen no autorizado' }, 403);
    }
    return null;
}
