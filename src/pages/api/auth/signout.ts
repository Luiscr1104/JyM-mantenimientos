import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const POST: APIRoute = async ({ cookies, request }) => {
    const supabase = createSupabaseServerClient(cookies, request);
    await supabase.auth.signOut();

    return new Response(null, {
        status: 303,
        headers: { Location: '/panel/login' },
    });
};
