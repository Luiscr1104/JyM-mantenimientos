CREATE TABLE "reminder_device_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"subscription_id" uuid NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_device_deliveries_unique" ON "reminder_device_deliveries" USING btree ("kind","target_id","due_at","subscription_id");--> statement-breakpoint
ALTER TABLE "reminder_device_deliveries" ENABLE ROW LEVEL SECURITY;
