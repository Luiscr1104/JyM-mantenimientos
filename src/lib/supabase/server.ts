import { createServerClient } from '@supabase/ssr';
import type { AstroCookies } from 'astro';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY } from 'astro:env/client';

export type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

interface CookiePair {
    name: string;
    value: string;
}

/**
 * Astro no expone el listado completo de cookies de entrada, así que lo
 * leemos del header. Supabase necesita `getAll` para manejar correctamente
 * los tokens largos que divide en varias cookies.
 */
function parseCookieHeader(header: string | null): CookiePair[] {
    if (!header) return [];

    return header.split(';').flatMap((part) => {
        const separator = part.indexOf('=');
        if (separator === -1) return [];

        const name = part.slice(0, separator).trim();
        const value = part.slice(separator + 1).trim();

        if (!name) return [];

        try {
            return [{ name, value: decodeURIComponent(value) }];
        } catch {
            return [{ name, value }];
        }
    });
}

/**
 * Cliente de Supabase para el servidor. Lee las cookies de la request y
 * reescribe las cookies renovadas en la response.
 */
export function createSupabaseServerClient(cookies: AstroCookies, request: Request) {
    return createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
        cookies: {
            getAll: () => parseCookieHeader(request.headers.get('cookie')),
            setAll: (items) => {
                for (const { name, value, options } of items) {
                    cookies.set(name, value, {
                        ...options,
                        path: '/',
                        secure: options.secure ?? import.meta.env.PROD,
                    });
                }
            },
        },
    });
}
