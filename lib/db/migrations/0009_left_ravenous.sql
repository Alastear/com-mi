ALTER TABLE "portfolio_item" ALTER COLUMN "media_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "portfolio_item" ADD COLUMN "embed_ref" text;