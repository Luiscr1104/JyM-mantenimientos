import postgres from 'postgres';
import { loadEnvFile } from 'node:process';

try {
    loadEnvFile('.env.local');
} catch {
    // En otros entornos las variables ya están disponibles.
}

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const secret = process.env.CRON_SECRET;
const endpoint = process.env.REMINDER_CRON_URL ??
    'https://jym-mantenimientos.vercel.app/api/cron/reminders';
const jobName = 'jym-reminders';
const secretName = 'jym_reminders_cron_secret';
const activate = process.argv.includes('--activate');

if (!url || !secret || !/^[a-f0-9]{64}$/.test(secret)) {
    throw new Error('Faltan DIRECT_URL/DATABASE_URL o un CRON_SECRET de 64 caracteres hexadecimales.');
}
const target = new URL(endpoint);
if (target.protocol !== 'https:' || target.pathname !== '/api/cron/reminders' ||
    !['jym-mantenimientos.vercel.app', 'jymmantenimientos.com'].includes(target.hostname)) {
    throw new Error('La URL del recordatorio debe ser HTTPS y apuntar a la ruta de JyM.');
}

// La definición de pg_cron solo contiene el nombre del secreto: nunca el valor.
const command = `select net.http_get(
    url := '${target.href}',
    headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = '${secretName}')
    ),
    timeout_milliseconds := 25000
)`;

const sql = postgres(url, { ssl: 'require', prepare: false, max: 1 });

try {
    const installed = new Set((await sql`
        select extname from pg_extension where extname in ('pg_cron', 'pg_net')
    `).map((row) => row.extname));
    if (!installed.has('pg_cron')) {
        await sql`create extension pg_cron with schema pg_catalog`;
        await sql`grant usage on schema cron to postgres`;
        await sql`grant all privileges on all tables in schema cron to postgres`;
    }
    if (!installed.has('pg_net')) {
        const [schema] = await sql`select to_regnamespace('extensions') as namespace`;
        if (!schema.namespace) await sql`create schema extensions`;
        await sql`create extension pg_net with schema extensions`;
    }

    const stored = await sql`
        select decrypted_secret from vault.decrypted_secrets where name = ${secretName}
    `;
    if (stored.length > 1) throw new Error('El secreto de Vault tiene nombres duplicados.');
    if (stored.length && stored[0].decrypted_secret !== secret) {
        throw new Error('El secreto de Vault no coincide con .env.local. No se reemplazó.');
    }
    if (!stored.length) {
        await sql`
            select vault.create_secret(${secret}, ${secretName}, 'Token para el programador de avisos de JyM')
        `;
    }
    console.log('Vault: token de recordatorios almacenado y verificado (valor oculto).');

    const jobs = await sql`
        select jobid, schedule, command, active from cron.job where jobname = ${jobName}
    `;
    if (jobs.length > 1 || (jobs.length &&
        (jobs[0].command !== command || jobs[0].schedule !== '* * * * *'))) {
        throw new Error('Ya hay un trabajo con ese nombre y otra configuración. No se modificó.');
    }
    if (!jobs.length) {
        await sql.begin(async (tx) => {
            const [created] = await tx`
                select cron.schedule(${jobName}, '* * * * *', ${command}) as id
            `;
            await tx`select cron.alter_job(job_id := ${created.id}, active := false)`;
        });
        console.log('Supabase Cron: trabajo cada minuto creado INACTIVO hasta el despliegue.');
    } else {
        console.log(`Supabase Cron: trabajo existente ${jobs[0].active ? 'activo' : 'inactivo'}; sin cambios.`);
    }

    if (activate) {
        // No activamos el cron hasta que el endpoint desplegado autentique y funcione.
        const response = await fetch(endpoint, {
            headers: { Authorization: `Bearer ${secret}` },
            signal: AbortSignal.timeout(30_000),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || typeof data.sent !== 'number') {
            throw new Error(`El endpoint de producción todavía no está listo (HTTP ${response.status}).`);
        }
        const [job] = await sql`select jobid from cron.job where jobname = ${jobName}`;
        await sql`select cron.alter_job(job_id := ${job.jobid}, active := true)`;
        console.log('Supabase Cron: endpoint verificado y trabajo ACTIVADO.');
    }
} finally {
    await sql.end();
}
