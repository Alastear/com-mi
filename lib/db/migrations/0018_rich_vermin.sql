CREATE TABLE "order_invite" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"creator_page_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"service_id" text,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"order_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_invite_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "order_invite_claim" (
	"id" text PRIMARY KEY NOT NULL,
	"invite_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"user_id" text NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rejected_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "order_invite_revision" (
	"id" text PRIMARY KEY NOT NULL,
	"invite_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"lines" jsonb NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"addons_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"deposit_cents" integer DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"delivery_days" integer NOT NULL,
	"revisions_included" integer NOT NULL,
	"tos_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_invite" ADD CONSTRAINT "order_invite_creator_page_id_creator_page_id_fk" FOREIGN KEY ("creator_page_id") REFERENCES "public"."creator_page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_invite" ADD CONSTRAINT "order_invite_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_invite" ADD CONSTRAINT "order_invite_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_invite_claim" ADD CONSTRAINT "order_invite_claim_invite_id_order_invite_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."order_invite"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_invite_claim" ADD CONSTRAINT "order_invite_claim_revision_id_order_invite_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."order_invite_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_invite_claim" ADD CONSTRAINT "order_invite_claim_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_invite_revision" ADD CONSTRAINT "order_invite_revision_invite_id_order_invite_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."order_invite"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_invite_page_idx" ON "order_invite" USING btree ("creator_page_id","created_at");--> statement-breakpoint
CREATE INDEX "order_invite_email_idx" ON "order_invite" USING btree ("email");--> statement-breakpoint
CREATE INDEX "order_invite_claim_invite_idx" ON "order_invite_claim" USING btree ("invite_id","claimed_at");--> statement-breakpoint
CREATE INDEX "order_invite_claim_user_idx" ON "order_invite_claim" USING btree ("user_id","claimed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_invite_claim_live_idx" ON "order_invite_claim" USING btree ("invite_id") WHERE "order_invite_claim"."rejected_at" is null and "order_invite_claim"."withdrawn_at" is null;--> statement-breakpoint
CREATE INDEX "order_invite_revision_invite_idx" ON "order_invite_revision" USING btree ("invite_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_invite_revision_live_idx" ON "order_invite_revision" USING btree ("invite_id") WHERE "order_invite_revision"."superseded_at" is null and "order_invite_revision"."accepted_at" is null;