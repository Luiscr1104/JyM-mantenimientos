import {
    boolean,
    doublePrecision,
    index,
    integer,
    numeric,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uuid,
} from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', ['owner', 'tech']);
export const clientStatus = pgEnum('client_status', ['active', 'inactive']);
export const leadStatus = pgEnum('lead_status', ['new', 'contacted', 'quoted', 'won', 'lost']);

const timestamps = {
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const profiles = pgTable('profiles', {
    id: uuid('id').primaryKey(),
    fullName: text('full_name').notNull(),
    role: userRole('role').notNull().default('owner'),
    phone: text('phone'),
    ...timestamps,
});

export const clients = pgTable('clients', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    phone: text('phone'),
    email: text('email'),
    notes: text('notes'),
    status: clientStatus('status').notNull().default('active'),
    ...timestamps,
});

export const properties = pgTable(
    'properties',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        clientId: uuid('client_id')
            .notNull()
            .references(() => clients.id, { onDelete: 'cascade' }),
        alias: text('alias').notNull(),
        address: text('address').notNull(),
        lat: doublePrecision('lat'),
        lng: doublePrecision('lng'),
        gateCode: text('gate_code'),
        accessNotes: text('access_notes'),
        photoUrl: text('photo_url'),
        poolType: text('pool_type'),
        volumeM3: doublePrecision('volume_m3'),
        pumpNotes: text('pump_notes'),
        filterType: text('filter_type'),
        sanitation: text('sanitation'),
        ...timestamps,
    },
    (table) => [index('properties_client_id_idx').on(table.clientId)],
);

export const servicePlans = pgTable(
    'service_plans',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        propertyId: uuid('property_id')
            .notNull()
            .references(() => properties.id, { onDelete: 'cascade' }),
        visitsPerWeek: integer('visits_per_week').notNull().default(1),
        preferredDays: text('preferred_days').array(),
        price: numeric('price', { precision: 12, scale: 2 }),
        active: boolean('active').notNull().default(true),
        ...timestamps,
    },
    (table) => [index('service_plans_property_id_idx').on(table.propertyId)],
);

export const leads = pgTable('leads', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    email: text('email'),
    message: text('message').notNull(),
    status: leadStatus('status').notNull().default('new'),
    source: text('source').notNull().default('website'),
    ...timestamps,
});

export const settings = pgTable('settings', {
    key: text('key').primaryKey(),
    value: text('value'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Profile = typeof profiles.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
export type ServicePlan = typeof servicePlans.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
