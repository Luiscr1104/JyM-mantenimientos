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
