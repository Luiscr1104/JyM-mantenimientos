CREATE TYPE "public"."client_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'quoted', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'tech');--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"notes" text,
	"status" "client_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"message" text NOT NULL,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"source" text DEFAULT 'website' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"role" "user_role" DEFAULT 'owner' NOT NULL,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"address" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"gate_code" text,
	"access_notes" text,
	"photo_url" text,
	"pool_type" text,
	"volume_m3" double precision,
	"pump_notes" text,
	"filter_type" text,
	"sanitation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"visits_per_week" integer DEFAULT 1 NOT NULL,
	"preferred_days" text[],
	"price" numeric(12, 2),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_plans" ADD CONSTRAINT "service_plans_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "properties_client_id_idx" ON "properties" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "service_plans_property_id_idx" ON "service_plans" USING btree ("property_id");--> statement-breakpoint

-- Seguridad: el panel accede por Drizzle (rol postgres), pero bloqueamos
-- cualquier acceso directo a estas tablas con la publishable key vía PostgREST.
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "properties" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "service_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;