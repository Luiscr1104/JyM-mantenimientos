/// <reference types="astro/client" />

declare namespace App {
    interface Locals {
        supabase: import('./lib/supabase/server').SupabaseServerClient;
        user: import('@supabase/supabase-js').User | null;
        profile: { id: string; role: 'owner' | 'tech' } | null;
    }
}
