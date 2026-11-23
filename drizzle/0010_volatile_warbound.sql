CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "visits_running_pump_idx" ON "visits" USING btree ("pump_started_at") WHERE status = 'in_progress' AND pump_stopped_at IS NULL;--> statement-breakpoint
CREATE INDEX "water_fill_tasks_open_due_idx" ON "water_fill_tasks" USING btree ("due_at") WHERE closed_at IS NULL;