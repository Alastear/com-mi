CREATE TABLE "creator_page" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"about" text DEFAULT '' NOT NULL,
	"banner_media_id" text,
	"avatar_media_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"status_note" text DEFAULT '' NOT NULL,
	"currency" text DEFAULT 'THB' NOT NULL,
	"tos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tos_version" integer DEFAULT 1 NOT NULL,
	"socials" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"theme" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_mature" boolean DEFAULT false NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"show_queue_publicly" boolean DEFAULT true NOT NULL,
	"slots_total" integer DEFAULT 5 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_page_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"pathname" text NOT NULL,
	"url" text NOT NULL,
	"access" text DEFAULT 'public' NOT NULL,
	"kind" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" integer DEFAULT 0 NOT NULL,
	"width" integer,
	"height" integer,
	"thumbhash" text,
	"variant_of" text,
	"variant_label" text,
	"status" text DEFAULT 'orphan' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_item" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_page_id" text NOT NULL,
	"media_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"linked_service_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_page_id" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'illustration' NOT NULL,
	"mode" text DEFAULT 'instant' NOT NULL,
	"base_price_cents" integer DEFAULT 0 NOT NULL,
	"delivery_days" integer DEFAULT 7 NOT NULL,
	"revisions_included" integer DEFAULT 2 NOT NULL,
	"cover_media_id" text,
	"includes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_option" (
	"id" text PRIMARY KEY NOT NULL,
	"service_id" text NOT NULL,
	"group_label" text DEFAULT '' NOT NULL,
	"label" text NOT NULL,
	"price_delta_cents" integer DEFAULT 0 NOT NULL,
	"input_type" text DEFAULT 'checkbox' NOT NULL,
	"max_quantity" integer,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_tier" (
	"id" text PRIMARY KEY NOT NULL,
	"service_id" text NOT NULL,
	"label" text NOT NULL,
	"price_delta_cents" integer DEFAULT 0 NOT NULL,
	"preview_media_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creator_page" ADD CONSTRAINT "creator_page_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_page" ADD CONSTRAINT "creator_page_banner_media_id_media_id_fk" FOREIGN KEY ("banner_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_page" ADD CONSTRAINT "creator_page_avatar_media_id_media_id_fk" FOREIGN KEY ("avatar_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_item" ADD CONSTRAINT "portfolio_item_creator_page_id_creator_page_id_fk" FOREIGN KEY ("creator_page_id") REFERENCES "public"."creator_page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_item" ADD CONSTRAINT "portfolio_item_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_item" ADD CONSTRAINT "portfolio_item_linked_service_id_service_id_fk" FOREIGN KEY ("linked_service_id") REFERENCES "public"."service"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_creator_page_id_creator_page_id_fk" FOREIGN KEY ("creator_page_id") REFERENCES "public"."creator_page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_option" ADD CONSTRAINT "service_option_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_tier" ADD CONSTRAINT "service_tier_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_tier" ADD CONSTRAINT "service_tier_preview_media_id_media_id_fk" FOREIGN KEY ("preview_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_owner_status_idx" ON "media" USING btree ("owner_user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "portfolio_page_sort_idx" ON "portfolio_item" USING btree ("creator_page_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "service_page_slug_idx" ON "service" USING btree ("creator_page_id","slug");--> statement-breakpoint
CREATE INDEX "service_page_sort_idx" ON "service" USING btree ("creator_page_id","sort_order");--> statement-breakpoint
CREATE INDEX "service_option_service_idx" ON "service_option" USING btree ("service_id","sort_order");--> statement-breakpoint
CREATE INDEX "service_tier_service_idx" ON "service_tier" USING btree ("service_id","sort_order");