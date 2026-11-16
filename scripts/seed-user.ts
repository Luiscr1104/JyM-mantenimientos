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

type Role = 'owner' | 'tech';

interface SeedOptions {
    email: string;
    fullName: string;
    role: Role;
    password: string;
}

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const databaseUrl = process.env.DATABASE_URL;
const appUrl = process.env.APP_URL ?? 'https://jym-mantenimientos.vercel.app';

function fail(message: string): never {
    console.error(message);
    process.exit(1);
}

if (!supabaseUrl || !secretKey || !databaseUrl) {
    fail(
        'Faltan variables: PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY y DATABASE_URL deben estar en .env.local.',
    );
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

function readFlag(name: string): string | undefined {
    const exact = `--${name}`;
    const index = process.argv.indexOf(exact);

    if (index === -1) return undefined;

    const value = process.argv[index + 1];
    if (!value || value.startsWith('--')) {
        fail(`Falta el valor para ${exact}.`);
    }

    return value;
}

function parseOptions(): SeedOptions {
    const rawEmail = readFlag('email') ?? process.env.USER_EMAIL;
    if (!rawEmail) {
        fail(
            'Uso: pnpm seed:user --email correo@dominio.com [--name "Nombre Apellido"] [--role owner|tech] [--password "..."]',
        );
    }

    const email = rawEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        fail(`Correo inválido: ${email}`);
    }

    const rawRole = (readFlag('role') ?? process.env.USER_ROLE ?? 'owner').trim().toLowerCase();
    if (rawRole !== 'owner' && rawRole !== 'tech') {
        fail('El rol debe ser "owner" o "tech".');
    }

    const fullName =
        (readFlag('name') ?? process.env.USER_NAME)?.trim() || email.split('@')[0] || 'Usuario';

    const password =
        (readFlag('password') ?? process.env.USER_PASSWORD)?.trim() || generatePassword();

    return { email, fullName, role: rawRole, password };
}

const options = parseOptions();

const admin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});

const { data: list, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
});

if (listError) {
    fail(`No se pudieron listar los usuarios: ${listError.message}`);
}

const existing = list.users.find((user) => user.email?.toLowerCase() === options.email);

let userId: string;

if (existing) {
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
        password: options.password,
        email_confirm: true,
        user_metadata: { full_name: options.fullName },
    });

    if (error || !data.user) {
        fail(`No se pudo actualizar el usuario: ${error?.message}`);
    }

    userId = data.user.id;
    console.log(`Usuario existente actualizado: ${options.email}`);
} else {
    const { data, error } = await admin.auth.admin.createUser({
        email: options.email,
        password: options.password,
        email_confirm: true,
        user_metadata: { full_name: options.fullName },
    });

    if (error || !data.user) {
        fail(`No se pudo crear el usuario: ${error?.message}`);
    }

    userId = data.user.id;
    console.log(`Usuario creado: ${options.email}`);
}

const sql = postgres(databaseUrl, { prepare: false, ssl: 'require', max: 1 });
const db = drizzle(sql);

await db
    .insert(profiles)
    .values({ id: userId, fullName: options.fullName, role: options.role })
    .onConflictDoUpdate({
        target: profiles.id,
        set: { fullName: options.fullName, role: options.role, updatedAt: new Date() },
    });

await sql.end();

console.log('\n──────────────────────────────────────────────');
console.log('  Acceso al panel');
console.log('──────────────────────────────────────────────');
console.log(`  URL:        ${appUrl}/panel/login`);
console.log(`  Correo:     ${options.email}`);
console.log(`  Contraseña: ${options.password}`);
console.log(`  Rol:        ${options.role}`);
console.log('──────────────────────────────────────────────');
console.log('Comparte la contraseña por un canal privado y pídele cambiarla en Ajustes.');
