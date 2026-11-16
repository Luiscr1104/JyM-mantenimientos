export function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8' },
    });
}

export function isJsonRequest(request: Request): boolean {
    return (request.headers.get('content-type') ?? '').includes('application/json');
}

export async function readJsonOrForm(request: Request): Promise<Record<string, unknown>> {
    if (isJsonRequest(request)) {
        try {
            const data = await request.json();
            return typeof data === 'object' && data !== null
                ? (data as Record<string, unknown>)
                : {};
        } catch {
            return {};
        }
    }

    const form = await request.formData();
    return Object.fromEntries(form.entries());
}

/** Redirige al referer si es del mismo origen; si no, al fallback. */
export function redirectBack(request: Request, fallback: string): Response {
    const referer = request.headers.get('referer');

    if (referer) {
        try {
            const target = new URL(referer);
            const current = new URL(request.url);

            if (target.origin === current.origin) {
                return new Response(null, {
                    status: 303,
                    headers: { Location: `${target.pathname}${target.search}` },
                });
            }
        } catch {
            // Referer inválido: usamos el fallback.
        }
    }

    return new Response(null, { status: 303, headers: { Location: fallback } });
}
