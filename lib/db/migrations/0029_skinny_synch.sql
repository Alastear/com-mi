CREATE TABLE "capability_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"capability" text NOT NULL,
	"target" text NOT NULL,
	"before" jsonb,
	"after" jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capability_cohort" (
	"capability" text NOT NULL,
	"creator_page_id" text NOT NULL,
	"cohort" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "capability_cohort_capability_creator_page_id_pk" PRIMARY KEY("capability","creator_page_id")
);
--> statement-breakpoint
CREATE TABLE "capability_rollout" (
	"capability" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "capability_audit" ADD CONSTRAINT "capability_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capability_cohort" ADD CONSTRAINT "capability_cohort_creator_page_id_creator_page_id_fk" FOREIGN KEY ("creator_page_id") REFERENCES "public"."creator_page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "capability_audit_time_idx" ON "capability_audit" USING btree ("created_at");