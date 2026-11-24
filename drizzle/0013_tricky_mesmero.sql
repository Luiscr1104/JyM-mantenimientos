ALTER TABLE "personal_reminders" ADD COLUMN "request_id" uuid;--> statement-breakpoint
ALTER TABLE "personal_reminders" ADD CONSTRAINT "personal_reminders_request_id_unique" UNIQUE("request_id");