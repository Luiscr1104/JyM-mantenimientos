import { defineConfig } from 'drizzle-kit';
import { loadEnvFile } from 'node:process';

// Drizzle Kit corre fuera de Astro, así que cargamos el archivo local a mano.
try {
    loadEnvFile('.env.local');
} catch {
    // En CI/Vercel las variables ya están en process.env.
}

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!url) {
    throw new Error('Falta DIRECT_URL o DATABASE_URL para ejecutar Drizzle Kit.');
}

// El pooler de Supabase exige SSL.
const withSsl = url.includes('sslmode=') ? url : `${url}${url.includes('?') ? '&' : '?'}sslmode=require`;

export default defineConfig({
    schema: './src/db/schema.ts',
    out: './drizzle',
    dialect: 'postgresql',
    dbCredentials: {
        url: withSsl,
    },
    verbose: true,
    strict: true,
});
