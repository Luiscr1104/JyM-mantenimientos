CREATE TABLE "offline_visit_syncs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"visit_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "offline_visit_syncs" ADD CONSTRAINT "offline_visit_syncs_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_visit_syncs" ADD CONSTRAINT "offline_visit_syncs_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "offline_visit_syncs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "visit_events" ENABLE ROW LEVEL SECURITY;
