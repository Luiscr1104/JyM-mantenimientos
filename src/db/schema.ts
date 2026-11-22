import {
    boolean,
    date,
    doublePrecision,
    index,
    integer,
    jsonb,
    numeric,
    pgEnum,
    pgTable,
    text,
    timestamp,
    type AnyPgColumn,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { WorkType } from '@/lib/visit-types';

export const userRole = pgEnum('user_role', ['owner', 'tech']);
export const clientStatus = pgEnum('client_status', ['active', 'inactive']);
export const leadStatus = pgEnum('lead_status', ['new', 'contacted', 'quoted', 'won', 'lost']);
export const visitStatus = pgEnum('visit_status', [
    'scheduled',
    'in_progress',
    'completed',
    'skipped',
]);
export const poolProduct = pgEnum('pool_product', [
    'granulated_chlorine',
    'chlorine_tablet',
    'caustic_base',
    'liquid_flocculant',
    'granular_flocculant',
]);

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

export const visits = pgTable(
    'visits',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        propertyId: uuid('property_id')
            .notNull()
            .references(() => properties.id, { onDelete: 'cascade' }),
        scheduledFor: date('scheduled_for').notNull(),
        status: visitStatus('status').notNull().default('scheduled'),
        orderIndex: integer('order_index').notNull().default(0),
        startedAt: timestamp('started_at', { withTimezone: true }),
        completedAt: timestamp('completed_at', { withTimezone: true }),
        leftAt: timestamp('left_at', { withTimezone: true }),
        workTypes: text('work_types').array().$type<WorkType[]>().notNull().default(sql`ARRAY['routine']::text[]`),
        followUpForVisitId: uuid('follow_up_for_visit_id')
            .references((): AnyPgColumn => visits.id, { onDelete: 'set null' }),
        pumpStartedAt: timestamp('pump_started_at', { withTimezone: true }),
        pumpStoppedAt: timestamp('pump_stopped_at', { withTimezone: true }),
        checklist: jsonb('checklist').$type<VisitChecklist>(),
        notes: text('notes'),
        pendingReason: text('pending_reason'),
        ...timestamps,
    },
    (table) => [
        index('visits_scheduled_for_idx').on(table.scheduledFor),
        index('visits_property_id_idx').on(table.propertyId),
        uniqueIndex('visits_property_date_unique').on(table.propertyId, table.scheduledFor),
        uniqueIndex('visits_follow_up_unique').on(table.followUpForVisitId),
    ],
);

export const visitEvents = pgTable(
    'visit_events',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        visitId: uuid('visit_id').notNull().references(() => visits.id, { onDelete: 'cascade' }),
        kind: text('kind').$type<'arrival' | 'departure' | 'reopen' | 'skip'>().notNull(),
        occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
        actorId: uuid('actor_id').references(() => profiles.id, { onDelete: 'set null' }),
    },
    (table) => [index('visit_events_visit_id_idx').on(table.visitId)],
);
export const visitProducts = pgTable(
    'visit_products',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        visitId: uuid('visit_id').notNull().references(() => visits.id, { onDelete: 'cascade' }),
        product: poolProduct('product').notNull(),
        quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [index('visit_products_visit_id_idx').on(table.visitId)],
);

export const waterFillTasks = pgTable(
    'water_fill_tasks',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
        visitId: uuid('visit_id').references(() => visits.id, { onDelete: 'set null' }),
        dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
        delayMinutes: integer('delay_minutes').notNull(),
        openedBy: uuid('opened_by').references(() => profiles.id, { onDelete: 'set null' }),
        closedAt: timestamp('closed_at', { withTimezone: true }),
        closedBy: uuid('closed_by').references(() => profiles.id, { onDelete: 'set null' }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        index('water_fill_tasks_property_id_idx').on(table.propertyId),
        index('water_fill_tasks_due_at_idx').on(table.dueAt),
        uniqueIndex('water_fill_tasks_one_open_per_property').on(table.propertyId).where(sql`closed_at IS NULL`),
    ],
);

export const pushSubscriptions = pgTable('push_subscriptions', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const reminderDeliveries = pgTable('reminder_deliveries', {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').$type<'water' | 'pump'>().notNull(),
    targetId: uuid('target_id').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('reminder_deliveries_unique').on(table.kind, table.targetId, table.dueAt)]);

// Una aceptación por servicio push y dispositivo: un fallo en otro teléfono
// no vuelve a enviar el mismo recordatorio a quien ya lo recibió.
export const reminderDeviceDeliveries = pgTable('reminder_device_deliveries', {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').$type<'water' | 'pump'>().notNull(),
    targetId: uuid('target_id').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    subscriptionId: uuid('subscription_id').notNull(),
    status: text('status').$type<'sending' | 'accepted' | 'retry' | 'invalid'>().notNull(),
    attempts: integer('attempts').notNull().default(1),
    claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    uniqueIndex('reminder_device_deliveries_unique')
        .on(table.kind, table.targetId, table.dueAt, table.subscriptionId),
]);

export const offlineVisitSyncs = pgTable('offline_visit_syncs', {
    id: uuid('id').primaryKey(),
    visitId: uuid('visit_id').notNull().references(() => visits.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export interface RouteStop {
    visitId: string;
    propertyId: string;
    order: number;
    lat: number;
    lng: number;
}

export interface RouteOrigin {
    lat: number;
    lng: number;
    label: string;
    kind: 'base' | 'gps' | 'property';
}

export const routePlans = pgTable(
    'route_plans',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        visitDate: date('visit_date').notNull(),
        stops: jsonb('stops').$type<RouteStop[]>().notNull(),
        origin: jsonb('origin').$type<RouteOrigin>(),
        distanceMeters: integer('distance_meters'),
        durationSeconds: integer('duration_seconds'),
        polyline: text('polyline'),
        source: text('source').notNull().default('google'),
        optimizedAt: timestamp('optimized_at', { withTimezone: true }).notNull().defaultNow(),
        ...timestamps,
    },
    (table) => [uniqueIndex('route_plans_visit_date_unique').on(table.visitDate)],
);

export type VisitChecklist = Record<string, boolean>;

export type Profile = typeof profiles.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
export type ServicePlan = typeof servicePlans.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type Visit = typeof visits.$inferSelect;
export type NewVisit = typeof visits.$inferInsert;
export type RoutePlan = typeof routePlans.$inferSelect;
export type VisitProduct = typeof visitProducts.$inferSelect;
export type WaterFillTask = typeof waterFillTasks.$inferSelect;
