ALTER TABLE "visits" ADD COLUMN "left_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "visits" SET "left_at" = "completed_at" WHERE "completed_at" IS NOT NULL;
