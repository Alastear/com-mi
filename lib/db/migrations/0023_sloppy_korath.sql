ALTER TABLE "review" ADD COLUMN "creator_replied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "review" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "message_event_idx" ON "message" USING btree ("order_id","event_type","created_at") WHERE "message"."is_system_event";