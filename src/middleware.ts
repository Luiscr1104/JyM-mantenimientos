import { defineMiddleware } from 'astro:middleware';
import { eq } from 'drizzle-orm';
import { db, profiles } from '@/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const PROTECTED_PREFIXES = ['/panel', '/api/panel'];
const AUTH_PREFIXES = ['/auth', '/api/auth'];

function matches(pathname: string, prefixes: string[]) {
    return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export const onRequest = defineMiddleware(async (context, next) => {
    const { pathname } = context.url;
    const isLoginPage = pathname === '/panel/login';
    const isProtected = matches(pathname, PROTECTED_PREFIXES) && !isLoginPage;
    const isAuthRoute = matches(pathname, AUTH_PREFIXES) || isLoginPage;

    // La landing y el blog no pagan la latencia de una llamada a Supabase.
    if (!isProtected && !isAuthRoute) {
        return next();
    }

    const supabase = createSupabaseServerClient(context.cookies, context.request);

    // getUser() valida el token contra el servidor de Auth y refresca la sesión.
    // No metas lógica entre esta llamada y el setAll de cookies.
    const {
        data: { user },
    } = await supabase.auth.getUser();

    // Solo los usuarios con perfil en la tabla `profiles` tienen acceso.
    let profile: { id: string; role: 'owner' | 'tech' } | null = null;

    if (user) {
        const [row] = await db
            .select({ id: profiles.id, role: profiles.role })
            .from(profiles)
            .where(eq(profiles.id, user.id))
            .limit(1);

        profile = row ?? null;
    }

    context.locals.supabase = supabase;
    context.locals.user = user;
    context.locals.profile = profile;

    const hasAccess = Boolean(user && profile);

    if (isProtected && !hasAccess) {
        if (pathname.startsWith('/api/')) {
            return new Response(JSON.stringify({ error: 'No autorizado' }), {
                status: 401,
                headers: { 'content-type': 'application/json; charset=utf-8' },
            });
        }

        if (!user) {
            const nextUrl = `${pathname}${context.url.search}`;
            return context.redirect(`/panel/login?next=${encodeURIComponent(nextUrl)}`);
        }

        return context.redirect('/panel/login?error=no-access');
    }

    if (isLoginPage) {
        if (hasAccess) {
            return context.redirect('/panel');
        }

        // Usuario autenticado pero sin perfil: cerramos la sesión para evitar bucles.
        if (user && !profile) {
            await supabase.auth.signOut();
            context.locals.user = null;
        }
    }

    return next();
});
