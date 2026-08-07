ALTER TABLE "creator_page" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "creator_page" ADD COLUMN "promptpay_type" text;--> statement-breakpoint
ALTER TABLE "creator_page" ADD COLUMN "promptpay_id" text;--> statement-breakpoint
ALTER TABLE "creator_page" ADD COLUMN "promptpay_name" text;