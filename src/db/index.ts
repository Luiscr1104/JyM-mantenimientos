import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { DATABASE_URL } from 'astro:env/server';
import * as schema from './schema';

type Db = ReturnType<typeof createDb>;

const globalForDb = globalThis as unknown as { __jymDb?: Db };

function createDb() {
    if (!DATABASE_URL) {
        throw new Error('DATABASE_URL no está configurada. Revisa .env.local o las variables de Vercel.');
    }

    const client = postgres(DATABASE_URL, {
        // Necesario con el transaction pooler de Supabase (puerto 6543).
        prepare: false,
        ssl: 'require',
        max: 5,
        idle_timeout: 20,
    });

    return drizzle(client, { schema });
}

export const db = globalForDb.__jymDb ?? createDb();

if (process.env.NODE_ENV !== 'production') {
    globalForDb.__jymDb = db;
}

export * from './schema';
