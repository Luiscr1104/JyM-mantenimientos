import { count } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { clients, properties, servicePlans } from '../src/db/schema';

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

const [existing] = await db.select({ value: count() }).from(clients);
if (Number(existing?.value ?? 0) > 0) {
    console.log('Ya existen clientes en la base. No se agregó nada.');
    await sql.end();
    process.exit(0);
}

const demo = [
    {
        client: { name: 'María Rodríguez', phone: '+506 8811 2233', email: 'maria@example.com', notes: 'Prefiere visitas los martes por la mañana.' },
        property: {
            alias: 'Casa Luna · Airbnb',
            address: 'La Fortuna centro, 200 m norte de la iglesia',
            lat: 10.4709,
            lng: -84.6453,
            gateCode: '1234',
            accessNotes: 'Entrar por la puerta lateral, hay perro amigable.',
            poolType: 'Rectangular',
            volumeM3: 32,
            filterType: 'Arena',
            sanitation: 'Cloro',
            pumpNotes: 'Bomba Hayward 1.5 HP. Apagar siempre al terminar.',
        },
    },
    {
        client: { name: 'Carlos Jiménez', phone: '+506 8722 4455', email: 'carlos@example.com', notes: 'Paga por SINPE el primer día del mes.' },
        property: {
            alias: 'Villa Volcán',
            address: 'El Castillo, 1 km antes de la catarata',
            lat: 10.423,
            lng: -84.73,
            gateCode: 'Candado azul',
            accessNotes: 'Portón negro, código en la caja.',
            poolType: 'Infinity',
            volumeM3: 48,
            filterType: 'Cartucho',
            sanitation: 'Sal',
            pumpNotes: 'Sistema de sal. Limpiar celda cada 15 días.',
        },
    },
    {
        client: { name: 'Ana Vargas', phone: '+506 8633 7788', email: 'ana@example.com', notes: 'Airbnb con huéspedes casi todo el año.' },
        property: {
            alias: 'Airbnb Río Fortuna',
            address: 'La Fortuna, camino a la catarata',
            lat: 10.48,
            lng: -84.66,
            gateCode: 'Llave en lockbox 8899',
            accessNotes: 'Coordinar con la encargada de limpieza.',
            poolType: 'Riñón',
            volumeM3: 24,
            filterType: 'Arena',
            sanitation: 'Cloro',
            pumpNotes: 'Bomba 1 HP con timer. Revisar que el timer quede en OFF.',
        },
    },
    {
        client: { name: 'Jorge Solano', phone: '+506 8544 1122', email: 'jorge@example.com', notes: 'Casa de fin de semana.' },
        property: {
            alias: 'Casa Palma',
            address: 'Nuevo Arenal, entrada al lago',
            lat: 10.53,
            lng: -84.88,
            gateCode: '4321',
            accessNotes: 'Camino de lastre, entrar despacio.',
            poolType: 'Rectangular',
            volumeM3: 40,
            filterType: 'Arena',
            sanitation: 'Cloro',
            pumpNotes: 'Bomba 2 HP. Filtro con válvula de 6 posiciones.',
        },
    },
    {
        client: { name: 'Sofía Mora', phone: '+506 8455 6677', email: 'sofia@example.com', notes: 'Cliente nueva, piscina con poco uso.' },
        property: {
            alias: 'Chalet Tucán',
            address: 'La Fortuna, barrio Tanque',
            lat: 10.455,
            lng: -84.635,
            gateCode: '5678',
            accessNotes: 'Tocar la campana al llegar.',
            poolType: 'Irregular',
            volumeM3: 28,
            filterType: 'Cartucho',
            sanitation: 'Cloro',
            pumpNotes: 'Bomba 1 HP. Limpiar canastilla cada visita.',
        },
    },
    {
        client: { name: 'Luis Quesada', phone: '+506 8366 9900', email: 'luisq@example.com', notes: 'Propiedad de alquiler vacacional.' },
        property: {
            alias: 'Finca El Jardín',
            address: 'La Fortuna, 5 km hacia San Ramón',
            lat: 10.44,
            lng: -84.7,
            gateCode: 'Candado verde',
            accessNotes: 'Entrada por el camino de los naranjos.',
            poolType: 'Rectangular',
            volumeM3: 36,
            filterType: 'Arena',
            sanitation: 'Mixto',
            pumpNotes: 'Bomba 1.5 HP. Revisar presión del filtro.',
        },
    },
];

const schedules = [
    { visitsPerWeek: 2, preferredDays: ['lunes', 'jueves'] },
    { visitsPerWeek: 1, preferredDays: ['martes'] },
    { visitsPerWeek: 2, preferredDays: ['miercoles', 'sabado'] },
    { visitsPerWeek: 1, preferredDays: ['jueves'] },
    { visitsPerWeek: 1, preferredDays: ['viernes'] },
    { visitsPerWeek: 1, preferredDays: ['lunes'] },
];

for (const [index, item] of demo.entries()) {
    const [client] = await db.insert(clients).values(item.client).returning();
    const [property] = await db
        .insert(properties)
        .values({ ...item.property, clientId: client.id })
        .returning();

    const schedule = schedules[index % schedules.length];
    await db.insert(servicePlans).values({
        propertyId: property.id,
        visitsPerWeek: schedule.visitsPerWeek,
        preferredDays: schedule.preferredDays,
        active: true,
    });
}

console.log(
    `Seed demo listo: ${demo.length} clientes con una propiedad y su frecuencia de servicio.`,
);
await sql.end();
