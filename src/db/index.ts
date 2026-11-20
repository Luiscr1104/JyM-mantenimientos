import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { DATABASE_URL, DIRECT_URL } from 'astro:env/server';
import * as schema from './schema';

type Db = ReturnType<typeof createDb>;

const globalForDb = globalThis as unknown as { __jymDb?: Db };

function createDb() {
    // El pool de transacciones (6543) puede cancelar consultas simples con 57014.
    // El pool de sesión (5432) está configurado como DIRECT_URL en producción.
    const connectionUrl = DIRECT_URL || DATABASE_URL;
    if (!connectionUrl) {
        throw new Error('No hay conexión a la base de datos configurada.');
    }

    const client = postgres(connectionUrl, {
        // Compatible también con el transaction pooler si falta DIRECT_URL.
        prepare: false,
        ssl: 'require',
        // Cada función de Vercel crea su propio pool; evitar agotar el pooler
        // de Supabase cuando se preparan varias visitas a la vez.
        max: 1,
        connect_timeout: 10,
        idle_timeout: 20,
    });

    return drizzle(client, { schema });
}

export const db = globalForDb.__jymDb ?? createDb();

if (process.env.NODE_ENV !== 'production') {
    globalForDb.__jymDb = db;
}

export * from './schema';
