ALTER TYPE "public"."pool_product" ADD VALUE 'liquid_flocculant';--> statement-breakpoint
ALTER TYPE "public"."pool_product" ADD VALUE 'granular_flocculant';--> statement-breakpoint
CREATE TABLE "visit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visit_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid
);
--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "work_types" text[] DEFAULT ARRAY['routine']::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "follow_up_for_visit_id" uuid;--> statement-breakpoint
ALTER TABLE "visit_events" ADD CONSTRAINT "visit_events_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_events" ADD CONSTRAINT "visit_events_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visit_events_visit_id_idx" ON "visit_events" USING btree ("visit_id");--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_follow_up_for_visit_id_visits_id_fk" FOREIGN KEY ("follow_up_for_visit_id") REFERENCES "public"."visits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "visits_follow_up_unique" ON "visits" USING btree ("follow_up_for_visit_id");
--> statement-breakpoint
INSERT INTO "visit_events" ("visit_id", "kind", "occurred_at")
SELECT "id", 'arrival', "started_at" FROM "visits" WHERE "started_at" IS NOT NULL;
--> statement-breakpoint
INSERT INTO "visit_events" ("visit_id", "kind", "occurred_at")
SELECT "id", 'departure', "completed_at" FROM "visits" WHERE "completed_at" IS NOT NULL;
