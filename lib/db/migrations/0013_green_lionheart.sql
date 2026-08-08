CREATE TABLE "admin_action" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_user_id" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "suspension_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "creator_page" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "creator_page" ADD COLUMN "suspended_by" text;--> statement-breakpoint
ALTER TABLE "creator_page" ADD COLUMN "suspension_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_action" ADD CONSTRAINT "admin_action_admin_user_id_user_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_action_target_idx" ON "admin_action" USING btree ("target_type","target_id","created_at");