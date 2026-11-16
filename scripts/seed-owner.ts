import { createClient } from '@supabase/supabase-js';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { randomInt } from 'node:crypto';
import { profiles } from '../src/db/schema';

try {
    process.loadEnvFile('.env.local');
} catch {
    // En CI/Vercel las variables ya están en process.env.
}

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const databaseUrl = process.env.DATABASE_URL;

const email = (process.env.OWNER_EMAIL ?? 'luiscr1104@gmail.com').trim().toLowerCase();
const fullName = process.env.OWNER_NAME ?? 'Luis';

if (!supabaseUrl || !secretKey || !databaseUrl) {
    console.error(
        'Faltan variables: PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY y DATABASE_URL deben estar en .env.local.',
    );
    process.exit(1);
}

function generatePassword(length = 20): string {
    // Sin caracteres ambiguos (0/O, 1/l/I) para poder teclearla si hace falta.
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let result = '';
    for (let index = 0; index < length; index += 1) {
        result += alphabet[randomInt(alphabet.length)];
    }
    return result;
}

const password = process.env.OWNER_PASSWORD?.trim() || generatePassword();

const admin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});

const { data: list, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
});

if (listError) {
    console.error('No se pudieron listar los usuarios:', listError.message);
    process.exit(1);
}

const existing = list.users.find((user) => user.email?.toLowerCase() === email);

let userId: string;

if (existing) {
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
    });

    if (error || !data.user) {
        console.error('No se pudo actualizar el usuario:', error?.message);
        process.exit(1);
    }

    userId = data.user.id;
    console.log(`Usuario existente actualizado: ${email}`);
} else {
    const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
    });

    if (error || !data.user) {
        console.error('No se pudo crear el usuario:', error?.message);
        process.exit(1);
    }

    userId = data.user.id;
    console.log(`Usuario creado: ${email}`);
}

const sql = postgres(databaseUrl, { prepare: false, ssl: 'require', max: 1 });
const db = drizzle(sql);

await db
    .insert(profiles)
    .values({ id: userId, fullName, role: 'owner' })
    .onConflictDoUpdate({
        target: profiles.id,
        set: { fullName, role: 'owner', updatedAt: new Date() },
    });

await sql.end();

console.log('\n──────────────────────────────────────────────');
console.log('  Acceso al panel');
console.log('──────────────────────────────────────────────');
console.log(`  URL:        /panel/login`);
console.log(`  Correo:     ${email}`);
console.log(`  Contraseña: ${password}`);
console.log('──────────────────────────────────────────────');
console.log('Guarda la contraseña en tu gestor. No se vuelve a mostrar.');
