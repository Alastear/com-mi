CREATE TABLE "upload_intent" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"bucket" text NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"order_id" text,
	"content_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"filename" text DEFAULT '' NOT NULL,
	"upload_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "upload_intent_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "upload_intent" ADD CONSTRAINT "upload_intent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "upload_intent_created_idx" ON "upload_intent" USING btree ("created_at");