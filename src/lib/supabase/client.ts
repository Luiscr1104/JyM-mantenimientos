import { createBrowserClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY } from 'astro:env/client';

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

/** Cliente de Supabase para islas React en el navegador. */
export function createSupabaseBrowserClient() {
    browserClient ??= createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY);
    return browserClient;
}
