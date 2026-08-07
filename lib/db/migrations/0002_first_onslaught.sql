CREATE TABLE "delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"media_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"license_type" text DEFAULT 'personal' NOT NULL,
	"released_at" timestamp with time zone,
	"downloaded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"sender_user_id" text,
	"body" text DEFAULT '' NOT NULL,
	"attachment_media_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_system_event" boolean DEFAULT false NOT NULL,
	"event_type" text,
	"event_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_by_creator_at" timestamp with time zone,
	"read_by_client_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "order" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"creator_page_id" text NOT NULL,
	"client_user_id" text NOT NULL,
	"service_id" text,
	"status" text DEFAULT 'requested' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"queue_position" integer,
	"currency" text DEFAULT 'THB' NOT NULL,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"addons_cents" integer DEFAULT 0 NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"amount_paid_cents" integer DEFAULT 0 NOT NULL,
	"revisions_used" integer DEFAULT 0 NOT NULL,
	"revisions_allowed" integer DEFAULT 0 NOT NULL,
	"tos_version_accepted" integer DEFAULT 1 NOT NULL,
	"tos_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"accepted_tos_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"quote_expires_at" timestamp with time zone,
	"is_public_in_queue" boolean DEFAULT true NOT NULL,
	"private_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "order_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "order_answer" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"field_key" text NOT NULL,
	"field_label" text NOT NULL,
	"value" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_item" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"label" text NOT NULL,
	"kind" text NOT NULL,
	"unit_price_cents" integer DEFAULT 0 NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"source_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_record" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"method" text DEFAULT 'promptpay' NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"proof_media_id" text,
	"verified_by_user_id" text,
	"verified_at" timestamp with time zone,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"creator_page_id" text NOT NULL,
	"client_user_id" text NOT NULL,
	"rating" integer NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"creator_reply" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
ALTER TABLE "delivery" ADD CONSTRAINT "delivery_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_sender_user_id_user_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_creator_page_id_creator_page_id_fk" FOREIGN KEY ("creator_page_id") REFERENCES "public"."creator_page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_client_user_id_user_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_answer" ADD CONSTRAINT "order_answer_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_record" ADD CONSTRAINT "payment_record_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_record" ADD CONSTRAINT "payment_record_proof_media_id_media_id_fk" FOREIGN KEY ("proof_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_record" ADD CONSTRAINT "payment_record_verified_by_user_id_user_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_creator_page_id_creator_page_id_fk" FOREIGN KEY ("creator_page_id") REFERENCES "public"."creator_page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_client_user_id_user_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_order_idx" ON "delivery" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "message_order_idx" ON "message" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "order_page_status_idx" ON "order" USING btree ("creator_page_id","status","created_at");--> statement-breakpoint
CREATE INDEX "order_client_idx" ON "order" USING btree ("client_user_id","created_at");--> statement-breakpoint
CREATE INDEX "order_answer_order_idx" ON "order_answer" USING btree ("order_id","sort_order");--> statement-breakpoint
CREATE INDEX "order_item_order_idx" ON "order_item" USING btree ("order_id","sort_order");--> statement-breakpoint
CREATE INDEX "payment_order_idx" ON "payment_record" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "rate_limit_window_idx" ON "rate_limit" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "review_page_idx" ON "review" USING btree ("creator_page_id","created_at");