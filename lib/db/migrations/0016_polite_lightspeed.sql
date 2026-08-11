CREATE TABLE "order_quote" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"lines" jsonb NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"addons_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"deposit_cents" integer DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"expires_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_quote" ADD CONSTRAINT "order_quote_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_quote_order_idx" ON "order_quote" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_quote_live_idx" ON "order_quote" USING btree ("order_id") WHERE "order_quote"."superseded_at" is null and "order_quote"."accepted_at" is null;