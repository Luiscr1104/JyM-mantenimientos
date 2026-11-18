CREATE TYPE "public"."pool_product" AS ENUM('granulated_chlorine', 'chlorine_tablet', 'caustic_base');--> statement-breakpoint
CREATE TABLE "visit_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visit_id" uuid NOT NULL,
	"product" "pool_product" NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "water_fill_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"visit_id" uuid,
	"due_at" timestamp with time zone NOT NULL,
	"delay_minutes" integer NOT NULL,
	"opened_by" uuid,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "visit_products" ADD CONSTRAINT "visit_products_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "water_fill_tasks" ADD CONSTRAINT "water_fill_tasks_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "water_fill_tasks" ADD CONSTRAINT "water_fill_tasks_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "water_fill_tasks" ADD CONSTRAINT "water_fill_tasks_opened_by_profiles_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "water_fill_tasks" ADD CONSTRAINT "water_fill_tasks_closed_by_profiles_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visit_products_visit_id_idx" ON "visit_products" USING btree ("visit_id");--> statement-breakpoint
CREATE INDEX "water_fill_tasks_property_id_idx" ON "water_fill_tasks" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "water_fill_tasks_due_at_idx" ON "water_fill_tasks" USING btree ("due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "water_fill_tasks_one_open_per_property" ON "water_fill_tasks" USING btree ("property_id") WHERE "closed_at" IS NULL;--> statement-breakpoint
-- Solo el servidor puede leer y escribir estas tablas.
ALTER TABLE "visit_products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "water_fill_tasks" ENABLE ROW LEVEL SECURITY;
