ALTER TABLE "payment_record" ADD COLUMN "rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_record" ADD COLUMN "rejected_by_user_id" text;--> statement-breakpoint
ALTER TABLE "payment_record" ADD COLUMN "reject_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_record" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_record" ADD COLUMN "voided_by_user_id" text;--> statement-breakpoint
ALTER TABLE "payment_record" ADD COLUMN "void_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_record" ADD CONSTRAINT "payment_record_rejected_by_user_id_user_id_fk" FOREIGN KEY ("rejected_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_record" ADD CONSTRAINT "payment_record_voided_by_user_id_user_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;