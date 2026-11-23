CREATE TABLE "ewelink_device_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid,
	"device_id" text NOT NULL,
	"name" text NOT NULL,
	"action" text NOT NULL,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ewelink_property_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"device_id" text NOT NULL,
	"name" text NOT NULL,
	"model" text,
	"uiid" integer,
	"linked_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ewelink_device_events" ADD CONSTRAINT "ewelink_device_events_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ewelink_device_events" ADD CONSTRAINT "ewelink_device_events_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ewelink_property_devices" ADD CONSTRAINT "ewelink_property_devices_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ewelink_property_devices" ADD CONSTRAINT "ewelink_property_devices_linked_by_profiles_id_fk" FOREIGN KEY ("linked_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ewelink_device_events_property_id_idx" ON "ewelink_device_events" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ewelink_property_devices_device_id_unique" ON "ewelink_property_devices" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "ewelink_property_devices_property_id_idx" ON "ewelink_property_devices" USING btree ("property_id");--> statement-breakpoint
ALTER TABLE "ewelink_property_devices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ewelink_device_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Conservar la entrada antigua en settings para poder volver al código piloto si hiciera falta.
-- Los IDs se migran sin hacer llamadas ni enviar órdenes a eWeLink.
INSERT INTO "ewelink_property_devices" ("property_id", "device_id", "name", "model", "uiid")
SELECT p.id, s.value::jsonb->>'deviceId', s.value::jsonb->>'name',
    s.value::jsonb->>'model', (s.value::jsonb->>'uiid')::integer
FROM "settings" s
JOIN "properties" p ON p.id::text = s.value::jsonb->>'propertyId'
WHERE s.key = 'ewelink_pilot_device'
    AND nullif(s.value::jsonb->>'deviceId', '') IS NOT NULL;--> statement-breakpoint
INSERT INTO "ewelink_device_events" ("property_id", "device_id", "name", "action")
SELECT property_id, device_id, name, 'migrated'
FROM "ewelink_property_devices";
