import type { APIRoute } from 'astro';
import { passwordInputSchema } from '@/lib/validation';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
    if (!locals.user) return redirect('/panel/login', 303);

    const form = await request.formData();
    const parsed = passwordInputSchema.safeParse({
        password: String(form.get('password') ?? ''),
    });

    if (!parsed.success) {
        return redirect('/panel/ajustes?error=password', 303);
    }

    const { error } = await locals.supabase.auth.updateUser({ password: parsed.data.password });
    if (error) {
        console.error('[auth] updateUser password:', error.message);
        return redirect('/panel/ajustes?error=password', 303);
    }

    return redirect('/panel/ajustes?ok=password', 303);
};
