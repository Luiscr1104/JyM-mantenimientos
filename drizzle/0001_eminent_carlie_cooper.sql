CREATE TYPE "public"."visit_status" AS ENUM('scheduled', 'in_progress', 'completed', 'skipped');--> statement-breakpoint
CREATE TABLE "route_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visit_date" date NOT NULL,
	"stops" jsonb NOT NULL,
	"distance_meters" integer,
	"duration_seconds" integer,
	"polyline" text,
	"source" text DEFAULT 'google' NOT NULL,
	"optimized_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"scheduled_for" date NOT NULL,
	"status" "visit_status" DEFAULT 'scheduled' NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"pump_started_at" timestamp with time zone,
	"pump_stopped_at" timestamp with time zone,
	"checklist" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "route_plans_visit_date_unique" ON "route_plans" USING btree ("visit_date");--> statement-breakpoint
CREATE INDEX "visits_scheduled_for_idx" ON "visits" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "visits_property_id_idx" ON "visits" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "visits_property_date_unique" ON "visits" USING btree ("property_id","scheduled_for");--> statement-breakpoint

-- Mismo criterio que las tablas de la Fase 1: el panel va por Drizzle y
-- bloqueamos el acceso directo con la publishable key.
ALTER TABLE "visits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "route_plans" ENABLE ROW LEVEL SECURITY;