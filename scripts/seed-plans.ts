import { count } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { properties, servicePlans } from '../src/db/schema';

try {
    process.loadEnvFile('.env.local');
} catch {
    // En CI/Vercel las variables ya están en process.env.
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    console.error('Falta DATABASE_URL en .env.local.');
    process.exit(1);
}

const sql = postgres(databaseUrl, { prepare: false, ssl: 'require', max: 1 });
const db = drizzle(sql);

const schedules = [
    { visitsPerWeek: 2, preferredDays: ['lunes', 'jueves'] },
    { visitsPerWeek: 1, preferredDays: ['martes'] },
    { visitsPerWeek: 2, preferredDays: ['miercoles', 'sabado'] },
    { visitsPerWeek: 1, preferredDays: ['jueves'] },
    { visitsPerWeek: 1, preferredDays: ['viernes'] },
    { visitsPerWeek: 1, preferredDays: ['lunes'] },
];

const allProperties = await db
    .select({ id: properties.id, alias: properties.alias })
    .from(properties)
    .orderBy(properties.createdAt);

const withPlan = new Set(
    (await db.select({ propertyId: servicePlans.propertyId }).from(servicePlans)).map(
        (row) => row.propertyId,
    ),
);

const pending = allProperties.filter((property) => !withPlan.has(property.id));

if (pending.length === 0) {
    console.log('Todas las propiedades ya tienen frecuencia configurada.');
} else {
    for (let index = 0; index < pending.length; index += 1) {
        const schedule = schedules[index % schedules.length];
        await db.insert(servicePlans).values({
            propertyId: pending[index].id,
            visitsPerWeek: schedule.visitsPerWeek,
            preferredDays: schedule.preferredDays,
            active: true,
        });
        console.log(`Plan creado para ${pending[index].alias}`);
    }
}

const [total] = await db.select({ value: count() }).from(servicePlans);
console.log(`Total de planes: ${Number(total?.value ?? 0)}.`);

await sql.end();
