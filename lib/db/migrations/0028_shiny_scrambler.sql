CREATE TABLE "client_profile" (
	"creator_page_id" text NOT NULL,
	"client_user_id" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_profile_creator_page_id_client_user_id_pk" PRIMARY KEY("creator_page_id","client_user_id")
);
--> statement-breakpoint
ALTER TABLE "client_profile" ADD CONSTRAINT "client_profile_creator_page_id_creator_page_id_fk" FOREIGN KEY ("creator_page_id") REFERENCES "public"."creator_page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_profile" ADD CONSTRAINT "client_profile_client_user_id_user_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;